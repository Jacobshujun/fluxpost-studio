import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
const temp = await mkdtemp(path.join(tmpdir(), "fluxpost-gemini-"));
const logs = [], requests = [], cleanup = [], proxyConnections = [];
const config = { geminiApiKey: "fixture-key", geminiBaseUrl: "", geminiModel: "fixture-flash", geminiProxyEnabled: false, geminiProxyUrl: "", geminiRequestTimeoutMs: 5000 };
const account = { id: "owner-a", displayName: "Fixture", role: "operator" };
const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
const jpeg = Buffer.from([255,216,255,224,0]);
const fixtures = new Map();
let mode = "ok", materializeHook, directoryOwner;
const stubs = {
  "./config": { appConfig: config },
  "./activity-log": { recordExecutionLog: async (entry) => logs.push(entry) },
  "./runtime-media-materializer": { materializeRuntimeMedia: async (url, options) => {
    await materializeHook?.(options.signal);
    options.signal.throwIfAborted();
    const filePath = fixtures.get(url);
    if (!filePath) throw new Error("fixture private-path secret-image missing");
    return { filePath, cleanup: async () => cleanup.push(url) };
  } },
  "./canvas/directory-snapshots": { getCanvasDirectorySnapshot: async (_id, owner) => {
    directoryOwner = owner;
    if (owner !== "owner-a") throw new Error("denied private directory");
    return { groups: [{ images: [{ id: "image-a", absolutePath: fixtures.get("/media/a") }] }] };
  } },
  "../toapis-image-api": { toApisImageRatios: ["1:1"], toApisImageResolutions: ["1k", "2k", "4k"] },
};
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const loadedModule = { exports: {} };
  cache.set(relative, loadedModule);
  const source = readFileSync(relative, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  Function("require", "module", "exports", output)((name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith(".")) return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), `${name}.ts`)));
    return require(name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  requests.push({ url: req.url, key: req.headers["x-goog-api-key"], body: JSON.parse(body) });
  const current = mode;
  res.setHeader("Content-Type", "application/json");
  if (typeof current === "number") { res.writeHead(current); res.end("secret provider body fixture-key"); return; }
  if (current === "blocked") { res.end(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })); return; }
  if (current === "empty") { res.end(JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: "private thought" }] } }] })); return; }
  if (current === "truncate") { res.end(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }] })); return; }
  if (current === "body-wait") { res.writeHead(200); res.write('{"candidates":'); return; }
  res.end(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private thought" }, { text: "回答" }, { text: "正文" }] } }] }));
});
const proxySockets = new Set();
const proxyServer = http.createServer();
proxyServer.on("connect", (req, socket, head) => {
  proxyConnections.push(req.url);
  const [hostname, port] = req.url.split(":");
  assert.equal(hostname, "127.0.0.1", "offline proxy must never connect externally");
  const upstream = net.connect(Number(port), hostname, () => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) upstream.write(head);
    upstream.pipe(socket); socket.pipe(upstream);
  });
  for (const item of [socket, upstream]) {
    proxySockets.add(item);
    item.on("close", () => proxySockets.delete(item));
    item.on("error", () => { socket.destroy(); upstream.destroy(); });
  }
});
const listen = (s) => new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
const oldLimit = process.env.WORKER_GPT_CONCURRENCY;
process.env.WORKER_GPT_CONCURRENCY = "1";
try {
  await listen(server); await listen(proxyServer);
  config.geminiBaseUrl = `http://127.0.0.1:${server.address().port}/v1beta`;
  config.geminiProxyUrl = `http://127.0.0.1:${proxyServer.address().port}`;
  for (const [url, data] of [["/media/a", png], ["/media/b", jpeg], ["/media/big", Buffer.alloc(7 * 1024 * 1024 + 1)], ["/media/many", Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)])]]) {
    const filename = path.join(temp, url.split("/").at(-1)); await writeFile(filename, data); fixtures.set(url, filename);
  }
  const { callGeminiForText: call, GeminiNeedsConfigError } = load("src/lib/gemini.ts");
  const base = { prompt: "fixture user prompt", images: [], account };
  assert.equal(await call(base), "回答正文");
  assert.match(requests.at(-1).url, /fixture-flash:generateContent$/);
  assert.equal(requests.at(-1).key, "fixture-key");
  assert.deepEqual(requests.at(-1).body.contents[0].parts, [{ text: base.prompt }]);
  assert.equal(await call({ ...base, model: "models/fixture-pro", images: [{ url: "/media/b" }, { url: "/media/a" }, { url: "/media/b" }] }), "回答正文");
  assert.match(requests.at(-1).url, /fixture-pro:generateContent$/);
  assert.deepEqual(requests.at(-1).body.contents[0].parts.slice(1).map((part) => part.inlineData.mimeType), ["image/jpeg", "image/png", "image/jpeg"]);
  assert.equal(requests.at(-1).body.contents[0].parts[2].inlineData.data, png.toString("base64"));
  await call({ ...base, images: [{ url: "/api/canvas/local-directory/media?snapshot=fixture&media=image-a" }] });
  assert.equal(directoryOwner, "owner-a");
  await assert.rejects(call({ ...base, account: { ...account, id: "other" }, images: [{ url: "/api/canvas/local-directory/media?snapshot=fixture&media=image-a" }] }), /Gemini 请求失败/);

  // In-flight config is immutable even while reading a picture.
  materializeHook = async () => { config.geminiModel = "fixture-new"; config.geminiApiKey = "fixture-new-key"; config.geminiProxyEnabled = true; };
  await call({ ...base, images: [{ url: "/media/a" }] });
  assert.match(requests.at(-1).url, /fixture-flash:generateContent$/);
  assert.equal(requests.at(-1).key, "fixture-key");
  assert.equal(proxyConnections.length, 0);
  materializeHook = undefined;
  await call(base);
  assert.equal(proxyConnections.length, 1);
  assert.match(requests.at(-1).url, /fixture-new:generateContent$/);
  assert.equal(requests.at(-1).key, "fixture-new-key");
  config.geminiProxyEnabled = false; await call(base);
  assert.equal(proxyConnections.length, 1, "proxy off takes effect on next request");

  config.geminiApiKey = ""; await assert.rejects(call(base), GeminiNeedsConfigError);
  config.geminiApiKey = "fixture-key"; config.geminiModel = ""; await assert.rejects(call(base), GeminiNeedsConfigError);
  await call({ ...base, model: "fixture-override" }); config.geminiModel = "fixture-flash";
  await assert.rejects(call({ ...base, model: "../bad" }), /模型 ID/);
  const before = requests.length;
  await assert.rejects(call({ ...base, images: Array(9).fill({ url: "/media/a" }) }), /8 张/);
  await assert.rejects(call({ ...base, images: [{ url: "/media/big" }] }), /7MiB/);
  await assert.rejects(call({ ...base, images: Array(5).fill({ url: "/media/many" }) }), /20MB/);
  await assert.rejects(call({ ...base, prompt: " " }), /指令或上游/);
  const gif = path.join(temp, "gif"); await writeFile(gif, "GIF89afixture"); fixtures.set("/media/gif", gif);
  await assert.rejects(call({ ...base, images: [{ url: "/media/gif" }] }), /JPEG、PNG 和 WebP/);
  assert.equal(requests.length, before);
  for (const status of [400,401,403,404,429,502]) {
    mode = status; await assert.rejects(call(base), new RegExp(`Gemini HTTP ${status}`));
  }
  mode = "blocked"; await assert.rejects(call(base), /安全策略/);
  mode = "truncate"; await assert.rejects(call(base), /长度限制/);
  mode = "empty"; await assert.rejects(call(base), /有效文本/);
  mode = "body-wait"; config.geminiRequestTimeoutMs = 80;
  await assert.rejects(call(base), /超时/);
  config.geminiRequestTimeoutMs = 5000;
  const cancel = new AbortController();
  const active = call({ ...base, signal: cancel.signal });
  setTimeout(() => cancel.abort(new DOMException("cancel fixture", "AbortError")), 60);
  await assert.rejects(active, /cancel fixture/);
  mode = "ok";
  const pool = load("src/lib/concurrency.ts");
  let release;
  const held = pool.runWithConcurrencyPool("gpt", () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve(); await Promise.resolve();
  const queuedCancel = new AbortController();
  const queued = call({ ...base, signal: queuedCancel.signal });
  setTimeout(() => queuedCancel.abort(new Error("queued cancel")), 30);
  await assert.rejects(queued, /queued cancel/); release(); await held;
  assert.equal(pool.getConcurrencySnapshot().gpt.active, 0);
  assert.equal(pool.getConcurrencySnapshot().gpt.queued, 0);
  const imageCancel = new AbortController();
  materializeHook = (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  const reading = call({ ...base, images: [{ url: "/media/a" }], signal: imageCancel.signal });
  imageCancel.abort(new Error("image cancel")); await assert.rejects(reading, /image cancel/);
  config.geminiRequestTimeoutMs = 30;
  await assert.rejects(call({ ...base, images: [{ url: "/media/a" }] }), /超时/);
  config.geminiRequestTimeoutMs = 5000;
  materializeHook = undefined;
  const diagnostics = JSON.stringify(logs);
  for (const secret of ["fixture-key", "fixture-new-key", "fixture user prompt", "private thought", "secret provider body", "private-path", png.toString("base64")]) assert.ok(!diagnostics.includes(secret), `logs leaked ${secret}`);
  assert.ok(cleanup.length > 5);

  // Real registry/graph/portable/iteration and V2 collection planning.
  const registry = load("src/lib/canvas/registry.ts");
  const graphModule = load("src/lib/canvas/graph.ts");
  const node = registry.createCanvasNode("model.gemini", "gemini", { x: 300, y: 0 });
  assert.equal(node.version, 1);
  assert.equal(registry.getCanvasNodeDefinition(node.type).capability, "text_model");
  assert.deepEqual(registry.getCanvasNodeDefinition(node.type).bypass, { inputPort: "prompt", outputPort: "text" });
  const source = registry.createCanvasNode("input.content-collection", "source", { x: 0, y: 0 });
  source.config.links = "https://www.xiaohongshu.com/explore/fixture-a\nhttps://www.xiaohongshu.com/explore/fixture-b";
  const graph = { nodes: [source, node], edges: [
    { id: "images", source: source.id, sourcePort: "images", target: node.id, targetPort: "images" },
    { id: "prompt", source: source.id, sourcePort: "body", target: node.id, targetPort: "prompt" },
  ], viewport: { x: 0, y: 0, zoom: 1 } };
  assert.equal(graphModule.validateCanvasGraphForPersistence(graph).valid, true);
  const portable = load("src/lib/canvas/workflow-file.ts");
  const restored = portable.parseCanvasWorkflowFile(JSON.stringify(portable.createCanvasWorkflowFile("Gemini", graph)));
  assert.deepEqual(restored.graph.nodes[1].config, node.config);
  const iteration = load("src/lib/canvas/iteration.ts");
  const region = registry.createCanvasNode("utility.image-iterate", "region", { x: 0, y: 0 });
  const inner = region.iteration.graph;
  inner.nodes[1] = { ...node, id: "gemini" };
  inner.edges.forEach((edge) => { edge.target = "gemini"; if (edge.targetPort === "instruction") edge.targetPort = "prompt"; });
  region.iteration.outputs = { text: { nodeId: "gemini", outputPort: "text" } };
  assert.deepEqual(iteration.validateCanvasIteration(region), []);
  const schedule = load("src/lib/canvas/content-collection-schedule.ts").canvasCollectionScheduleDefinition(graph);
  const scheduler = load("src/lib/canvas/scheduler-v2.ts");
  scheduler.validateCanvasScheduleV2Definition(graph, schedule);
  assert.equal(scheduler.expandCanvasScheduleV2(schedule.parameters, schedule).totalChildTasks, 2);
  // Exercise the registered executor itself, including needs_config mapping.
  const executorSource = readFileSync("src/lib/canvas/executors.ts", "utf8");
  const executorModule = { exports: {} };
  const executorImports = Object.fromEntries([...executorSource.matchAll(/from "([^"\n]+)"/g)].map((match) => [match[1], {}]));
  executorImports["../gemini"] = load("src/lib/gemini.ts");
  executorImports["./node-utils"] = load("src/lib/canvas/node-utils.ts");
  Function("require", "module", "exports", ts.transpileModule(executorSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(
    (name) => name.startsWith("node:") ? require(name) : executorImports[name], executorModule, executorModule.exports);
  const context = { node, account, runId: "fixture-run", inputs: {
    prompt: [{ kind: "text", value: "first source" }, { kind: "text", value: "second source" }],
    images: [{ kind: "images", items: [{ url: "/media/a" }] }],
  } };
  const result = await executorModule.exports.executeCanvasNode(context);
  assert.deepEqual(result.outputs.text, { kind: "text", value: "回答正文" });
  assert.equal(requests.at(-1).body.contents[0].parts[0].text, `${node.config.instruction}\n\nfirst source\n\nsecond source`);
  const concatenated = await executorModule.exports.executeCanvasNode({ ...context,
    node: registry.createCanvasNode("utility.text-concatenate", "downstream", { x: 500, y: 0 }),
    inputs: { text_a: [result.outputs.text], text_b: [{ kind: "text", value: "下游文字" }] },
  });
  assert.match(concatenated.outputs.text.value, /回答正文[\s\S]*下游文字/);
  config.geminiApiKey = "";
  await assert.rejects(executorModule.exports.executeCanvasNode(context), executorModule.exports.CanvasNeedsConfigError);
  config.geminiApiKey = "fixture-key";

  const runsSource = readFileSync("src/lib/canvas/runs.ts", "utf8");
  const ast = ts.createSourceFile("runs.ts", runsSource, ts.ScriptTarget.Latest, true);
  const bypassSource = ["resolveBypassOutputs", "mergeArtifacts"].map((name) => ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name).getText(ast)).join("\n");
  const resolveBypass = Function("getCanvasNodeDefinition", "orderedCanvasGptImageInputs", ts.transpileModule(bypassSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\nreturn resolveBypassOutputs;")(registry.getCanvasNodeDefinition, registry.orderedCanvasGptImageInputs);
  assert.deepEqual(resolveBypass(node, context.inputs), { text: { kind: "text", value: "first source\n\nsecond source" } });
  console.log("Gemini native HTTP/proxy/config snapshot/media/errors/cancellation and Canvas graph/iteration/V2 checks passed.");
} finally {
  if (oldLimit === undefined) delete process.env.WORKER_GPT_CONCURRENCY; else process.env.WORKER_GPT_CONCURRENCY = oldLimit;
  for (const socket of proxySockets) socket.destroy();
  proxyServer.closeAllConnections(); server.closeAllConnections();
  await Promise.all([new Promise((resolve) => proxyServer.close(resolve)), new Promise((resolve) => server.close(resolve))]);
  await rm(temp, { recursive: true, force: true });
}
