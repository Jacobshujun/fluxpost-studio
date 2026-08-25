import { createWriteStream, readFileSync } from "node:fs";
import { copyFile, readFile, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const requireFromCheck = createRequire(import.meta.url);
const heicConvert = requireFromCheck("heic-convert");

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    transpiled.outputText,
    {
      Buffer,
      URL,
      console,
      process,
      setTimeout,
      clearTimeout,
      fetch,
      AbortController,
      Blob,
      FormData,
      module: cjsModule,
      exports: cjsModule.exports,
      require: (value) => {
        if (value in requireMap) return requireMap[value];
        throw new Error(`Unexpected require: ${value}`);
      },
    },
    { filename: sourcePath },
  );
  return cjsModule.exports;
}

const imageFormat = loadTsModule("src/lib/image-format.ts");

const heicBytes = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
]);
const webpBytes = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x22, 0x18, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const jpegBytes = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01,
]);

const heic = imageFormat.sniffImageFormat(heicBytes);
assert(heic?.mimeType === "image/heic", "HEIC bytes should be detected even when saved under a .jpg path.");
assert(heic.browserSupported === false, "HEIC should not be treated as a browser-readable local preview format.");
assert(imageFormat.sniffModelSupportedImageMime(heicBytes) === undefined, "HEIC should not be sent to the visual tagging model.");

const webp = imageFormat.sniffImageFormat(webpBytes);
assert(webp?.mimeType === "image/webp", "WebP bytes should be detected even when the cache extension is wrong.");
assert(imageFormat.sniffBrowserSupportedImageMime(webpBytes) === "image/webp", "Local media serving should be able to emit image/webp by bytes.");

const jpeg = imageFormat.sniffImageFormat(jpegBytes);
assert(jpeg?.mimeType === "image/jpeg", "JPEG bytes should still be detected as image/jpeg.");
assert(imageFormat.normalizeModelSupportedImageMime("image/jpg; charset=binary") === "image/jpeg", "image/jpg should normalize to image/jpeg.");

let observedQuality;
const imageNormalizationModuleMap = {
  "node:crypto": { randomUUID: () => "verification" },
  "node:fs/promises": {},
  "node:path": path,
  "./image-format": imageFormat,
};
const imageNormalization = loadTsModule("src/lib/image-normalization.ts", {
  ...imageNormalizationModuleMap,
  "heic-convert": async (input) => {
    observedQuality = input.quality;
    return jpegBytes;
  },
});
const normalizedJpeg = await imageNormalization.convertHeicBufferToJpeg(heicBytes);
assert(imageFormat.sniffImageFormat(normalizedJpeg)?.mimeType === "image/jpeg", "HEIC conversion should return verified JPEG bytes.");
assert(observedQuality === 0.9, "HEIC conversion should request JPEG quality 0.9.");
await assertRejects(
  () => imageNormalization.convertHeicBufferToJpeg(jpegBytes),
  "Non-HEIC input should be rejected before decoding.",
);
const invalidOutputNormalization = loadTsModule("src/lib/image-normalization.ts", {
  ...imageNormalizationModuleMap,
  "heic-convert": async () => webpBytes,
});
await assertRejects(
  () => invalidOutputNormalization.convertHeicBufferToJpeg(heicBytes),
  "A decoder result without a valid JPEG header should be rejected.",
);

const realHeicPath = path.join(projectRoot, ".trellis", "verification", "fixtures", "real-heic-as-jpg.jpg");
const realHeicBytes = readFileSync(realHeicPath);
assert(path.extname(realHeicPath) === ".jpg", "The real HEIC regression fixture should exercise a misleading .jpg suffix.");
assert(imageFormat.sniffImageFormat(realHeicBytes)?.mimeType === "image/heic", "The real fixture should contain HEIC bytes.");
const realImageNormalization = loadTsModule("src/lib/image-normalization.ts", {
  ...imageNormalizationModuleMap,
  "node:fs/promises": requireFromCheck("node:fs/promises"),
  "heic-convert": heicConvert,
});
const realNormalizedJpeg = await realImageNormalization.convertHeicBufferToJpeg(realHeicBytes);
assert(imageFormat.sniffImageFormat(realNormalizedJpeg)?.mimeType === "image/jpeg", "The real HEIC fixture should decode to browser-readable JPEG bytes.");
await assertRejects(
  () => realImageNormalization.convertHeicBufferToJpeg(heicBytes),
  "A truncated HEIC payload should fail through the real decoder.",
);
const atomicFixturePath = path.join(projectRoot, ".trellis", "verification", "fixtures", `atomic-heic-${process.pid}.jpg`);
try {
  await copyFile(realHeicPath, atomicFixturePath);
  assert(await realImageNormalization.normalizeHeicFileToJpeg(atomicFixturePath), "The real HEIC file should be normalized in place.");
  assert(imageFormat.sniffImageFormat(await readFile(atomicFixturePath))?.mimeType === "image/jpeg", "Atomic HEIC replacement should leave verified JPEG bytes at the original path.");
} finally {
  await rm(atomicFixturePath, { force: true });
}

