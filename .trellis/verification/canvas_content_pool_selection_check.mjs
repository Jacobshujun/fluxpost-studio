import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const selectionModule = "src/lib/content-pool-selection.ts";
const selectionRoute = "src/app/api/content-pool/selection/route.ts";

assert.equal(existsSync(path.join(root, selectionModule)), true, "content-pool selection domain module must exist");
assert.equal(existsSync(path.join(root, selectionRoute)), true, "authenticated content-pool selection route must exist");

const selectionSource = read(selectionModule);
const routeSource = read(selectionRoute);
const canvasTypes = read("src/lib/canvas/types.ts");
const registrySource = read("src/lib/canvas/registry.ts");
const schedulerSource = read("src/lib/canvas/scheduler.ts");
const schedulerV2Source = read("src/lib/canvas/scheduler-v2.ts");
const pageSource = read("src/app/canvas/page.tsx");
const contentPoolSource = read("src/lib/content-pool.ts");

assert.match(selectionSource, /export function normalizeContentPoolSelectionFilter/);
assert.match(selectionSource, /export function selectContentPoolItems/);
assert.match(selectionSource, /contentTags[\s\S]+every\(/, "content tags must use AND matching");
assert.match(selectionSource, /sourceId/, "full-text matching must include source ids");
assert.match(selectionSource, /local_complete/, "local-media filtering must use the persisted cache status");
assert.match(selectionSource, /projectId[\s\S]+itemId/, "stable item ordering must include project and item tie breakers");
assert.match(selectionSource, /encodeContentPoolSelectionCursor/);
assert.match(selectionSource, /decodeContentPoolSelectionCursor/);
assert.match(selectionSource, /export function freezeContentPoolSelectionItem/);
assert.doesNotMatch(selectionSource, /\braw\b/, "compact selection snapshots must never expose source raw payloads");

assert.match(routeSource, /requireWorkspaceAccount\(request\)/, "the selection route must be authenticated");
assert.match(routeSource, /listContentPoolSelection/);
assert.match(routeSource, /searchParams\.getAll\("contentTag"\)/);
assert.match(contentPoolSource, /filterWorkspaceOwnedRecords\(pool\.projects[\s\S]+account\)/, "selection reads must remain owner-scoped");
assert.doesNotMatch(schedulerSource, /batchUpdateSourceItemStatus|updateSourceItem/, "scheduler preflight and launch must not mutate content-pool status");

assert.match(canvasTypes, /CanvasScheduleParameterType[\s\S]+"content-pool"/);
assert.match(canvasTypes, /mode: "content-pool-filter"/);
assert.match(canvasTypes, /CanvasScheduleContentPoolSnapshot/);
assert.match(canvasTypes, /CanvasBatchBindingAdapter[\s\S]+"content-pool-input"/);
assert.match(registrySource, /input\.content-pool[\s\S]+content-pool-input/);
assert.match(schedulerSource, /content-pool-filter/);
assert.match(schedulerSource, /CONTENT_POOL_SCHEDULE_LIMIT/);
assert.match(schedulerV2Source, /content-pool-input/);
assert.match(schedulerV2Source, /snapshotTitle/);
assert.match(schedulerV2Source, /snapshotVideoUrls/);

assert.match(pageSource, /function ContentPoolSelectionBrowser/);
assert.match(pageSource, /\/api\/content-pool\/selection/);
assert.match(pageSource, /function ContentPoolScheduleSourceEditor/);
assert.doesNotMatch(
  pageSource.match(/function ContentPoolSnapshotPicker[\s\S]+?\n}\n/)?.[0] || "",
  /<select/,
  "the normal content-pool node must no longer use a native select as its material browser",
);

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-content-pool-selection-"));
try {
  writeFileSync(path.join(temp, "content-pool-selection.js"), ts.transpileModule(selectionSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "content-pool-selection.ts",
  }).outputText, "utf8");
  const selection = createRequire(import.meta.url)(path.join(temp, "content-pool-selection.js"));
  const projects = [
    project("project-b", "项目 B", [
      item("item-2", { title: "普通标题", hotScore: 20, publishedAt: "2026-08-20T00:00:00.000Z", contentTagging: tagging(["tag-a"]) }),
      item("duplicate", { title: "B 中重复项", hotScore: 5 }),
    ]),
    project("project-a", "项目 A", [
      item("item-1", {
        title: "目标标题",
        contentText: "目标正文",
        authorName: "目标作者",
        sourceId: "SRC-ALPHA",
        hotScore: 20,
        publishedAt: "2026-08-20T00:00:00.000Z",
        contentTagging: tagging(["tag-a", "tag-b"]),
        mediaCache: { status: "local_complete" },
        downloadedImages: ["/media/local.jpg"],
        downloadedVideoUrl: "/media/local.mp4",
      }),
      item("duplicate", { title: "A 中重复项", hotScore: 5 }),
    ]),
  ];

  const andTags = selection.selectContentPoolItems(projects, { contentTags: ["tag-a", "tag-b"] });
  assert.deepEqual(andTags.map((entry) => entry.id), ["item-1"], "content tags must all match");
  assert.deepEqual(selection.selectContentPoolItems(projects, { query: "src-alpha" }).map((entry) => entry.id), ["item-1"], "full-text search must include source ids");
  assert.deepEqual(selection.selectContentPoolItems(projects, { localMediaComplete: true }).map((entry) => entry.id), ["item-1"], "local-complete filtering must be exact");

  const sorted = selection.selectContentPoolItems(projects, { sort: "hot-desc" });
  assert.deepEqual(sorted.slice(0, 2).map((entry) => entry.id), ["item-1", "item-2"], "stable ties must use project then item id");
  assert.equal(sorted.filter((entry) => entry.id === "duplicate").length, 1, "duplicate source ids must be removed");
  const firstPage = selection.paginateContentPoolSelection(sorted, [], "hot-desc", undefined, 1);
  const secondPage = selection.paginateContentPoolSelection(sorted, [], "hot-desc", firstPage.nextCursor, 1);
  assert.equal(firstPage.items[0].id, "item-1");
  assert.equal(secondPage.items[0].id, "item-2", "cursor paging must continue after the stable tuple");

  const frozen = selection.freezeContentPoolSelectionItem(andTags[0], "2026-08-26T00:00:00.000Z");
  assert.deepEqual(frozen.imageUrls, ["/media/local.jpg"], "local images must take precedence in frozen snapshots");
  assert.deepEqual(frozen.videoUrls, ["/media/local.mp4"], "local video must take precedence in frozen snapshots");
  assert.equal(frozen.snapshotAt, "2026-08-26T00:00:00.000Z");
  assert.equal(Object.hasOwn(frozen, "raw"), false, "frozen snapshots must not contain raw source payloads");
  const manual = selection.freezeContentPoolSelectionItemsByIds(sorted, ["item-2", "item-1", "item-2", "missing"], "2026-08-26T00:00:00.000Z");
  assert.deepEqual(manual.values.map((entry) => entry.id), ["item-2", "item-1"], "manual snapshots must preserve the first selected-id order and deduplicate ids");
  assert.deepEqual(manual.missingIds, ["missing"], "missing or unauthorized manual ids must remain explicit");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Canvas content-pool selection and batch contracts passed.");

function project(id, query, items) {
  return { id, query, items, createdAt: "", updatedAt: "", normalizedQuery: query, totalItems: items.length, newItems: items.length, analyzedItems: 0, rewrittenItems: 0, approvedItems: 0, publishedItems: 0, platforms: {} };
}

function item(id, patch = {}) {
  return {
    id,
    platform: "xiaohongshu",
    sourceId: id,
    mediaType: "mixed",
    sourceUrl: `https://example.test/${id}`,
    images: [`https://example.test/${id}.jpg`],
    videoUrl: `https://example.test/${id}.mp4`,
    mediaUrls: [],
    metrics: {},
    raw: { secret: true },
    ...patch,
  };
}

function tagging(tags) {
  return { tags, reasons: [], status: "success", source: "local" };
}
