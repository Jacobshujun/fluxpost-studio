import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
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
    if (name === "./video-encoding") return load("src/lib/canvas/video-encoding.ts");
    if (name.startsWith("node:") || name === "sharp") return require(name);
    throw new Error(`Unexpected dependency ${name}`);
  }, loaded, loaded.exports, { ...process, cwd: () => temp });
  return loaded.exports;
}
const sources = new Map();
let cleanups = 0, digestReads = 0, probes = 0, failProbe = false;
const materializer = { resolveRuntimeMediaReference: async (url) => {
  assert.ok(sources.has(url), `No external media allowed: ${url}`);
  return { url, localPath: url.startsWith("https:") ? undefined : sources.get(url) };
}, materializeRuntimeMedia: async (url) => {
  assert.ok(sources.has(url), `No external media allowed: ${url}`);
  return { filePath: sources.get(url), cleanup: async () => { cleanups++; } };
} };
const storage = { findExistingRuntimeMedia: async () => undefined, persistRuntimeMedia: async (input) => { assert.ok(readFileSync(input.filePath).length); return input.publicPath; } };
const concurrency = { runWithConcurrencyPool: async (name, task) => { assert.ok(["localImage", "localVideo", "mediaMetadata"].includes(name)); return task(); } };
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" });
try {
  const contract = load("src/lib/canvas/layer-compose-contract.ts");
  const media = load("src/lib/canvas/media-tools.ts", { "../concurrency": concurrency, "../runtime-media-materializer": materializer, "../runtime-media-storage": storage, "./node-utils": {}, "./types": {} });
  const renderer = load("src/lib/canvas/layer-compose.ts", { "node:fs": { createReadStream: (...args) => { digestReads++; return createReadStream(...args); } }, "./layer-compose-contract": contract, "./media-tools": { ...media, probeCanvasMediaFile: async (...args) => { probes++; if (failProbe) throw new Error("fixture probe failure"); return media.probeCanvasMediaFile(...args); } }, "../concurrency": concurrency, "../runtime-media-materializer": materializer, "../runtime-media-storage": storage, "./directory-snapshots": { getCanvasDirectorySnapshot: async (_id, owner) => { assert.equal(owner, "owner"); return { groups: [{ images: [{ id: "image", absolutePath: sources.get("red") }] }] }; } } });
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
  const readsBefore = digestReads, probesBefore = probes;
  const inspected = await Promise.all(Array.from({ length: 5 }, () => renderer.inspectComposeSource(videoSources[0], "owner")));
  assert.equal(inspected[0].hasAudio, true); assert.equal(inspected[0].durationSeconds, 1);
  await renderer.inspectComposeSource(videoSources[0], "owner");
  assert.equal(probes, probesBefore + 1, "concurrent and repeated local inspections share one probe");
  await renderer.inspectComposeSource(videoSources[0], "another-owner");
  assert.equal(probes, probesBefore + 2, "metadata cache is owner scoped");
  utimesSync(shortFile, new Date(), new Date(Date.now() + 2000));
  await renderer.inspectComposeSource(videoSources[0], "owner");
  assert.equal(probes, probesBefore + 3, "same URL with changed local stat must re-probe");
  failProbe = true;
  await assert.rejects(renderer.inspectComposeSource(videoSources[1], "owner"), /fixture probe failure/);
  failProbe = false;
  assert.equal((await renderer.inspectComposeSource(videoSources[1], "owner")).hasAudio, false, "failed request can retry");
  sources.set("https://fixture.invalid/short.mp4", shortFile);
  await renderer.inspectComposeSource(source("video", "https://fixture.invalid/short.mp4"), "owner");
  const remoteProbes = probes;
  await renderer.inspectComposeSource(source("video", "https://fixture.invalid/short.mp4"), "owner");
  assert.equal(probes, remoteProbes, "remote warm inspection uses metadata cache without another download");
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try { await renderer.inspectComposeSource(source("video", "https://fixture.invalid/short.mp4"), "owner"); }
  finally { Date.now = realNow; }
  assert.equal(probes, remoteProbes + 1, "mutable remote URL is inspected again after the short TTL");
  const privateImage = source("image", "/api/canvas/local-directory/media?snapshot=fixture&media=image");
  await renderer.inspectComposeSource(privateImage, "owner");
  await assert.rejects(renderer.inspectComposeSource(privateImage, "another-owner"), /owner/);
  assert.equal(digestReads, readsBefore, "preview inspection never hashes the full file");
  await assert.rejects(renderer.renderLayerComposition(config([make("v", "video", { source: bind("video", "short") })]), [{ ...videoSources[0], media: { url: "short", sha256: "wrong" } }], "owner"), /改变/);
  assert.ok(digestReads > readsBefore, "render still hashes and rejects changed content after inspection");

  const loading = load("src/lib/canvas/layer-compose-metadata.ts", { "./layer-compose-contract": contract });
  const changes = [], deferred = [];
  const loader = loading.createComposeMetadataLoader((id, state) => changes.push({ id, state }), (item, signal) => new Promise((resolve, reject) => deferred.push({ item, signal, resolve, reject })));
  const complete = { ...videoSources[0], width: 100, height: 100, durationSeconds: 1, hasAudio: false };
  loader.ensure(complete); assert.equal(deferred.length, 0, "upstream metadata avoids inspection, including no-audio video");
  for (const item of [...videoSources, source("image", "red"), ...videoSources]) loader.ensure(item);
  assert.equal(deferred.length, 2, "two active inspections, duplicates deduplicated");
  deferred[0].reject(new Error("fixture error"));
  await new Promise(setImmediate);
  assert.equal(deferred.length, 3, "failure releases a slot for another source");
  assert.equal(changes.find((entry) => entry.state.status === "error").id, "video:url:short");
  loader.retry(videoSources[0]); assert.equal(deferred.length, 3);
  deferred[1].resolve({ ...complete, ...videoSources[1] }); await new Promise(setImmediate);
  assert.equal(deferred.length, 4, "manual retry queued and started");
  deferred[3].resolve(complete); await new Promise(setImmediate);
  assert.equal(changes.at(-1).state.status, "ready");
  loader.ensure(source("image", "alpha")); loader.ensure(source("image", "never-start"));
  const requestsBeforeClose = deferred.length, updatesBeforeClose = changes.length;
  loader.dispose();
  for (const request of deferred) { assert.equal(request.signal.aborted, true); request.resolve(complete); }
  await new Promise(setImmediate);
  assert.equal(changes.length, updatesBeforeClose, "late completion does not update a closed editor");
  assert.equal(deferred.length, requestsBeforeClose, "queued work does not start after close");
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
  // A generated output can change URL and content on every run. The composition
  // follows its selected upstream output, retaining the original crop/geometry.
  assert.deepEqual(inputs[0].binding, { nodeId: "image", port: "images" });
  assert.deepEqual(inputs[1].binding, { nodeId: "video", port: "videos" });
  const boundImage = { ...red, source: contract.composeLayerSource(inputs[0]), x: 7, width: 80, crop: { x: .5, y: 0, width: .5, height: 1 } };
  const boundConfig = config([boundImage]);
  const inputCollection = read("src/lib/canvas/runs.ts").match(/function collectInputs\([\s\S]*?(?=\r?\nfunction missingRequiredInput)/)[0];
  const collectInputs = Function("bindComposeInput", `${compile(inputCollection)}; return collectInputs;`)(contract.bindComposeInput);
  const outputs = new Map([["image", { images: { kind: "images", items: [{ url: "alpha" }] } }]]);
  const gathered = collectInputs(graph.edges, "compose", outputs, true);
  const rerunSources = contract.composeSources(gathered.images.flatMap((a) => a.items), []);
  assert.equal(contract.findComposeSource(boundImage, rerunSources).media.url, "alpha");
  assert.equal(outputs.get("image").images.items[0].composeBinding, undefined, "input binding never mutates upstream artifacts");
  assert.deepEqual(collectInputs(graph.edges, "compose", outputs).images[0], outputs.get("image").images, "other consumers retain original artifacts");
  const beforeBound = structuredClone(boundConfig);
  const firstBoundRender = await renderer.renderLayerComposition(boundConfig, inputs, "owner");
  const secondBoundRender = await renderer.renderLayerComposition(boundConfig, rerunSources, "owner");
  assert.notEqual(firstBoundRender.item.url, secondBoundRender.item.url, "fresh output uses fresh rendered content/cache");
  assert.deepEqual(boundConfig, beforeBound, "rerunning never changes saved layout/crop");
  assert.ok((await pixel(secondBoundRender, 40, 50))[2] > 240, "new blue image is actually rendered");
  await assert.rejects(renderer.renderLayerComposition(boundConfig, [], "owner"), /上游输出不可用/);
  const wrongOrigin = contract.composeSources(contract.bindComposeInput(outputs.get("image").images, "different-node", "images").items, []);
  assert.equal(contract.findComposeSource(boundImage, wrongOrigin), undefined, "same kind never matches a different upstream");
  const multi = contract.bindComposeInput({ kind: "images", items: [{ url: "red", composeBinding: inputs[0].binding }, { url: "alpha" }] }, "image", "images");
  const multiSources = contract.composeSources(multi.items, []);
  assert.ok(multiSources.every((s) => !s.binding));
  assert.equal(contract.findComposeSource(boundImage, multiSources), undefined, "single-to-multiple must not pick the first item, even with the old URL present");
  assert.equal(contract.findComposeSource(red, multiSources).media.url, "red", "legacy and multi-item content selections remain supported");
  const conflicting = [...rerunSources, { ...inputs[0], key: "url:other" }];
  assert.equal(contract.findComposeSource(boundImage, conflicting), undefined, "ambiguous bound inputs fail closed");
  const sameMedia = contract.composeSources(["left", "right"].flatMap((id) => contract.bindComposeInput({ kind: "images", items: [{ url: "alpha" }] }, id, "images").items), []);
  assert.equal(sameMedia.length, 2, "equal content from distinct upstream nodes retains both bindings");
  assert.notEqual(loading.composeMetadataId(sameMedia[0]), loading.composeMetadataId(sameMedia[1]));
  const twinLayers = sameMedia.map((s, i) => make(`twin-${i}`, "image", { source: contract.composeLayerSource(s), x: i * 50, width: 50 }));
  await renderer.renderLayerComposition(config(twinLayers), sameMedia, "owner");
  const boundVideo = make("bound-video", "video", { source: contract.composeLayerSource(inputs[1]) });
  const freshVideo = contract.composeSources([], contract.bindComposeInput({ kind: "videos", items: [{ url: "long" }] }, "video", "videos").items);
  assert.equal((await renderer.renderLayerComposition(config([boundVideo]), freshVideo, "owner")).item.durationSeconds, 2);
  const corruptBinding = structuredClone(boundConfig); corruptBinding.layers[0].source.binding.nodeId = "";
  assert.equal(contract.isLayerComposeConfig(corruptBinding), false);
  const boundGraph = structuredClone(graph); boundGraph.nodes[0].config.composition = boundConfig;
  assert.deepEqual(serialization.decodeCanvasGraph(JSON.parse(JSON.stringify(boundGraph))), boundGraph);
  const boundPayload = clipboard.createCanvasClipboardPayload(boundGraph.nodes, boundGraph.edges, boundGraph.nodes.map((n) => n.id));
  const boundPaste = clipboard.instantiateCanvasClipboardPayload(boundPayload, { x: 0, y: 0 }, (kind, index) => `${kind}-${index}`);
  assert.equal(boundPaste.nodes[0].config.composition.layers[0].source.binding.nodeId, boundPaste.nodes[1].id);
  assert.equal(boundPayload.nodes[0].config.composition.layers[0].source.binding.nodeId, "image", "paste must not mutate clipboard source");
  const uploadGraph = structuredClone(graph);
  uploadGraph.nodes[2].type = "input.video-loader";
  uploadGraph.nodes[2].config = { selectedVideoId: "upload", videos: [{ id: "upload", filename: "short.mp4", url: "short", width: 100, height: 100, durationSeconds: 1, hasAudio: false, bytes: 100, mimeType: "video/mp4", uploadedAt: "2026-09-17T00:00:00Z" }] };
  const uploadedSource = require(path.join(temp, "layer-compose-inputs.js")).resolveComposeEditorSources(uploadGraph, "compose", new Map())[1];
  assert.equal(uploadedSource.hasAudio, false); assert.equal(loading.hasComposeMetadata(uploadedSource), true);
  const draft = structuredClone(graph); delete draft.nodes[0].config.composition.layers[0].source;
  assert.equal(graphLib.validateCanvasGraphForPersistence(draft).valid, true); assert.equal(graphLib.validateCanvasGraph(draft).valid, false);
  // TOS persistence consumes the local output after verifying the uploaded bytes.
  // Exercise both newly rendered and cached outputs without contacting storage.
  for (const kind of ["image", "video"]) {
    const persistenceConfig = config([kind === "image" ? red : boundVideo], { background: "#123456" });
    const persistenceSources = kind === "image" ? [source("image", "red")] : freshVideo;
    const localPersist = storage.persistRuntimeMedia;
    const local = await renderer.renderLayerComposition(persistenceConfig, persistenceSources, "owner");
    for (const cached of [true, false]) {
      const localPath = outputPath(local);
      assert.equal(existsSync(localPath), cached);
      let uploadedDigest;
      storage.persistRuntimeMedia = async (input) => {
        uploadedDigest = createHash("sha256").update(readFileSync(input.filePath)).digest("hex");
        rmSync(input.filePath);
        return `https://storage.invalid${input.publicPath}`;
      };
      try {
        const persisted = await renderer.renderLayerComposition(persistenceConfig, persistenceSources, "owner");
        assert.equal(persisted.item.url, `https://storage.invalid${local.item.url}`);
        assert.equal(persisted.item.sha256, uploadedDigest, "metadata retains the uploaded byte digest");
        assert.equal(persisted.kind, kind === "image" ? "images" : "videos");
        assert.equal(existsSync(localPath), false, "persistence cleanup remains intact");
      } finally { storage.persistRuntimeMedia = localPersist; }
    }
  }
  if (process.argv.includes("--nvenc")) {
    const previousEncoder = process.env.FFMPEG_VIDEO_ENCODER;
    process.env.FFMPEG_VIDEO_ENCODER = "h264_nvenc";
    try {
      const video = await renderer.renderLayerComposition(config([make("gpu", "video", { source: bind("video", "short") })], {
        width: 320, height: 180, audioLayerId: "gpu",
      }), videoSources, "owner");
      const metadata = await media.probeCanvasMediaFile(outputPath(video));
      assert.equal(metadata.width, 320); assert.equal(metadata.height, 180); assert.equal(metadata.hasAudio, true);
      const receipt = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", outputPath(video)], { encoding: "utf8" }));
      assert.match(receipt.streams.find((stream) => stream.codec_type === "video").tags.encoder, /h264_nvenc/);
      await assert.rejects(renderer.renderLayerComposition(config([make("gpu-small", "video", { source: bind("video", "short") })]), videoSources, "owner"), /minimum supported value/);
      const slideshow = await media.renderCanvasImageSlideshow({
        images: [{ url: "red" }], audio: { url: "short" }, durationSeconds: 1,
        ratio: "1:1", transition: "none", motion: false, seed: "gpu-fixture",
      });
      const slideshowReceipt = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", path.join(temp, "public", slideshow.url)], { encoding: "utf8" }));
      assert.match(slideshowReceipt.streams.find((stream) => stream.codec_type === "video").tags.encoder, /h264_nvenc/);
      assert.equal(slideshowReceipt.streams.find((stream) => stream.codec_type === "audio").codec_name, "aac");
      console.log("NVENC layer composition and slideshow: actual GPU receipts/audio; unsupported tiny dimensions fail explicitly.");
    } finally {
      if (previousEncoder === undefined) delete process.env.FFMPEG_VIDEO_ENCODER;
      else process.env.FFMPEG_VIDEO_ENCODER = previousEncoder;
    }
  }
  console.log("Layer composition: PNG/MP4 rendering, metadata reuse/cache/expiry/ownership, no-preview-hash, loading concurrency/retry/cancellation, graph and workflow round trips passed.");
} finally { rmSync(temp, { recursive: true, force: true }); }
