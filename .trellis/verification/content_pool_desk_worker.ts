import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ContentPoolDeskFilter } from "../../src/lib/types";

async function main() {
  const root = process.env.FLUXPOST_CONTENT_POOL_FIXTURE;
  if (!root) throw new Error("FLUXPOST_CONTENT_POOL_FIXTURE is required.");
  mkdirSync(path.join(root, "data"), { recursive: true });
  process.chdir(root);

  const database = await import("../../src/lib/database.ts");
  const collectionsDomain = await import("../../src/lib/content-pool-collections.ts");
  const contentPool = await import("../../src/lib/content-pool.ts");
  const { parseContentPoolDeskRequest } = await import("../../src/app/api/content-pool/desk/request.ts");

  const now = "2026-01-10T00:00:00.000Z";
  const admin = { id: "admin", displayName: "Admin", role: "admin" as const };
  const ownerA = { id: "owner-a", displayName: "Owner A", role: "operator" as const };
  const ownerB = { id: "owner-b", displayName: "Owner B", role: "operator" as const };

  type ItemSeed = {
    id: string;
    ownerUserId: string;
    title: string;
    platform: "xiaohongshu" | "douyin" | "weibo";
    mediaType: "image" | "video";
    status: "new" | "analyzed" | "rewritten" | "approved" | "published";
    hotScore: number;
    crawledAt: string;
    publishedAt?: string;
    customTags?: string[];
    contentTags?: string[];
    metrics?: { views?: number; likes?: number; comments?: number; collects?: number; shares?: number };
  };

  function sourceItem(seed: ItemSeed) {
    return {
      id: seed.id,
      ownerUserId: seed.ownerUserId,
      ownerDisplayName: seed.ownerUserId,
      platform: seed.platform,
      sourceId: seed.id,
      sourceUrl: `https://example.test/${seed.id}`,
      mediaType: seed.mediaType,
      title: seed.title,
      contentText: `${seed.title} 正文`,
      authorName: "作者",
      images: [],
      mediaUrls: [],
      customTags: seed.customTags || [],
      contentTagging: seed.contentTags ? { tags: seed.contentTags, updatedAt: now } : undefined,
      metrics: seed.metrics || {},
      raw: { payload: seed.id.repeat(64) },
      poolStatus: seed.status,
      hotScore: seed.hotScore,
      crawledAt: seed.crawledAt,
      firstSeenAt: seed.crawledAt,
      lastSeenAt: seed.crawledAt,
      publishedAt: seed.publishedAt,
      usedCount: 0,
    };
  }

  function project(id: string, ownerUserId: string, items: ReturnType<typeof sourceItem>[]) {
    return {
      id,
      ownerUserId,
      ownerDisplayName: ownerUserId,
      query: id,
      normalizedQuery: `${id}--owner-${ownerUserId}`,
      createdAt: now,
      updatedAt: now,
      lastCrawledAt: now,
      totalItems: items.length,
      newItems: items.filter((item) => item.poolStatus === "new").length,
      analyzedItems: 0,
      rewrittenItems: items.filter((item) => item.poolStatus === "rewritten").length,
      approvedItems: items.filter((item) => item.poolStatus === "approved").length,
      publishedItems: items.filter((item) => item.poolStatus === "published").length,
      platforms: {},
      items,
    };
  }

  const projectA = project("project-a", ownerA.id, [
    sourceItem({ id: "a1", ownerUserId: ownerA.id, title: "小鹏 G9 参考", platform: "xiaohongshu", mediaType: "image", status: "new", hotScore: 10, crawledAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-01-05T00:00:00.000Z", customTags: ["参考"], contentTags: ["车型"] }),
    sourceItem({ id: "a2", ownerUserId: ownerA.id, title: "小鹏 G6 夜景", platform: "douyin", mediaType: "video", status: "analyzed", hotScore: 50, crawledAt: "2026-01-02T00:00:00.000Z", publishedAt: "2026-01-03T00:00:00.000Z", customTags: ["夜景"], contentTags: ["夜景"] }),
    sourceItem({ id: "a3", ownerUserId: ownerA.id, title: "竞品对比", platform: "weibo", mediaType: "image", status: "rewritten", hotScore: 30, crawledAt: "2026-01-03T00:00:00.000Z", contentTags: ["车型", "夜景"] }),
    sourceItem({ id: "a4", ownerUserId: ownerA.id, title: "内饰细节", platform: "xiaohongshu", mediaType: "image", status: "approved", hotScore: 20, crawledAt: "2026-01-04T00:00:00.000Z", publishedAt: "2026-01-04T00:00:00.000Z", customTags: ["参考", "夜景"] }),
    sourceItem({ id: "a5", ownerUserId: ownerA.id, title: "动态试驾", platform: "xiaohongshu", mediaType: "video", status: "published", hotScore: 40, crawledAt: "2026-01-05T00:00:00.000Z" }),
  ]);
  const projectB = project("project-b", ownerB.id, [
    sourceItem({ id: "b1", ownerUserId: ownerB.id, title: "Owner B hot", platform: "xiaohongshu", mediaType: "image", status: "new", hotScore: 60, crawledAt: "2026-01-06T00:00:00.000Z" }),
    sourceItem({ id: "b2", ownerUserId: ownerB.id, title: "Owner B cold", platform: "douyin", mediaType: "video", status: "analyzed", hotScore: 5, crawledAt: "2026-01-07T00:00:00.000Z" }),
  ]);
  await database.writeContentProjectsToDb([projectA, projectB]);

  const rootCollection = await collectionsDomain.createContentPoolCollection(ownerA, { name: "车型库" });
  const childCollection = await collectionsDomain.createContentPoolCollection(ownerA, { name: "SUV", parentId: rootCollection.id });
  const otherCollection = await collectionsDomain.createContentPoolCollection(ownerB, { name: "B 库" });
  await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
    action: "add_to_collections",
    itemIds: ["a1", "a4"],
    collectionIds: [rootCollection.id],
  });
  await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
    action: "add_to_collections",
    itemIds: ["a2"],
    collectionIds: [childCollection.id],
  });
  await collectionsDomain.updateContentPoolCollectionItems(ownerB, {
    action: "add_to_collections",
    itemIds: ["b1"],
    collectionIds: [otherCollection.id],
  });

  const base: Partial<ContentPoolDeskFilter> = {
    library: "all",
    includeDescendants: true,
    query: "",
    statuses: [],
    platforms: [],
    mediaTypes: [],
    contentTags: [],
    customTags: [],
    sort: "hot_desc",
  };

  const adminPage1 = await contentPool.getContentPoolDesk(admin, base, undefined, 2);
  assert.equal(adminPage1.total, 7, "Admin desk should count all deduplicated items.");
  assert.equal(adminPage1.items.length, 2, "Desk should honor the page limit.");
  assert.equal(adminPage1.items[0].id, "b1", "Hot sort should put the highest score first.");
  assert.equal(adminPage1.hasMore, true, "Desk should report more pages.");
  assert.ok(adminPage1.nextCursor, "Desk should return a keyset cursor.");
  assert.equal(adminPage1.items.some((item) => Object.prototype.hasOwnProperty.call(item, "raw")), false, "Desk items must not include raw payloads.");
  const pageIds = new Set(adminPage1.items.map((item) => item.id));
  assert.ok(adminPage1.memberships.every((membership) => pageIds.has(membership.itemId)), "Desk memberships must be limited to the current page.");
  assert.ok(adminPage1.memberships.some((membership) => membership.collectionId === otherCollection.id), "Admin should see other owners' visible memberships.");

  const adminPage2 = await contentPool.getContentPoolDesk(admin, base, adminPage1.nextCursor, 2);
  assert.equal(new Set([...adminPage1.items, ...adminPage2.items].map((item) => item.id)).size, 4, "Cursor pages must not overlap.");
  assert.equal(adminPage2.total, 7, "Cursor pages must keep the same total.");

  const allAdminIds = new Set<string>();
  let adminCursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = await contentPool.getContentPoolDesk(admin, base, adminCursor, 2);
    response.items.forEach((item) => allAdminIds.add(item.id));
    if (!response.hasMore) break;
    adminCursor = response.nextCursor;
    assert.ok(adminCursor, "Every non-final desk page should have a cursor.");
  }
  assert.equal(allAdminIds.size, 7, "Paging to the end must return every item once.");

  const parsedRequest = parseContentPoolDeskRequest(new URLSearchParams("descendants=0&limit=7&sort=published_desc&customTag=%E5%8F%82%E8%80%83"));
  assert.equal(parsedRequest.filter.includeDescendants, false, "Desk request parsing should honor descendants=0.");
  assert.equal(parsedRequest.limit, 7, "Desk request parsing should read the limit.");
  assert.equal(parsedRequest.filter.sort, "published_desc", "Desk request parsing should read the sort.");
  assert.deepEqual(parsedRequest.filter.customTags, ["参考"], "Desk request parsing should read repeated custom tags.");

  const ownerPage = await contentPool.getContentPoolDesk(ownerA, base, undefined, 10);
  assert.equal(ownerPage.total, 5, "Operators should only see their own projects.");
  assert.ok(ownerPage.items.every((item) => item.ownerUserId === ownerA.id), "Operator desk items must be owner-scoped.");
  assert.equal(ownerPage.items[0].id, "a2", "Owner desk should sort by hot score.");

  const published = await contentPool.getContentPoolDesk(ownerA, { ...base, statuses: ["published"] }, undefined, 10);
  assert.deepEqual(published.items.map((item) => item.id), ["a5"], "Status filter should be applied.");
  const douyin = await contentPool.getContentPoolDesk(ownerA, { ...base, platforms: ["douyin"] }, undefined, 10);
  assert.deepEqual(douyin.items.map((item) => item.id), ["a2"], "Platform filter should be applied.");
  const videos = await contentPool.getContentPoolDesk(ownerA, { ...base, mediaTypes: ["video"] }, undefined, 10);
  assert.deepEqual(new Set(videos.items.map((item) => item.id)), new Set(["a2", "a5"]), "Media-type filter should be applied.");
  const contentTagged = await contentPool.getContentPoolDesk(ownerA, { ...base, contentTags: ["夜景"] }, undefined, 10);
  assert.deepEqual(new Set(contentTagged.items.map((item) => item.id)), new Set(["a2", "a3"]), "Content-tag filter should be applied.");
  const customTagged = await contentPool.getContentPoolDesk(ownerA, { ...base, customTags: ["参考", "夜景"] }, undefined, 10);
  assert.deepEqual(customTagged.items.map((item) => item.id), ["a4"], "Custom-tag filters must use AND semantics.");
  const byProject = await contentPool.getContentPoolDesk(ownerA, { ...base, projectId: "project-a" }, undefined, 10);
  assert.equal(byProject.total, 5, "Project filter should be applied.");
  const searched = await contentPool.getContentPoolDesk(ownerA, { ...base, query: "小鹏" }, undefined, 10);
  assert.deepEqual(new Set(searched.items.map((item) => item.id)), new Set(["a1", "a2"]), "Desk search should match title and body.");

  const defaultLibrary = await contentPool.getContentPoolDesk(ownerA, { ...base, library: "default" }, undefined, 10);
  assert.deepEqual(new Set(defaultLibrary.items.map((item) => item.id)), new Set(["a3", "a5"]), "Default library should contain items without memberships.");
  const rootWithDescendants = await contentPool.getContentPoolDesk(ownerA, { ...base, library: rootCollection.id, includeDescendants: true }, undefined, 10);
  assert.deepEqual(new Set(rootWithDescendants.items.map((item) => item.id)), new Set(["a1", "a2", "a4"]), "Library filter should include descendants by default.");
  const rootOnly = await contentPool.getContentPoolDesk(ownerA, { ...base, library: rootCollection.id, includeDescendants: false }, undefined, 10);
  assert.deepEqual(new Set(rootOnly.items.map((item) => item.id)), new Set(["a1", "a4"]), "Library filter should exclude descendants when disabled.");

  const publishedSort = await contentPool.getContentPoolDesk(ownerA, { ...base, sort: "published_desc" }, undefined, 10);
  assert.deepEqual(publishedSort.items.slice(0, 3).map((item) => item.id), ["a1", "a4", "a2"], "Published sort should be descending with missing values last.");
  assert.equal(publishedSort.items.at(-1)?.publishedAt, undefined, "Missing published values should sort last.");
  const crawledSort = await contentPool.getContentPoolDesk(ownerA, { ...base, sort: "crawled_asc" }, undefined, 10);
  assert.deepEqual(crawledSort.items.map((item) => item.id), ["a1", "a2", "a3", "a4", "a5"], "Crawled sort should be ascending.");

  const ids = await contentPool.getContentPoolDeskIds(admin, base, 3);
  assert.equal(ids.length, 3, "Desk ids should honor the ids limit.");
  assert.ok(ids.every((item) => item.id && item.ownerUserId), "Desk ids should retain owner ids for selection merges.");
  const ownerIds = await contentPool.getContentPoolDeskIds(ownerA, base, 200);
  assert.equal(ownerIds.length, 5, "Owner ids should respect owner isolation.");
  const rootIds = await contentPool.getContentPoolDeskIds(ownerA, { ...base, library: rootCollection.id, includeDescendants: false }, 999);
  assert.deepEqual(new Set(rootIds.map((item) => item.id)), new Set(["a1", "a4"]), "Desk ids should honor library filters and clamp the limit.");

  const strippedSnapshot = contentPool.stripContentPoolSnapshotRaw(await contentPool.getContentPoolSnapshot(undefined, ownerA));
  assert.equal(
    strippedSnapshot.projects.flatMap((project) => project.items).some((item) => Object.prototype.hasOwnProperty.call(item, "raw")),
    false,
    "Snapshot responses must omit raw payloads.",
  );

  const ownerSummary = await contentPool.getContentPoolDeskSummary(ownerA, { library: "all", includeDescendants: true });
  assert.equal(ownerSummary.projects.length, 1, "Owner summary should only include its own project.");
  assert.equal(ownerSummary.activeProject?.id, "project-a", "Summary should expose the active project.");
  assert.equal(ownerSummary.libraryCounts.all, 5, "Summary all count should match the owner desk total.");
  assert.equal(ownerSummary.libraryCounts.default, 2, "Summary default count should exclude memberships.");
  assert.equal(ownerSummary.libraryCounts.byCollection[rootCollection.id], 2, "Summary should count direct root memberships.");
  assert.equal(ownerSummary.libraryCounts.byCollection[childCollection.id], 1, "Summary should count child memberships.");
  assert.equal(ownerSummary.collections.length, 2, "Owner summary should hide other owners' collections.");
  assert.equal(ownerSummary.libraryStats.total, 5, "Library stats should describe the scoped view.");
  assert.ok(ownerSummary.tags.some((tag) => tag.label === "夜景" && tag.count === 2), "Summary tags should count visible custom tags.");

  const scopedSummary = await contentPool.getContentPoolDeskSummary(ownerA, { library: rootCollection.id, includeDescendants: true });
  assert.equal(scopedSummary.libraryStats.total, 3, "Scoped summary stats should use the selected library.");

  const adminSummary = await contentPool.getContentPoolDeskSummary(admin, { library: "all", includeDescendants: true });
  assert.equal(adminSummary.projects.length, 2, "Admin summary should include all owners' projects.");
  assert.equal(adminSummary.libraryCounts.all, 7, "Admin summary should count all items.");
  assert.equal(adminSummary.collections.length, 3, "Admin summary should expose all collections.");

  const projectBSnapshot = JSON.stringify((await database.readContentProjectsFromDb()).find((project) => project.id === "project-b"));
  const ingested = await contentPool.ingestCrawlItems(
    "project-a",
    [sourceItem({ id: "a6", ownerUserId: ownerA.id, title: "新增采集", platform: "xiaohongshu", mediaType: "image", status: "new", hotScore: 70, crawledAt: "2026-01-08T00:00:00.000Z" })],
    ownerA,
  );
  assert.equal(ingested.items.some((item) => item.id === "a6"), true, "Ingest should merge new items into the existing project.");
  assert.equal(ingested.ownerUserId, ownerA.id, "Ingest must preserve the project owner.");

  const manualSeed = sourceItem({ id: "a7", ownerUserId: ownerA.id, title: "手工新增", platform: "xiaohongshu", mediaType: "image", status: "new", hotScore: 15, crawledAt: "2026-01-08T00:00:00.000Z" });
  const created = await contentPool.createSourceItem("project-a", manualSeed, ownerA);
  assert.equal(created.item.id, "a7", "Manual creation should return the created item.");
  assert.equal(created.project.ownerUserId, ownerA.id, "Manual creation must preserve the project owner.");

  const updated = await contentPool.updateSourceItem("a1", { title: "更新后的标题", customTags: ["新标签"] }, ownerA);
  assert.equal(updated.title, "更新后的标题", "Single-item edits should persist title changes.");
  assert.deepEqual(updated.customTags, ["新标签"], "Single-item edits should persist custom tags.");
  await assert.rejects(() => contentPool.updateSourceItem("a1", { title: "越权" }, ownerB), /not found/, "Cross-owner edits must fail.");

  const statusBatch = await contentPool.batchUpdateSourceItemStatus(["a2", "a3"], "approved", ownerA);
  assert.equal(statusBatch.updatedCount, 2, "Batch status updates should find both items.");
  assert.ok(statusBatch.items.every((item) => item.poolStatus === "approved"), "Batch status updates should apply the new status.");
  const tagBatch = await contentPool.batchUpdateSourceItemCustomTags(["a2"], { add: ["重点"], remove: [] }, ownerA);
  assert.equal(tagBatch.failures.length, 0, "Batch custom-tag updates should succeed for owned items.");
  assert.deepEqual(tagBatch.items[0]?.customTags, ["夜景", "重点"], "Batch custom tags should be appended without dropping existing tags.");

  const scopedItems = await contentPool.getSourceItemsByIds(["a1", "b1"], ownerA);
  assert.deepEqual(scopedItems.map((item) => item.id), ["a1"], "Item-id reads must be owner scoped.");
  const frozen = await contentPool.freezeContentPoolItemsByIds(["a1", "b1"], ownerA);
  assert.deepEqual(frozen.values.map((item) => item.id), ["a1"], "Canvas freezing must be owner scoped.");
  assert.deepEqual(frozen.missingIds, ["b1"], "Canvas freezing should report out-of-scope ids.");

  const deletedBatch = await contentPool.batchDeleteSourceItems(["a6"], ownerA);
  assert.equal(deletedBatch.deletedCount, 1, "Batch deletion should remove the target item.");
  assert.equal((await contentPool.getSourceItemsByIds(["a6"], ownerA)).length, 0, "Deleted items must not be readable.");

  const newProject = await contentPool.ingestCrawlItems(
    "brand-new",
    [sourceItem({ id: "b3", ownerUserId: ownerB.id, title: "新项目", platform: "douyin", mediaType: "video", status: "new", hotScore: 1, crawledAt: "2026-01-09T00:00:00.000Z" })],
    ownerB,
  );
  assert.equal(newProject.normalizedQuery, "brand-new--owner-owner-b", "Ingest should create a new owner-scoped project key.");
  const storedProjects = await database.readContentProjectsFromDb();
  assert.equal(storedProjects.some((project) => project.id === newProject.id && project.items.some((item) => item.id === "b3")), true, "New project ingest should persist.");
  assert.equal(JSON.stringify(storedProjects.find((project) => project.id === "project-b")), projectBSnapshot, "Row-level writes must not touch unrelated projects.");

  console.log("Content-pool desk runtime contracts passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
