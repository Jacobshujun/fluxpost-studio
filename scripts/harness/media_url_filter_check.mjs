import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src/lib/media-url-filter.ts");
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
const sandbox = {
  URL,
  console,
  module: cjsModule,
  exports: cjsModule.exports,
};

vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });

const { mergeDownloadedAndRemoteImages, normalizeContentImageUrls } = cjsModule.exports;
if (typeof normalizeContentImageUrls !== "function") {
  throw new Error("normalizeContentImageUrls must be exported from src/lib/media-url-filter.ts");
}
if (typeof mergeDownloadedAndRemoteImages !== "function") {
  throw new Error("mergeDownloadedAndRemoteImages must be exported from src/lib/media-url-filter.ts");
}

const mediaCacheStatusPath = path.join(projectRoot, "src/lib/media-cache-status.ts");
const mediaCacheStatusSource = readFileSync(mediaCacheStatusPath, "utf8");
const transpiledMediaCacheStatus = ts.transpileModule(mediaCacheStatusSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: mediaCacheStatusPath,
});
const mediaCacheStatusModule = { exports: {} };
vm.runInNewContext(
  transpiledMediaCacheStatus.outputText,
  {
    URL,
    console,
    module: mediaCacheStatusModule,
    exports: mediaCacheStatusModule.exports,
    require: (name) => {
      if (name === "./media-url-filter") return cjsModule.exports;
      throw new Error(`Unexpected import in media cache status check: ${name}`);
    },
  },
  { filename: mediaCacheStatusPath },
);
const { buildMediaCacheStatus } = mediaCacheStatusModule.exports;
if (typeof buildMediaCacheStatus !== "function") {
  throw new Error("buildMediaCacheStatus must be exported from src/lib/media-cache-status.ts");
}

const p7Preview1 =
  "http://sns-web-i10.rednotecdn.com/202606041758/cd78459097e3904e0895f37a4bcd8278/1040g2sg320q257tc6eeg5np60r109c991ir1u2o!nd_prv_wgth_webp_3?src=A";
const p7Default1 =
  "http://sns-web-i10.rednotecdn.com/202606041758/eefd21885bcce85508382c9e8a2e2013/1040g2sg320q257tc6eeg5np60r109c991ir1u2o!nd_dft_wgth_webp_3?src=A";
const p7Preview2 =
  "http://sns-web-i10.rednotecdn.com/202606041758/c52d4e0450d25f82a01356579679dedb/notes_uhdr/1040g3qg320q28t7k5m005np60r109c99kp37p98!nd_prv_wgth_webp_3?src=A";
const p7Default2 =
  "http://sns-web-i10.rednotecdn.com/202606041758/2a5a40c3d0a41bec790c1e5e0ca053fd/notes_uhdr/1040g3qg320q28t7k5m005np60r109c99kp37p98!nd_dft_wgth_webp_3?src=A";

const normalizedRednote = normalizeContentImageUrls([
  p7Preview1,
  p7Default1,
  p7Preview2,
  p7Default2,
]);

if (normalizedRednote.length !== 2) {
  throw new Error(`Expected two unique Xiaohongshu assets after rednotecdn normalization, got ${normalizedRednote.length}`);
}
if (normalizedRednote[0] !== p7Default1 || normalizedRednote[1] !== p7Default2) {
  throw new Error("Xiaohongshu rednotecdn normalization should keep the clearer !nd_dft variants in original asset order.");
}

const xhsDetailPreview =
  "https://sns-na-i11.xhscdn.com/notes_pre_post/1040g3k0320s7v006n20g5ofal5uk1orl5bp1cp8?imageView2/2/w/576/format/webp/q/87%7CimageMogr2/strip&redImage/frame/0&ap=5&sc=SRH_PRV";
const xhsDetailDefault =
  "https://sns-na-i11.xhscdn.com/notes_pre_post/1040g3k0320s7v006n20g5ofal5uk1orl5bp1cp8?imageView2/2/w/1440/format/webp&ap=5&sc=SRH_DTL";

const normalizedDetail = normalizeContentImageUrls([xhsDetailPreview, xhsDetailDefault]);
if (normalizedDetail.length !== 1 || normalizedDetail[0] !== xhsDetailDefault) {
  throw new Error("Xiaohongshu xhscdn detail normalization should keep the clearer detail image variant.");
}

const staleDownloads = Array.from({ length: 10 }, (_, index) => `/media/crawl/xiaohongshu/p7/image-${index + 1}.webp`);
const mergedStaleDownloads = mergeDownloadedAndRemoteImages(
  staleDownloads,
  [p7Preview1, p7Default1, p7Preview2, p7Default2],
  { preferDownloaded: true },
);
if (mergedStaleDownloads.some((url) => staleDownloads.includes(url))) {
  throw new Error("Stale Xiaohongshu downloadedImages should be dropped when they outnumber normalized source images.");
}
if (mergedStaleDownloads.join("\n") !== [p7Default1, p7Default2].join("\n")) {
  throw new Error("Stale Xiaohongshu downloadedImages should fall back to the clearer normalized remote image URLs.");
}

const freshDownloads = ["/media/crawl/xiaohongshu/p7/image-1.webp", "/media/crawl/xiaohongshu/p7/image-2.webp"];
const mergedFreshDownloads = mergeDownloadedAndRemoteImages(
  freshDownloads,
  [p7Preview1, p7Default1, p7Preview2, p7Default2],
  { preferDownloaded: true },
);
if (mergedFreshDownloads[0] !== freshDownloads[0] || mergedFreshDownloads[1] !== freshDownloads[1]) {
  throw new Error("Fresh downloadedImages aligned to normalized source images should still be preferred.");
}

const staleCacheStatus = buildMediaCacheStatus({
  images: [p7Preview1, p7Default1, p7Preview2, p7Default2],
  downloadedImages: staleDownloads,
});
if (staleCacheStatus.localImages !== 0 || staleCacheStatus.remoteImages !== 2 || staleCacheStatus.status !== "remote_only") {
  throw new Error("Stale Xiaohongshu downloadedImages should not be counted as locally complete media cache status.");
}

console.log("Media URL filter normalization check passed.");
