import assert from "node:assert/strict";
import { parseReviewFilters, emptyReviewFilters, reviewTimeBounds, calendarDay, reviewFiltersFromUrl, type ReviewCondition, type ReviewFilters } from "../../src/lib/review-filters";
import { insertAt, ordinaryImagePrompts, reorderReviewImages } from "../../src/lib/review-image-order";
import type { GeneratedPost, XhsCard } from "../../src/lib/types";
import type { ReviewListPage, ReviewMetadata } from "../../src/lib/review-contract";

export function pureReviewCases() {
  const now = "2024-02-29T16:00:00.000Z"; // March 1 in Beijing.
  const bounds = (value: string, end?: string) => reviewTimeBounds({ field: "updatedAt", op: "preset", value, end }, now);
  assert.deepEqual(bounds("today"), { since: now, until: "2024-03-01T16:00:00.000Z" });
  assert.deepEqual(bounds("yesterday"), { since: "2024-02-28T16:00:00.000Z", until: now });
  assert.deepEqual(bounds("lastMonth"), { since: "2024-01-31T16:00:00.000Z", until: now });
  assert.equal(bounds("7d").since, "2024-02-23T16:00:00.000Z");
  assert.deepEqual(bounds("lastDays", "7"), bounds("7d"));
  assert.equal(bounds("thisWeek").since, "2024-02-25T16:00:00.000Z");
  assert.equal(bounds("lastWeek").until, "2024-02-25T16:00:00.000Z");
  assert.equal(reviewTimeBounds({ field: "createdAt", op: "preset", value: "thisWeek" }, "2023-12-31T16:00:00Z").since, "2023-12-31T16:00:00.000Z");
  assert.equal(reviewTimeBounds({ field: "createdAt", op: "between", value: "2024-02-28", end: "2024-02-29" }, now).until, now);
  assert.equal(reviewTimeBounds({ field: "createdAt", op: "before", value: "2024-02-29" }, now).until, "2024-02-28T16:00:00.000Z");
  assert.equal(reviewTimeBounds({ field: "createdAt", op: "after", value: "2024-02-29" }, now).since, now);
  assert.throws(() => calendarDay("2023-02-29"));
  assert.throws(() => bounds("lastDays", "0"));
  assert.throws(() => reviewTimeBounds({ field: "updatedAt", op: "between", value: "2024-03-01", end: "2024-02-29" }, now));
  const base = emptyReviewFilters();
  const roundtrip = (value: unknown) => parseReviewFilters(JSON.stringify(value));
  const leaf = { field: "body", op: "notContains", value: "test-drive" };
  assert.equal(roundtrip({ ...base, groups: [{ match: "all", children: Array(50).fill(leaf) }] }).groups[0].children.length, 50);
  for (const value of [{ ...base, version: 2 }, { ...base, groups: [{ match: "all", children: Array(51).fill(leaf) }] }, { ...base, groups: [{ match: "all", children: [] }] }, { ...base, groups: [{ match: "all", children: [{ ...leaf, field: "body); DROP TABLE x" }] }] }, { ...base, groups: [{ match: "all", children: [{ ...leaf, op: "sql" }] }] }, { ...base, groups: [{ match: "all", children: [{ match: "any", children: [{ match: "all", children: [leaf] }] }] }] }]) assert.throws(() => roundtrip(value));
  assert.deepEqual(reviewFiltersFromUrl(new URLSearchParams({ filters: JSON.stringify(base), status: "draft" })), base);
  assert.equal(reviewFiltersFromUrl(new URLSearchParams()).groups.length, 1);
  assert.throws(() => parseReviewFilters("")); assert.throws(() => parseReviewFilters("{"));
  assert.deepEqual(insertAt([0, 1, 2, 3], 0, 3), [1, 2, 3, 0]);
  assert.deepEqual(insertAt([0, 1, 2, 3], 3, 0), [3, 0, 1, 2]);
  const post = fixturePosts()[0];
  post.imageUrls = ["same", "same", "third"]; post.imagePrompts = ["first", "second", "third"];
  const moved = reorderReviewImages(post, 0, 2);
  assert.deepEqual(moved.imageUrls, ["same", "third", "same"]);
  assert.deepEqual(moved.imagePrompts, ["second", "third", "first"]);
  assert.deepEqual(post.imagePrompts, ["first", "second", "third"]);
  assert.deepEqual(ordinaryImagePrompts({ ...post, imagePrompts: undefined, imagePrompt: "a\n\nb\n\nc" }), ["a", "b", "c"]);
  const cards = ["cover", "missing", "ending"].map((id, index) => ({ id, index, role: index === 0 ? "cover" : "content", prompt: id, imageUrl: index === 1 ? undefined : id, candidateUrls: [id], qa: { status: "passed", attempts: 1, issues: [] } }) as XhsCard);
  const series = { ...post, xhsSeries: { cards } as GeneratedPost["xhsSeries"] };
  const seriesMoved = reorderReviewImages(series, 1, 0);
  assert.deepEqual(seriesMoved.xhsSeries!.cards.map((card) => card.id), ["missing", "cover", "ending"]);
  assert.deepEqual(seriesMoved.imageUrls, ["cover", "ending"]);
  const coverLast = reorderReviewImages(seriesMoved, 1, 2);
  assert.equal(coverLast.xhsSeries!.cards[2].role, "cover");
  assert.deepEqual(coverLast.xhsSeries!.cards.map((card) => card.index), [0, 1, 2]);
}

