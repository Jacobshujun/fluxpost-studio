import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, readdir, rm, unlink, truncate } from "node:fs/promises";
import * as fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), "fluxpost-local-save-"));
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const jpeg = Buffer.from([255, 216, 255, 224, 0, 0]);
const fixtures = new Map();
let enabled = true;
let denied = false;
let failWrite = false;
let cleanupCount = 0;
const reads = [];
const modules = new Map();
const stubs = {
  "./directory-snapshots": { canvasLocalDirectoryEnabled: () => enabled },
  "../runtime-media-materializer": {
    materializeRuntimeMedia: async (url, options) => {
      reads.push(url);
      assert.equal(options.maxBytes, 30 * 1024 * 1024);
      const filePath = fixtures.get(url);
      if (!filePath) throw new Error("fixture source unavailable");
      return { filePath, cleanup: async () => { cleanupCount++; } };
    },
  },
  "node:fs/promises": {
    ...fs,
    mkdir: async (...args) => {
      if (denied) throw Object.assign(new Error("fixture denied"), { code: "EACCES" });
      return fs.mkdir(...args);
    },
    open: async (...args) => {
      const handle = await fs.open(...args);
      if (!failWrite || args[1] !== "wx") return handle;
      return {
        writeFile: async () => { throw Object.assign(new Error("fixture disk full"), { code: "ENOSPC" }); },
        close: () => handle.close(),
      };
    },
  },
};
async function load(relative) {
  if (modules.has(relative)) return modules.get(relative);
  const source = await readFile(path.join(root, relative), "utf8");
  const imports = [...source.matchAll(/from "(\.[^"]+)"/g)].map((match) => match[1]);
  const dependencies = {};
  for (const specifier of imports) {
    if (specifier in stubs) continue;
    if (specifier === "./types") { dependencies[specifier] = {}; continue; }
    dependencies[specifier] = await load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier + ".ts")));
  }
  const loadedModule = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", output)((specifier) => stubs[specifier] || dependencies[specifier] || require(specifier), loadedModule, loadedModule.exports);
  modules.set(relative, loadedModule.exports);
  return loadedModule.exports;
}

