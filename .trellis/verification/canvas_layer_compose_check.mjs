import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import ts from "typescript";

const root = process.cwd(), temp = mkdtempSync(path.join(tmpdir(), "fluxpost-layer-check-"));
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(path.join(root, file), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function load(file, modules = {}) {
  const loaded = { exports: {} };
  Function("require", "module", "exports", "process", compile(read(file)))((name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name.startsWith("node:") || name === "sharp") return require(name);
    throw new Error(`Unexpected dependency ${name}`);
  }, loaded, loaded.exports, { ...process, cwd: () => temp });
  return loaded.exports;
}
const sources = new Map();
let cleanups = 0;
const materializer = { materializeRuntimeMedia: async (url) => {
  assert.ok(sources.has(url), `No external media allowed: ${url}`);
  return { filePath: sources.get(url), cleanup: async () => { cleanups++; } };
} };
const storage = { persistRuntimeMedia: async (input) => { assert.ok(readFileSync(input.filePath).length); return input.publicPath; } };
const concurrency = { runWithConcurrencyPool: async (name, task) => { assert.ok(["localImage", "localVideo"].includes(name)); return task(); } };
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" });
try {
  const contract = load("src/lib/canvas/layer-compose-contract.ts");
  const media = load("src/lib/canvas/media-tools.ts", { "../concurrency": concurrency, "../runtime-media-materializer": materializer, "../runtime-media-storage": storage, "./node-utils": {}, "./types": {} });
  const renderer = load("src/lib/canvas/layer-compose.ts", { "./layer-compose-contract": contract, "./media-tools": media, "../concurrency": concurrency, "../runtime-media-materializer": materializer, "../runtime-media-storage": storage, "./directory-snapshots": { getCanvasDirectorySnapshot: async (_id, owner) => { assert.equal(owner, "owner"); return { groups: [{ images: [{ id: "image", absolutePath: sources.get("red") }] }] }; } } });
  const make = (id, kind, patch = {}) => ({ ...contract.newComposeLayer(id, kind, 100, 100), ...patch });
  const config = (layers, patch = {}) => ({ ...contract.defaultLayerComposeConfig(), width: 100, height: 100, layers, ...patch });
  const source = (kind, url) => ({ kind, key: `url:${url}`, media: { url } });
  const bind = (kind, url) => ({ kind, key: `url:${url}` });
  const outputPath = (result) => path.join(temp, "public", result.item.url);
  const pixel = async (result, x, y) => [...await sharp(outputPath(result)).extract({ left: x, top: y, width: 1, height: 1 }).ensureAlpha().raw().toBuffer()];
  for (const [name, width, height, background] of [["red", 200, 100, "red"], ["alpha", 100, 100, { r: 0, g: 0, b: 255, alpha: 0.5 }]]) {
    const file = path.join(temp, `${name}.png`); await sharp({ create: { width, height, channels: 4, background } }).png().toFile(file); sources.set(name, file);
  }
  const red = make("image", "image", { source: bind("image", "red") });
  let result = await renderer.renderLayerComposition(config([red], { background: "#00ff00" }), [source("image", "red")], "owner");
  assert.deepEqual(await pixel(result, 50, 5), [0, 255, 0, 255]);
  assert.deepEqual(await pixel(result, 50, 50), [255, 0, 0, 255]);
  assert.equal(result.item.width, 100); assert.equal(result.item.height, 100);
  const repeat = await renderer.renderLayerComposition(config([red], { background: "#00ff00" }), [source("image", "red")], "owner");
  assert.equal(repeat.item.url, result.item.url);
  const transparent = await renderer.renderLayerComposition(config([red], { background: "transparent" }), [source("image", "red")], "owner");
  assert.equal((await pixel(transparent, 50, 5))[3], 0);
  const alpha = make("alpha", "image", { source: bind("image", "alpha"), opacity: 0.5 });
  result = await renderer.renderLayerComposition(config([{ ...red, fit: "cover" }, alpha]), [source("image", "red"), source("image", "alpha")], "owner");
  const mixed = await pixel(result, 50, 50); assert.ok(mixed[0] >= 188 && mixed[0] <= 193); assert.ok(mixed[2] >= 62 && mixed[2] <= 66);
  const clipped = await renderer.renderLayerComposition(config([make("solid", "solid", { color: "#ff0000", x: -50, width: 100 })]), [], "owner");
  assert.deepEqual(await pixel(clipped, 10, 10), [255, 0, 0, 255]); assert.deepEqual(await pixel(clipped, 90, 10), [255, 255, 255, 255]);
  const stripe = await sharp({ create: { width: 200, height: 100, channels: 4, background: "blue" } }).composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 4, background: "red" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  writeFileSync(sources.get("red"), stripe);
  const cropConfig = config([{ ...red, crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }]);
  result = await renderer.renderLayerComposition(cropConfig, [source("image", "red")], "owner");
  assert.deepEqual(await pixel(result, 50, 50), [0, 0, 255, 255]);
  assert.notEqual(result.item.url, repeat.item.url);
  const changedBytes = await renderer.renderLayerComposition(config([red], { background: "#00ff00" }), [source("image", "red")], "owner"); assert.notEqual(changedBytes.item.url, repeat.item.url);
  await assert.rejects(renderer.renderLayerComposition(config([red]), [], "owner"), /失效/);
  await assert.rejects(renderer.renderLayerComposition(config([red]), [{ ...source("image", "red"), media: { url: "red", sha256: "wrong" } }], "owner"), /改变/);
  assert.ok(contract.validateLayerComposeConfig(config([make("v", "video", { source: bind("video", "short") })], { width: 101 })).some((error) => error.includes("偶数")));
  assert.equal(contract.isLayerComposeConfig(config(Array.from({ length: 25 }, (_, i) => make(String(i), "solid")))), false);
  assert.equal(contract.isLayerComposeConfig(config([{ ...red, crop: { x: .9, y: 0, width: .2, height: 1 } }])), false);
  const shortFile = path.join(temp, "short.mp4"), longFile = path.join(temp, "long.mp4");
  ffmpeg(["-f", "lavfi", "-i", "color=red:s=100x100:r=30:d=0.5", "-f", "lavfi", "-i", "color=blue:s=100x100:r=30:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", shortFile]);
  ffmpeg(["-f", "lavfi", "-i", "color=green:s=100x100:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", longFile]);
  sources.set("short", shortFile); sources.set("long", longFile);
  const videoSources = [source("video", "short"), source("video", "long")];
  const framePixel = async (file, seconds) => {
    const frame = ffmpeg(["-ss", String(seconds), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
    return [...await sharp(frame).extract({ left: 50, top: 50, width: 1, height: 1 }).raw().toBuffer()];
  };
  const rms = (file, seconds) => {
    const bytes = ffmpeg(["-ss", String(seconds), "-i", file, "-t", "0.15", "-vn", "-f", "f32le", "-ac", "1", "pipe:1"]);
    let sum = 0; for (let offset = 0; offset < bytes.length; offset += 4) sum += bytes.readFloatLE(offset) ** 2;
    return Math.sqrt(sum / (bytes.length / 4));
  };
  for (const behavior of ["hold", "loop", "hide"]) {
    const layers = [make("long", "video", { source: bind("video", "long") }), make("short", "video", { source: bind("video", "short"), endBehavior: behavior })];
    const video = await renderer.renderLayerComposition(config(layers, { audioLayerId: "short" }), videoSources, "owner");
    assert.equal(video.kind, "videos"); assert.equal(video.item.durationSeconds, 2);
    const metadata = await media.probeCanvasMediaFile(outputPath(video)); assert.equal(metadata.hasAudio, true);
    const rgb = await framePixel(outputPath(video), 1.2);
    if (behavior === "hold") assert.ok(rgb[2] > 220 && rgb[0] < 20, `hold ${rgb}`);
    if (behavior === "loop") assert.ok(rgb[0] > 220 && rgb[2] < 20, `loop ${rgb}`);
    if (behavior === "hide") assert.ok(rgb[1] > 90 && rgb[0] < 20, `hide ${rgb}`);
    assert.ok(rms(outputPath(video), .2) > .01);
    assert.ok(behavior === "loop" ? rms(outputPath(video), 1.2) > .01 : rms(outputPath(video), 1.2) < .001);
  }
  const noAudio = await renderer.renderLayerComposition(config([make("long", "video", { source: bind("video", "long") })], { audioLayerId: "long", durationMode: "custom", durationSeconds: 1 }), videoSources, "owner");
  assert.equal((await media.probeCanvasMediaFile(outputPath(noAudio))).hasAudio, false);
  assert.equal(noAudio.item.durationSeconds, 1);
  const overlayVideo = await renderer.renderLayerComposition(config([make("long", "video", { source: bind("video", "long"), width: 50, height: 50 }), { ...alpha, width: 50, height: 50 }], { background: "#ff0000", durationMode: "custom", durationSeconds: 1 }), [...videoSources, source("image", "alpha")], "owner");
  const overlayFrame = ffmpeg(["-i", outputPath(overlayVideo), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
  const center = [...await sharp(overlayFrame).extract({ left: 25, top: 25, width: 1, height: 1 }).raw().toBuffer()];
  assert.ok(center[1] > 85 && center[1] < 105 && center[2] > 50 && center[2] < 80, `video alpha ${center}`);
  const edge = [...await sharp(overlayFrame).extract({ left: 80, top: 80, width: 1, height: 1 }).raw().toBuffer()]; assert.ok(edge[0] > 230 && edge[1] < 20);
  sources.set("bad", path.join(temp, "bad.png")); writeFileSync(sources.get("bad"), "corrupt");
  await assert.rejects(renderer.renderLayerComposition(config([red, make("bad", "image", { source: bind("image", "bad") })]), [source("image", "red"), source("image", "bad")], "owner"));
  assert.ok(cleanups > 10); assert.ok(readdirSync(path.join(temp, "public/generated/canvas-tools")).every((name) => !name.includes(".tmp.")));
  // Real serialization/registry/clipboard/workflow modules, isolated from runtime storage.
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageResolutions=['1k'];exports.toApisImageRatios=['1:1'];");
  writeFileSync(path.join(temp, "feishu-publish-mode.js"), "exports.feishuPublishModeOptions=[];exports.normalizeFeishuPublishMode=v=>v||'full';");
  writeFileSync(path.join(temp, "image-model-options.js"), compile(read("src/lib/image-model-options.ts")));
  for (const name of ["layer-compose-contract", "image-process-contract", "types", "node-utils", "source-video-contract", "video-loader", "content-collection", "save-images", "seedance-references", "subtitle-style", "subtitle-editor", "registry", "graph", "iteration", "serialization", "clipboard", "workflow-file", "layer-compose-inputs"]) {
    writeFileSync(path.join(temp, `${name}.js`), compile(read(`src/lib/canvas/${name}.ts`).replaceAll('"../toapis-image-api"', '"./toapis-image-api"').replaceAll('"../feishu-publish-mode"', '"./feishu-publish-mode"').replaceAll('"../image-model-options"', '"./image-model-options"')));
  }
  const registry = require(path.join(temp, "registry.js")), graphLib = require(path.join(temp, "graph.js")), serialization = require(path.join(temp, "serialization.js")), workflow = require(path.join(temp, "workflow-file.js"));
  const node = registry.createCanvasNode("utility.layer-compose", "compose", { x: 0, y: 0 }); node.config.composition = cropConfig;
  const imageNode = registry.createCanvasNode("input.images", "image", { x: 0, y: 0 }); imageNode.config.urls = ["red"];
  const videoNode = registry.createCanvasNode("input.videos", "video", { x: 0, y: 0 }); videoNode.config.urls = ["short"];
  const graph = { nodes: [node, imageNode, videoNode], edges: [{ id: "i", source: "image", sourcePort: "images", target: "compose", targetPort: "images" }, { id: "v", source: "video", sourcePort: "videos", target: "compose", targetPort: "videos" }], viewport: { x: 0, y: 0, zoom: 1 } };
  assert.equal(graphLib.validateCanvasGraph(graph).valid, true);
  assert.deepEqual(serialization.decodeCanvasGraph(JSON.parse(JSON.stringify(graph))), graph);
  assert.deepEqual(workflow.parseCanvasWorkflowFile(JSON.stringify(workflow.createCanvasWorkflowFile("Layers", graph))).graph, graph);
  const clipboard = require(path.join(temp, "clipboard.js"));
  const payload = clipboard.createCanvasClipboardPayload(graph.nodes, graph.edges, graph.nodes.map((entry) => entry.id));
  const pasted = clipboard.instantiateCanvasClipboardPayload(payload, { x: 40, y: 60 }, (kind, index) => `${kind}-${index}`);
  assert.deepEqual(pasted.nodes.find((entry) => entry.type === "utility.layer-compose").config.composition, cropConfig);
  const inputs = require(path.join(temp, "layer-compose-inputs.js")).resolveComposeEditorSources(graph, "compose", new Map()); assert.equal(inputs.length, 2);
  const draft = structuredClone(graph); delete draft.nodes[0].config.composition.layers[0].source;
  assert.equal(graphLib.validateCanvasGraphForPersistence(draft).valid, true); assert.equal(graphLib.validateCanvasGraph(draft).valid, false);
  console.log("Layer composition: real PNG pixels/crop/alpha/cache, MP4 endings/audio/duration, failure cleanup, identity, graph and workflow round trips passed.");
} finally { rmSync(temp, { recursive: true, force: true }); }
