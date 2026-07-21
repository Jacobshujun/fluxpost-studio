import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = process.cwd();

const files = {
  core: "src/lib/runtime-media-storage-core.ts",
  storage: "src/lib/runtime-media-storage.ts",
  materializer: "src/lib/runtime-media-materializer.ts",
  config: "src/lib/config.ts",
  types: "src/lib/types.ts",
  mediaCache: "src/lib/media-cache.ts",
  imageGeneration: "src/lib/image-generation.ts",
  comfy: "src/lib/comfyui-klein.ts",
  reviewUpload: "src/lib/review-image-upload.ts",
  feishuImport: "src/lib/feishu-content-import.ts",
  feishuCli: "src/lib/feishu-cli.ts",
  modelImageInput: "src/lib/model-image-input.ts",
  configPage: "src/app/config/page.tsx",
  probeRoute: "src/app/api/config/tos-check/route.ts",
};

for (const relativePath of Object.values(files)) {
  if (!existsSync(path.join(projectRoot, relativePath))) {
    throw new Error(`Missing TOS runtime media implementation file: ${relativePath}`);
  }
}

const core = loadTypescriptCommonJs(files.core);
const storage = read(files.storage);
const materializer = read(files.materializer);
const config = read(files.config);
const types = read(files.types);
const mediaCache = read(files.mediaCache);
const imageGeneration = read(files.imageGeneration);
const comfy = read(files.comfy);
const reviewUpload = read(files.reviewUpload);
const feishuImport = read(files.feishuImport);
const feishuCli = read(files.feishuCli);
const modelImageInput = read(files.modelImageInput);
const configPage = read(files.configPage);
const probeRoute = read(files.probeRoute);

assertEqual(core.normalizeTosEndpoint("tos-cn-guangzhou.volces.com"), "https://tos-cn-guangzhou.volces.com", "TOS endpoint must default to HTTPS.");
assertEqual(
  core.buildTosObjectKey("/generated/folder/a b.png", "fluxpost/flux-lightmoment"),
  "fluxpost/flux-lightmoment/generated/folder/a b.png",
  "Logical paths must map under the deployment prefix.",
);
assertEqual(
  core.buildTosPublicUrl({
    publicBaseUrl: "https://bucket.example.com/",
    objectKey: "fluxpost/flux-lightmoment/generated/folder/a b.png",
    etag: '\"etag-value\"',
  }),
  "https://bucket.example.com/fluxpost/flux-lightmoment/generated/folder/a%20b.png?v=etag-value",
  "Public URLs must encode segments and include the verified ETag.",
);
assertEqual(
  core.isManagedTosUrl(
    "https://bucket.example.com/fluxpost/flux-lightmoment/generated/image.png?v=e1",
    "https://bucket.example.com",
    "fluxpost/flux-lightmoment",
  ),
  true,
  "Configured TOS URLs must be recognized as managed cache.",
);
assertEqual(
  core.isManagedTosUrl("https://source.example.com/image.png", "https://bucket.example.com", "fluxpost/flux-lightmoment"),
  false,
  "Unrelated remote URLs must not be counted as managed cache.",
);

await verifyUploadCore(core);
await verifyMaterializerRoot(
  loadTypescriptCommonJs(files.materializer, {
    "./media-request": { buildMediaRequestHeaders: () => ({}) },
  }),
);

