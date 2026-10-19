import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, existsSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import sharp from "sharp";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const typesSource = read("src/lib/canvas/types.ts");
const registrySource = read("src/lib/canvas/registry.ts");
const toolsSource = read("src/lib/canvas/media-tools.ts");
const pageSource = read("src/app/canvas/page.tsx");
const serializationSource = read("src/lib/canvas/serialization.ts");

assert.match(typesSource, /"utility\.media-mask"/);
assert.match(typesSource, /shape: "rectangle" \| "rounded-rectangle"/);
assert.match(typesSource, /mode: "solid" \| "blur" \| "mosaic" \| "image"/);
assert.match(typesSource, /validateCanvasMediaMaskConfig/);
assert.match(registrySource, /type: "utility\.media-mask"/);
assert.match(registrySource, /inputs: \[[\s\S]*id: "images"[\s\S]*id: "videos"/);
assert.match(toolsSource, /export async function maskCanvasMedia/);
assert.match(toolsSource, /runWithConcurrencyPool\("localVideo"/);
assert.match(toolsSource, /maskGeometryExpressions/);
assert.match(toolsSource, /property === "x" \|\| property === "y" \? Math\.max\(0, rounded\) : Math\.max\(1, rounded\)/, "edge-aligned masks must allow zero-pixel x/y coordinates");
assert.match(toolsSource, /mediaFingerprint\("media-mask-v3"/, "mask renderer fixes must invalidate older derived-media cache entries");
assert.match(pageSource, /CanvasMediaMaskEditor/);
assert.match(pageSource, /utility\.media-mask/);
assert.match(serializationSource, /nodeType === "utility\.media-mask" && key === "mask"/);
assert.match(pageSource, /const activeRunId = selectedRunIdRef\.current;[\s\S]*const routeRun = !activeRunId && runId[\s\S]*const selectedRun = explicitRun/);

const getModelArtifact = loadTsFunctions(
  pageSource,
  ["getModelArtifact", "isPreviewableModelArtifact"],
  "getModelArtifact",
  {
    getCanvasNodeDefinition: () => ({
      outputs: [
        { id: "images", kind: "images" },
        { id: "videos", kind: "videos" },
      ],
    }),
  },
);
const videoArtifact = { kind: "videos", items: [{ url: "/generated/masked.mp4" }] };
const imageArtifact = { kind: "images", items: [{ url: "/generated/masked.png" }] };
assert.equal(getModelArtifact("utility.media-mask", { outputs: { videos: videoArtifact } }), videoArtifact, "video-only mask results must remain previewable when images is the first declared output");
assert.equal(getModelArtifact("utility.media-mask", { outputs: { images: imageArtifact } }), imageArtifact, "image-only mask results must remain previewable");
assert.equal(getModelArtifact("utility.media-mask", { outputs: { text: { kind: "text", value: "unexpected" } } }), undefined, "undeclared artifact kinds must not become previewable through compatibility fallback lookup");
assert.equal(getModelArtifact("utility.media-mask", { outputs: {} }), undefined, "empty mask results must keep the existing empty state");

const maskGeometryExpressions = loadTsFunctions(toolsSource, ["maskGeometryExpressions"], "maskGeometryExpressions");
assert.deepEqual(
  maskGeometryExpressions({ x: 0, y: 0, width: 1, height: 0.1 }, 1920, 1080),
  { x: "0", y: "0", width: "1920", height: "108" },
  "full-width edge masks must start at the exact top-left pixel",
);

const types = loadTsModule("src/lib/canvas/types.ts");
const valid = {
  protocolVersion: 1,
  regions: [{ id: "wm", shape: "rounded-rectangle", mode: "solid", x: 0.7, y: 0.04, width: 0.2, height: 0.08, opacity: 0.85, color: "#000000", startMs: 0, endMs: 5000, keyframes: [{ timeMs: 0, x: 0.7, y: 0.04, width: 0.2, height: 0.08 }, { timeMs: 3000, x: 0.65, y: 0.1, width: 0.2, height: 0.08 }] }],
};
assert.equal(types.validateCanvasMediaMaskConfig(valid).length, 0);
assert.ok(types.validateCanvasMediaMaskConfig({ protocolVersion: 1, regions: [{ ...valid.regions[0], opacity: 2 }] }).some((error) => /opacity/.test(error)));
assert.ok(types.validateCanvasMediaMaskConfig({ protocolVersion: 1, regions: [{ ...valid.regions[0], keyframes: [{ ...valid.regions[0].keyframes[1] }, { ...valid.regions[0].keyframes[0] }] }] }).some((error) => /ascending/.test(error)));
const templateRegion = { id: "template", shape: "rectangle", mode: "image", imageSource: "input", x: 0, y: 0, width: 1, height: 1, opacity: 1, color: "#000000" };
const templateConfig = { protocolVersion: 1, regions: [templateRegion] };
assert.equal(types.validateCanvasMediaMaskConfig(templateConfig).length, 0);
assert.equal(types.normalizeCanvasMediaMaskConfig(templateConfig).regions[0].imageSource, "input");
assert.ok(types.validateCanvasMediaMaskConfig({ ...templateConfig, regions: [{ ...templateRegion, imageSource: "unknown" }] }).some((error) => /imageSource/.test(error)));
assert.ok(types.validateCanvasMediaMaskConfig({ ...templateConfig, regions: [{ ...templateRegion, imageSource: undefined }] }).some((error) => /imageUrl/.test(error)));
assert.equal(types.canvasMediaMaskUsesImageInput({ ...valid, itemOverrides: { source: [templateRegion] } }), true);
const requiredPorts = loadTsFunctions(registrySource, ["getCanvasRequiredInputPorts"], "getCanvasRequiredInputPorts", {
  getCanvasNodeDefinition: () => ({ inputs: [{ id: "images" }, { id: "videos" }, { id: "overlayImages" }] }),
  getCanvasNodeExecutionMode: () => "enabled",
  canvasMediaMaskUsesImageInput: types.canvasMediaMaskUsesImageInput,
});
assert.deepEqual(requiredPorts({ type: "utility.media-mask", config: { mask: templateConfig } }, []).map((port) => port.id), ["overlayImages"]);
assert.equal(requiredPorts({ type: "utility.media-mask", config: { mask: valid } }, []).length, 0);
await verifyRenderer();
console.log("Canvas media mask contracts passed.");

function loadTsModule(relativePath, requireMap = {}, extras = {}) {
  const source = read(relativePath);
  const transformed = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const moduleRecord = { exports: {} };
  const sandbox = { module: moduleRecord, exports: moduleRecord.exports, require: (name) => requireMap[name] || (name === "./video-encoding" ? loadTsModule("src/lib/canvas/video-encoding.ts") : undefined) || (name.startsWith("node:") ? createRequire(import.meta.url)(name) : {}), console, process, Buffer, setTimeout, clearTimeout, __dirname: path.dirname(path.join(root, relativePath)), __filename: path.join(root, relativePath), ...extras };
  vm.runInNewContext(transformed, sandbox, { filename: relativePath });
  return moduleRecord.exports;
}

function loadTsFunctions(source, names, returnName, scope = {}) {
  const ast = ts.createSourceFile("canvas-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = names.map((name) => {
    const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `source is missing function ${name}`);
    return declaration.getText(ast).replace(/^export\s+/, "");
  });
  const transformed = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    fileName: "canvas-page.tsx",
  }).outputText;
  const keys = Object.keys(scope);
  return Function(...keys, `${transformed}\nreturn ${returnName};`)(...keys.map((key) => scope[key]));
}

