import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src/lib/tikhub.ts");
const source = readFileSync(sourcePath, "utf8");
const contentPageSource = readFileSync(path.join(projectRoot, "src/app/content/page.tsx"), "utf8");

if (/filterXiaohongshuItemsByRequestedNoteType|isXiaohongshuRequestedNoteType|shouldApplyXiaohongshuLocalTypeFilter|droppedByNoteTypeCount/.test(source)) {
  throw new Error("src/lib/tikhub.ts must not contain local Xiaohongshu post-crawl note-type filtering helpers or dropped-count diagnostics.");
}

if (!/app_v2\/get_image_note_detail/.test(source) || !/app_v2\/get_video_note_detail/.test(source)) {
  throw new Error("Xiaohongshu detail enrichment must use the current App V2 image/video endpoints.");
}

if (/xiaohongshu\/(?:web\/get_note_info_v4|web\/extract_share_info|web_v3\/fetch_note_detail)/.test(source)) {
  throw new Error("Xiaohongshu detail enrichment must not use removed Web or Web V3 endpoints.");
}

if (/web_v3\/fetch_search_notes/.test(source)) {
  throw new Error("Xiaohongshu search must use App V2 search_notes, not Web V3 fetch_search_notes.");
}

if (!/xiaohongshu:\s*"https:\/\/docs\.tikhub\.io\/420136398e0"/.test(contentPageSource) || /438852171e0/.test(contentPageSource)) {
  throw new Error("Frontend Xiaohongshu docs link must point to the updated TikHub App V2 search_notes document.");
}

for (const sortValue of ["comment_descending", "collect_descending", "english_preferred"]) {
  if (!contentPageSource.includes(`value: "${sortValue}"`)) {
    throw new Error(`Frontend Xiaohongshu sort options should expose ${sortValue}.`);
  }
}

if (!contentPageSource.includes("<option value={3}>直播</option>")) {
  throw new Error("Frontend Xiaohongshu note type options should expose TikHub App V2 live notes.");
}

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
});

const videoQualitySource = readFileSync(path.join(projectRoot, "src/lib/video-quality.ts"), "utf8");
const videoQualityTranspiled = ts.transpileModule(videoQualitySource, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: path.join(projectRoot, "src/lib/video-quality.ts"),
});
const videoQualityModule = { exports: {} };
vm.runInNewContext(videoQualityTranspiled.outputText, { module: videoQualityModule, exports: videoQualityModule.exports, console, URL }, { filename: path.join(projectRoot, "src/lib/video-quality.ts") });

const cjsModule = { exports: {} };
const sandbox = {
  Buffer,
  URL,
  URLSearchParams,
  console,
  module: cjsModule,
  exports: cjsModule.exports,
  require: (name) => {
    if (name === "node:http" || name === "node:https") {
      return {
        request: () => {
          throw new Error("Network request is disabled in Xiaohongshu note type check.");
        },
      };
    }
    if (name === "./activity-log") {
      return {
        compactError: (error) => String(error?.message || error),
        recordExecutionLog: async () => undefined,
      };
    }
    if (name === "./config") {
      return {
        appConfig: {
          tikhubApiKey: "test-key",
          tikhubBaseUrl: "https://example.invalid",
        },
      };
    }
    if (name === "./concurrency") {
      return {
        concurrencyConfig: {
          crawl: 12,
          media: 30,
          gpt: 50,
          image: 100,
          feishu: 50,
          production: 30,
        },
        mapWithConcurrency: async (items, _concurrency, mapper) => Promise.all(items.map(mapper)),
        runWithConcurrencyPool: async (_name, task) => task(),
      };
    }
    if (name === "./media-url-filter") {
      return {
        isLikelyNonContentImageUrl: () => false,
        normalizeContentImageUrls: (urls) => urls,
      };
    }
    if (name === "./douyin-media") {
      return {
        extractDouyinCarouselImageUrls: () => [],
      };
    }
    if (name === "./source-timestamps") {
      return {
        extractPublishedTime: () => ({}),
      };
    }
    if (name === "./video-quality") {
      return videoQualityModule.exports;
    }
    throw new Error(`Unexpected import in Xiaohongshu note type check: ${name}`);
  },
};

vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });

const {
  buildXiaohongshuSearchPath,
  getXiaohongshuSearchNoteTypeParams,
  mapXiaohongshuNoteType,
  normalizeTikHubResponse,
} = cjsModule.exports;

if (typeof mapXiaohongshuNoteType !== "function") {
  throw new Error("mapXiaohongshuNoteType must be exported from src/lib/tikhub.ts");
}
if (typeof buildXiaohongshuSearchPath !== "function") {
  throw new Error("buildXiaohongshuSearchPath must be exported from src/lib/tikhub.ts");
}
if (typeof getXiaohongshuSearchNoteTypeParams !== "function") {
  throw new Error("getXiaohongshuSearchNoteTypeParams must be exported from src/lib/tikhub.ts");
}
if (typeof normalizeTikHubResponse !== "function") {
  throw new Error("normalizeTikHubResponse must be exported from src/lib/tikhub.ts for fixture checks");
}