const mediaUrlFilter = loadTsModule("src/lib/media-url-filter.ts");
const isManagedFixtureUrl = (url) => url.startsWith("https://fixture-bucket.tos-cn-guangzhou.volces.com/fluxpost/");
const mediaCacheStatus = loadTsModule("src/lib/media-cache-status.ts", {
  "./media-url-filter": mediaUrlFilter,
  "./runtime-media-storage": { isManagedRuntimeMediaUrl: isManagedFixtureUrl },
});
const persistedImages = [];
const mediaCacheRuntimeStorage = {
  findExistingRuntimeMedia: async () => undefined,
  isManagedRuntimeMediaUrl: isManagedFixtureUrl,
  persistRuntimeMedia: async ({ filePath, publicPath, contentType }) => {
    const bytes = await readFile(filePath);
    assert(imageFormat.sniffImageFormat(bytes)?.mimeType === "image/jpeg", "Every persisted cache image should contain JPEG bytes.");
    assert(contentType === "image/jpeg", "Every persisted cache image should use the byte-sniffed JPEG MIME type.");
    persistedImages.push({ publicPath, bytes });
    await rm(filePath, { force: true });
    return `https://fixture-bucket.tos-cn-guangzhou.volces.com/fluxpost${publicPath}?v=fixture-${persistedImages.length}`;
  },
};
const mediaCacheModule = loadTsModule("src/lib/media-cache.ts", {
  "node:child_process": requireFromCheck("node:child_process"),
  "node:fs": { createWriteStream },
  "node:fs/promises": requireFromCheck("node:fs/promises"),
  "node:http": { request: httpRequest },
  "node:https": { request: httpsRequest },
  "node:path": path,
  "./activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
  "./concurrency": {
    concurrencyConfig: { media: 1 },
    mapWithConcurrency: async (values, _limit, worker) => Promise.all(values.map(worker)),
  },
  "./image-format": imageFormat,
  "./image-normalization": realImageNormalization,
  "./media-cache-status": mediaCacheStatus,
  "./media-request": { buildMediaRequestHeaders: () => ({}) },
  "./runtime-media-materializer": { materializeRuntimeMedia: async () => { throw new Error("Unexpected video materialization."); } },
  "./runtime-media-storage": mediaCacheRuntimeStorage,
  "./source-image-cleanup": { cleanCachedSourceImage: async () => undefined, shouldCleanCachedSourceImage: () => false },
  "./video-frame-review": { isVideoFrameAiReviewConfigured: () => false, reviewVideoFramesWithAi: async (frames) => frames },
  "./video-transcription": {
    isArkVideoTranscriptionConfigured: () => false,
    mergeTranscriptIntoContentText: (text) => text,
    transcribeVideoContent: async () => { throw new Error("Unexpected video transcription."); },
  },
  "./video-frame-policy": {
    replaceVideoFrameUrlsInMediaUrls: (urls) => urls,
    selectBestVideoHighlightFrames: (frames) => frames || [],
  },
  "./video-quality": { rankVideoUrlsByQuality: () => [] },
});