export function fixturePosts(): GeneratedPost[] {
  return Array.from({ length: 7 }, (_, index) => ({ id: `filter-${index}`, ownerUserId: index === 5 ? "other" : "filter-owner", ownerDisplayName: "Filter Author", sourceItemId: "fixture", sourceBatchId: index === 6 ? "other-batch" : "filter-batch", platform: "xiaohongshu", title: `Title ${index}`, body: index === 2 ? "G7 body mention" : index === 3 ? "test-drive" : "", taskKeyword: index === 4 ? "\tG9\u3000" : "fallback", feishuVehicle: ["\tG7\u3000", "G7i", "G6", "G9", " \t ", "G7", "G7"][index], imagePrompt: "prompt", imageUrls: [], materialPaths: [], aiNotes: [], status: index === 4 ? "published" : "draft", createdAt: "2024-02-28T16:00:00.000Z", updatedAt: "2024-03-01T16:00:00.000Z" }));
}

export async function queryReviewCases(service: {
  list: (params: URLSearchParams) => Promise<ReviewListPage>;
  metadata: (params: URLSearchParams) => Promise<ReviewMetadata>;
}) {
  const base = { ...emptyReviewFilters(), asOf: "2024-03-02T02:00:00.000Z" };
  const run = async (conditions: ReviewCondition[], extra: Partial<ReviewFilters> = {}) => service.list(new URLSearchParams({ sourceBatchId: "filter-batch", status: "published", filters: JSON.stringify({ ...base, groups: conditions.length ? [{ match: "all", children: conditions }] : [], ...extra }) }));
  assert.equal((await run([])).posts.length, 5, "new empty filters must override legacy status");
  assert.deepEqual((await run([], { search: { field: "vehicle", value: "G7" } })).posts.map((p) => p.id), ["filter-0"]);
  assert.equal((await run([{ field: "vehicle", op: "in", value: ["G7", "G9"] }, { field: "status", op: "in", value: ["draft", "editing"] }, { field: "body", op: "notContains", value: "test-drive" }])).posts.length, 1);
  assert.equal((await run([{ field: "body", op: "empty" }])).posts.length, 3);
  assert.equal((await run([{ field: "body", op: "notEmpty" }])).posts.length, 2);
  assert.equal((await run([{ field: "vehicle", op: "notIn", value: ["G7"] }])).posts.length, 4);
  assert.equal((await run([{ field: "body", op: "contains", value: "%" }])).posts.length, 0);
  assert.equal((await run([{ field: "createdAt", op: "on", value: "2024-02-29" }])).posts.length, 5);
  assert.equal((await run([{ field: "updatedAt", op: "on", value: "2024-02-29" }])).posts.length, 0);
  assert.equal((await run([{ field: "updatedAt", op: "between", value: "2024-03-01", end: "2024-03-02" }])).posts.length, 5);
  const or: ReviewFilters["groups"] = [{ match: "any", children: [{ field: "vehicle", op: "in", value: ["G7"] }, { match: "all", children: [{ field: "title", op: "contains", value: "Title" }] }] }];
  assert.equal((await run([], { match: "any", groups: or })).posts.length, 5, "OR must stay within account and batch scope");
  const metadata = await service.metadata(new URLSearchParams({ sourceBatchId: "filter-batch" }));
  assert.deepEqual([...metadata.vehicles].sort(), ["G6", "G7", "G7i", "G9"]);
  assert.equal(metadata.summary.total, 5);
  await assert.rejects(service.list(new URLSearchParams({ filters: "{}" })));
}
