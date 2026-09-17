import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-image-process-"));
const read = (name) => readFileSync(path.join(root, name), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function load(file, modules = {}) {
  const loadedModule = { exports: {} };
  Function("require", "module", "exports", "process", compile(read(file)))((name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name.startsWith("node:") || name === "sharp") return require(name);
    throw new Error(`Unexpected dependency ${name}`);
  }, loadedModule, loadedModule.exports, { ...process, cwd: () => temp });
  return loadedModule.exports;
}
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
try {
  const contract = load("src/lib/canvas/image-process-contract.ts");
  const config = (patch = {}) => contract.resolveImageProcessConfig(patch);
  let materializations = 0, persists = 0;
  const sources = new Map();
  const processor = load("src/lib/canvas/image-process.ts", {
    "./image-process-contract": contract,
    "../concurrency": { runWithConcurrencyPool: async (name, task) => { assert.equal(name, "localImage"); return task(); } },
    "../runtime-media-materializer": { materializeRuntimeMedia: async (url) => {
      materializations++; assert.ok(sources.has(url));
      return { filePath: sources.get(url), cleanup: async () => {} };
    } },
    "../runtime-media-storage": { persistRuntimeMedia: async (input) => {
      persists++; const bytes = readFileSync(input.filePath);
      const metadata = await sharp(bytes).metadata();
      assert.equal(input.contentType, `image/${metadata.format}`);
      return input.publicPath;
    } },
    "./directory-snapshots": { getCanvasDirectorySnapshot: async (id, owner) => {
      assert.equal(id, "snapshot");
      if (owner !== "owner") throw new Error("Unauthorized snapshot");
      return { groups: [{ images: [{ id: "directory", absolutePath: sources.get("source") }] }] };
    } },
  });
  const transparent = await sharp({ create: { width: 320, height: 160, channels: 4, background: { r: 220, g: 30, b: 50, alpha: 0.5 } } }).png().toBuffer();
  const noise = Buffer.alloc(512 * 320 * 3);
  let seed = 127;
  for (let i = 0; i < noise.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noise[i] = seed >>> 24; }
  const photo = await sharp(noise, { raw: { width: 512, height: 320, channels: 3 } }).png().toBuffer();
  for (const format of ["jpeg", "png", "webp"]) {
    const encoded = await processor.encodeCanvasImage(transparent, config({ format }));
    const meta = await sharp(encoded.buffer).metadata();
    assert.equal(meta.format, format); assert.equal(meta.width, 320); assert.equal(meta.height, 160);
    assert.equal(meta.hasAlpha, format !== "jpeg"); assert.equal(meta.exif, undefined);
  }
  for (const [settings, width, height] of [
    [{ resizeMode: "percent", scalePercent: 50 }, 160, 80],
    [{ resizeMode: "longest", longestEdge: 120 }, 120, 60],
    [{ resizeMode: "custom", width: 100, height: 100, fit: "inside" }, 100, 50],
    [{ resizeMode: "custom", width: 100, height: 100, fit: "cover" }, 100, 100],
    [{ resizeMode: "custom", width: 100, height: 100, fit: "contain" }, 100, 100],
  ]) {
    const result = await processor.encodeCanvasImage(transparent, config(settings));
    assert.deepEqual([result.width, result.height], [width, height]);
  }
  const padded = await processor.encodeCanvasImage(transparent, config({ format: "png", resizeMode: "custom", width: 100, height: 100, fit: "contain", background: "transparent" }));
  const raw = await sharp(padded.buffer).raw().toBuffer(); assert.equal(raw[3], 0);
  const white = await processor.encodeCanvasImage(transparent, config({ format: "png", resizeMode: "custom", width: 100, height: 100, fit: "contain" }));
  assert.deepEqual([...await sharp(white.buffer).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()], [255, 255, 255, 255]);
  const oriented = await sharp(transparent).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotated = await processor.encodeCanvasImage(oriented, config());
  assert.deepEqual([rotated.width, rotated.height, rotated.sourceWidth, rotated.sourceHeight], [160, 320, 160, 320]);
  assert.equal((await sharp(rotated.buffer).metadata()).orientation, undefined);
  for (const format of ["jpeg", "webp"]) {
    const high = await processor.encodeCanvasImage(photo, config({ format, quality: 90 }));
    const low = await processor.encodeCanvasImage(photo, config({ format, quality: 75 }));
    const targetKB = Math.ceil((high.buffer.length + low.buffer.length) / 2048);
    const result = await processor.encodeCanvasImage(photo, config({ format, compressionMode: "size", targetKB }));
    assert.ok(result.buffer.length <= targetKB * 1024); assert.ok(result.quality >= 75 && result.quality <= 90);
    assert.deepEqual([result.width, result.height], [512, 320]);
    await assert.rejects(processor.encodeCanvasImage(photo, config({ format, compressionMode: "size", targetKB: 1 })), /目标.*最低画质 75/);
    const percent = await processor.encodeCanvasImage(photo, config({ format, compressionMode: "percent", targetPercent: 80 }));
    assert.ok(percent.buffer.length <= Math.floor(photo.length * 0.8));
  }
  await assert.rejects(processor.encodeCanvasImage(photo, config({ format: "png", compressionMode: "size", targetKB: 1 })), /PNG 无损/);
  await assert.rejects(processor.encodeCanvasImage(Buffer.from("corrupt"), config()));
  const animated = await sharp(Buffer.concat([Buffer.alloc(16 * 16 * 3, 0), Buffer.alloc(16 * 16 * 3, 255)]), { raw: { width: 16, height: 32, channels: 3, pageHeight: 16 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  await assert.rejects(processor.encodeCanvasImage(animated, config()), /动画/);
  // APNG animation metadata is not surfaced by Sharp's PNG decoder; a valid acTL chunk must still be rejected.
  const animationControl = Buffer.alloc(20);
  animationControl.writeUInt32BE(8, 0); animationControl.write("acTL", 4); animationControl.writeUInt32BE(2, 8);
  let crc = 0xffffffff;
  for (const byte of animationControl.subarray(4, 16)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  animationControl.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
  const apng = Buffer.concat([transparent.subarray(0, 33), animationControl, transparent.subarray(33)]);
  await assert.rejects(processor.encodeCanvasImage(apng, config()), /动画/);
  await assert.rejects(processor.encodeCanvasImage(Buffer.alloc(contract.IMAGE_PROCESS_LIMITS.bytes + 1), config()), /30 MB/);
  await assert.rejects(processor.encodeCanvasImage(transparent, config({ resizeMode: "custom", width: 8192, height: 8192, fit: "cover" })), /4000 万/);
  const oversized = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(processor.encodeCanvasImage(oversized, config()), /pixel limit/);
  assert.throws(() => config({ quality: 0 })); assert.throws(() => config({ compressionMode: "size", minQuality: 91 }));
  assert.throws(() => config({ format: "jpeg", background: "transparent" }));
  assert.equal(contract.imageProcessConfigKey({}), contract.imageProcessConfigKey({ width: 19, scalePercent: 33 }));
  assert.notEqual(contract.imageProcessConfigKey({}), contract.imageProcessConfigKey({ quality: 89 }));

  const sourceFile = path.join(temp, "source.png"); writeFileSync(sourceFile, photo); sources.set("source", sourceFile);
  const items = [{ url: "source", name: "first.png", localPath: "must-not-be-used", sha256: "stale" }, { url: "source", name: "second.png" }];
  const output = await processor.processCanvasImages(items, {}, "owner");
  assert.deepEqual(output.map((item) => item.name), ["first.jpg", "second.jpg"]);
  assert.equal(output[0].url, output[1].url); assert.equal(output[0].localPath, undefined);
  assert.equal(hash(readFileSync(sourceFile)), hash(photo));
  assert.equal(output[0].sha256, hash(readFileSync(path.join(temp, "public", output[0].url))));
  assert.equal(output[0].imageProcessing.sourceBytes, photo.length);
  const download = load("src/lib/canvas/image-download.ts", {
    "../image-format": load("src/lib/image-format.ts"),
    "./save-images": load("src/lib/canvas/save-images.ts"),
  });
  const inspected = await download.inspectCanvasImageDownload(path.join(temp, "public", output[0].url));
  assert.equal(inspected.size, output[0].imageProcessing.outputBytes);
  assert.equal(inspected.mimeType, "image/jpeg"); assert.equal(inspected.extension, ".jpg");
  const again = await processor.processCanvasImages([items[0]], {}, "owner"); assert.deepEqual(again[0], output[0]);
  const changed = await processor.processCanvasImages([items[0]], { quality: 80 }, "owner"); assert.notEqual(changed[0].url, output[0].url);
  writeFileSync(sourceFile, transparent);
  const changedSource = await processor.processCanvasImages([items[0]], {}, "owner"); assert.notEqual(changedSource[0].url, output[0].url);
  const directory = await processor.processCanvasImages([{ url: "/api/canvas/local-directory/media?snapshot=snapshot&media=directory" }], {}, "owner");
  assert.equal(directory.length, 1);
  await assert.rejects(processor.processCanvasImages([{ url: "/api/canvas/local-directory/media?snapshot=snapshot&media=directory" }], {}, "other"), /Unauthorized/);
  await assert.rejects(processor.processCanvasImages([], {}, "owner"), /1–20/);
  await assert.rejects(processor.processCanvasImages(Array(21).fill(items[0]), {}, "owner"), /1–20/);
  const bad = path.join(temp, "bad.png"); writeFileSync(bad, "broken"); sources.set("bad", bad);
  await assert.rejects(processor.processCanvasImages([items[0], { url: "bad" }], {}, "owner"), /第 2 张/);
  assert.ok(materializations > 0 && persists > 0);
  assert.ok(readdirSync(path.join(temp, "data/cache/canvas-image-process")).every((file) => !file.endsWith(".tmp")));

  // Exercise actual registry, graph, nested iteration and scheduler contracts in an isolated module tree.
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageResolutions=['1k'];exports.toApisImageRatios=['1:1'];");
  writeFileSync(path.join(temp, "feishu-publish-mode.js"), "exports.feishuPublishModeOptions=[];exports.normalizeFeishuPublishMode=v=>v||'full';");
  writeFileSync(path.join(temp, "image-model-options.js"), compile(read("src/lib/image-model-options.ts")));
  for (const name of ["layer-compose-contract", "image-process-contract", "types", "node-utils", "source-video-contract", "video-loader", "content-collection", "content-collection-schedule", "save-images", "seedance-references", "subtitle-style", "subtitle-editor", "registry", "graph", "iteration", "serialization", "scheduler-v2"]) {
    writeFileSync(path.join(temp, `${name}.js`), compile(read(`src/lib/canvas/${name}.ts`).replaceAll('"../toapis-image-api"', '"./toapis-image-api"').replaceAll('"../feishu-publish-mode"', '"./feishu-publish-mode"').replaceAll('"../image-model-options"', '"./image-model-options"')));
  }
  const registry = require(path.join(temp, "registry.js"));
  const graphLib = require(path.join(temp, "graph.js"));
  const serialization = require(path.join(temp, "serialization.js"));
  const iteration = require(path.join(temp, "iteration.js"));
  const scheduler = require(path.join(temp, "scheduler-v2.js"));
  const source = registry.createCanvasNode("input.images", "source", { x: 0, y: 0 }); source.config.urls = ["https://fixture.invalid/image.png"];
  const node = registry.createCanvasNode("utility.image-process", "process", { x: 300, y: 0 });
  const graph = { nodes: [source, node], edges: [{ id: "e", source: "source", sourcePort: "images", target: "process", targetPort: "images" }], viewport: { x: 0, y: 0, zoom: 1 } };
  assert.equal(graphLib.validateCanvasGraph(graph).valid, true);
  assert.deepEqual(serialization.decodeCanvasGraph(JSON.parse(JSON.stringify(graph))), graph);
  node.executionMode = "bypass";
  assert.equal(graphLib.buildCanvasRunPlan(graph).steps.find((step) => step.nodeId === "process").action, "bypass");
  node.executionMode = "enabled";
  const region = registry.createCanvasNode("utility.image-iterate", "region", { x: 0, y: 0 });
  region.iteration.graph.nodes = [region.iteration.graph.nodes[0], node];
  region.iteration.graph.edges = [{ id: "inner", source: region.iteration.graph.nodes[0].id, sourcePort: "images", target: node.id, targetPort: "images" }];
  region.iteration.outputs = { images: { nodeId: node.id, outputPort: "images" } };
  assert.deepEqual(iteration.validateCanvasIteration(region), []);
  assert.doesNotThrow(() => scheduler.validateCanvasScheduleV2Definition(graph, { parameters: [{ id: "images", name: "图片", scope: "child", expansion: "each", valueType: "image", binding: { nodeId: "source", fieldKey: "urls" }, source: { mode: "manual-list", values: [{ id: "asset", url: "https://fixture.invalid/image.png" }] } }], sharedOutputs: [], expansion: { main: "cartesian", child: "cartesian" }, childResult: { nodeId: "process", outputPort: "images", artifactKind: "images" }, aggregationPolicy: "all" }));
  assert.equal(registry.getCanvasNodeDefinition("utility.image-transform").defaultConfig.preset, "xiaohongshu");
  // Executor preserves batch metadata and only exposes complete output groups.
  const executorText = read("src/lib/canvas/executors.ts");
  const ast = ts.createSourceFile("executors.ts", executorText, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === "executeImageProcess");
  const execute = Function("processCanvasImages", "imageItems", `${compile(fn.getText(ast))};return executeImageProcess;`)(processor.processCanvasImages, (artifacts) => artifacts.flatMap((artifact) => artifact.items));
  const batch = { fixture: "identity" };
  const executed = await execute({ node, account: { id: "owner" }, inputs: { images: [{ kind: "images", items: [items[0]], imageBatch: batch }] } });
  assert.equal(executed.outputs.images.imageBatch, batch);
  assert.equal(executed.outputs.images.items.length, 1);
  console.log("Canvas image processing: real encoders, targets, geometry, alpha, orientation, limits, batch/cache/ownership, graph/bypass/iteration/scheduler passed.");
} finally { rmSync(temp, { recursive: true, force: true }); }