let videoRequestCount = 0;
const fixtureServer = createServer((request, response) => {
  if (request.url === "/video.mp4") videoRequestCount += 1;
  const index = Number(request.url?.match(/image-(\d+)\.jpg/)?.[1] || 0);
  const body = request.url === "/invalid-heic.jpg" ? heicBytes : index === 1 ? realNormalizedJpeg : realHeicBytes;
  response.writeHead(200, {
    "content-length": body.length,
    "content-type": index === 1 && request.url !== "/invalid-heic.jpg" ? "image/jpeg" : "image/heic",
  });
  response.end(body);
});
await new Promise((resolve, reject) => {
  fixtureServer.once("error", reject);
  fixtureServer.listen(0, "127.0.0.1", resolve);
});
const fixtureAddress = fixtureServer.address();
assert(fixtureAddress && typeof fixtureAddress === "object", "The local HEIC fixture server should start.");
const fixtureSourceId = `heic-cache-${process.pid}`;
const fixtureCacheDir = path.join(projectRoot, "public", "media", "crawl", "weibo", fixtureSourceId);
try {
  const sourceImages = Array.from({ length: 9 }, (_value, index) => `http://127.0.0.1:${fixtureAddress.port}/image-${index + 1}.jpg`);
  const [cachedItem] = await mediaCacheModule.cacheCrawledMedia([
    {
      id: fixtureSourceId,
      sourceId: fixtureSourceId,
      platform: "weibo",
      sourceUrl: "https://weibo.example.invalid/status/fixture",
      contentText: "fixture",
      images: sourceImages,
      mediaUrls: sourceImages,
    },
  ], { forceImageRefresh: true, skipVideoProcessing: true });
  assert(persistedImages.length === 9, "One JPEG plus eight HEIC images should all reach verified TOS persistence.");
  assert(cachedItem.downloadedImages?.length === 9, "The cached source should retain all nine aligned managed image URLs.");
  assert(cachedItem.downloadedImages.every(isManagedFixtureUrl), "The final cache should contain only managed browser-readable URLs.");
  assert(cachedItem.mediaCache?.status === "local_complete", "The nine-image cache should report complete local/TOS coverage.");
  assert(!cachedItem.downloadErrors?.length, "Successful HEIC normalization should not leave cache errors.");
  await mediaCacheModule.cacheCrawledMedia([
    {
      id: `${fixtureSourceId}-video`,
      sourceId: `${fixtureSourceId}-video`,
      platform: "weibo",
      sourceUrl: "https://weibo.example.invalid/status/video-fixture",
      videoUrl: `http://127.0.0.1:${fixtureAddress.port}/video.mp4`,
      contentText: "video fixture",
      images: [],
      mediaUrls: [],
    },
  ], { forceImageRefresh: true, skipVideoProcessing: true });
  assert(videoRequestCount === 0, "Image-only historical repair must not download a source video.");

  const generatedImages = [];
  const imageGeneration = loadTsModule("src/lib/image-generation.ts", {
    "node:child_process": requireFromCheck("node:child_process"),
    "node:crypto": requireFromCheck("node:crypto"),
    "node:fs/promises": requireFromCheck("node:fs/promises"),
    "node:path": path,
    "./activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
    "./comfyui-klein": { isComfyUiKleinConfigured: () => false, runComfyUiKleinImageTask: async () => { throw new Error("Unexpected ComfyUI call."); } },
    "./config": {
      appConfig: { openaiImageRequestTimeoutMs: 1_000, openaiImageEndpoint: "images" },
      isOpenaiImageRouteConfigured: () => false,
      openaiImageApiKey: () => "",
      openaiImageRouteConfig: () => ({}),
      openaiImageUrl: () => "https://provider.example.invalid",
    },
    "./concurrency": {
      concurrencyConfig: { image: 1 },
      mapWithConcurrency: async (values, _limit, worker) => Promise.all(values.map(worker)),
      runWithConcurrencyPool: async (_pool, worker) => worker(),
    },
    "./creation-controls": { buildSingleImageTaskPrompt: () => "" },
    "./image-format": imageFormat,
    "./image-transport": {
      fetchImageTransport: (url, init) => fetch(url, init),
      isImageNetworkUnavailableError: () => false,
      toImageTransportUnavailableError: (error) => error,
    },
    "./image-normalization": realImageNormalization,
    "./image-size-options": { defaultImageGenerationSize: "1024x1024", normalizeImageGenerationSize: (value) => value || "1024x1024" },
    "./media-request": { buildMediaRequestHeaders: () => ({}) },
    "./openai-image-sse": { fetchOpenAiImageSse: async () => { throw new Error("Unexpected image provider call."); } },
    "./runtime-media-storage": {
      deleteRuntimeMediaObject: async () => undefined,
      isTosRuntimeMediaConfigured: () => true,
      persistRuntimeMedia: async ({ filePath, publicPath, contentType }) => {
        const bytes = await readFile(filePath);
        assert(imageFormat.sniffImageFormat(bytes)?.mimeType === "image/jpeg", "Keep-mode HEIC persistence should receive JPEG bytes.");
        assert(contentType === "image/jpeg", "Keep-mode HEIC persistence should use image/jpeg.");
        generatedImages.push(publicPath);
        await rm(filePath, { force: true });
        return `https://fixture-bucket.tos-cn-guangzhou.volces.com/fluxpost${publicPath}?v=keep`;
      },
      persistTosProbeObject: async () => { throw new Error("Unexpected TOS probe."); },
    },
    "./image-providers/contracts": {
      ImageProviderError: class ImageProviderError extends Error {},
      IMAGE_PROVIDER_CAPABILITIES: {},
      buildOpenAiJsonGenerationBody: () => ({}),
      parseOpenAiJsonImageResponse: () => ({ imageUrls: [] }),
    },
    "./toapis-image-api": {
      buildToApisGenerationBody: () => ({}),
      formatToApisTaskError: (error) => String(error),
      getToApisCompletedImageUrls: () => [],
      parseRetryAfterMs: () => 0,
      requireToApisTaskId: () => "",
    },
  });
  const keepTask = {
    id: "keep-real-heic",
    url: `http://127.0.0.1:${fixtureAddress.port}/image-2.jpg`,
    kind: "source_image",
    label: "HEIC source",
    selected: true,
    mode: "keep",
    prompt: "",
  };
  const keepResult = await imageGeneration.generateImagesFromPrompt("", 1, [keepTask]);
  assert(keepResult.status === "completed" && keepResult.imageUrls.length === 1, "A real HEIC keep task should complete with one durable image.");
  assert(isManagedFixtureUrl(keepResult.imageUrls[0]), "A real HEIC keep task should return managed TOS media.");
  assert(generatedImages.length === 1, "A real HEIC keep task should persist exactly one converted JPEG.");

  const invalidKeepResult = await imageGeneration.generateImagesFromPrompt("", 1, [{
    ...keepTask,
    id: "keep-invalid-heic",
    label: "Invalid HEIC source",
    url: `http://127.0.0.1:${fixtureAddress.port}/invalid-heic.jpg`,
  }]);
  assert(invalidKeepResult.status === "needs_review", "An invalid HEIC keep task should require review.");
  assert(invalidKeepResult.imageUrls.length === 0, "An invalid HEIC source URL must not be persisted as a final image.");
} finally {
  await new Promise((resolve) => fixtureServer.close(resolve));
  await rm(fixtureCacheDir, { recursive: true, force: true });
}

