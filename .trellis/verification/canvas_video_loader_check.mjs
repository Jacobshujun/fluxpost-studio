import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function loadTsModule(relative, requireMap = {}) {
  const output = ts.transpileModule(read(relative), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const cjs = { exports: {} };
  vm.runInNewContext(output, {
    Buffer, URL, console, process, module: cjs, exports: cjs.exports, structuredClone,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected import ${name} from ${relative}`);
    },
  }, { filename: relative });
  return cjs.exports;
}

function compileFunction(relative, name, scope = {}) {
  const source = read(relative);
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, `${relative} is missing ${name}`);
  const output = ts.transpileModule(declaration.getText(ast).replace(/^export\s+/, ""), {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const names = Object.keys(scope);
  return Function(...names, `${output}\nreturn ${name};`)(...names.map((key) => scope[key]));
}

const snapshots = loadTsModule("src/lib/canvas/video-loader.ts", { "./types": {} });
const first = snapshots.normalizeCanvasVideoSnapshot({
  id: "sha256:aaa",
  filename: "one.mp4",
  url: "/generated/canvas-video-uploads/aaa.mp4",
  mimeType: "video/mp4",
  bytes: 1024,
  durationSeconds: 4.5,
  width: 1080,
  height: 1920,
  hasAudio: true,
  uploadedAt: "2026-08-20T00:00:00.000Z",
});
const second = snapshots.normalizeCanvasVideoSnapshot({
  id: "sha256:bbb",
  filename: "two.webm",
  url: "https://media.example/two.webm",
  mimeType: "video/webm",
  bytes: 2048,
  durationSeconds: 8,
  width: 1920,
  height: 1080,
  hasAudio: false,
  uploadedAt: "2026-08-20T00:00:01.000Z",
});
assert.equal(first?.filename, "one.mp4");
assert.equal(second?.hasAudio, false);
assert.equal(snapshots.normalizeCanvasVideoSnapshot({ ...first, mimeType: "video/avi" }), undefined);
assert.equal(snapshots.normalizeCanvasVideoSnapshot({ ...first, bytes: 0 }), undefined);
assert.equal(snapshots.normalizeCanvasVideoSnapshot({ ...first, bytes: 512 * 1024 * 1024 + 1 }), undefined);
assert.deepEqual(JSON.parse(JSON.stringify(snapshots.canvasVideoLoaderConfig([first, first, second], "missing"))), JSON.parse(JSON.stringify({
  videos: [first, second],
  selectedVideoId: first.id,
})));
assert.equal(snapshots.selectedCanvasVideo({ videos: [first, second], selectedVideoId: second.id })?.id, second.id);
assert.equal(snapshots.validateCanvasVideoLoaderConfig({ videos: [], selectedVideoId: "" }).length, 1);
assert.ok(snapshots.validateCanvasVideoLoaderConfig({ videos: Array.from({ length: 201 }, (_, index) => ({ ...first, id: `sha256:${index}` })), selectedVideoId: first.id }).some((message) => message.includes("200")));

const resolveCanvasLiteralOutputs = compileFunction("src/lib/canvas/executors.ts", "resolveCanvasLiteralOutputs", {
  selectedCanvasVideo: snapshots.selectedCanvasVideo,
});
assert.deepEqual(JSON.parse(JSON.stringify(resolveCanvasLiteralOutputs({
  type: "input.video-loader",
  config: { videos: [first, second], selectedVideoId: second.id },
}))), {
  videos: { kind: "videos", items: [{ url: second.url, name: second.filename, mimeType: second.mimeType, width: second.width, height: second.height, durationSeconds: second.durationSeconds }] },
}, "literal execution must emit only the selected video");

const types = read("src/lib/canvas/types.ts");
const registry = read("src/lib/canvas/registry.ts");
const executors = read("src/lib/canvas/executors.ts");
const scheduler = read("src/lib/canvas/scheduler.ts");
const schedulerV2 = read("src/lib/canvas/scheduler-v2.ts");
const page = read("src/app/canvas/page.tsx");
const css = read("src/app/globals.css");
const route = read("src/app/api/canvas/video-uploads/route.ts");
const upload = read("src/lib/canvas/video-upload.ts");

for (const source of [types, registry, executors, page]) assert.ok(source.includes('"input.video-loader"'));
assert.ok(types.includes('"video-loader-queue"'));
assert.ok(types.includes('"video-input"'));
assert.ok(registry.includes('parameterTypes: ["video"]'));
for (const source of [scheduler, schedulerV2]) assert.ok(source.includes("video-loader-queue"));
for (const snippet of ["XMLHttpRequest", "上传视频", "selectedVideoId", "dataTransferVideoFiles", "canvas-video-loader-queue"]) assert.ok(page.includes(snippet), `Canvas UI is missing ${snippet}`);
assert.ok(css.includes(".canvas-video-loader"));
assert.ok(route.includes("requireWorkspaceAccount"));
assert.ok(route.includes("saveCanvasVideoUpload"));
for (const snippet of ["MAX_CANVAS_VIDEO_UPLOAD_BYTES", "createHash", "probeCanvasMediaFile", "persistRuntimeMedia", "request.body", "rm("]) assert.ok(upload.includes(snippet), `Upload service is missing ${snippet}`);

const noopRuntimeMedia = { findExistingRuntimeMedia: async () => undefined, persistRuntimeMedia: async ({ publicPath }) => publicPath };
const mediaTools = loadTsModule("src/lib/canvas/media-tools.ts", {
  "../concurrency": { runWithConcurrencyPool: async (_pool, task) => task() },
  "../runtime-media-materializer": {},
  "../runtime-media-storage": noopRuntimeMedia,
  "./node-utils": {},
  "./types": {},
});
const uploadService = loadTsModule("src/lib/canvas/video-upload.ts", {
  "../runtime-media-storage": noopRuntimeMedia,
  "./media-tools": mediaTools,
  "./video-loader": snapshots,
  "./types": {},
});

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-video-loader-"));
const stagingRoot = path.join(temp, "staging");
const outputRoot = path.join(temp, "output");
const fixedNow = new Date("2026-08-20T00:00:00.000Z");
const persistCalls = [];
const dependencies = {
  stagingRoot,
  outputRoot,
  probeMedia: mediaTools.probeCanvasMediaFile,
  findExistingMedia: async () => undefined,
  persistMedia: async (input) => { persistCalls.push(input); return input.publicPath; },
  now: () => fixedNow,
};
const bodyRequest = (body, headers) => new Request("http://localhost/api/canvas/video-uploads", { method: "POST", body, headers, duplex: "half" });

function createRotatedFixture(sourcePath, outputPath) {
  const modern = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-display_rotation:v:0", "90", "-i", sourcePath,
    "-c", "copy", outputPath,
  ], { encoding: "utf8" });
  if (modern.status === 0) return;

  const modernError = `${modern.stderr ?? ""}${modern.error?.message ?? ""}`;
  if (!/Unrecognized option 'display_rotation/.test(modernError)) {
    throw new Error(`Could not create rotated video fixture: ${modernError}`);
  }
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath,
    "-c", "copy", "-metadata:s:v:0", "rotate=90", outputPath,
  ]);
}

try {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x48:d=0.25", "-f", "lavfi", "-i", "sine=frequency=1000:duration=0.25", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(temp, "sample.mp4")]);
  createRotatedFixture(path.join(temp, "sample.mp4"), path.join(temp, "rotated.mp4"));
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x48:d=2", "-itsoffset", "0.5", "-f", "lavfi", "-i", "sine=frequency=1000:duration=1", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(temp, "delayed-audio.mp4")]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x48:d=0.25", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "mov", path.join(temp, "sample.mov")]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=green:s=64x48:d=0.25", "-an", "-c:v", "libvpx-vp9", path.join(temp, "sample.webm")]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=600:duration=0.25", "-vn", "-c:a", "aac", path.join(temp, "audio-only.m4a")]);

  for (const [filename, mimeType] of [["sample.mp4", "video/mp4"], ["sample.mov", "video/quicktime"], ["sample.webm", "video/webm"]]) {
    const bytes = readFileSync(path.join(temp, filename));
    const result = await uploadService.saveCanvasVideoUpload(bodyRequest(bytes, { "content-type": "application/octet-stream" }), filename, dependencies);
    assert.equal(result.mimeType, mimeType);
    assert.equal(result.bytes, bytes.length);
    assert.equal(result.uploadedAt, fixedNow.toISOString());
    assert.match(result.id, /^sha256:[a-f0-9]{64}$/);
    assert.ok(result.width > 0 && result.height > 0 && result.durationSeconds > 0);
  }
  assert.equal(persistCalls.length, 3);
  assert.deepEqual(readdirSync(stagingRoot), [], "successful uploads must leave no staging files");

  const rotated = await mediaTools.probeCanvasMediaFile(path.join(temp, "rotated.mp4"));
  assert.equal(rotated.codedWidth, 64);
  assert.equal(rotated.codedHeight, 48);
  assert.equal(Math.abs(rotated.rotation), 90);
  assert.equal(rotated.width, 48, "90-degree metadata must swap displayed width");
  assert.equal(rotated.height, 64, "90-degree metadata must swap displayed height");
  assert.equal(rotated.mediaStartSeconds, 0);
  assert.equal(rotated.videoStartSeconds, 0);
  assert.equal(rotated.audioStartSeconds, 0);

  const delayedAudio = await mediaTools.probeCanvasMediaFile(path.join(temp, "delayed-audio.mp4"));
  assert.ok(Math.abs(delayedAudio.mediaStartSeconds - delayedAudio.videoStartSeconds) < 0.01);
  assert.ok(delayedAudio.audioStartSeconds - delayedAudio.mediaStartSeconds > 0.4, "audio stream origin must retain its delay from the media timeline");

  await assert.rejects(() => uploadService.saveCanvasVideoUpload(bodyRequest(new Uint8Array(), { "content-type": "video/mp4" }), "empty.mp4", dependencies), /不能为空/);
  await assert.rejects(() => uploadService.saveCanvasVideoUpload(bodyRequest(Buffer.from("not a video"), { "content-type": "video/mp4" }), "fake.mp4", dependencies), /ffprobe|video|Invalid data/i);
  await assert.rejects(() => uploadService.saveCanvasVideoUpload(bodyRequest(readFileSync(path.join(temp, "audio-only.m4a"))), "audio-only.mp4", dependencies), /video stream|无法识别/i);
  const overflowStream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); controller.close(); } });
  await assert.rejects(() => uploadService.saveCanvasVideoUpload(bodyRequest(overflowStream), "overflow.mp4", { ...dependencies, maxBytes: 10 }), /512 MB/);
  assert.deepEqual(readdirSync(stagingRoot), [], "failed and over-limit uploads must clean staging files");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Canvas video loader verification passed.");
