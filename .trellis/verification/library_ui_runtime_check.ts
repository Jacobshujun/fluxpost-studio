import assert from "node:assert/strict";
import { dateBoundary, filtersToQuery, libraryCollectionRows, readLibraryFilters, recentDateRange, validateFilterRanges, smartOperators } from "../../src/app/library/library-ui";
import type { LibraryCollection } from "../../src/lib/types";

const collectionFixture = (id: string, parentId?: string): LibraryCollection => ({
  id, name: id, parentId, relativePath: parentId ? `${parentId}/${id}` : id,
  ownerUserId: "owner", ownerDisplayName: "Owner", visibility: "private", kind: "folder",
  createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z",
});
// Navigation is chronological: unrelated roots precede children created later.
const chronological = [collectionFixture("first"), collectionFixture("last"), collectionFixture("child", "first"), collectionFixture("grandchild", "child"), collectionFixture("sibling", "first")];
const rowIds = (collapsed = new Set<string>(), search = "") => libraryCollectionRows(chronological, collapsed, search).map(({ collection, depth }) => [collection.id, depth]);
assert.deepEqual(rowIds(), [["first", 0], ["child", 1], ["grandchild", 2], ["sibling", 1], ["last", 0]]);
assert.deepEqual(rowIds(new Set(["first"])), [["first", 0], ["last", 0]]);
assert.deepEqual(rowIds(new Set(["child"])), [["first", 0], ["child", 1], ["sibling", 1], ["last", 0]]);
assert.deepEqual(rowIds(new Set(["first", "child"]), "grandchild"), [["first", 0], ["child", 1], ["grandchild", 2]]);
assert.deepEqual(libraryCollectionRows([collectionFixture("orphan", "private-parent"), collectionFixture("nested", "orphan")], new Set(), "").map(({ collection, depth }) => [collection.id, depth]), [["orphan", 0], ["nested", 1]]);
assert.deepEqual(libraryCollectionRows([chronological[3], chronological[2], chronological[0], chronological[1]], new Set(), "").map(({ collection }) => collection.id), ["first", "child", "grandchild", "last"]);

const params = new URLSearchParams("view=collection:parent&descendants=0&tag=red&tag=night&vehicleModel=G6&vehicleColor=白色&scene=城市&angle=front&people=no&imageType=exterior&taggingStatus=completed&minWidth=1200&maxByteSize=1048576&sort=oldest");
const filters = readLibraryFilters(params);
assert.equal(filters.limit, 60);
assert.equal(filters.includeDescendants, false);
assert.equal(filters.taggingStatus, "completed");
assert.deepEqual(filters.tags, ["red", "night"]);
const wire = new URLSearchParams(filtersToQuery(filters));
for (const key of ["vehicleModel", "vehicleColor", "scene", "angle", "people", "imageType", "taggingStatus", "minWidth", "maxByteSize", "sort"]) assert.deepEqual(wire.getAll(key), params.getAll(key));
assert.equal(wire.get("includeDescendants"), "false");
assert.equal(wire.has("vehicleModels"), false);
assert.equal(readLibraryFilters(new URLSearchParams("taggingStatus=running")).taggingStatus, "running");
assert.equal(readLibraryFilters(new URLSearchParams("taggingStatus=success")).taggingStatus, undefined);
assert.equal(dateBoundary("2026-10-14"), "2026-10-13T16:00:00.000Z");
assert.equal(dateBoundary("2026-10-14", true), "2026-10-14T16:00:00.000Z");
assert.deepEqual(recentDateRange(7, new Date("2026-10-14T15:00:00Z")), { addedFrom: "2026-10-07T16:00:00.000Z", addedBefore: "2026-10-14T16:00:00.000Z" });
assert.throws(() => dateBoundary("2026-02-30"));
assert.throws(() => validateFilterRanges(new URLSearchParams("minWidth=1000&maxWidth=400")));
assert.throws(() => validateFilterRanges(new URLSearchParams("minByteSize=-1")));
assert.throws(() => validateFilterRanges(new URLSearchParams("addedFrom=2026-10-15T00:00:00Z&addedBefore=2026-10-14T00:00:00Z")));
assert.deepEqual(smartOperators.favorite, ["is"]);
assert.deepEqual(smartOperators.createdAt, ["before", "after"]);
for (const field of ["generated", "generationEntry", "filename", "generatedAt", "unlabelledVehicle", "vehicleModel"]) {
  assert.equal(Object.hasOwn(smartOperators, field), false, `${field} must not remain a smart-folder field`);
}
const retired = readLibraryFilters(new URLSearchParams("generated=true&generationEntry=canvas&filename=old.png&unlabelledVehicle=true"));
for (const field of ["generated", "generationEntry", "filename", "generatedFrom", "generatedBefore", "unlabelledVehicle"]) {
  assert.equal(Object.hasOwn(retired, field), false, `${field} must not be parsed into library filters`);
}
assert.deepEqual(retired.tags, []);
assert.equal(retired.search, undefined);
console.log("Gallery filter wire names, descendant scope, statuses, Beijing dates and validation passed.");
