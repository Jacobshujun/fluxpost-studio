import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function loadTsModule(relativePath) {
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
      console,
      module: cjsModule,
      exports: cjsModule.exports,
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

const mediaCache = read("src/lib/media-cache.ts");
assertContains(mediaCache, /ensureBrowserReadableCachedImage/, "Media cache should validate downloaded image bytes before using the local URL.");
assertContains(mediaCache, /format\?\.mimeType === "image\/heic"[\s\S]*normalizeHeicFileToJpeg/, "Media cache should normalize HEIC images to JPEG.");
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

console.log("Media cache image format check passed.");