for (const key of [
  "TOS_ENABLED",
  "TOS_ACCESS_KEY_ID",
  "TOS_ACCESS_KEY_SECRET",
  "TOS_BUCKET",
  "TOS_ENDPOINT",
  "TOS_REGION",
  "TOS_PUBLIC_BASE_URL",
  "TOS_OBJECT_PREFIX",
]) {
  assertContains(config, new RegExp(escapeRegex(key)), `Advanced config is missing ${key}.`);
}
assertContains(config, /configField\("TOS_ACCESS_KEY_ID"[\s\S]*?"secret"/, "TOS access key must be a masked secret field.");
assertContains(config, /configField\("TOS_ACCESS_KEY_SECRET"[\s\S]*?"secret"/, "TOS secret key must be a masked secret field.");
assertContains(types, /tosConfigured:\s*boolean/, "Public config status must expose tosConfigured only as a boolean.");
assertContains(types, /tosEnabled:\s*boolean/, "Public config status must expose tosEnabled only as a boolean.");

assertContains(storage, /ACLType\.ACLPublicRead/, "TOS uploads must use object-level public-read ACL.");
assertContains(storage, /headObject/, "TOS uploads must verify stored object metadata.");
assertContains(storage, /data[\"']?,\s*[\"']tos-pending|tos-pending/, "Failed uploads must retain files under data/tos-pending.");
assertContains(storage, /rm\([^)]*filePath/, "Verified uploads must remove their local staging file.");

for (const [name, source] of Object.entries({ mediaCache, imageGeneration, comfy, reviewUpload, feishuImport })) {
  assertContains(source, /persistRuntimeMedia/, `${name} must persist final runtime media through the shared storage boundary.`);
}
assertContains(feishuCli, /materializeRuntimeMedia/, "Feishu publish must materialize remote TOS attachments through the shared helper.");
assertContains(
  materializer,
  /temporaryRoot\?:\s*string/,
  "Runtime media materialization must let CLI consumers choose a safe temporary root.",
);
assertContains(
  materializer,
  /temporaryRoot\s*=\s*path\.resolve\(options\.temporaryRoot\s*\|\|\s*tmpdir\(\)\)[\s\S]*mkdtemp\(path\.join\(temporaryRoot,\s*["']fluxpost-runtime-media-["']\)\)/,
  "Runtime media materialization must create temporary files under the requested root.",
);
assertContains(
  feishuCli,
  /feishuAttachmentStagingRoot\s*=\s*path\.join\(process\.cwd\(\),\s*["']data["'],\s*["']feishu-outbox["']\)/,
  "Feishu attachment staging must stay inside the CLI working directory.",
);
assertContains(
  feishuCli,
  /materializeRuntimeMedia\(imageUrl,\s*\{[^}]*temporaryRoot:\s*feishuAttachmentStagingRoot[^}]*\}\)/s,
  "Feishu image materialization must use the CLI-safe staging root.",
);
assertContains(
  feishuCli,
  /materializeRuntimeMedia\(url,\s*\{[^}]*temporaryRoot:\s*feishuAttachmentStagingRoot[^}]*\}\)/s,
  "Feishu video materialization must use the CLI-safe staging root.",
);
assertContains(modelImageInput, /materializeRuntimeMedia|readRuntimeMedia/, "Model image input must support shared runtime-media reads.");
assertContains(mediaCache, /isManagedRuntimeMediaUrl/, "Media cache status wiring must recognize managed TOS URLs.");
assertContains(
  mediaCache,
  /if \(videoFramesNeedPersistence\) \{\s*selectedVideoFrames = await persistSelectedVideoFrames/,
  "Historical video-frame URLs must not be uploaded during an ordinary cache read.",
);

assertContains(probeRoute, /requireWorkspaceAccount/, "TOS probe must require workspace sign-in.");
assertContains(probeRoute, /isWorkspaceAdmin/, "TOS probe must require admin role.");
assertContains(probeRoute, /Range/, "TOS probe must verify public byte-range delivery.");
assertContains(probeRoute, /deleteObject|deleteRuntimeMediaObject/, "TOS probe must clean up its objects.");
assertNotContains(probeRoute, /accessKeyId|accessKeySecret/, "TOS probe responses must not expose credentials.");
assertNotContains(probeRoute, /NextResponse\.json\(\{\s*error/, "TOS probe responses must contain boolean check fields only.");
assertContains(configPage, /api\/config\/tos-check/, "Advanced config UI must expose the admin TOS probe action.");

console.log("TOS runtime media storage check passed.");

async function verifyUploadCore(module) {
  const calls = [];
  let stored;
  let putFailures = 0;
  const client = {
    async headObject() {
      calls.push("head");
      if (!stored) throw Object.assign(new Error("not found"), { statusCode: 404 });
      return { data: { "content-length": String(stored.length), etag: '\"verified-etag\"' } };
    },
    async putObject(input) {
      calls.push("put");
      if (putFailures > 0) {
        putFailures -= 1;
        throw Object.assign(new Error("temporary failure"), { statusCode: 503 });
      }
      stored = input.body;
      return { data: {} };
    },
  };

  const first = await module.ensureVerifiedTosObject({
    client,
    bucket: "bucket",
    objectKey: "prefix/generated/test.png",
    body: Buffer.from("image"),
    contentType: "image/png",
    overwrite: false,
    maxAttempts: 3,
  });
  assertEqual(first.etag, '\"verified-etag\"', "Upload must return the verified object ETag.");
  assertEqual(calls.join(","), "head,put,head", "A cache miss must HEAD, PUT, then verify with HEAD.");

  calls.length = 0;
  await module.ensureVerifiedTosObject({
    client,
    bucket: "bucket",
    objectKey: "prefix/generated/test.png",
    body: Buffer.from("image"),
    contentType: "image/png",
    overwrite: false,
    maxAttempts: 3,
  });
  assertEqual(calls.join(","), "head", "A verified existing object must be reused without upload.");

  calls.length = 0;
  putFailures = 1;
  await module.ensureVerifiedTosObject({
    client,
    bucket: "bucket",
    objectKey: "prefix/generated/test.png",
    body: Buffer.from("image"),
    contentType: "image/png",
    overwrite: true,
    maxAttempts: 3,
  });
  assertEqual(calls.join(","), "put,put,head", "Forced overwrite must retry transient upload failures and verify once.");

  const mismatchClient = {
    async headObject() {
      return { data: { "content-length": "1", etag: "bad" } };
    },
    async putObject() {
      return { data: {} };
    },
  };
  await assertRejects(
    () =>
      module.ensureVerifiedTosObject({
        client: mismatchClient,
        bucket: "bucket",
        objectKey: "prefix/generated/test.png",
        body: Buffer.from("image"),
        contentType: "image/png",
        overwrite: true,
        maxAttempts: 1,
      }),
    /size mismatch/i,
    "HEAD size mismatch must fail the upload contract.",
  );
}

async function verifyMaterializerRoot(module) {
  const payload = Buffer.from("feishu-attachment-check");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-length": payload.length, "content-type": "image/jpeg" });
    response.end(payload);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "fluxpost-materializer-check-"));
  try {
    if (!address || typeof address === "string") throw new Error("Materializer check server did not bind a TCP port.");
    const materialized = await module.materializeRuntimeMedia(`http://127.0.0.1:${address.port}/asset.jpg`, {
      maxBytes: 1024,
      kind: "image",
      temporaryRoot,
    });
    const relativePath = path.relative(temporaryRoot, materialized.filePath);
    assertEqual(relativePath.startsWith("..") || path.isAbsolute(relativePath), false, "Materialized media must stay inside the requested root.");
    assertEqual((await readFile(materialized.filePath)).equals(payload), true, "Materialized media must preserve the downloaded bytes.");
    await materialized.cleanup();
    assertEqual(existsSync(path.dirname(materialized.filePath)), false, "Materialized media cleanup must remove its temporary directory.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function loadTypescriptCommonJs(relativePath, dependencyOverrides = {}) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const wrapper = vm.runInThisContext(`(function(require,module,exports,Buffer){${output}\n})`, { filename: relativePath });
  wrapper((id) => dependencyOverrides[id] || require(id), loadedModule, loadedModule.exports, Buffer);
  return loadedModule.exports;
}

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

async function assertRejects(action, pattern, message) {
  try {
    await action();
  } catch (error) {
    const value = error instanceof Error ? error.message : String(error);
    if (pattern.test(value)) return;
    throw new Error(`${message} Wrong error: ${value}`);
  }
  throw new Error(`${message} Expected rejection.`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
