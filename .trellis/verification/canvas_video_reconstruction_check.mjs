import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const fixtureRoot = mkdtempSync(path.join(tmpdir(), "fluxpost-video-reconstruct-"));
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

try {
  verifyStaticContracts();
  await verifySourceVideoService();
  await verifyMediaPipeline();
  console.log("Canvas video reconstruction checks passed.");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

function verifyStaticContracts() {
  const types = read("src/lib/canvas/types.ts");
  const registry = read("src/lib/canvas/registry.ts");
  const route = read("src/app/api/canvas/source-video/route.ts");
  const scheduler = read("src/lib/canvas/scheduler.ts");
  assert.match(types, /CanvasPortKind = CanvasArtifactKind \| "any" \| "visual"/);
  assert.match(types, /"input\.source-video"/);
  assert.match(types, /"utility\.video-reconstruct"/);
  assert.match(registry, /kind: "visual", required: true/);
  assert.match(registry, /bypass: \{ inputPort: "source", outputPort: "videos" \}/);
  assert.match(route, /error instanceof CanvasSourceVideoValidationError \? 400 : 500/);
  assert.match(scheduler, /assertFrozenCanvasScheduleV2AssetsStillAvailable\(current, account\)/);
  assert.match(scheduler, /getSourceItemsByIds\(ids, account\)/);
  assert.match(scheduler, /source\.mode === "source-video-links"/);

  const templates = loadTsModule("src/lib/canvas/templates.ts", {
    "./registry": {
      createCanvasNode: (type, id, position) => ({ id, type, version: 1, position, config: {}, executionMode: "enabled" }),
    },
    "./types": {},
  });
  for (const key of ["video-reconstruct-seedance", "video-reconstruct-gpt-image"]) {
    const { graph } = templates.createCanvasWorkflowTemplateGraph(key);
    assert.deepEqual(Array.from(graph.nodes, (node) => node.type), [
      "input.source-video", "input.text", key.endsWith("seedance") ? "model.seedance" : "model.gpt-image", "utility.video-reconstruct", "utility.display-any",
    ]);
    assert.equal(graph.nodes[0].executionMode, "disabled");
    assert.equal(graph.edges.length, 4);
    assert.equal(graph.edges.at(-1).target, "result-display");
  }

  const contract = loadTsModule("src/lib/canvas/source-video-contract.ts", { "./types": {} });
  const snapshot = {
    id: "source-1", projectName: "Video rebuild", sourceUrl: "https://example.invalid/source.mp4", platform: "original",
    url: "/generated/canvas-tools/source.mp4", durationSeconds: 8, width: 1920, height: 1080, resolvedAt: "2026-08-11T00:00:00.000Z",
  };
  const config = contract.canvasSourceVideoSnapshotConfig(snapshot);
  assert.equal(contract.isCanvasSourceVideoSnapshotCurrent(config), true);
  assert.equal(contract.isCanvasSourceVideoSnapshotCurrent({ ...config, sourceUrl: "https://example.invalid/changed.mp4" }), false);
  assert.equal(contract.canvasSourceVideoSnapshotFromConfig(contract.clearCanvasSourceVideoSnapshot(config)), undefined);
}

async function verifySourceVideoService() {
  let ingestCalls = 0;
  let platformResolveCalls = 0;
  let failUrl = "";
  const service = loadTsModule("src/lib/canvas/source-video-service.ts", {
    "node:crypto": createRequire(import.meta.url)("node:crypto"),
    "../concurrency": {
      concurrencyConfig: { media: 4 },
      mapWithConcurrency: async (values, _limit, worker) => Promise.all(values.map(worker)),
    },
    "../content-safety-policy": {
      getContentSafetyPolicy: async () => ({}),
      normalizeContentSafetyPolicySnapshot: (value) => value,
    },
    "../content-pool": {
      ingestCrawlItems: async (_projectName, items) => {
        ingestCalls += 1;
        return { items };
      },
    },
    "../media-cache": { buildVideoDownloadCandidates: (item) => [item.videoUrl].filter(Boolean) },
    "../source-link-import": {
      detectSourceLinkPlatform: (url) => url.includes("platform.example") ? "douyin" : undefined,
      resolveSourceLinks: async ({ links }) => {
        platformResolveCalls += 1;
        return {
          total: links.length,
          valid: links.length,
          results: links.map((url) => ({ url, status: "imported" })),
          items: links.map((url, index) => sourceItem(`platform-${index}`, "douyin", url, `https://cdn.example/video-${index}.mp4`)),
        };
      },
    },
    "../source-safety": { filterUnsafeSourceItems: async (items) => ({ items, filtered: [] }) },
    "../source-tagging": { tagSourceItems: async (items) => items },
    "../types": {},
    "../workspace-ownership": {},
    "./media-tools": {
      persistCanvasSourceVideo: async (url) => {
        if (url === failUrl) throw new Error("fixture media failure");
        return { url: `/generated/canvas-tools/${encodeURIComponent(url)}.mp4`, durationSeconds: 5, width: 1280, height: 720 };
      },
    },
    "./types": {},
  });
  const account = { userId: "owner-1", displayName: "Owner" };
  const [direct] = await service.resolveCanvasSourceVideos({ links: ["https://direct.example/source.mp4"], projectName: "Video rebuild", account });
  assert.equal(direct.platform, "original");
  assert.equal(direct.sourceUrl, "https://direct.example/source.mp4");
  assert.equal(platformResolveCalls, 0);
  assert.equal(ingestCalls, 1);

  const [platform] = await service.resolveCanvasSourceVideos({ links: ["https://platform.example/share/1"], projectName: "Video rebuild", account });
  assert.equal(platform.platform, "douyin");
  assert.equal(platformResolveCalls, 1);

  const callsBeforeFailure = ingestCalls;
  failUrl = "https://direct.example/fail.mp4";
  await assert.rejects(
    () => service.resolveCanvasSourceVideos({ links: ["https://direct.example/ok.mp4", failUrl], projectName: "Video rebuild", account }),
    (error) => error?.name === "CanvasSourceVideoValidationError",
  );
  assert.equal(ingestCalls, callsBeforeFailure, "batch media failure must occur before content-pool ingestion");
  await assert.rejects(
    () => service.resolveCanvasSourceVideos({ links: ["https://direct.example/duplicate.mp4", "https://direct.example/duplicate.mp4"], projectName: "Video rebuild", account }),
    (error) => error?.name === "CanvasSourceVideoValidationError",
  );
}

async function verifyMediaPipeline() {
  const sourcePath = path.join(fixtureRoot, "source.mp4");
  const replacementVideoPath = path.join(fixtureRoot, "replacement.mp4");
  const imagePath = path.join(fixtureRoot, "replacement.png");
  const largeImagePath = path.join(fixtureRoot, "large.png");
  const noAudioPath = path.join(fixtureRoot, "no-audio.mp4");
  const webmPath = path.join(fixtureRoot, "source.webm");
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1.6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.6", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=1.6", "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", sourcePath]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x120:r=24:d=0.45", "-f", "lavfi", "-i", "sine=frequency=1200:sample_rate=48000:duration=0.45", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", replacementVideoPath]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=green:s=513x257", "-frames:v", "1", "-update", "1", imagePath]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=yellow:s=5000x2500", "-frames:v", "1", "-update", "1", largeImagePath]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", noAudioPath]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=purple:s=160x90:r=24:d=0.6", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=0.6", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-c:a", "libopus", "-shortest", webmPath]);

  const materialized = new Map([
    ["fixture://source", sourcePath],
    ["fixture://replacement-video", replacementVideoPath],
    ["fixture://image", imagePath],
    ["fixture://large-image", largeImagePath],
    ["fixture://no-audio", noAudioPath],
    ["fixture://webm", webmPath],
  ]);
  const cleanupCalls = [];
  const persistenceCalls = [];
  let returnExisting = false;
  const mediaTools = loadTsModule("src/lib/canvas/media-tools.ts", {
    "node:crypto": createRequire(import.meta.url)("node:crypto"),
    "node:child_process": { execFile },
    "node:fs/promises": fsPromises,
    "node:path": path,
    "../concurrency": { runWithConcurrencyPool: async (pool, task) => { assert.equal(pool, "localVideo"); return task(); } },
    "../runtime-media-materializer": {
      materializeRuntimeMedia: async (url) => {
        if (url === "fixture://materialize-failure") throw new Error("replacement materialization failed");
        const generatedPath = String(url).startsWith("/generated/") ? path.join(fixtureRoot, "public", String(url).replace(/^\/+/, "")) : undefined;
        const filePath = materialized.get(url) || generatedPath;
        if (!filePath || !existsSync(filePath)) throw new Error(`Unknown fixture URL: ${url}`);
        return { filePath, cleanup: async () => { cleanupCalls.push(url); } };
      },
    },
    "../runtime-media-storage": {
      findExistingRuntimeMedia: async (publicPath) => returnExisting ? `https://cache.example.invalid${publicPath}` : undefined,
      persistRuntimeMedia: async (input) => { persistenceCalls.push(input); return input.publicPath; },
    },
    "./node-utils": {},
    "./types": {},
  }, { process: { ...process, cwd: () => fixtureRoot } });

  const videoResult = await mediaTools.reconstructCanvasVideo({
    source: { url: "fixture://source" }, replacement: { url: "fixture://replacement-video" }, replacementKind: "video",
  });
  const videoOutput = publicFile(videoResult.url);
  assertVideoOutput(videoOutput, { width: 160, height: 120, duration: 1.6 });
  const samples = decodeAudio(videoOutput);
  assert.ok(toneEnergy(samples, 440) > toneEnergy(samples, 880) * 5, "output must use the source first audio track");
  assert.ok(toneEnergy(samples, 440) > toneEnergy(samples, 1200) * 5, "replacement video audio must be discarded");

  const imageResult = await mediaTools.reconstructCanvasVideo({
    source: { url: "fixture://source" }, replacement: { url: "fixture://image" }, replacementKind: "image",
  });
  const imageOutput = publicFile(imageResult.url);
  const imageProbe = assertVideoOutput(imageOutput, { width: 512, height: 256, duration: 1.6 });
  assert.equal(imageProbe.streams.find((stream) => stream.codec_type === "video").avg_frame_rate, "30/1");

  returnExisting = true;
  const capped = await mediaTools.reconstructCanvasVideo({
    source: { url: "fixture://source" }, replacement: { url: "fixture://large-image" }, replacementKind: "image",
  });
  returnExisting = false;
  assert.deepEqual({ width: capped.width, height: capped.height }, { width: 4096, height: 2048 });

  const cleanupBeforeNoAudio = cleanupCalls.length;
  await assert.rejects(
    () => mediaTools.reconstructCanvasVideo({ source: { url: "fixture://no-audio" }, replacement: { url: "fixture://image" }, replacementKind: "image" }),
    /does not contain an audio track/i,
  );
  assert.equal(cleanupCalls.length, cleanupBeforeNoAudio + 2);

  const cleanupBeforeMaterializeFailure = cleanupCalls.length;
  await assert.rejects(
    () => mediaTools.reconstructCanvasVideo({ source: { url: "fixture://source" }, replacement: { url: "fixture://materialize-failure" }, replacementKind: "image" }),
    /replacement materialization failed/i,
  );
  assert.equal(cleanupCalls.length, cleanupBeforeMaterializeFailure + 1, "source media must be cleaned when replacement materialization fails");

  const durableWebm = await mediaTools.persistCanvasSourceVideo("fixture://webm");
  assert.match(durableWebm.url, /\.webm$/);
  assert.equal(persistenceCalls.at(-1).contentType, "video/webm");
  assert.ok(existsSync(publicFile(durableWebm.url)));
  await assert.rejects(() => mediaTools.persistCanvasSourceVideo("https://example.invalid/live.m3u8"), /HLS sources are not supported/i);

  const outputRoot = path.join(fixtureRoot, "public", "generated", "canvas-tools");
  assert.deepEqual(readdirSync(outputRoot).filter((name) => name.includes(".tmp")), [], "temporary outputs must be removed");
}

