import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";

const root = process.cwd(), require = createRequire(import.meta.url);
const temporary = await mkdtemp(path.join(tmpdir(), "qwen-runtime-"));
const endpoint = "https://fixture.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const account = { id: "owner", role: "operator", displayName: "Fixture" };
const node = { id: "qwen", type: "model.qwen-image", version: 1, config: { endpoint } };
const workflow = { id: "workflow", ownerUserId: "owner", graph: { nodes: [node] } };
const run = { id: "run", workflowId: "workflow", ownerUserId: "owner", graphSnapshot: { nodes: [structuredClone(node)] } };
const db = new Map(), calls = [], persisted = [];
let storageFails = false, responseMode = "ok", downloadedAuth;
const png = await sharp({ create: { width: 512, height: 512, channels: 4, background: "orange" } }).png().toBuffer();
const stubs = {
  "../database": {
    readAppMetaValue: async (key) => db.get(key), writeAppMetaValue: async (key, value) => db.set(key, value),
    compareAndSetAppMetaValue: async (key, expected, value) => { if (db.get(key) !== expected) return false; db.set(key, value); return true; },
    getCanvasWorkflowFromDb: async (id) => id === "workflow" ? workflow : undefined,
    getCanvasRunFromDb: async (id) => id === "run" ? run : undefined,
  },
  "../workspace-ownership": { canAccessWorkspaceOwner: (actor, owner) => actor.id === owner || actor.role === "admin" },
  "./concurrency": { runWithConcurrencyPool: async (_name, task, options) => { options.signal.throwIfAborted(); return task(); } },
  "./runtime-media-materializer": { materializeRuntimeMedia: async (_url, options) => { options.signal.throwIfAborted(); return { filePath: path.join(temporary, "reference.png"), cleanup: async () => {} }; } },
  "./runtime-media-storage": { persistRuntimeMedia: async (input) => { if (storageFails) throw new Error("private-storage-secret"); persisted.push(input); return input.publicPath; } },
  "./canvas/directory-snapshots": { getCanvasDirectorySnapshot: async (_id, owner) => { assert.equal(owner, "owner"); return { groups: [{ images: [{ id: "image", absolutePath: path.join(temporary, "reference.png") }] }] }; } },
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} }; cache.set(file, loadedModule);
  const source = readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  Function("require", "module", "exports", output)((name) => name in stubs ? stubs[name] : name.startsWith(".") ? load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name + ".ts"))) : require(name), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const originalFetch = globalThis.fetch;
