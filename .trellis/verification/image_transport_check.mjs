import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const nativeRequire = createRequire(import.meta.url);
const config = {
  appConfig: { openaiImageProxyUrl: "" },
  isOpenaiImageRouteConfigured: (route) => route === "primary",
  openaiImageRouteConfig: () => ({ baseUrl: "http://127.0.0.1:1" }),
};

const output = ts.transpileModule(read("src/lib/image-transport.ts"), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: "image-transport.ts",
}).outputText;
const cjsModule = { exports: {} };
vm.runInNewContext(output, {
  module: cjsModule,
  exports: cjsModule.exports,
  require: (name) => name === "./config" ? config : name === "./types" ? {} : nativeRequire(name),
  AbortController,
  Error,
  Request,
  Response,
  URL,
  clearTimeout,
  fetch,
  setTimeout,
}, { filename: "image-transport.ts" });
const { checkImageTransportHealth, fetchImageTransport, isImageNetworkUnavailableError } = cjsModule.exports;

const origin = http.createServer((request, response) => {
  response.writeHead(204, { "x-image-transport-test": request.method || "" });
  response.end();
});
await listen(origin);
const originPort = origin.address().port;
config.openaiImageRouteConfig = () => ({ baseUrl: `http://image-provider.test:${originPort}` });

let connectCount = 0;
const proxy = net.createServer((client) => {
  let buffered = Buffer.alloc(0);
  client.once("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    const line = buffered.toString("utf8").split("\r\n", 1)[0] || "";
    const match = /^CONNECT\s+([^:]+):(\d+)\s+/i.exec(line);
    if (!match) return client.destroy();
    connectCount += 1;
    const upstream = net.createConnection({ host: match[1] === "image-provider.test" ? "127.0.0.1" : match[1], port: Number(match[2]) }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on("error", () => client.destroy());
  });
});
await listen(proxy);
const proxyPort = proxy.address().port;
config.appConfig.openaiImageProxyUrl = `http://127.0.0.1:${proxyPort}`;

try {
  const response = await fetchImageTransport(`http://image-provider.test:${originPort}/image`);
  assert.equal(response.status, 204);
  assert.equal(connectCount, 1, "remote image transport must use the configured proxy");

  const localResponse = await fetchImageTransport(`http://127.0.0.1:${originPort}/local-image`);
  assert.equal(localResponse.status, 204);
  assert.equal(connectCount, 1, "localhost image traffic must bypass the image proxy");

  const health = await checkImageTransportHealth(2_000);
  assert.equal(health.proxy.reachable, true);
  assert.equal(health.primary.reachable, true);
  assert.equal(health.backup.configured, false);
  assert.equal(health.ok, true);

  const closedPort = await reserveClosedPort();
  config.appConfig.openaiImageProxyUrl = `http://127.0.0.1:${closedPort}`;
  await assert.rejects(
    () => fetchImageTransport(`http://image-provider.test:${originPort}/unavailable`),
    (error) => isImageNetworkUnavailableError(error),
    "closed Xray port must be classified as image-network unavailable",
  );

  const unavailable = await checkImageTransportHealth(500);
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.proxy.reachable, false);
  assert.match(unavailable.proxy.error, /Xray/);
} finally {
  await Promise.all([close(origin), close(proxy)]);
}

const imageGeneration = read("src/lib/image-generation.ts");
assert.ok(imageGeneration.includes("fetchImageTransport"));
assert.ok(imageGeneration.includes("fetchOpenAiImageSse("));
assert.ok(imageGeneration.includes("fetchImageTransport,"), "SSE requests must receive the image transport explicitly");
assert.ok(imageGeneration.includes("waitingForNetwork: error.state.waitingForNetwork"));
assert.ok(imageGeneration.includes("isImageNetworkUnavailableError(error)"), "accepted task recovery must preserve an explicit network-wait state");
assert.ok(!/\breturn await fetch\(/.test(imageGeneration), "shared image requests must not call global fetch directly");
assert.ok(!read("src/lib/openai.ts").includes("image-transport"), "text requests must not use the image proxy");
assert.ok(!read("src/lib/comfyui-klein.ts").includes("image-transport"), "ComfyUI must remain direct/local");

const runs = read("src/lib/canvas/runs.ts");
assert.ok(runs.includes("waitReason: IMAGE_NETWORK_WAIT_REASON"));
assert.ok(runs.includes("waitReason: result.pending ? result.waitReason : undefined"));
const executors = read("src/lib/canvas/executors.ts");
assert.ok(executors.includes("waitReason: children.some((child) => child.waitReason === IMAGE_NETWORK_WAIT_REASON)"));
assert.ok(runs.includes("requeueCanvasRunQueueItem(finalRun.id, 30_000)"));
assert.ok(runs.includes("const hasPendingProvider = Boolean(pendingNode)"));
assert.ok(read("scripts/local/restart.ps1").includes("Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED"));

console.log("Image transport, Xray health, and Canvas wait contracts passed.");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function reserveClosedPort() {
  const server = net.createServer();
  await listen(server);
  const port = server.address().port;
  await close(server);
  return port;
}
