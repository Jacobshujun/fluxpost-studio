import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const contentPoolSource = readFileSync(path.join(projectRoot, "src/lib/content-pool.ts"), "utf8");

if (!/extractDouyinCarouselImageUrls/.test(contentPoolSource)) {
  throw new Error("Content-pool refresh should repair Douyin carousel images from raw records.");
}
if (!/rawImageRepairApplied\s*\?\s*undefined\s*:\s*filterAlignedDownloadedImages/.test(contentPoolSource)) {
  throw new Error("Content-pool refresh should drop stale downloadedImages when Douyin raw image repair changes source image order.");
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
  const sandbox = {
    Buffer,
    URL,
    URLSearchParams,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const mediaFilter = loadTsModule("src/lib/media-url-filter.ts");
const douyinMedia = loadTsModule("src/lib/douyin-media.ts", {
  "./media-url-filter": mediaFilter,
});
const tikhub = loadTsModule("src/lib/tikhub.ts", {
  "node:http": {
    request: () => {
      throw new Error("Network request is disabled in Douyin carousel image check.");
    },
  },
  "node:https": {
    request: () => {
      throw new Error("Network request is disabled in Douyin carousel image check.");
    },
  },
  "./activity-log": {
    compactError: (error) => String(error?.message || error),
    recordExecutionLog: async () => undefined,
  },
  "./config": {
    appConfig: {
      tikhubApiKey: "test-key",
      tikhubBaseUrl: "https://example.invalid",
    },
  },
  "./concurrency": {
    concurrencyConfig: {
      crawl: 8,
      media: 20,
      gpt: 50,
      image: 100,
      feishu: 50,
      production: 20,
    },
    mapWithConcurrency: async (items, _concurrency, mapper) => Promise.all(items.map(mapper)),
    runWithConcurrencyPool: async (_name, task) => task(),
  },
  "./douyin-media": douyinMedia,
  "./media-url-filter": mediaFilter,
  "./source-timestamps": {
    extractPublishedTime: () => ({}),
  },
});

const { normalizeContentImageUrls } = mediaFilter;
const { normalizeTikHubResponse } = tikhub;

if (typeof normalizeContentImageUrls !== "function") {
  throw new Error("normalizeContentImageUrls must be exported from src/lib/media-url-filter.ts.");
}
if (typeof normalizeTikHubResponse !== "function") {
  throw new Error("normalizeTikHubResponse must be exported from src/lib/tikhub.ts.");
}
if (typeof douyinMedia.extractDouyinCarouselImageUrls !== "function") {
  throw new Error("extractDouyinCarouselImageUrls must be exported from src/lib/douyin-media.ts for content-pool raw repair.");
}

function imageUrl(assetId, variant) {
  if (variant === "cover") {
    return `https://p26-sign.douyinpic.com/tos-cn-i-0813/${assetId}~noop.webp?biz_tag=aweme_images&sc=cover&column_n=0`;
  }
  if (variant === "originCover") {
    return `https://p26-sign.douyinpic.com/tos-cn-i-0813/${assetId}~tplv-dy-360p.jpeg?biz_tag=aweme_images&sc=origin_cover&column_n=0`;
  }
  if (variant === "heic") {
    return `https://p3-sign.douyinpic.com/tos-cn-i-0813/${assetId}~tplv-dy-aweme-images-v2:1920:1440:q80.heic?sc=image`;
  }
  if (variant === "water") {
    return `https://p3-sign.douyinpic.com/tos-cn-i-0813/${assetId}~tplv-dy-water-v10:encoded-watermark:3000:3000:q80.webp?sc=image`;
  }
  return `https://p3-sign.douyinpic.com/tos-cn-i-0813/${assetId}~tplv-dy-aweme-images-v2:1920:1440:q80.jpeg?sc=image`;
}

const firstAsset = "douyinasset00abcdefghi";
const normalizedVariants = normalizeContentImageUrls([
  imageUrl(firstAsset, "cover"),
  imageUrl(firstAsset, "originCover"),
  imageUrl(firstAsset, "heic"),
  imageUrl(firstAsset, "water"),
  imageUrl(firstAsset, "jpeg"),
]);

if (normalizedVariants.length !== 1) {
  throw new Error(`Douyin image variants should collapse to one asset, got ${normalizedVariants.length}.`);
}
if (normalizedVariants[0] !== imageUrl(firstAsset, "jpeg")) {
  throw new Error("Douyin variant normalization should keep the non-watermarked supported JPEG image.");
}

const assets = Array.from({ length: 20 }, (_value, index) => `douyinasset${String(index).padStart(2, "0")}abcdefghi`);
const fixture = {
  data: [
    {
      aweme_id: "7647456408942589300",
      aweme_type: 68,
      media_type: 2,
      desc: "小鹏X9 多图自动轮播",
      video: {
        cover: {
          url_list: [imageUrl(assets[0], "cover"), imageUrl(assets[0], "originCover")],
        },
        origin_cover: {
          url_list: [imageUrl(assets[0], "originCover")],
        },
        play_addr: {
          url_list: [],
        },
      },
      images: assets.map((assetId) => ({
        uri: `tos-cn-i-0813/${assetId}`,
        width: 1920,
        height: 1440,
        url_list: [imageUrl(assetId, "heic"), imageUrl(assetId, "jpeg")],
        download_url_list: [imageUrl(assetId, "water")],
      })),
    },
  ],
};

const [item] = normalizeTikHubResponse(fixture, "douyin");
if (!item) {
  throw new Error("Douyin carousel fixture should normalize to one item.");
}
if (item.mediaType !== "image") {
  throw new Error(`Douyin carousel fixture should be image media, got ${item.mediaType}.`);
}
if (item.images.length !== assets.length) {
  throw new Error(`Douyin carousel should keep all ${assets.length} image assets, got ${item.images.length}.`);
}

item.images.forEach((url, index) => {
  const expectedAsset = assets[index];
  if (!url.includes(expectedAsset)) {
    throw new Error(`Image ${index + 1} should preserve carousel asset ${expectedAsset}, got ${url}.`);
  }
  if (!/tplv-dy-aweme-images-v2/.test(url) || !/\.jpeg(?:[?#]|$)/.test(url)) {
    throw new Error(`Image ${index + 1} should use the supported aweme JPEG variant, got ${url}.`);
  }
  if (/\.heic(?:[?#]|$)|water-v|sc=(?:cover|origin_cover)|~noop|tplv-dy-360p/.test(url)) {
    throw new Error(`Image ${index + 1} should not use HEIC, watermarked, or cover variants: ${url}.`);
  }
});

const repairedImages = douyinMedia.extractDouyinCarouselImageUrls(fixture.data[0]);
if (repairedImages.join("\n") !== item.images.join("\n")) {
  throw new Error("extractDouyinCarouselImageUrls should match Douyin normalized carousel images for raw repair.");
}

console.log("Douyin carousel image extraction check passed.");