function sourceItem(id, platform, sourceUrl, videoUrl) {
  return { id, platform, sourceId: id, mediaType: "video", sourceUrl, title: id, contentText: "", images: [], videoUrl, mediaUrls: [videoUrl], metrics: {}, raw: {} };
}

function assertVideoOutput(filePath, expected) {
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate", "-of", "json", filePath]));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.filter((stream) => stream.codec_type === "audio");
  assert.equal(video.codec_name, "h264");
  assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(video.width, expected.width);
  assert.equal(video.height, expected.height);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].codec_name, "aac");
  assert.ok(Math.abs(Number(probe.format.duration) - expected.duration) < 0.12, `duration ${probe.format.duration} must match ${expected.duration}`);
  const bytes = readFileSync(filePath);
  assert.ok(bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat")), "MP4 must place moov before mdat for fast start");
  return probe;
}

function decodeAudio(filePath) {
  const result = execFileSync("ffmpeg", ["-v", "error", "-i", filePath, "-map", "0:a:0", "-t", "0.8", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { maxBuffer: 4 * 1024 * 1024 });
  return new Float32Array(result.buffer, result.byteOffset, Math.floor(result.byteLength / 4));
}

function toneEnergy(samples, frequency, sampleRate = 48000) {
  let real = 0;
  let imaginary = 0;
  const step = 2 * Math.PI * frequency / sampleRate;
  for (let index = 0; index < samples.length; index += 1) {
    real += samples[index] * Math.cos(step * index);
    imaginary -= samples[index] * Math.sin(step * index);
  }
  return real * real + imaginary * imaginary;
}

function publicFile(url) {
  return path.join(fixtureRoot, "public", String(url).replace(/^\/+/, ""));
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function loadTsModule(relativePath, requireMap, sandboxExtras = {}) {
  const sourcePath = path.join(root, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const cjsModule = { exports: {} };
  const sandbox = {
    Buffer, URL, console, process, module: cjsModule, exports: cjsModule.exports, setTimeout, clearTimeout, structuredClone,
    ...sandboxExtras,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(output, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}
