import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";

async function main() {
const root = process.env.FLUXPOST_CONTENT_POOL_FIXTURE;
if (!root) throw new Error("FLUXPOST_CONTENT_POOL_FIXTURE is required.");
mkdirSync(path.join(root, "data"), { recursive: true });
process.chdir(root);

const database = await import("../../src/lib/database.ts");
const collectionsDomain = await import("../../src/lib/content-pool-collections.ts");
const contentPool = await import("../../src/lib/content-pool.ts");
const selection = await import("../../src/lib/content-pool-selection.ts");

const now = "2026-11-02T00:00:00.000Z";
const ownerA = { id: "owner-a", displayName: "Owner A", role: "operator" as const };
const ownerB = { id: "owner-b", displayName: "Owner B", role: "operator" as const };

function sourceItem(id: string, ownerUserId: string, customTags: string[]) {
  return {
    id,
    ownerUserId,
    ownerDisplayName: ownerUserId,
    platform: "xiaohongshu" as const,
    sourceId: id,
    title: id,
    contentText: `${id} body`,
    images: [],
    mediaUrls: [],
    customTags,
    metrics: {},
    raw: {},
    poolStatus: "new" as const,
    crawledAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
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
    newItems: items.length,
    analyzedItems: 0,
    rewrittenItems: 0,
    approvedItems: 0,
    publishedItems: 0,
    platforms: { xiaohongshu: items.length },
    items,
  };
}

await database.writeContentProjectsToDb([
  project("project-a", ownerA.id, [
    sourceItem("xhs-1", ownerA.id, ["参考"]),
    sourceItem("xhs-2", ownerA.id, ["夜景"]),
  ]),
  project("project-b", ownerB.id, [sourceItem("xhs-3", ownerB.id, ["参考"])]),
]);

const rootCollection = await collectionsDomain.createContentPoolCollection(ownerA, { name: "车型库" });
const childCollection = await collectionsDomain.createContentPoolCollection(ownerA, { name: "SUV", parentId: rootCollection.id });
assert.equal(childCollection.parentId, rootCollection.id, "Subset should point at its parent.");
assert.equal(childCollection.relativePath, "车型库/SUV", "Subset relative path should be cached.");

const added = await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
  action: "add_to_collections",
  itemIds: ["xhs-1"],
  collectionIds: [rootCollection.id, childCollection.id],
});
assert.equal(added.failures.length, 0, "Owner A should add its own item to both collections.");
assert.equal(added.memberships.length, 2, "The item should be in two collections.");

const childOnly = await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
  action: "add_to_collections",
  itemIds: ["xhs-2"],
  collectionIds: [childCollection.id],
});
assert.equal(childOnly.failures.length, 0, "Owner A should add a child-only item.");

const snapshot = await contentPool.getContentPoolSnapshot(undefined, ownerA);
assert.equal(snapshot.collections.length, 2, "Snapshot should expose owner A collections.");
assert.equal(snapshot.memberships.length, 3, "Snapshot should expose memberships.");
assert.ok(snapshot.tags.some((tag) => tag.label === "参考" && tag.key === "参考"), "Snapshot should expose tag suggestions.");

const withDescendants = await contentPool.listContentPoolSelection({ collectionId: rootCollection.id, includeDescendants: true }, ownerA);
assert.equal(withDescendants.total, 2, "Root collection should include child collection items.");
const withoutDescendants = await contentPool.listContentPoolSelection({ collectionId: rootCollection.id, includeDescendants: false }, ownerA);
assert.equal(withoutDescendants.total, 1, "Root collection without descendants should only include direct items.");
assert.equal(withDescendants.collections.length, 2, "Selection response should expose collections for Canvas.");

const reserved = await contentPool.resolveContentPoolSelection({ collectionId: childCollection.id, includeDescendants: false }, ownerA);
assert.equal(reserved.length, 2, "Resolve selection should honor the collection filter.");

const tagSuggestions = await contentPool.listContentPoolTagSuggestions(ownerA, { limit: 500 });
assert.ok(tagSuggestions.some((tag) => tag.label === "参考" && tag.color), "Tag suggestion should have a stable color.");

const renamed = await collectionsDomain.renameContentPoolTag(ownerA, { from: "参考", to: "重点参考" });
assert.ok(renamed.affectedItems >= 1, "Renaming a tag should update at least one item.");
const renamedSnapshot = await contentPool.getContentPoolSnapshot(undefined, ownerA);
const renamedItem = renamedSnapshot.projects.flatMap((item) => item.items).find((item) => item.id === "xhs-1");
assert.deepEqual(renamedItem?.customTags, ["重点参考"], "Tag rename should update item custom tags.");

