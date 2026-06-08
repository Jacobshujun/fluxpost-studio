import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
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

const policy = loadTsModule("src/lib/video-frame-policy.ts", {
  "./types": {},
});

const {
  isVideoFrameMediaUrl,
  maxVideoHighlightFrames,
  replaceVideoFrameUrlsInMediaUrls,
  selectBestVideoHighlightFrames,
} = policy;

if (maxVideoHighlightFrames !== 5) {
  throw new Error(`Video highlight frame cap must be 5, got ${maxVideoHighlightFrames}.`);
}
if (typeof selectBestVideoHighlightFrames !== "function") {
  throw new Error("selectBestVideoHighlightFrames must be exported.");
}
if (typeof replaceVideoFrameUrlsInMediaUrls !== "function") {
  throw new Error("replaceVideoFrameUrlsInMediaUrls must be exported.");
}
if (typeof isVideoFrameMediaUrl !== "function") {
  throw new Error("isVideoFrameMediaUrl must be exported.");
}

const frames = [
  { id: "interval-low", url: "/media/crawl/douyin/source-1/frames/frame-001.jpg?cache=1", timestamp: 0, score: 70, type: "interval", reason: "low" },
  { id: "interval-duplicate", url: "/media/crawl/douyin/source-1/frames/frame-001.jpg?cache=2", timestamp: 0, score: 92, type: "interval", reason: "duplicate" },
  { id: "cover", url: "/media/crawl/douyin/source-1/frames/cover.jpg", timestamp: 0.7, score: 82, type: "cover", reason: "cover" },
  { id: "scene-one", url: "/media/crawl/douyin/source-1/frames/scene-001.jpg", timestamp: 3, score: 86, type: "scene_change", reason: "scene" },
  { id: "highlight-original", url: "/media/crawl/douyin/source-1/frames/highlight-original.jpg", timestamp: 5, score: 95, type: "highlight", reason: "highlight" },
  { id: "highlight-best", url: "/media/crawl/douyin/source-1/frames/highlight-best.jpg", timestamp: 5.4, score: 99, type: "highlight", reason: "best" },
  { id: "scene-two", url: "/media/crawl/douyin/source-1/frames/scene-002.jpg", timestamp: 10, score: 87, type: "scene_change", reason: "scene" },
  { id: "interval-late", url: "/media/crawl/douyin/source-1/frames/frame-006.jpg", timestamp: 15, score: 72, type: "interval", reason: "late" },
  { id: "interval-extra", url: "/media/crawl/douyin/source-1/frames/frame-007.jpg", timestamp: 18, score: 71, type: "interval", reason: "extra" },
];

const selected = selectBestVideoHighlightFrames(frames);
if (selected.length !== 5) {
  throw new Error(`Expected exactly 5 selected video highlight frames, got ${selected.length}.`);
}
if (selected[0].id !== "highlight-best") {
  throw new Error("Best highlight frame should rank first.");
}
if (selected.some((frame) => frame.id === "interval-duplicate")) {
  throw new Error("Duplicate frame URLs should be deduped before ranking.");
}
if (selected.some((frame) => frame.id === "highlight-original")) {
  throw new Error("Near-duplicate timestamps should not displace broader highlight coverage while five frames are available.");
}
if (!selected.some((frame) => frame.type === "cover") || !selected.some((frame) => frame.type === "scene_change")) {
  throw new Error("Selected frames should preserve useful cover and scene-change candidates.");
}

const selectedUrls = new Set(selected.map((frame) => frame.url));
const mediaUrls = replaceVideoFrameUrlsInMediaUrls(
  [
    "https://example.invalid/source",
    "/media/crawl/douyin/source-1/frames/frame-099.jpg",
    selected[0].url,
    "https://cdn.example.invalid/image.jpg",
  ],
  selected,
);
if (mediaUrls.includes("/media/crawl/douyin/source-1/frames/frame-099.jpg")) {
  throw new Error("Stale unselected frame URLs should be removed from mediaUrls.");
}
if (selected.some((frame) => !mediaUrls.includes(frame.url))) {
  throw new Error("Selected video highlight frame URLs should be present in mediaUrls.");
}
if (mediaUrls.filter((url) => selectedUrls.has(url)).length !== selected.length) {
  throw new Error("Selected video highlight frame URLs should not be duplicated in mediaUrls.");
}
if (!isVideoFrameMediaUrl("/media/crawl/douyin/source-1/frames/scene-001.jpg")) {
  throw new Error("Local extracted frame URLs should be recognized as video-frame media.");
}
if (isVideoFrameMediaUrl("https://cdn.example.invalid/image.jpg")) {
  throw new Error("Ordinary image URLs should not be treated as video frames.");
}

const mediaCache = read("src/lib/media-cache.ts");
const contentPool = read("src/lib/content-pool.ts");
const mediaBackfill = read("src/lib/media-backfill.ts");
const creationControls = read("src/lib/creation-controls.ts");
const sourceTagging = read("src/lib/source-tagging.ts");
const page = read("src/app/page.tsx");
const baseline = read("scripts/harness/check.ps1");

assertContains(mediaCache, /selectBestVideoHighlightFrames/, "Media cache must select best video highlight frames before storing.");
assertContains(mediaCache, /replaceVideoFrameUrlsInMediaUrls/, "Media cache must remove stale unselected frame URLs from mediaUrls.");
assertNotContains(mediaCache, /maxVideoFrames\s*=\s*12/, "Old 12-frame media-cache cap must not remain.");

assertContains(contentPool, /selectBestVideoHighlightFrames/, "Content-pool writes must normalize stored video frames.");
assertContains(contentPool, /replaceVideoFrameUrlsInMediaUrls/, "Content-pool writes must remove stale frame URLs from mediaUrls.");

assertContains(mediaBackfill, /selectBestVideoHighlightFrames/, "Media backfill must normalize video frames.");
assertContains(mediaBackfill, /replaceVideoFrameUrlsInMediaUrls/, "Media backfill must remove stale frame URLs from mediaUrls.");

assertContains(creationControls, /maxVideoHighlightFrames/, "Default production image tasks must use the global video-frame cap.");
assertNotContains(creationControls, /frameTasks\.slice\(0,\s*12\)/, "Default production image tasks must not keep the old 12 video-frame cap.");

assertContains(sourceTagging, /selectBestVideoHighlightFrames/, "Source visual tagging must use the global video-frame selector for stale records.");
assertContains(page, /selectBestVideoHighlightFrames/, "Frontend preview and visual-tag editing must use the global video-frame selector for stale records.");

assertContains(baseline, /video_frame_policy_check\.mjs/, "Harness baseline must include the video frame policy check.");

console.log("Video frame policy check passed.");
