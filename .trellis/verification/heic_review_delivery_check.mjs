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

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const transpiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
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

const preview = loadTsModule("src/lib/media-preview.ts");
const nativeTos = "https://bucket.tos-cn-guangzhou.volces.com/fluxpost/image.jpg?v=etag";
const customTos = "https://media.example.invalid/fluxpost/image.jpg?v=etag";
const weibo = "https://wx2.sinaimg.cn/large/example.jpg";
assert(preview.toRemoteImagePreviewSrc(nativeTos) === nativeTos, "Native Volcengine TOS URLs should load directly.");
assert(preview.toRemoteImagePreviewSrc(customTos).startsWith("/api/media/proxy?url="), "Custom media origins should reach the server decision boundary.");
assert(preview.toRemoteImagePreviewSrc(weibo).startsWith("/api/media/proxy?url="), "Weibo source images should retain proxy headers.");

const proxyRoute = read("src/app/api/media/proxy/route.ts");
assertContains(proxyRoute, /isManagedRuntimeMediaUrl\(target\)[\s\S]*NextResponse\.redirect\(target/, "Managed TOS URLs should redirect without VPS body proxying.");
assertContains(proxyRoute, /sniffImageFormat\(image\)[\s\S]*detectedFormat\?\.mimeType === "image\/heic"[\s\S]*status:\s*415/, "The browser proxy should reject HEIC response bytes explicitly.");

const repair = loadTsModule("src/lib/generated-media-repair.ts", {
  "./activity-log": { recordExecutionLog: async () => undefined },
  "./config": { appConfig: { tosEnabled: true } },
  "./database": {},
  "./media-backfill": {},
  "./media-url-filter": { getCachedImageIndex: () => undefined },
  "./runtime-media-storage": {
    isManagedRuntimeMediaUrl: (url) => url.includes("tos-cn-guangzhou.volces.com"),
    isTosRuntimeMediaConfigured: () => true,
  },
});
const source = {
  id: "source-1",
  images: [weibo, "https://wx3.sinaimg.cn/large/second.jpg"],
};
const candidates = repair.findRepairCandidates(
  {
    id: "post-1",
    imageUrls: [nativeTos, weibo, "https://generated.example.invalid/output.jpg"],
  },
  source,
);
assert(candidates.length === 1, "Only exact external source-image matches should be repair candidates.");
assert(candidates[0].finalImageIndex === 1 && candidates[0].sourceImageIndex === 0, "Repair candidates should preserve final and source indices.");
assert(
  repair.findRepairCandidates(
    { id: "post-duplicate", imageUrls: [weibo] },
    { id: "source-duplicate", images: [weibo, weibo] },
  ).length === 0,
  "Duplicate source URLs should not be assigned an ambiguous source index.",
);

const repairRoute = read("src/app/api/config/media-repair/route.ts");
assertContains(repairRoute, /requireWorkspaceAccount\(request\)/, "Historical media repair should require sign-in.");
assertContains(repairRoute, /isWorkspaceAdmin\(account\)/, "Historical media repair should require an admin.");
assertContains(repairRoute, /body\.mode !== "scan" && body\.mode !== "apply"/, "Historical media repair should validate the mode.");

const repairDomain = read("src/lib/generated-media-repair.ts");
assertContains(repairDomain, /maxRepairLimit = 25/, "Historical repair batches should have a hard limit.");
assertContains(repairDomain, /imageUrls\[candidate\.finalImageIndex\] !== candidate\.sourceUrl/, "Historical repair should re-check exact matches before writing.");
assertContains(repairDomain, /cachedSource\.images\[candidate\.sourceImageIndex\] !== candidate\.sourceUrl/, "Historical repair should re-check source image order after refreshing media.");
assertContains(repairDomain, /task\.mode === "keep"[\s\S]*referenceUrls:/, "Historical repair should update keep URLs while preserving generated task URLs and updating exact references.");
assertContains(repairDomain, /forceImageRefresh:\s*true/, "Historical repair should force a fresh source-image cache and verified TOS write.");
assertContains(repairDomain, /skipVideoProcessing:\s*true/, "Historical repair should not download videos, transcribe, or run AI frame review.");
assertContains(repairDomain, /backfill\.cachedItems/, "Historical repair should use only this repair attempt's cache evidence.");
assertContains(repairDomain, /saveGeneratedPostToDb/, "Historical repair should persist verified replacements.");

const imageGeneration = read("src/lib/image-generation.ts");
assertContains(imageGeneration, /recordKeepTaskNeedsReview/, "Keep-mode normalization failures should become needs-review results.");
assertContains(imageGeneration, /materializeRemoteSourceImage/, "Remote keep-mode images should be inspected before being returned.");
assertContains(imageGeneration, /persistRemoteSourceImage\(buffer,\s*url/, "Verified remote keep-mode images should be persisted instead of retaining platform URLs.");
const simpleRuns = read("src/lib/simple-runs.ts");
assertContains(simpleRuns, /imageResult\.status !== "needs_review"[\s\S]*publishReadyPosts\.push\(post\)/, "Needs-review image drafts should be kept out of automatic publishing.");
assertContains(simpleRuns, /if \(!publishReadyPosts\.length\)[\s\S]*status: "skipped"/, "An all-needs-review batch should remain in the review desk without Feishu publishing.");

const firstTos = "https://bucket.tos-cn-guangzhou.volces.com/fluxpost/media/crawl/weibo/source-1/image-1.jpg?v=one";
const secondTos = "https://bucket.tos-cn-guangzhou.volces.com/fluxpost/media/crawl/weibo/source-1/image-2.jpg?v=two";
let storedPosts = [
  {
    id: "post-apply",
    sourceItemId: "source-1",
    platform: "weibo",
    title: "unchanged title",
    body: "unchanged body",
    status: "draft",
    imagePrompt: "prompt",
    imageUrls: [weibo, source.images[1]],
    imageTasks: [
      { id: "keep", mode: "keep", url: weibo, referenceUrls: [weibo, source.images[1]] },
      { id: "generated", mode: "wash", url: source.images[1], referenceUrls: [weibo, source.images[1]] },
    ],
    materialPaths: [],
    aiNotes: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];
let saveCount = 0;
let backfillCallCount = 0;
const executableRepair = loadTsModule("src/lib/generated-media-repair.ts", {
  "./activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
  "./config": { appConfig: { tosEnabled: true } },
  "./database": {
    readGeneratedPostsFromDb: async () => structuredClone(storedPosts),
    readContentProjectsFromDb: async () => [{ id: "project", items: [source] }],
    saveGeneratedPostToDb: async (post) => {
      saveCount += 1;
      storedPosts = storedPosts.map((current) => (current.id === post.id ? structuredClone(post) : current));
    },
  },
  "./media-backfill": {
    backfillSourceItemMedia: async () => {
      backfillCallCount += 1;
      return {
        items: [],
        cachedItems: [{ ...source, downloadedImages: [firstTos, secondTos] }],
      };
    },
  },
  "./media-url-filter": {
    getCachedImageIndex: (url) => {
      const match = url.match(/image-(\d+)/);
      return match ? Number(match[1]) - 1 : undefined;
    },
  },
  "./runtime-media-storage": {
    isManagedRuntimeMediaUrl: (url) => url.includes("tos-cn-guangzhou.volces.com/fluxpost/"),
    isTosRuntimeMediaConfigured: () => true,
  },
});
const account = { id: "admin", role: "admin" };
const scanned = await executableRepair.runGeneratedMediaRepairBatch({ mode: "scan", limit: 10, account });
assert(scanned.candidateImageCount === 2 && backfillCallCount === 0, "Scan mode should identify exact candidates without refreshing media.");
const applied = await executableRepair.runGeneratedMediaRepairBatch({ mode: "apply", limit: 10, account });
assert(backfillCallCount === 1, "Apply mode should refresh candidate source media once per batch.");
assert(applied.repairedPostCount === 1 && applied.repairedImageCount === 2, "Apply mode should replace every verified exact-match image.");
assert(storedPosts[0].imageUrls.join("|") === [firstTos, secondTos].join("|"), "Apply mode should preserve source image order.");
assert(storedPosts[0].title === "unchanged title" && storedPosts[0].body === "unchanged body" && storedPosts[0].status === "draft", "Media repair should preserve copy and review status.");
assert(storedPosts[0].imageTasks[0].url === firstTos, "Keep task URLs should follow exact repaired images.");
assert(storedPosts[0].imageTasks[1].url === source.images[1], "Generated task URLs should remain unchanged.");
assert(storedPosts[0].imageTasks[1].referenceUrls.join("|") === [firstTos, secondTos].join("|"), "Exact reference URLs should be updated for every task mode.");
const repeated = await executableRepair.runGeneratedMediaRepairBatch({ mode: "apply", limit: 10, account });
assert(repeated.candidateImageCount === 0 && repeated.repairedImageCount === 0 && saveCount === 1, "Repeated repair should be idempotent.");

let failedSaveCount = 0;
const failedRepair = loadTsModule("src/lib/generated-media-repair.ts", {
  "./activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
  "./config": { appConfig: { tosEnabled: true } },
  "./database": {
    readGeneratedPostsFromDb: async () => [{ ...storedPosts[0], id: "post-failed", imageUrls: [weibo] }],
    readContentProjectsFromDb: async () => [{ id: "project", items: [source] }],
    saveGeneratedPostToDb: async () => { failedSaveCount += 1; },
  },
  "./media-backfill": {
    backfillSourceItemMedia: async () => ({
      items: [],
      cachedItems: [{ ...source, downloadedImages: ["https://bucket.tos-cn-guangzhou.volces.com/fluxpost/media/image-3.jpg"] }],
    }),
  },
  "./media-url-filter": { getCachedImageIndex: () => 2 },
  "./runtime-media-storage": {
    isManagedRuntimeMediaUrl: (url) => url.includes("tos-cn-guangzhou.volces.com/fluxpost/"),
    isTosRuntimeMediaConfigured: () => true,
  },
});
const failed = await failedRepair.runGeneratedMediaRepairBatch({ mode: "apply", limit: 10, account });
assert(failed.repairedImageCount === 0 && failed.failures.length === 1 && failedSaveCount === 0, "Missing or wrong-index TOS replacements should be reported without writing the post.");

let raceReadCount = 0;
let raceSaveCount = 0;
const racePost = { ...storedPosts[0], id: "post-race", imageUrls: [weibo] };
const raceRepair = loadTsModule("src/lib/generated-media-repair.ts", {
  "./activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
  "./config": { appConfig: { tosEnabled: true } },
  "./database": {
    readGeneratedPostsFromDb: async () => {
      raceReadCount += 1;
      return raceReadCount === 1 ? [racePost] : [{ ...racePost, imageUrls: ["https://example.invalid/changed.jpg"] }];
    },
    readContentProjectsFromDb: async () => [{ id: "project", items: [source] }],
    saveGeneratedPostToDb: async () => { raceSaveCount += 1; },
  },
  "./media-backfill": {
    backfillSourceItemMedia: async () => ({ items: [], cachedItems: [{ ...source, downloadedImages: [firstTos] }] }),
  },
  "./media-url-filter": { getCachedImageIndex: () => 0 },
  "./runtime-media-storage": {
    isManagedRuntimeMediaUrl: (url) => url.includes("tos-cn-guangzhou.volces.com/fluxpost/"),
    isTosRuntimeMediaConfigured: () => true,
  },
});
const raced = await raceRepair.runGeneratedMediaRepairBatch({ mode: "apply", limit: 10, account });
assert(raced.repairedImageCount === 0 && raced.failures.length === 1 && raceSaveCount === 0, "A post changed after scanning should not be overwritten.");

const cursorPosts = ["post-c", "post-a", "post-b"].map((id) => ({ ...racePost, id }));
const cursorRepair = loadTsModule("src/lib/generated-media-repair.ts", {
  "./activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
  "./config": { appConfig: { tosEnabled: true } },
  "./database": {
    readGeneratedPostsFromDb: async () => cursorPosts,
    readContentProjectsFromDb: async () => [{ id: "project", items: [source] }],
  },
  "./media-backfill": { backfillSourceItemMedia: async () => { throw new Error("scan must not backfill"); } },
  "./media-url-filter": { getCachedImageIndex: () => 0 },
  "./runtime-media-storage": {
    isManagedRuntimeMediaUrl: () => false,
    isTosRuntimeMediaConfigured: () => true,
  },
});
const cursorFirst = await cursorRepair.runGeneratedMediaRepairBatch({ mode: "scan", limit: 1, account });
const cursorSecond = await cursorRepair.runGeneratedMediaRepairBatch({ mode: "scan", limit: 1, cursor: cursorFirst.nextCursor, account });
assert(cursorFirst.nextCursor === "post-a" && cursorSecond.cursor === "post-a" && cursorSecond.nextCursor === "post-b", "Repair pagination should advance in stable post-id order.");

console.log("HEIC review delivery check passed.");
