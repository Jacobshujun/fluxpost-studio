import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";

const root = process.cwd(), require = createRequire(import.meta.url);
const registry = require("tsx/cjs/api").require(path.join(root, "src/lib/canvas/registry.ts"), path.join(root, "package.json"));
const temporary = await mkdtemp(path.join(tmpdir(), "wonder-runtime-"));
const endpoint = "https://yike.cn-shanghai.aliyuncs.com/";
const account = { id: "owner", role: "operator", displayName: "Fixture" };
const node = { id: "wonder", type: "model.wonder-image", version: 1, config: { endpoint } };
const workflow = { id: "workflow", ownerUserId: "owner", graph: { nodes: [node] } };
const run = { id: "run", workflowId: "workflow", ownerUserId: "owner", graphSnapshot: { nodes: [structuredClone(node)] } };
const db = new Map(), calls = [], persisted = [];
let mediaReady = false, jobStatus = "Finished", downloadedAuth, storageEnabled = true, thirdPartyReady = true, duplicateImport = false;
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
  "./runtime-media-storage": {
    isRuntimeMediaStorageEnabled: () => storageEnabled,
    persistLibraryObject: async (input) => { persisted.push({ kind: "reference", ...input }); return { publicUrl: "https://public.example/reference.png" }; },
    persistRuntimeMedia: async (input) => { persisted.push({ kind: "output", ...input }); return input.publicPath; },
  },
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
  const credentials = load("src/lib/canvas/wonder-credentials.ts");
  const target = { workflowId: "workflow", nodeId: "wonder" };
  assert.deepEqual(await credentials.wonderCredentialStatus(target, account), { configured: false });
  await assert.rejects(credentials.saveWonderCredential(target, { ...account, id: "other" }, "secret", endpoint), /无权/);
  await assert.rejects(credentials.wonderCredentialForRun("run", node, account), /保存/);
  await Promise.all([credentials.saveWonderCredential(target, account, "fixture-secret", endpoint), credentials.saveWonderCredential(target, account, "fixture-secret", endpoint)]);
  assert.equal((await credentials.wonderCredentialForRun("run", node, account)).apiKey, "fixture-secret");
  assert.ok(!JSON.stringify([...db]).includes("fixture-secret"));
  assert.deepEqual(await credentials.wonderCredentialStatus(target, account), { configured: true });
  node.config.endpoint = endpoint.replace("cn-shanghai", "ap-southeast-1");
  assert.deepEqual(await credentials.wonderCredentialStatus(target, account), { configured: false });
  await assert.rejects(credentials.wonderCredentialForRun("run", run.graphSnapshot.nodes[0], account), /保存/);
  await assert.rejects(credentials.saveWonderCredential(target, account, "secret", endpoint), /改变/);
  node.config.endpoint = endpoint;
  await credentials.removeWonderCredential(target, account);
  await assert.rejects(credentials.wonderCredentialForRun("run", node, account), /保存/);
  await credentials.saveWonderCredential(target, account, "fixture-secret", endpoint);
  const master = path.join(temporary, "data/canvas-secrets/wonder-master.key");
  const key = await readFile(master);
  await rm(master);
  await assert.rejects(credentials.saveWonderCredential(target, account, "new-secret", endpoint), /丢失/);
  await writeFile(master, key);
  assert.equal((await credentials.wonderCredentialForRun("run", node, account)).apiKey, "fixture-secret");
  const inner = { ...node, id: "inner" };
  workflow.graph.nodes.push({ id: "region", type: "utility.image-iterate", iteration: { graph: { nodes: [inner] } } });
  await credentials.saveWonderCredential({ ...target, nodeId: "inner", regionId: "region" }, account, "inner-secret", endpoint);
  run.iterationContext = { regionNodeId: "region" };
  run.graphSnapshot.nodes = [inner];
  assert.equal((await credentials.wonderCredentialForRun("run", inner, account)).apiKey, "inner-secret");
  await assert.rejects(credentials.wonderCredentialForRun("run", inner, { ...account, id: "other" }), /无权/);
  run.iterationContext = undefined; run.graphSnapshot.nodes = [node];

  globalThis.fetch = async (url, init) => {
    init?.signal?.throwIfAborted();
    if (new URL(url).origin === new URL(endpoint).origin) {
      const parsed = new URLSearchParams(init.body), action = init.headers["x-acs-action"];
      calls.push({ url, action, init, parsed });
      assert.equal(init.headers.Authorization, "fixture-secret");
      assert.match(init.headers["x-acs-date"], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.equal(init.headers["x-acs-version"], "2026-07-07");
      assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
      assert.deepEqual(Object.keys(init.headers).sort(), ["Authorization", "Content-Type", "x-acs-action", "x-acs-date", "x-acs-version"].sort(), "API-key authentication must not acquire RAM signature/nonce headers.");
      assert.equal(url, endpoint, "Match the official curl root URL without additional query parameters.");
      assert.equal(parsed.get("Format"), "JSON", "The official curl contract sends Format in the form body.");
      if (action === "ImportMedia") {
        if (duplicateImport) return Response.json({ Code: "MediaAlreadyExist", Message: 'The media with the given inputUrl "https://public.example/reference.png" has already been registered with mediaId "media-existing".' }, { status: 400 });
        return Response.json({ MediaId: "media-one" });
      }
      if (action === "GetMedia") { const value = mediaReady; mediaReady = true; return Response.json({ MediaInfo: { MediaBasicInfo: { Status: value ? "Normal" : "Processing" }, MediaDynamicInfo: { DynamicMetaData: { Data: JSON.stringify({ ThirdPartyAssetStatus: thirdPartyReady ? "Success" : "Failed" }) } } } }); }
      if (action === "SubmitImageGenerationJob") return Response.json({ JobId: "ag-one" });
      if (action === "GetImageGenerationJob") return Response.json({ ImageGenerationJob: { JobId: "ag-one", Status: jobStatus, Output: JSON.stringify({ Medias: [{ MediaId: "result", OutputUrl: "https://signed.example/image.png?secret=private" }] }) } });
      throw new Error(`Unexpected action ${action}`);
    }
    downloadedAuth = init?.headers;
    return new Response(png);
  };
  const { generateWonderImages: generate } = load("src/lib/wonder-image.ts");
  const base = { endpoint, apiKey: "fixture-secret", prompt: "edit", model: "qwen-image-3.0", images: [], count: 1, resolution: "1K", aspectRatio: "16:9", account };
  const submitted = await generate(base);
  assert.deepEqual(submitted, { jobId: "ag-one", status: "Created", pending: true });
  const submit = calls.find((call) => call.action === "SubmitImageGenerationJob");
  assert.equal(submit.parsed.get("JobType"), "text_to_image");
  assert.equal(submit.parsed.get("N"), "1");
  const beforeResume = calls.length;
  jobStatus = "Executing";
  assert.deepEqual(await generate({ ...base, resumeJobId: "ag-one" }), { jobId: "ag-one", status: "Executing", pending: true });
  assert.equal(calls.length, beforeResume + 1);
  assert.equal(calls.filter((call) => call.action === "SubmitImageGenerationJob").length, 1);
  jobStatus = "Finished";
  const completed = await generate({ ...base, resumeJobId: "ag-one" });
  assert.equal(completed.pending, false); assert.equal(completed.items[0].width, 512); assert.ok(completed.items[0].url.startsWith("/generated/wonder-"));
  assert.deepEqual(await readFile(path.join(temporary, "public", completed.items[0].url)), png, "Output bytes must survive temporary download cleanup even with local storage.");
  assert.equal(downloadedAuth, undefined);
  const curlPrompt = "一只戴宇航头盔的柯基，漂浮在星云中，电影级光影";
  await generate({ ...base, model: "qwen-image-2.0", prompt: curlPrompt });
  const curlSubmit = calls.filter((call) => call.action === "SubmitImageGenerationJob").at(-1);
  assert.deepEqual([...curlSubmit.parsed].sort(), [
    ["Format", "JSON"], ["JobType", "text_to_image"], ["Model", "qwen-image-2.0"], ["Scene", "general"],
    ["Input", JSON.stringify({ Prompt: curlPrompt })], ["Resolution", "1K"], ["AspectRatio", "16:9"], ["N", "1"],
  ].sort(), "Decoded fields must match the official curl, including Unicode and the selected model; field order is not an API requirement.");
  const publicReference = { url: "https://public.example/reference.png" };
  await generate({ ...base, images: [publicReference] });
  const edited = calls.filter((call) => call.action === "SubmitImageGenerationJob").at(-1);
  assert.equal(edited.parsed.get("JobType"), "image_to_image");
  assert.deepEqual(JSON.parse(edited.parsed.get("Input")).Medias, [{ Type: "image", MediaId: "media-one" }]);
  assert.equal(calls.filter((call) => call.action === "GetMedia").length, 2);
  assert.equal(calls.find((call) => call.action === "ImportMedia").parsed.has("RegisterConfig"), false);
  await generate({ ...base, model: "Wonder-Image-2.5-Pro", images: [publicReference] });
  assert.deepEqual(JSON.parse(calls.filter((call) => call.action === "ImportMedia").at(-1).parsed.get("RegisterConfig")), { NeedThirdPartyAsset: true });
  assert.equal(calls.filter((call) => call.action === "SubmitImageGenerationJob").at(-1).parsed.get("Model"), "Wonder-Image-2.5-Pro");
  duplicateImport = true;
  const duplicateStart = calls.length, persistedBeforeDuplicate = persisted.length;
  const duplicateResult = await generate({ ...base, images: [publicReference] });
  assert.equal(duplicateResult.pending, true, "An already-registered reference should continue to submission.");
  assert.deepEqual(calls.slice(duplicateStart).map((call) => call.action), ["ImportMedia", "GetMedia", "SubmitImageGenerationJob"]);
  assert.equal(calls[duplicateStart].parsed.get("Overwrite"), "false");
  assert.equal(calls[duplicateStart + 1].parsed.get("MediaId"), "media-existing");
  assert.equal(persisted.length, persistedBeforeDuplicate, "Reuse must not upload or persist a second reference.");
  assert.deepEqual(JSON.parse(calls.filter((call) => call.action === "SubmitImageGenerationJob").at(-1).parsed.get("Input")).Medias, [{ Type: "image", MediaId: "media-existing" }]);
  const duplicateResumeStart = calls.length;
  await generate({ ...base, images: [publicReference], resumeJobId: duplicateResult.jobId });
  assert.deepEqual(calls.slice(duplicateResumeStart).map((call) => call.action), ["GetImageGenerationJob"], "Resume must not register or submit again.");
  await generate({ ...base, model: "Wonder-Image-2.5-Pro", images: [publicReference] });
  assert.deepEqual(JSON.parse(calls.filter((call) => call.action === "SubmitImageGenerationJob").at(-1).parsed.get("Input")).Medias, [{ Type: "image", MediaId: "media-existing" }]);
  thirdPartyReady = false;
  const duplicateFailureStart = calls.length;
  await assert.rejects(generate({ ...base, model: "Wonder-Image-2.5-Pro", images: [publicReference] }), /GetMedia.*失败/);
  assert.deepEqual(calls.slice(duplicateFailureStart).map((call) => call.action), ["ImportMedia", "GetMedia"], "Reuse cannot bypass Wonder asset readiness.");
  thirdPartyReady = true;
  duplicateImport = false;
  thirdPartyReady = false;
  const submitsBeforeFailure = calls.filter((call) => call.action === "SubmitImageGenerationJob").length;
  await assert.rejects(generate({ ...base, model: "Wonder-Image-2.5-Pro", images: [publicReference] }), /GetMedia.*失败/);
  assert.equal(calls.filter((call) => call.action === "SubmitImageGenerationJob").length, submitsBeforeFailure);
  thirdPartyReady = true;
  await generate({ ...base, images: [{ url: "/media/a.png" }, { url: `data:image/png;base64,${png.toString("base64")}` }, { url: "/api/canvas/local-directory/media?snapshot=one&media=image" }] });
  assert.equal(persisted.filter((item) => item.kind === "reference").length, 3);
  const beforeInvalid = calls.length;
  await assert.rejects(generate({ ...base, images: Array(10).fill(publicReference) }), /9/);
  await assert.rejects(generate({ ...base, prompt: " " }), /提示词/);
  await assert.rejects(generate({ ...base, signal: AbortSignal.abort() }));
  assert.equal(calls.length, beforeInvalid);
  storageEnabled = false;
  await assert.rejects(generate({ ...base, images: [{ url: "/media/a.png" }] }), /对象存储/);
  storageEnabled = true;
  const small = await sharp({ create: { width: 399, height: 512, channels: 3, background: "red" } }).png().toBuffer();
  await writeFile(path.join(temporary, "reference.png"), small);
  await assert.rejects(generate({ ...base, images: [publicReference] }), /400px/);
  await writeFile(path.join(temporary, "reference.png"), png);
  globalThis.fetch = async () => new Response(JSON.stringify({ Code: "InvalidApiKey", Message: "fixture-secret https://private.invalid", RequestId: "json-request-123" }), { status: 401 });
  await assert.rejects(generate({ ...base, resumeJobId: "ag-one" }), (error) => !error.message.includes("fixture-secret") && !error.message.includes("https://") && error.message.includes("InvalidApiKey") && error.message.includes("GetImageGenerationJob") && error.message.includes("json-request-123"));
  for (const responseBody of ["<Error><Code>private-xml-secret</Code></Error>", "<!doctype html><html>private-html-secret</html>", "private-plain-secret"]) {
    globalThis.fetch = async () => new Response(responseBody, { status: 400, headers: { "x-acs-request-id": "request-fixture-123" } });
    await assert.rejects(generate(base), (error) => error.message.includes("SubmitImageGenerationJob") && error.message.includes("HTTP 400") && error.message.includes("request-fixture-123") && !error.message.includes("private-"));
    await assert.rejects(generate({ ...base, images: [publicReference] }), /ImportMedia.*HTTP 400/);
  }
  globalThis.fetch = async () => Response.json({ Code: "InputCensorBlocked", Message: "fixture-secret https://signed.invalid/image?Signature=private" });
  await assert.rejects(generate(base), (error) => error.message.includes("InputCensorBlocked") && !error.message.includes("fixture-secret") && !error.message.includes("https://"));
  for (const reply of [
    { Code: "MediaAlreadyExist", Message: "missing ID fixture-secret https://signed.invalid/image?Signature=private" },
    { Code: "Forbidden", MediaId: "media-existing", Message: "has already been registered with mediaId \"media-existing\"." },
  ]) {
    const rejectedActions = [];
    globalThis.fetch = async (_url, init) => { rejectedActions.push(init.headers["x-acs-action"]); return Response.json(reply, { status: 400 }); };
    await assert.rejects(generate({ ...base, images: [publicReference] }), (error) => error.message.includes("ImportMedia") && !Object.hasOwn(error, "body") && !error.message.includes("https://") && !error.message.includes("fixture-secret"));
    assert.deepEqual(rejectedActions, ["ImportMedia"]);
  }
  globalThis.fetch = async () => Response.json({ Code: "MediaAlreadyExist", MediaId: "media-existing" }, { status: 400 });
  await assert.rejects(generate(base), /SubmitImageGenerationJob.*HTTP 400/, "Only ImportMedia can reuse a duplicate media ID.");
  await assert.rejects(generate({ ...base, resumeJobId: "ag-one" }), /GetImageGenerationJob.*HTTP 400/);
  globalThis.fetch = async () => Response.json({ Code: "MediaAlreadyExist", MediaId: "media-existing", Message: "duplicate fixture-secret https://signed.invalid/image?Signature=private" }, { status: 500 });
  await assert.rejects(generate({ ...base, images: [publicReference] }), /ImportMedia.*HTTP 500/, "Do not recover duplicate-looking provider failures outside HTTP 400.");
  globalThis.fetch = async () => Response.json({ Code: "MissingSignatureNonce", Message: "SignatureNonce is mandatory for this action.", RequestId: "auth-fixture-123" }, { status: 400 });
  for (const input of [base, { ...base, images: [publicReference] }, { ...base, resumeJobId: "ag-one" }]) {
    await assert.rejects(generate(input), (error) => error.message.includes("MissingSignatureNonce") && error.message.includes("HTTP 400") && error.message.includes("auth-fixture-123") && error.message.includes("AliyunYikeFullAccess") && error.message.includes("重新授权") && error.message.includes("站点") && error.message.includes("无需添加") && !error.message.includes("fixture-secret"));
  }
  globalThis.fetch = async () => { throw new Error("private fetch detail"); };
  await assert.rejects(generate({ ...base, resumeJobId: "ag-one" }), (error) => !error.message.includes("private fetch detail"));

  const executorSource = readFileSync(path.join(root, "src/lib/canvas/executors.ts"), "utf8");
  const executorModule = { exports: {} };
  const imports = Object.fromEntries([...executorSource.matchAll(/from "([^"\n]+)"/g)].map((match) => [match[1], {}]));
  let executorInput;
  imports["../wonder-image"] = { generateWonderImages: async (input) => { executorInput = input; return { jobId: "ag-test", status: "Created", pending: true }; } };
  imports["./wonder-credentials"] = credentials;
  imports["./registry"] = registry;
  Function("require", "module", "exports", ts.transpileModule(executorSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(
    (name) => name.startsWith("node:") ? require(name) : imports[name], executorModule, executorModule.exports);
  node.config = { ...node.config, prompt: "local instruction", model: "qwen-image-3.0", count: 1, resolution: "1K", aspectRatio: "1:1" };
  let providerState;
  const inputs = { prompt: [{ kind: "text", value: "first" }, { kind: "text", value: "second" }], references: [{ kind: "images", items: [{ url: "a" }, { url: "a" }, { url: "b" }] }] };
  const result = await executorModule.exports.executeCanvasNode({ node, runId: "run", account, inputs, onProviderTaskUpdate: async (state) => { providerState = state; } });
  assert.equal(result.pending, true); assert.equal(providerState.taskId, "ag-test");
  assert.equal(executorInput.prompt, "first\n\nsecond\n\nlocal instruction");
  assert.deepEqual(executorInput.images.map((item) => item.url), ["a", "b"]);
  assert.equal(executorInput.resumeJobId, undefined);
  await executorModule.exports.executeCanvasNode({ node, runId: "run", account, inputs, previousNodeRun: { providerTaskId: "ag-test" } });
  assert.equal(executorInput.resumeJobId, "ag-test");
  node.config.referenceUrls = ["direct", "a"];
  const numbered = { ...inputs, image_9: [{ kind: "images", items: [{ url: "nine" }] }], image_2: [{ kind: "images", items: [{ url: "two" }, { url: "a" }] }] };
  await executorModule.exports.executeCanvasNode({ node, runId: "run", account, inputs: numbered });
  assert.deepEqual(executorInput.images.map((item) => item.url), ["direct", "a", "b", "two", "nine"]);
  await assert.rejects(executorModule.exports.executeCanvasNode({ node, runId: "run", account, inputs: { image_1: [{ kind: "images", items: Array.from({ length: 10 }, (_, index) => ({ url: `extra-${index}` })) }] } }), /9/);
  const runs = ts.createSourceFile("runs.ts", readFileSync(path.join(root, "src/lib/canvas/runs.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const bypassFunctions = runs.statements.filter((statement) => ts.isFunctionDeclaration(statement) && ["resolveBypassOutputs", "mergeArtifacts"].includes(statement.name?.text)).map((statement) => statement.getText()).join("\n");
  const scope = { ...imports["./registry"], mergeCanvasImageBatchSummaries: () => undefined, structuredClone };
  const bypass = Function(...Object.keys(scope), ts.transpileModule(bypassFunctions, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + "\nreturn resolveBypassOutputs;")(...Object.values(scope));
  assert.deepEqual(bypass({ ...node, executionMode: "bypass" }, numbered).images.items.map((item) => item.url), ["direct", "a", "b", "two", "nine"]);
  assert.equal(bypass({ ...node, config: {}, executionMode: "bypass" }, {}), undefined);
  await credentials.removeWonderCredential(target, account);
  await assert.rejects(executorModule.exports.executeCanvasNode({ node, runId: "run", account, inputs }), executorModule.exports.CanvasNeedsConfigError);
  console.log("Wonder Image runtime: credentials, media, async resume, result persistence, limits, cancellation and safe failures passed.");
} finally {
  globalThis.fetch = originalFetch; process.chdir(root);
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
