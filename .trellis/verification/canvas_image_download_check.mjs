import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const sourceFiles = [
  "src/lib/canvas/save-images.ts",
  "src/lib/canvas/image-download.ts",
  "src/app/api/canvas/runs/[id]/downloads/images/route.ts",
];
for (const relative of sourceFiles) assert.ok(existsSync(path.join(root, relative)), `missing Canvas image download file: ${relative}`);

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-canvas-download-check-"));
try {
  for (const relative of ["src/lib/canvas/types.ts", "src/lib/canvas/save-images.ts", "src/lib/image-format.ts", "src/lib/canvas/image-download.ts"]) {
    const output = ts.transpileModule(read(relative), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: relative,
    }).outputText;
    const destination = relative.replace(/^src\/lib\//, "").replace(/\.ts$/, ".js");
    const destinationPath = path.join(temp, destination);
    const destinationFolder = path.dirname(destinationPath);
    if (!existsSync(destinationFolder)) createRequire(import.meta.url)("node:fs").mkdirSync(destinationFolder, { recursive: true });
    writeFileSync(destinationPath, output, "utf8");
  }
  const require = createRequire(import.meta.url);
  const saveImages = require(path.join(temp, "canvas/save-images.js"));
  const downloads = require(path.join(temp, "canvas/image-download.js"));

  assert.equal(saveImages.validateCanvasImageFilenamePrefix("车型图"), undefined);
  for (const invalid of ["", " ", "a/b", "a\\b", "a:b", "bad.", "bad ", "x".repeat(81), "bad\u0080name"]) {
    assert.match(saveImages.validateCanvasImageFilenamePrefix(invalid) || "", /filename prefix/i, `invalid prefix must fail: ${JSON.stringify(invalid)}`);
  }
  assert.equal(saveImages.canvasImageDownloadFilename("车型图", 1, ".png"), "车型图_0001.png");
  assert.equal(saveImages.canvasImageDownloadFilename("car", 30, ".jpg"), "car_0030.jpg");
  assert.match(saveImages.canvasImageDownloadContentDisposition("车型图_0001.png"), /^attachment; filename="FluxPost_0001\.png"; filename\*=UTF-8''/);

  const run = canvasRunFixture();
  assert.deepEqual(downloads.resolveCanvasImageDownload(run, "node-run-save", 0), {
    url: "/generated/one.jpg",
    filenamePrefix: "车型图",
    ordinal: 1,
  });
  assert.deepEqual(downloads.resolveCanvasImageDownload(run, "node-run-save-reused", 1), {
    url: "https://assets.example.test/two.jpg",
    filenamePrefix: "车型图",
    ordinal: 2,
  });
  assert.throws(() => downloads.resolveCanvasImageDownload(run, "missing", 0), (error) => error.status === 404);
  assert.throws(() => downloads.resolveCanvasImageDownload(run, "node-run-other", 0), (error) => error.status === 404);
  assert.throws(() => downloads.resolveCanvasImageDownload(run, "node-run-running", 0), (error) => error.status === 400);
  assert.throws(() => downloads.resolveCanvasImageDownload(run, "node-run-save", -1), (error) => error.status === 400);
  assert.throws(() => downloads.resolveCanvasImageDownload(run, "node-run-save", 3), (error) => error.status === 400);

  const pngPath = path.join(temp, "image.png");
  writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  assert.deepEqual(await downloads.inspectCanvasImageDownload(pngPath), { size: 9, mimeType: "image/png", extension: ".png" });
  const textPath = path.join(temp, "not-image.txt");
  writeFileSync(textPath, "not an image", "utf8");
  await assert.rejects(() => downloads.inspectCanvasImageDownload(textPath), (error) => error.status === 400 && /recognized image/i.test(error.message));
  const oversizedPath = path.join(temp, "oversized-image.png");
  writeFileSync(oversizedPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  truncateSync(oversizedPath, saveImages.CANVAS_IMAGE_DOWNLOAD_MAX_BYTES + 1);
  await assert.rejects(() => downloads.inspectCanvasImageDownload(oversizedPath), (error) => error.status === 400 && /byte limit/i.test(error.message));

  const route = read("src/app/api/canvas/runs/[id]/downloads/images/route.ts");
  for (const snippet of ["requireWorkspaceAccount", "getCanvasRun", "resolveCanvasImageDownload", "materializeRuntimeMedia", "inspectCanvasImageDownload", "createReadStream", "Readable.toWeb", "Content-Disposition", "X-Content-Type-Options", "stream.once(\"close\"", "materialized.cleanup"]) {
    assert.ok(route.includes(snippet), `download route is missing ${snippet}`);
  }
  assert.ok(!route.includes('searchParams.get("url")'), "download route must never accept an arbitrary media URL");

  const largePngPath = path.join(temp, "large-image.bin");
  writeFileSync(largePngPath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4 * 1024 * 1024)]));
  let authenticated = true;
  let visibleRun = run;
  let materializedPath = pngPath;
  const materializedUrls = [];
  let cleanupCalls = 0;
  class WorkspaceSignInError extends Error {}
  class TestNextResponse extends Response {
    static json(body, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      return new TestNextResponse(JSON.stringify(body), { ...init, headers });
    }
  }
  const routeModule = loadTsModule("src/app/api/canvas/runs/[id]/downloads/images/route.ts", {
    "next/server": { NextResponse: TestNextResponse },
    "@/lib/canvas/image-download": downloads,
    "@/lib/canvas/save-images": saveImages,
    "@/lib/canvas/runs": {
      getCanvasRun: async (runId, account) => {
        assert.equal(runId, "run-1");
        assert.equal(account.id, "owner-1");
        return visibleRun;
      },
    },
    "@/lib/runtime-media-materializer": {
      materializeRuntimeMedia: async (url, options) => {
        materializedUrls.push({ url, options });
        return {
          filePath: materializedPath,
          resolvedUrl: url,
          temporary: true,
          cleanup: async () => { cleanupCalls += 1; },
        };
      },
    },
    "@/lib/workspace-accounts": {
      requireWorkspaceAccount: async () => {
        if (!authenticated) throw new WorkspaceSignInError("Sign in required");
        return { id: "owner-1", displayName: "Owner", role: "operator" };
      },
      isWorkspaceSignInError: (error) => error instanceof WorkspaceSignInError,
    },
  });
  const requestDownload = (query) => routeModule.GET(
    new Request(`http://localhost/api/canvas/runs/run-1/downloads/images?${query}`),
    { params: Promise.resolve({ id: "run-1" }) },
  );

  authenticated = false;
  assert.equal((await requestDownload("nodeRunId=node-run-save&index=0")).status, 401, "downloads must require sign-in");
  authenticated = true;
  visibleRun = undefined;
  assert.equal((await requestDownload("nodeRunId=node-run-save&index=0")).status, 404, "inaccessible runs must remain indistinguishable from missing runs");
  visibleRun = run;
  assert.equal((await requestDownload("nodeRunId=node-run-other&index=0")).status, 404, "forged non-save node runs must be rejected");
  assert.equal((await requestDownload("nodeRunId=node-run-save&index=99&url=https%3A%2F%2Fevil.test%2Ffake.png")).status, 400, "caller URLs and out-of-range indices must be rejected");

  const successResponse = await requestDownload("nodeRunId=node-run-save&index=0");
  assert.equal(successResponse.status, 200);
  assert.equal(successResponse.headers.get("Content-Type"), "image/png");
  assert.equal(successResponse.headers.get("Content-Length"), "9");
  assert.equal(successResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(successResponse.headers.get("Cache-Control"), "private, no-store");
  assert.match(successResponse.headers.get("Content-Disposition") || "", /filename\*=UTF-8''/);
  assert.match(successResponse.headers.get("Content-Disposition") || "", /_0001\.png/, "the extension must come from image bytes, not the source URL");
  await successResponse.arrayBuffer();
  await waitFor(() => cleanupCalls === 1, "completed streams must clean materialized media");
  assert.deepEqual(JSON.parse(JSON.stringify(materializedUrls[0])), {
    url: "/generated/one.jpg",
    options: { maxBytes: 30 * 1024 * 1024, kind: "image" },
  });

  for (const [url, index] of [["/media/recovered-from-tos.jpg", 1], ["https://assets.example.test/remote.webp", 2]]) {
    run.nodeRuns[0].outputs.downloads.items[index] = { url };
    const response = await requestDownload(`nodeRunId=node-run-save&index=${index}`);
    assert.equal(response.status, 200, `${url} must use the bounded media materializer`);
    await response.arrayBuffer();
  }
  await waitFor(() => cleanupCalls === 3, "local, TOS-recovered, and remote simulations must all clean up");
  assert.deepEqual(materializedUrls.slice(1).map((entry) => entry.url), ["/media/recovered-from-tos.jpg", "https://assets.example.test/remote.webp"]);

  run.run.graphSnapshot.nodes[0].config.filenamePrefix = "bad/dir";
  assert.equal((await requestDownload("nodeRunId=node-run-save&index=0")).status, 400, "frozen invalid prefixes must be rejected before materialization");
  run.run.graphSnapshot.nodes[0].config.filenamePrefix = "车型图";
  materializedPath = textPath;
  const cleanupBeforeNonImage = cleanupCalls;
  assert.equal((await requestDownload("nodeRunId=node-run-save&index=0")).status, 400, "non-image materialized content must be rejected");
  assert.equal(cleanupCalls, cleanupBeforeNonImage + 1, "rejected media must be cleaned immediately");

  materializedPath = largePngPath;
  const interruptedResponse = await requestDownload("nodeRunId=node-run-save&index=0");
  const reader = interruptedResponse.body.getReader();
  await reader.read();
  const cleanupBeforeCancel = cleanupCalls;
  await reader.cancel();
  await waitFor(() => cleanupCalls === cleanupBeforeCancel + 1, "cancelled streams must clean materialized media");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Canvas image download check passed.");

function canvasRunFixture() {
  const base = {
    runId: "run-1",
    attempt: 1,
    inputs: {},
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const downloads = { kind: "images", items: [{ url: "/generated/one.jpg" }, { url: "https://assets.example.test/two.jpg" }, { url: "https://assets.example.test/three.webp" }] };
  return {
    run: {
      id: "run-1",
      graphSnapshot: {
        nodes: [
          { id: "save", type: "utility.save-images", version: 1, position: { x: 0, y: 0 }, config: { filenamePrefix: "车型图" } },
          { id: "other", type: "utility.image-preview", version: 1, position: { x: 0, y: 0 }, config: {} },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    nodeRuns: [
      { ...base, id: "node-run-save", nodeId: "save", nodeType: "utility.save-images", status: "completed", outputs: { downloads } },
      { ...base, id: "node-run-save-reused", nodeId: "save", nodeType: "utility.save-images", status: "reused", outputs: { downloads } },
      { ...base, id: "node-run-other", nodeId: "other", nodeType: "utility.image-preview", status: "completed", outputs: { downloads } },
      { ...base, id: "node-run-running", nodeId: "save", nodeType: "utility.save-images", status: "running", outputs: { downloads } },
    ],
  };
}

function loadTsModule(relativePath, requireMap) {
  const sourcePath = path.join(root, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const cjsModule = { exports: {} };
  const sandbox = {
    AbortSignal,
    Buffer,
    Headers,
    Request,
    Response,
    URL,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(output, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}
