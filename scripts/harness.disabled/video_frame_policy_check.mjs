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

const singleShotFrames = [
  { id: "best", url: "/media/crawl/douyin/single-shot/frames/frame-001.jpg", timestamp: 0, score: 96, type: "highlight", reason: "best", perceptualHash: "0".repeat(256) },
  { id: "same-angle-1", url: "/media/crawl/douyin/single-shot/frames/frame-002.jpg", timestamp: 4, score: 94, type: "highlight", reason: "same", perceptualHash: "0".repeat(250) + "1".repeat(6) },
  { id: "same-angle-2", url: "/media/crawl/douyin/single-shot/frames/frame-003.jpg", timestamp: 8, score: 92, type: "scene_change", reason: "same", perceptualHash: "0".repeat(248) + "1".repeat(8) },
  { id: "same-angle-3", url: "/media/crawl/douyin/single-shot/frames/frame-004.jpg", timestamp: 12, score: 90, type: "interval", reason: "same", perceptualHash: "0".repeat(247) + "1".repeat(9) },
  { id: "different-detail", url: "/media/crawl/douyin/single-shot/frames/frame-005.jpg", timestamp: 16, score: 70, type: "interval", reason: "different", perceptualHash: "1".repeat(256) },
];
const singleShotSelected = selectBestVideoHighlightFrames(singleShotFrames);
if (singleShotSelected.length !== 2) {
  throw new Error(`Single-shot visually similar frames should not be padded to 5, got ${singleShotSelected.length}.`);
}
if (!singleShotSelected.some((frame) => frame.id === "best") || !singleShotSelected.some((frame) => frame.id === "different-detail")) {
  throw new Error("Visual diversity selection should keep the best frame and any genuinely different candidate.");
}

const qualityFrames = [
  { id: "black", url: "/media/crawl/douyin/quality/frames/frame-001.jpg", timestamp: 0, score: 99, type: "highlight", reason: "black", qualityScore: 3, selectionReason: "black frame" },
  { id: "blur", url: "/media/crawl/douyin/quality/frames/frame-002.jpg", timestamp: 3, score: 98, type: "highlight", reason: "blur", qualityScore: 18, selectionReason: "motion blur" },
  { id: "clean-detail", url: "/media/crawl/douyin/quality/frames/frame-003.jpg", timestamp: 6, score: 75, type: "interval", reason: "wheel detail", qualityScore: 86, aestheticScore: 91, aiScore: 93, selectionReason: "clear detail frame with social-media value" },
  { id: "interior", url: "/media/crawl/douyin/quality/frames/frame-004.jpg", timestamp: 9, score: 74, type: "interval", reason: "interior", qualityScore: 84, aestheticScore: 90, aiScore: 92, selectionReason: "interior feature detail" },
  { id: "plain-car", url: "/media/crawl/douyin/quality/frames/frame-005.jpg", timestamp: 12, score: 96, type: "highlight", reason: "ordinary full car", qualityScore: 80, aestheticScore: 62, aiScore: 61, selectionReason: "ordinary full vehicle frame" },
  { id: "scene", url: "/media/crawl/douyin/quality/frames/frame-006.jpg", timestamp: 15, score: 80, type: "scene_change", reason: "scene", qualityScore: 82, aestheticScore: 89, aiScore: 91, selectionReason: "driving scene with useful atmosphere" },
  { id: "stable", url: "/media/crawl/douyin/quality/frames/frame-007.jpg", timestamp: 18, score: 78, type: "interval", reason: "stable", qualityScore: 83, aestheticScore: 80, aiScore: 82, selectionReason: "stable clean frame" },
  { id: "text-value", url: "/media/crawl/douyin/quality/frames/frame-008.jpg", timestamp: 21, score: 77, type: "interval", reason: "info", qualityScore: 81, aestheticScore: 79, aiScore: 81, selectionReason: "information-rich frame" },
];
const qualitySelected = selectBestVideoHighlightFrames(qualityFrames);
if (qualitySelected.some((frame) => frame.id === "black" || frame.id === "blur")) {
  throw new Error("Very low-quality black or blurred frames should be filtered out even when their legacy score is high.");
}
if (qualitySelected[0]?.id !== "clean-detail") {
  throw new Error("AI-reviewed local/detail/interior/scene frames should be allowed to outrank ordinary full-car frames.");
}
if (qualitySelected.some((frame) => /主体完整|整车完整|车身占满|full car required/i.test(frame.selectionReason || ""))) {
  throw new Error("AI review selection reasons must not require complete car subject framing.");
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
const videoFrameReview = read("src/lib/video-frame-review.ts");
const types = read("src/lib/types.ts");
const contentPool = read("src/lib/content-pool.ts");
const mediaBackfill = read("src/lib/media-backfill.ts");
const creationControls = read("src/lib/creation-controls.ts");
const sourceTagging = read("src/lib/source-tagging.ts");
const page = read("src/app/page.tsx");
const baseline = read("scripts/harness/check.ps1");

assertContains(mediaCache, /selectBestVideoHighlightFrames/, "Media cache must select best video highlight frames before storing.");
assertContains(mediaCache, /replaceVideoFrameUrlsInMediaUrls/, "Media cache must remove stale unselected frame URLs from mediaUrls.");
assertContains(mediaCache, /perceptualHash/, "Media cache must compute local perceptual hashes for extracted video frames.");
assertContains(mediaCache, /probeVideoDurationSeconds/, "Media cache must probe duration so frame candidates can cover the whole video.");
assertContains(mediaCache, /buildVideoFrameSampleTimestamps/, "Media cache must build timestamp samples instead of only scanning the first fixed window.");
assertContains(mediaCache, /reviewVideoFramesWithAi/, "Media cache must route extracted frame candidates through AI review when available.");
assertContains(mediaCache, /qualityScore/, "Media cache must compute local frame quality scores before final selection.");
assertNotContains(mediaCache, /maxVideoFrames\s*=\s*12/, "Old 12-frame media-cache cap must not remain.");
assertNotContains(mediaCache, /const frameScanSeconds\s*=\s*36/, "Video frame extraction must not only scan the first 36 seconds.");

assertContains(types, /qualityScore\?:\s*number/, "VideoFrameAsset must expose local qualityScore.");
assertContains(types, /aestheticScore\?:\s*number/, "VideoFrameAsset must expose AI aestheticScore.");
assertContains(types, /aiScore\?:\s*number/, "VideoFrameAsset must expose AI aiScore.");
assertContains(types, /selectionReason\?:\s*string/, "VideoFrameAsset must expose selectionReason.");

assertContains(videoFrameReview, /export async function reviewVideoFramesWithAi/, "AI video-frame review helper must be exported.");
assertContains(videoFrameReview, /aestheticScore/, "AI video-frame review must request aestheticScore.");
assertContains(videoFrameReview, /clarityScore/, "AI video-frame review must request clarityScore.");
assertContains(videoFrameReview, /compositionScore/, "AI video-frame review must request compositionScore.");
assertContains(videoFrameReview, /contentValueScore/, "AI video-frame review must request contentValueScore.");
assertContains(videoFrameReview, /usableForPost/, "AI video-frame review must request usableForPost.");
assertContains(videoFrameReview, /不要求[^。\n]*(整车完整|车身占满|外观大图)/, "AI review prompt must explicitly avoid requiring complete-car framing.");
assertNotContains(videoFrameReview, /(车主体完整|主体完整|整车完整入镜).*标准/, "AI review must not make complete vehicle subject framing a scoring standard.");

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