try {
  process.chdir(temporary);
  await writeFile(path.join(temporary, "reference.png"), png);
  const credentials = load("src/lib/canvas/qwen-credentials.ts");
  const target = { workflowId: "workflow", nodeId: "qwen" };
  assert.deepEqual(await credentials.qwenCredentialStatus(target, account), { configured: false });
  await assert.rejects(credentials.saveQwenCredential(target, { ...account, id: "other" }, "secret", endpoint), /无权/);
  await assert.rejects(credentials.qwenCredentialForRun("run", node, account), /保存/);
  await Promise.all([credentials.saveQwenCredential(target, account, "fixture-secret", endpoint), credentials.saveQwenCredential(target, account, "fixture-secret", endpoint)]);
  assert.equal((await credentials.qwenCredentialForRun("run", node, account)).apiKey, "fixture-secret");
  assert.ok(!JSON.stringify([...db]).includes("fixture-secret"));
  assert.deepEqual(await credentials.qwenCredentialStatus(target, account), { configured: true });
  node.config.endpoint = endpoint.replace("fixture.", "other.");
  assert.deepEqual(await credentials.qwenCredentialStatus(target, account), { configured: false });
  await assert.rejects(credentials.qwenCredentialForRun("run", run.graphSnapshot.nodes[0], account), /保存/);
  await assert.rejects(credentials.saveQwenCredential(target, account, "secret", endpoint), /改变/);
  node.config.endpoint = endpoint;
  await credentials.removeQwenCredential(target, account);
  await assert.rejects(credentials.qwenCredentialForRun("run", node, account), /保存/);
  await credentials.saveQwenCredential(target, account, "fixture-secret", endpoint);
  const master = path.join(temporary, "data/canvas-secrets/qwen-master.key");
  const key = await readFile(master);
  await rm(master);
  await assert.rejects(credentials.saveQwenCredential(target, account, "new-secret", endpoint), /丢失/);
  await writeFile(master, key);
  assert.equal((await credentials.qwenCredentialForRun("run", node, account)).apiKey, "fixture-secret");
  const inner = { ...node, id: "inner" };
  workflow.graph.nodes.push({ id: "region", type: "utility.image-iterate", iteration: { graph: { nodes: [inner] } } });
  await credentials.saveQwenCredential({ ...target, nodeId: "inner", regionId: "region" }, account, "inner-secret", endpoint);
  run.iterationContext = { regionNodeId: "region" };
  run.graphSnapshot.nodes = [inner];
  assert.equal((await credentials.qwenCredentialForRun("run", inner, account)).apiKey, "inner-secret");
  await assert.rejects(credentials.qwenCredentialForRun("run", inner, { ...account, id: "other" }), /无权/);

  globalThis.fetch = async (url, init) => {
    init.signal.throwIfAborted();
    if (url === endpoint) {
      calls.push({ url, ...init, parsed: JSON.parse(init.body) });
      if (responseMode === "401") return new Response("fixture-secret", { status: 401 });
      if (responseMode === "malformed") return Response.json({ code: "Error", message: "fixture-secret" });
      if (responseMode === "empty") return Response.json({ output: { choices: [] } });
      return Response.json({ output: { choices: [{ finish_reason: "stop", message: { content: [{ image: "https://fixture.oss-cn-beijing.aliyuncs.com/image.png?Expires=1" }] } }] } });
    }
    downloadedAuth = init.headers;
    assert.equal(init.redirect, "error");
    return new Response(responseMode === "bad-image" ? "not an image" : png);
  };
  const { generateQwenImages: generate } = load("src/lib/qwen-image.ts");
  const base = { endpoint, apiKey: "fixture-secret", prompt: "edit", images: [], promptExtend: false, count: 1, account };
  const output = await generate(base);
  assert.equal(output[0].width, 512); assert.ok(output[0].url.startsWith("/generated/qwen-"));
  assert.equal(calls[0].headers.Authorization, "Bearer fixture-secret");
  assert.equal(calls[0].parsed.parameters.prompt_extend, false);
  assert.equal(downloadedAuth, undefined);
  await generate({ ...base, images: [{ url: "/media/a.png" }, { url: `data:image/png;base64,${png.toString("base64")}` }, { url: "/api/canvas/local-directory/media?snapshot=one&media=image" }] });
  assert.equal(calls.at(-1).parsed.input.messages[0].content.length, 4);
  assert.equal(calls.at(-1).parsed.input.messages[0].content[0].image, calls.at(-1).parsed.input.messages[0].content[1].image);
  const before = calls.length;
  await assert.rejects(generate({ ...base, images: Array(4).fill({ url: "/media/a.png" }) }), /3/);
  await assert.rejects(generate({ ...base, prompt: " " }), /提示词/);
  await assert.rejects(generate({ ...base, signal: AbortSignal.abort() }));
  assert.equal(calls.length, before);
  for (const mode of ["401", "malformed", "empty", "bad-image"]) {
    responseMode = mode;
    await assert.rejects(generate(base), (error) => !error.message.includes("fixture-secret") && error.message.startsWith("Qwen:"));
  }
  responseMode = "ok"; storageFails = true;
  await assert.rejects(generate(base), /保存失败/);
  storageFails = false;
  await assert.rejects(generate({ ...base, size: "1024*1024" }), /尺寸/);
  const tooWide = await sharp({ create: { width: 110, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(generate({ ...base, images: [{ url: `data:image/png;base64,${tooWide.toString("base64")}` }] }), /10:1/);
  assert.equal(persisted.length, 2);
  const executorSource = readFileSync(path.join(root, "src/lib/canvas/executors.ts"), "utf8");
  const executorModule = { exports: {} };
  const imports = Object.fromEntries([...executorSource.matchAll(/from "([^"\n]+)"/g)].map((match) => [match[1], {}]));
  let executorInput;
  imports["../qwen-image"] = { generateQwenImages: async (input) => { executorInput = input; return [{ url: "/generated/fixture.png" }]; } };
  imports["./qwen-credentials"] = credentials;
  Function("require", "module", "exports", ts.transpileModule(executorSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(
    (name) => name.startsWith("node:") ? require(name) : imports[name], executorModule, executorModule.exports);
  inner.config = { ...inner.config, prompt: "local instruction", count: 1, promptExtend: false };
  const inputs = { prompt: [{ kind: "text", value: "first" }, { kind: "text", value: "second" }], references: [{ kind: "images", items: [{ url: "a" }, { url: "a" }, { url: "b" }] }] };
  const result = await executorModule.exports.executeCanvasNode({ node: inner, runId: "run", account, inputs });
  assert.equal(result.outputs.images.items[0].url, "/generated/fixture.png");
  assert.equal(executorInput.prompt, "first\n\nsecond\n\nlocal instruction");
  assert.deepEqual(executorInput.images.map((item) => item.url), ["a", "a", "b"]);
  assert.equal(executorInput.promptExtend, false);
  await credentials.removeQwenCredential({ ...target, nodeId: "inner", regionId: "region" }, account);
  await assert.rejects(executorModule.exports.executeCanvasNode({ node: inner, runId: "run", account, inputs }), executorModule.exports.CanvasNeedsConfigError);
  console.log("Qwen runtime: encrypted credentials, ownership, endpoint binding, iteration, request/media, limits, cancellation and safe failures passed.");
} finally {
  globalThis.fetch = originalFetch; process.chdir(root);
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(temporary, { recursive: true, force: true });
}
