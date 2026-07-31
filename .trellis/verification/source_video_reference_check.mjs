import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function read(path) {
  return readFileSync(path, "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

function loadTsModule(path) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const moduleShim = { exports: {} };
  vm.runInNewContext(output, { exports: moduleShim.exports, module: moduleShim }, { filename: path });
  return moduleShim.exports;
}

const types = read("src/lib/types.ts");
const sourceVideoReference = read("src/lib/source-video-reference.ts");
const openai = read("src/lib/openai.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const simpleRunRoute = read("src/app/api/simple/runs/route.ts");
const reviewRoute = read("src/app/api/review/route.ts");
const reviewPage = read("src/app/review/page.tsx");
const page = read("src/app/page.tsx");
const feishuCli = read("src/lib/feishu-cli.ts");
const baseline = read(".trellis/verification/check.mjs");

assertContains(types, /GeneratedPost[\s\S]*videoUrls\?:\s*string\[\]/, "GeneratedPost must carry optional final source video URLs.");
assertContains(types, /SimpleRunInput[\s\S]*includeSourceVideo\?:\s*boolean/, "SimpleRunInput must carry the source-video opt-in switch.");

assertContains(sourceVideoReference, /export function resolveSourceVideoUrls/, "A shared source-video resolver must be exported.");
assertContains(sourceVideoReference, /source\.downloadedVideoUrl[\s\S]*source\.videoUrl/, "Source-video resolver must prefer cached local video before remote source video.");
assertContains(sourceVideoReference, /export function hasSourceVideoReference/, "A shared source-video presence helper must be exported.");

const { resolveSourceVideoUrls } = loadTsModule("src/lib/source-video-reference.ts");
assert.deepEqual(
  Array.from(resolveSourceVideoUrls({
    downloadedVideoUrl: " /media/crawl/douyin/post/video-1.mp4 ",
    videoUrl: "https://example.invalid/source-video.mp4",
  })),
  ["/media/crawl/douyin/post/video-1.mp4"],
  "Source-video resolver must return the local cached video instead of both local and remote fallback URLs.",
);
assert.deepEqual(
  Array.from(resolveSourceVideoUrls({
    videoUrl: " https://example.invalid/source-video.mp4 ",
  })),
  ["https://example.invalid/source-video.mp4"],
  "Source-video resolver must keep a remote source video only when no cached local video exists.",
);

assertContains(openai, /includeSourceVideo\?:\s*boolean/, "generatePost input must accept the source-video opt-in switch.");
assertContains(openai, /input\.includeSourceVideo === true \? resolveSourceVideoUrls\(input\.source\) : \[\]/, "generatePost must attach source videos only when explicitly enabled.");
assertContains(openai, /input\.includeSourceVideo === true \? resolveSourceVideoUrls\(source\) : \[\]/, "Demo generated posts must also respect the source-video opt-in switch.");

assertContains(simpleRunRoute, /includeSourceVideo\?:\s*boolean/, "Simple run API should accept the source-video switch.");
assertContains(simpleRunRoute, /includeSourceVideo:\s*body\.includeSourceVideo === true/, "Simple run API must default source-video attachment off.");

assertContains(simpleRuns, /hasSimpleProductionVideoReference\(source\)/, "Simple production must check for direct source video references.");
assertContains(simpleRuns, /isSimpleProductionVideoLikeSource\(source\)[\s\S]*hasSimpleProductionVideoReference\(source\)[\s\S]*source\.videoFrames\?\.length/, "Video-like simple production sources must allow source-video references when no frames exist.");
assertNotContains(simpleRuns, /Skipped video source without extracted video frames\./, "No-frame video skip message must be replaced with source-video-aware wording.");
assertContains(simpleRuns, /includeSourceVideo:\s*normalizedInput\.includeSourceVideo === true/, "Simple runs must normalize source-video attachment off by default.");
assertContains(simpleRuns, /includeSourceVideo:\s*normalizedInput\.includeSourceVideo === true/, "Simple production generatePost calls must use the normalized source-video opt-in.");

assertContains(reviewRoute, /"imageUrls" \| "videoUrls" \| "imageTasks" \| "feishuVehicle"/, "Review API manual patch must allow videoUrls.");
assertContains(reviewRoute, /if \("videoUrls" in body\.manualPatch\) allowedPatch\.videoUrls = body\.manualPatch\.videoUrls/, "Review API must preserve videoUrls in manual patches.");
assertContains(reviewPage, /videoUrls:\s*draft\.videoUrls/, "Review saveDraft must include draft video URLs.");
assertContains(reviewPage, /removeDraftVideo/, "Review desk must support removing a video material from the draft.");
assertContains(reviewPage, /<video[\s\S]*controls/, "Review desk must render video materials with playable controls.");
assertContains(reviewPage, /countPostMedia/, "Review desk media counts must include videos, not only imageUrls.");

assertContains(types, /export const defaultSimpleRunMediaSettings:[\s\S]*includeSourceVideo:\s*false/, "Shared simple media defaults must keep source-video attachment off.");
assertContains(page, /const \[simpleIncludeSourceVideo,\s*setSimpleIncludeSourceVideo\] = useState\(defaultSimpleRunMediaSettings\.includeSourceVideo\)/, "Simple UI must initialize source-video attachment from shared defaults.");
assertContains(page, /引用源视频素材/, "UI should expose the source-video material switch label.");
assertContains(page, /includeSourceVideo:\s*simpleIncludeSourceVideo/, "Simple start request must send the source-video switch.");

assertContains(feishuCli, /resolvePostAttachmentFiles/, "Feishu publish must resolve image and video attachments through a shared helper.");
assertContains(feishuCli, /post\.videoUrls/, "Feishu publish must include post.videoUrls in attachment handling.");
assertContains(feishuCli, /resolveLocalMediaFile\(url,\s*"video"\)/, "Feishu publish must resolve local video files separately from image files.");
assertContains(
  feishuCli,
  /const localVideoFiles[\s\S]*if \(!localVideoFiles\.length\) failures\.push\(\.\.\.videoFailures\)/,
  "Feishu publish must tolerate historical local+remote video fallback pairs while still failing remote-only videos.",
);
assertContains(feishuCli, /Post \$\{post\.id\} has media URLs but no local files/, "Feishu publish must fail clearly when media URLs cannot be uploaded.");
assertContains(feishuCli, /attachmentStatus:\s*countPostMedia\(post\) \? "pending" : "skipped"/, "Feishu publish state must mark pending attachments when a post has images or videos.");

assertContains(baseline, /source_video_reference_check\.mjs/, "Trellis baseline must include the source video reference check.");

console.log("source_video_reference_check passed");