async function verifyRenderer() {
  const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-mask-alpha-"));
  const source = path.join(temp, "source.mp4");
  const template = path.join(temp, "template.png");
  const corrupt = path.join(temp, "corrupt.png");
  const outputFile = (url) => path.join(temp, "public", url.replace(/^\/+/, ""));
  const cleanup = [];
  let encodes = 0;
  const native = createRequire(import.meta.url);
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=120x80:r=10:d=2", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
    const pixels = Buffer.alloc(120 * 80 * 4);
    for (let y = 0; y < 80; y += 1) for (let x = 0; x < 120; x += 1) {
      const offset = (y * 120 + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 3] = x < 40 ? 0 : x < 80 ? 128 : 255;
    }
    await sharp(pixels, { raw: { width: 120, height: 80, channels: 4 } }).png().toFile(template);
    writeFileSync(corrupt, "invalid PNG");
    const media = loadTsModule("src/lib/canvas/media-tools.ts", {
      "./types": types,
      "../concurrency": { runWithConcurrencyPool: async (pool, fn) => { assert.equal(pool, "localVideo"); return fn(); } },
      "node:child_process": { execFile: (...args) => {
        if (args[0] === "ffmpeg") encodes += 1;
        return native("node:child_process").execFile(...args);
      } },
      "../runtime-media-materializer": { materializeRuntimeMedia: async (url) => {
        const filePath = { "fixture:source": source, "fixture:second": source, "fixture:template": template, "fixture:corrupt": corrupt, "fixture:gpu": path.join(temp, "gpu-source.mp4") }[url];
        assert.ok(filePath, `Unknown fixture ${url}`);
        return { filePath, cleanup: async () => { cleanup.push(url); } };
      } },
      "../runtime-media-storage": {
        findExistingRuntimeMedia: async (url) => existsSync(outputFile(url)) ? url : undefined,
        persistRuntimeMedia: async ({ publicPath }) => publicPath,
      },
    }, { process: { ...process, cwd: () => temp } });
    const base = { kind: "video", items: [{ url: "fixture:source" }], config: templateConfig, overlayImage: { url: "fixture:template" } };
    const [result, second] = await media.maskCanvasMedia({ ...base, items: [...base.items, { url: "fixture:second" }] });
    assert.equal(result.width, 120);
    assert.equal(result.height, 80);
    assert.ok(Math.abs(result.durationSeconds - 2) < 0.1);
    assert.equal(cleanup.filter((url) => url === "fixture:template").length, 1, "batch must share a materialized template");
    for (const item of [result, second]) for (const time of [0, 0.9, 1.9]) {
      const frame = decodeFrame(outputFile(item.url), time);
      assertPixel(frame, 20, 40, [0, 0, 255]);
      assertPixel(frame, 60, 40, [128, 0, 127]);
      assertPixel(frame, 100, 40, [255, 0, 0]);
    }
    const audio = execFileSync("ffmpeg", ["-v", "error", "-i", outputFile(result.url), "-map", "0:a:0", "-t", "1", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"]);
    const samples = new Float32Array(audio.buffer, audio.byteOffset, audio.byteLength / 4);
    const energy = (frequency) => {
      let real = 0, imaginary = 0;
      samples.forEach((value, index) => { real += value * Math.cos(index * 2 * Math.PI * frequency / 48000); imaginary += value * Math.sin(index * 2 * Math.PI * frequency / 48000); });
      return real * real + imaginary * imaginary;
    };
    assert.ok(energy(440) > energy(880) * 20, "source audio content must survive");
    const beforeCache = encodes;
    assert.equal((await media.maskCanvasMedia(base))[0].url, result.url);
    assert.equal(encodes, beforeCache, "identical template content must hit the derived cache");
    const [positioned] = await media.maskCanvasMedia({ ...base, config: { ...templateConfig, regions: [{ ...templateRegion, x: 0.5, y: 0.5, width: 0.5, height: 0.5, opacity: 0.5, startMs: 500, endMs: 1400 }] } });
    for (const time of [0, 1.8]) assertPixel(decodeFrame(outputFile(positioned.url), time), 110, 60, [0, 0, 255]);
    const middle = decodeFrame(outputFile(positioned.url), 0.9);
    assertPixel(middle, 110, 60, [128, 0, 127]);
    assertPixel(middle, 90, 60, [64, 0, 191]);
    assertPixel(middle, 30, 60, [0, 0, 255]);
    const [legacy] = await media.maskCanvasMedia({ ...base, overlayImage: undefined, config: { ...templateConfig, regions: [{ ...templateRegion, imageSource: undefined, imageUrl: "fixture:template" }] } });
    assertPixel(decodeFrame(outputFile(legacy.url), 1.9), 60, 40, [128, 0, 127]);
    const [ordered] = await media.maskCanvasMedia({ ...base, config: { ...templateConfig, regions: [templateRegion, { ...templateRegion, id: "solid", mode: "solid", color: "#00ff00", width: 0.5 }] } });
    assertPixel(decodeFrame(outputFile(ordered.url), 1), 20, 40, [0, 255, 0]);
    for (const mode of ["blur", "mosaic"]) {
      const [oldMode] = await media.maskCanvasMedia({ ...base, overlayImage: undefined, config: { ...templateConfig, regions: [{ ...templateRegion, mode }] } });
      assertPixel(decodeFrame(outputFile(oldMode.url), 1), 60, 40, [0, 0, 255]);
    }
    const [overridden] = await media.maskCanvasMedia({ ...base, config: { ...templateConfig, regions: [{ ...templateRegion, mode: "solid" }], itemOverrides: { "fixture:source": [templateRegion] } } });
    assertPixel(decodeFrame(outputFile(overridden.url), 1), 100, 40, [255, 0, 0]);
    await assert.rejects(() => media.maskCanvasMedia({ ...base, overlayImage: undefined }), /遮罩图片/);
    await assert.rejects(() => media.maskCanvasMedia({ ...base, overlayImage: { url: "fixture:corrupt" } }));
    assert.ok(cleanup.includes("fixture:corrupt"), "failed encoding must clean up the template");
    assert.ok(readdirSync(path.join(temp, "public/generated/canvas-tools")).every((name) => !name.includes(".tmp.")), "failed encoding must remove staging files");
    await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toFile(template);
    const [changed] = await media.maskCanvasMedia(base);
    assert.notEqual(changed.url, result.url, "same URL with new bytes must invalidate the overlay cache");
    assertPixel(decodeFrame(outputFile(changed.url), 1), 60, 40, [0, 255, 0]);
    const execute = loadTsFunctions(read("src/lib/canvas/executors.ts"), ["executeMediaMask"], "executeMediaMask", {
      imageItems: (artifacts = []) => artifacts.flatMap((artifact) => artifact.kind === "images" ? artifact.items : []),
      CanvasNeedsConfigError: Error, CanvasMediaNeedsConfigError: media.CanvasMediaNeedsConfigError,
      maskCanvasMedia: media.maskCanvasMedia,
    });
    const context = { node: { config: { mask: templateConfig } }, inputs: { videos: [{ kind: "videos", items: base.items }], overlayImages: [{ kind: "images", items: [base.overlayImage] }] } };
    assert.equal((await execute(context)).outputs.videos.items.length, 1, "template input must not conflict with base video");
    await assert.rejects(() => execute({ ...context, inputs: { ...context.inputs, overlayImages: [{ kind: "images", items: [base.overlayImage, base.overlayImage] }] } }), /只接受一张/);
    await assert.rejects(() => execute({ ...context, inputs: { videos: context.inputs.videos } }), /遮罩图片/);
    await assert.rejects(() => execute({ ...context, inputs: { ...context.inputs, images: [{ kind: "images", items: [base.overlayImage] }] } }), /只能连接图片或视频/);
    if (process.argv.includes("--nvenc")) {
      const previousEncoder = process.env.FFMPEG_VIDEO_ENCODER;
      process.env.FFMPEG_VIDEO_ENCODER = "h264_nvenc";
      try {
        execFileSync("ffmpeg", ["-v", "error", "-y", "-i", source, "-vf", "scale=320:180", "-c:v", "libx264", "-c:a", "copy", path.join(temp, "gpu-source.mp4")]);
        const [gpu] = await media.maskCanvasMedia({ ...base, items: [{ url: "fixture:gpu" }] });
        const receipt = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", outputFile(gpu.url)], { encoding: "utf8" }));
        const video = receipt.streams.find((stream) => stream.codec_type === "video");
        assert.equal(video.width, 320); assert.equal(video.height, 180);
        assert.match(video.tags.encoder, /h264_nvenc/);
        assert.equal(receipt.streams.find((stream) => stream.codec_type === "audio").codec_name, "aac");
        execFileSync("ffmpeg", ["-v", "error", "-i", outputFile(gpu.url), "-f", "null", "-"]);
        console.log("NVENC video mask: actual GPU encoder receipt, dimensions, audio and decode passed.");
      } finally {
        if (previousEncoder === undefined) delete process.env.FFMPEG_VIDEO_ENCODER;
        else process.env.FFMPEG_VIDEO_ENCODER = previousEncoder;
      }
    }
    console.log("Real FFmpeg mask alpha, geometry, timing, audio, batch, cache and error checks passed.");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function decodeFrame(filePath, time) {
  return execFileSync("ffmpeg", ["-v", "error", "-ss", String(time), "-i", filePath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
}

function assertPixel(frame, x, y, expected) {
  const offset = (y * 120 + x) * 3;
  assert.equal(frame.length, 120 * 80 * 3);
  expected.forEach((value, channel) => assert.ok(Math.abs(frame[offset + channel] - value) < 15, `pixel ${x},${y}: expected ${expected}, got ${[...frame.subarray(offset, offset + 3)]}`));
}