const mediaCache = read("src/lib/media-cache.ts");
const imageNormalizationSource = read("src/lib/image-normalization.ts");
assertContains(mediaCache, /ensureBrowserReadableCachedImage/, "Media cache should validate downloaded image bytes before using the local URL.");
assertContains(mediaCache, /format\?\.mimeType === "image\/heic"[\s\S]*normalizeHeicFileToJpeg/, "Media cache should normalize HEIC images to JPEG.");
assertContains(imageNormalizationSource, /heic-convert/, "HEIC normalization should use the pinned cross-platform decoder.");
assertContains(imageNormalizationSource, /quality:\s*heicJpegQuality/, "HEIC normalization should use the configured JPEG quality.");
assertContains(imageNormalizationSource, /outputFormat\?\.mimeType !== "image\/jpeg"/, "HEIC normalization should validate converted JPEG bytes.");
assertContains(mediaCache, /contentType:\s*format\.mimeType/, "TOS persistence should use the normalized image MIME detected from bytes.");
assertContains(mediaCache, /await rm\(filePath,\s*\{ force: true \}\)/, "Unsupported cached images should be removed instead of kept as broken previews.");

const localMediaRoute = read("src/app/api/media/local/[...path]/route.ts");
assertContains(localMediaRoute, /sniffBrowserSupportedImageMime/, "Local media serving should infer image content type from file bytes.");
assertContains(localMediaRoute, /const contentType = await inferContentType/, "Local media content type inference must be asynchronous so it can inspect bytes.");

const sourceTagging = read("src/lib/source-tagging.ts");
const modelImageInput = read("src/lib/model-image-input.ts");
assertContains(sourceTagging, /toModelImageUrl/, "Source tagging should use the shared model image input helper.");
assertContains(modelImageInput, /sniffModelSupportedImageMime/, "Shared model image input should use the model-supported image sniffing helper.");

const contentPage = read("src/app/content/page.tsx");
assertContains(contentPage, /localMediaPreviewVersion/, "Frontend image previews should carry a local media cache-bust version.");
assertContains(contentPage, /url\.startsWith\("\/media\/"\) \|\| url\.startsWith\("\/generated\/"\)/, "Frontend image previews should cache-bust local media URLs.");
assertContains(contentPage, /appendQueryParam\(url,\s*"v",\s*localMediaPreviewVersion\)/, "Local media preview URLs should append the cache-bust version.");

async function assertRejects(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

console.log("Media cache image format check passed.");