const colored = await collectionsDomain.setContentPoolTagColor(ownerA, { label: "重点参考", color: "rose" });
assert.equal(colored.tag.color, "rose", "Tag color should be stored.");
const coloredTags = await contentPool.listContentPoolTagSuggestions(ownerA, { limit: 500 });
assert.equal(coloredTags.find((tag) => tag.label === "重点参考")?.color, "rose", "Tag suggestion should use the registry color.");

const deletedTag = await collectionsDomain.deleteContentPoolTag(ownerA, { label: "重点参考" });
assert.ok(deletedTag.affectedItems >= 1, "Deleting a tag should update items.");
const afterTagDelete = await contentPool.getContentPoolSnapshot(undefined, ownerA);
assert.equal(afterTagDelete.projects.flatMap((item) => item.items).find((item) => item.id === "xhs-1")?.customTags?.length, 0, "Deleted tag should be removed from items.");

const ownerMismatch = await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
  action: "add_to_collections",
  itemIds: ["xhs-3"],
  collectionIds: [rootCollection.id],
});
assert.equal(ownerMismatch.failures.length, 1, "Cross-owner membership must fail.");
const afterMismatch = await contentPool.getContentPoolSnapshot(undefined, ownerA);
assert.equal(afterMismatch.memberships.length, 3, "Cross-owner failure must not change memberships.");

await assert.rejects(
  () => collectionsDomain.updateContentPoolCollection(ownerA, rootCollection.id, { parentId: childCollection.id }),
  /子集/,
  "A collection cannot move under its own descendant.",
);
await assert.rejects(
  () => collectionsDomain.updateContentPoolCollection(ownerB, rootCollection.id, { name: "越权" }),
  /不存在或无权编辑/,
  "Another owner cannot edit the collection.",
);

const moved = await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
  action: "move_to_collection",
  itemIds: ["xhs-2"],
  sourceCollectionId: childCollection.id,
  targetCollectionId: rootCollection.id,
});
assert.equal(moved.failures.length, 0, "Owner A should move its item.");
const afterMoveSnapshot = await contentPool.getContentPoolSnapshot(undefined, ownerA);
const xhs2Memberships = afterMoveSnapshot.memberships.filter((membership) => membership.itemId === "xhs-2");
assert.deepEqual(xhs2Memberships.map((membership) => membership.collectionId), [rootCollection.id], "Move should remove the source and add the target only.");

await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
  action: "move_to_default",
  itemIds: ["xhs-2"],
});
const afterDefaultSnapshot = await contentPool.getContentPoolSnapshot(undefined, ownerA);
assert.equal(afterDefaultSnapshot.memberships.filter((membership) => membership.itemId === "xhs-2").length, 0, "Moving to default should clear all memberships.");

const createdAndAdded = await collectionsDomain.updateContentPoolCollectionItems(ownerA, {
  action: "create_collection_and_add",
  itemIds: ["xhs-2"],
  name: "临时库",
});
assert.ok(createdAndAdded.collection, "Create-and-add should return the new collection.");
assert.equal(createdAndAdded.memberships.some((membership) => membership.itemId === "xhs-2" && membership.collectionId === createdAndAdded.collection?.id), true, "Create-and-add should add the item.");

await collectionsDomain.deleteContentPoolCollection(ownerA, childCollection.id);
const afterCollectionDelete = await contentPool.getContentPoolSnapshot(undefined, ownerA);
assert.equal(afterCollectionDelete.collections.some((collection) => collection.id === childCollection.id), false, "Deleted collection should disappear.");
assert.equal(afterCollectionDelete.projects.flatMap((item) => item.items).some((item) => item.id === "xhs-1"), true, "Deleting a collection must not delete items.");

await contentPool.deleteSourceItem("xhs-1", ownerA);
const afterItemDelete = await contentPool.getContentPoolSnapshot(undefined, ownerA);
assert.equal(afterItemDelete.memberships.some((membership) => membership.itemId === "xhs-1"), false, "Deleting an item should clean memberships.");

const filtered = selection.filterProjectsByCollection(
  afterItemDelete.projects,
  afterItemDelete.memberships,
  new Set([rootCollection.id]),
);
assert.equal(filtered.some((project) => project.items.some((item) => item.id === "xhs-1")), false, "Filtered projects must not include deleted items.");

console.log("Content-pool collections runtime contracts passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