if (mapXiaohongshuNoteType(2) !== "普通笔记") {
  throw new Error("Internal Xiaohongshu noteType=2 should map to TikHub App V2 image/text note_type=普通笔记.");
}
if (mapXiaohongshuNoteType(1) !== "视频笔记") {
  throw new Error("Internal Xiaohongshu noteType=1 should map to TikHub App V2 video note_type=视频笔记.");
}
if (mapXiaohongshuNoteType(3) !== "直播笔记") {
  throw new Error("Internal Xiaohongshu noteType=3 should map to TikHub App V2 live note_type=直播笔记.");
}

const imageTextSearchPath = buildXiaohongshuSearchPath(
  { query: "Xiaopeng P7", sort: "popularity_descending", noteType: 2 },
  3,
);
const imageTextUrl = new URL(imageTextSearchPath, "https://example.test");
if (imageTextUrl.pathname !== "/api/v1/xiaohongshu/app_v2/search_notes") {
  throw new Error(`Xiaohongshu search should use App V2 search_notes, got ${imageTextUrl.pathname}`);
}
if (imageTextUrl.searchParams.get("keyword") !== "Xiaopeng P7") {
  throw new Error("Xiaohongshu App V2 search path should include keyword.");
}
if (imageTextUrl.searchParams.get("page") !== "3") {
  throw new Error("Xiaohongshu App V2 search path should include page.");
}
if (imageTextUrl.searchParams.get("sort_type") !== "popularity_descending") {
  throw new Error("Xiaohongshu App V2 search path should include requested sort_type.");
}
if (imageTextUrl.searchParams.get("note_type") !== "普通笔记") {
  throw new Error("Internal Xiaohongshu image/text noteType=2 should request App V2 note_type=普通笔记.");
}
if (imageTextUrl.searchParams.get("time_filter") !== "不限") {
  throw new Error("Xiaohongshu App V2 search path should include default time_filter=不限.");
}
if (imageTextUrl.searchParams.get("source") !== "explore_feed") {
  throw new Error("Xiaohongshu App V2 search path should include source=explore_feed.");
}
if (imageTextUrl.searchParams.get("ai_mode") !== "0") {
  throw new Error("Xiaohongshu App V2 search path should include ai_mode=0.");
}

for (const sortValue of ["comment_descending", "collect_descending", "english_preferred"]) {
  const sortUrl = new URL(
    buildXiaohongshuSearchPath({ query: "Xiaopeng P7", sort: sortValue, noteType: 0 }, 1),
    "https://example.test",
  );
  if (sortUrl.searchParams.get("sort_type") !== sortValue) {
    throw new Error(`Xiaohongshu App V2 search path should preserve sort_type=${sortValue}.`);
  }
}

const imageTextAttempts = getXiaohongshuSearchNoteTypeParams(2);
if (imageTextAttempts.join(",") !== "普通笔记") {
  throw new Error(`Image/text search should only request selected App V2 note_type=普通笔记, got ${imageTextAttempts.join(",")}`);
}
const videoAttempts = getXiaohongshuSearchNoteTypeParams(1);
if (videoAttempts.join(",") !== "视频笔记") {
  throw new Error(`Video search should only request selected App V2 note_type=视频笔记, got ${videoAttempts.join(",")}`);
}
const liveAttempts = getXiaohongshuSearchNoteTypeParams(3);
if (liveAttempts.join(",") !== "直播笔记") {
  throw new Error(`Live search should only request selected App V2 note_type=直播笔记, got ${liveAttempts.join(",")}`);
}
const allAttempts = getXiaohongshuSearchNoteTypeParams(0);
if (allAttempts.join(",") !== "不限") {
  throw new Error(`All-note search should only request App V2 note_type=不限 once, got ${allAttempts.join(",")}`);
}

const appV2SearchFixture = {
  data: {
    items: [
      {
        id: "6a0db7220000000006020fad",
        xsec_token: "test-xsec-token",
        noteCard: {
          type: "normal",
          displayTitle: "小鹏G6 正确图文笔记",
          desc: "小鹏G6 真实笔记内容",
          imageList: [
            {
              url: "https://sns-img.example.com/g6.webp",
            },
          ],
          interactInfo: {
            liked_count: 12,
          },
        },
      },
    ],
  },
};
const normalized = normalizeTikHubResponse(appV2SearchFixture, "xiaohongshu");
if (normalized.length !== 1) {
  throw new Error(`Expected one Xiaohongshu fixture item, got ${normalized.length}`);
}
const [fixtureItem] = normalized;
if (fixtureItem.sourceId !== "6a0db7220000000006020fad") {
  throw new Error(`App V2 search wrapper id should be preserved, got ${fixtureItem.sourceId}`);
}
if (fixtureItem.id !== "xiaohongshu-6a0db7220000000006020fad") {
  throw new Error(`App V2 normalized id should use the real note id, got ${fixtureItem.id}`);
}
if (/^xiaohongshu-\d+$/.test(fixtureItem.sourceId)) {
  throw new Error("App V2 fixture must not produce generated temporary Xiaohongshu source ids.");
}
if (fixtureItem.raw?.xsec_token !== "test-xsec-token") {
  throw new Error("App V2 search wrapper xsec_token should be preserved during normalization.");
}
if (fixtureItem.title !== "小鹏G6 正确图文笔记") {
  throw new Error(`App V2 noteCard displayTitle should be normalized as title, got ${fixtureItem.title}`);
}

console.log("Xiaohongshu request mapping and no post-crawl type filter/fallback check passed.");