try {
  await writeFile(path.join(temp, "source.wrong"), png);
  await writeFile(path.join(temp, "source.jpg"), jpeg);
  fixtures.set("/generated/a.jpg", path.join(temp, "source.wrong"));
  fixtures.set("/generated/b.png", path.join(temp, "source.jpg"));
  const { saveCanvasImagesToFolder: save } = await load("src/lib/canvas/local-image-save.ts");
  const validation = await load("src/lib/canvas/save-images.ts");
  assert.equal(validation.validateCanvasImageOutputFolder(undefined), undefined);
  assert.equal(validation.validateCanvasImageOutputFolder("D:\\图片 输出"), undefined);
  for (const folder of [23, "x\n", "https://example.test", "D:relative"]) assert.ok(validation.validateCanvasImageOutputFolder(folder));
  let checkpoint;
  const base = {
    runId: "run-one", nodeId: "save", outputFolder: path.join(temp, "中文 空格", "nested"), filenamePrefix: "小鹏",
    urls: ["/generated/a.jpg", "/generated/b.png"],
    checkpoint: async (value) => { checkpoint = structuredClone(value); },
  };
  const first = await save(base);
  assert.deepEqual(first.items.map((item) => item.status), ["saved", "saved"]);
  assert.equal(path.basename(first.items[0].filePath), "小鹏_0001.png");
  assert.equal(path.basename(first.items[1].filePath), "小鹏_0002.jpg");
  assert.deepEqual(await readFile(first.items[0].filePath), png);
  assert.deepEqual(await readFile(first.items[1].filePath), jpeg);
  assert.equal(cleanupCount, 2);
  assert.deepEqual(checkpoint, first);
  const readCount = reads.length;
  assert.deepEqual(await save({ ...base, previous: first }), first);
  assert.equal(reads.length, readCount, "successful retry must not fetch images again");
  const crashed = structuredClone(first);
  crashed.items[1].status = "pending";
  assert.equal((await save({ ...base, previous: crashed })).items[1].status, "saved", "crash after write is recovered by hash");
  const unclaimed = structuredClone(first);
  unclaimed.items[0].claimed = false;
  assert.notEqual((await save({ ...base, previous: unclaimed })).items[0].filePath, first.items[0].filePath, "a planned but unclaimed concurrent file is never reused");
  await unlink(first.items[1].filePath);
  assert.equal((await save({ ...base, previous: first })).items[1].status, "saved", "missing saved files are restored");
  await writeFile(first.items[0].filePath, "user changed file");
  const repaired = await save({ ...base, previous: first });
  assert.notEqual(repaired.items[0].filePath, first.items[0].filePath);
  assert.equal(await readFile(first.items[0].filePath, "utf8"), "user changed file");
  const newRun = await save({ ...base, runId: "new-run", previous: repaired });
  assert.notEqual(newRun.items[0].filePath, repaired.items[0].filePath);
  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, i) => save({ ...base, runId: `concurrent-${i}` })));
  assert.equal(new Set(concurrent.flatMap((value) => value.items.map((item) => item.filePath))).size, 16);
  for (const value of concurrent) assert.ok(value.items.every((item) => item.status === "saved"));
  const relative = path.relative(root, path.join(temp, "relative"));
  assert.equal((await save({ ...base, outputFolder: relative })).outputFolder, path.resolve(root, relative));
  const broken = await save({ ...base, runId: "partial", urls: [base.urls[0], "missing"] });
  assert.deepEqual(broken.items.map((item) => item.status), ["saved", "failed"]);
  fixtures.set("missing", path.join(temp, "source.jpg"));
  const retried = await save({ ...base, runId: "partial", urls: [base.urls[0], "missing"], previous: broken });
  assert.equal(retried.items[0].filePath, broken.items[0].filePath);
  assert.ok(retried.items.every((item) => item.status === "saved"));
  const fileFolder = await save({ ...base, outputFolder: path.join(temp, "source.jpg") });
  assert.ok(fileFolder.items.every((item) => item.status === "failed"));
  denied = true;
  assert.match((await save(base)).items[0].error, /权限/);
  denied = false;
  failWrite = true;
  const diskFullFolder = path.join(temp, "disk-full");
  assert.match((await save({ ...base, outputFolder: diskFullFolder })).items[0].error, /空间不足/);
  assert.deepEqual(await readdir(diskFullFolder), [], "ordinary write failures remove only files created by this attempt");
  failWrite = false;
  enabled = false;
  await assert.rejects(() => save(base), /未启用/);
  enabled = true;
  await assert.rejects(() => save({ ...base, checkpoint: async () => { throw new Error("checkpoint unavailable"); } }), /checkpoint unavailable/);
  await assert.rejects(() => save({ ...base, urls: Array(31).fill(base.urls[0]) }), /30/);
  await writeFile(path.join(temp, "invalid"), "not image");
  fixtures.set("invalid", path.join(temp, "invalid"));
  assert.match((await save({ ...base, urls: ["invalid"] })).items[0].error, /recognized image/);
  await writeFile(path.join(temp, "oversize"), png);
  await truncate(path.join(temp, "oversize"), 30 * 1024 * 1024 + 1);
  fixtures.set("oversize", path.join(temp, "oversize"));
  assert.match((await save({ ...base, urls: ["oversize"] })).items[0].error, /byte limit/);

  // Execute the actual save-node function with real filesystem behavior and isolated media fixtures.
  const source = await readFile(path.join(root, "src/lib/canvas/executors.ts"), "utf8");
  const ast = ts.createSourceFile("executors.ts", source, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter((statement) => ts.isFunctionDeclaration(statement) && ["executeSaveImages", "imageItems"].includes(statement.name?.text));
  const code = ts.transpileModule(functions.map((fn) => fn.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const execute = new Function("saveCanvasImagesToFolder", "CANVAS_SAVE_IMAGE_MAX_ITEMS", code + "\nreturn executeSaveImages;")(save, 30);
  const node = { id: "save", config: { filenamePrefix: "测试", outputFolder: path.join(temp, "executor") } };
  const inputs = { images: [{ kind: "images", items: [{ url: base.urls[0] }, { url: "still-missing" }] }] };
  const result = await execute({ node, inputs, runId: "executor", onInternalMetadataUpdate: async (value) => { checkpoint = value; } });
  assert.match(result.failure, /成功 1 张，失败 1 张/);
  assert.equal(result.outputs.downloads.items.length, 2);
  assert.deepEqual(result.internalMetadata, checkpoint);
  const legacy = await execute({ node: { id: "save", config: { filenamePrefix: "测试" } }, inputs, runId: "legacy" });
  assert.equal(legacy.internalMetadata, undefined);
  assert.equal(legacy.outputs.downloads.items.length, 2);
  console.log("PASS Canvas local image saving: real files, collisions/concurrency, retry/checkpoint, limits, errors and executor integration");
} finally {
  await rm(temp, { recursive: true, force: true });
}
