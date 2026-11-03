import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertContains = (source, pattern, message) => assert(pattern.test(source), message);
const assertNotContains = (source, pattern, message) => assert(!pattern.test(source), message);
const sliceFunction = (source, name, nextName) => {
  const start = source.indexOf(`export async function ${name}`);
  assert(start >= 0, `Missing function ${name}.`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start) : -1;
  return source.slice(start, end > start ? end : undefined);
};

for (const file of [
  "src/app/api/content-pool/desk/route.ts",
  "src/app/api/content-pool/desk/summary/route.ts",
  "src/app/api/content-pool/desk/ids/route.ts",
]) {
  assert(existsSync(path.join(root, file)), `Missing lightweight content-pool route ${file}.`);
}

const contentPool = read("src/lib/content-pool.ts");
const collections = read("src/lib/content-pool-collections.ts");
const mediaBackfill = read("src/lib/media-backfill.ts");
const contentPage = read("src/app/content/page.tsx");
const crawlJobsRoute = read("src/app/api/crawl/jobs/route.ts");
const crawlLinksRoute = read("src/app/api/crawl/links/route.ts");
const contentItemsRoute = read("src/app/api/content/items/route.ts");
const deskRoute = read("src/app/api/content-pool/desk/route.ts");
const summaryRoute = read("src/app/api/content-pool/desk/summary/route.ts");
const idsRoute = read("src/app/api/content-pool/desk/ids/route.ts");
const snapshotRoute = read("src/app/api/content-pool/route.ts");
const itemsRoute = read("src/app/api/content/items/route.ts");

assertContains(deskRoute, /getContentPoolDesk\(/, "Desk route must call the paginated desk domain.");
assertContains(summaryRoute, /getContentPoolDeskSummary\(/, "Desk summary route must call the summary domain.");
assertContains(idsRoute, /getContentPoolDeskIds\(/, "Desk ids route must call the id-selection domain.");
assertContains(contentPool, /nextCursor:\s*hasMore && last/, "Desk responses must provide a keyset nextCursor.");
assertContains(contentPool, /memberships:\s*membershipsForContentPoolDeskItems/, "Desk responses must scope memberships to the page.");
assertContains(contentPool, /total:\s*sorted\.length/, "Desk responses must expose the filtered total.");

assertContains(snapshotRoute, /stripContentPoolSnapshotRaw\(/, "Snapshot responses must strip raw payloads.");
assertContains(itemsRoute, /stripContentPoolSnapshotRaw\(/, "Content item GET responses must strip raw payloads.");
assertContains(contentItemsRoute, /contentPoolItemWithoutRaw\(/, "Content item POST/PATCH responses must strip raw payloads.");
assertContains(contentItemsRoute, /contentPoolProjectSummary\(/, "Content item POST responses must return a project summary without items.");
assertContains(crawlJobsRoute, /stripContentPoolItemsRaw\(/, "Crawl job responses must strip raw payloads.");
assertContains(crawlJobsRoute, /contentPoolProjectSummary\(/, "Crawl job responses must return a project summary without items.");
assertContains(crawlLinksRoute, /stripContentPoolItemsRaw\(/, "Link import responses must strip raw payloads.");
assertContains(crawlLinksRoute, /contentPoolProjectSummary\(/, "Link import responses must return a project summary without items.");

const ingest = sliceFunction(contentPool, "ingestCrawlItems", "createSourceItem");
const createItem = sliceFunction(contentPool, "createSourceItem", "updateSourceItem");
const updateItem = sliceFunction(contentPool, "updateSourceItem", "deleteSourceItem");
const deleteItem = sliceFunction(contentPool, "deleteSourceItem", "batchUpdateSourceItemStatus");
const batchStatus = sliceFunction(contentPool, "batchUpdateSourceItemStatus", "batchDeleteSourceItems");
const batchDelete = sliceFunction(contentPool, "batchDeleteSourceItems", "markSourceRewritten");
const batchTags = sliceFunction(contentPool, "batchUpdateSourceItemCustomTags", "listContentPoolSelection");
const getByIds = sliceFunction(contentPool, "getSourceItemsByIds", "listContentPoolTagSuggestions");
const freezeByIds = sliceFunction(contentPool, "freezeContentPoolItemsByIds", "ingestCrawlItems");

for (const [name, source] of [
  ["ingestCrawlItems", ingest],
  ["createSourceItem", createItem],
  ["updateSourceItem", updateItem],
  ["deleteSourceItem", deleteItem],
  ["batchUpdateSourceItemStatus", batchStatus],
  ["batchDeleteSourceItems", batchDelete],
  ["batchUpdateSourceItemCustomTags", batchTags],
  ["getSourceItemsByIds", getByIds],
  ["freezeContentPoolItemsByIds", freezeByIds],
]) {
  assertNotContains(source, /readContentProjectsFromDb|writeContentProjectsToDb|readPool\(|writePool\(/, `${name} must not use whole-pool reads or writes.`);
}
assertContains(ingest, /mutateContentProjectByNormalizedQueryInDb\(/, "Ingest must write only the target project.");
assertContains(createItem, /mutateContentProjectByNormalizedQueryInDb\(/, "Manual item creation must write only the target project.");
assertContains(updateItem, /mutateContentProjectsForItemIdsInDb\(/, "Single-item edits must write only containing projects.");
assertContains(deleteItem, /mutateContentProjectsForItemIdsInDb\(/, "Single-item deletion must write only containing projects.");
assertContains(batchStatus, /mutateContentProjectsForItemIdsInDb\(/, "Batch status updates must write only containing projects.");
assertContains(batchDelete, /mutateContentProjectsForItemIdsInDb\(/, "Batch deletion must write only containing projects.");
assertContains(batchTags, /mutateContentProjectsForItemIdsInDb\(/, "Batch tag updates must write only containing projects.");
assertContains(getByIds, /readContentProjectsForItemIdsFromDb\(/, "Pool source reads must use item-scoped project lookup.");
assertContains(freezeByIds, /readContentProjectsForItemIdsFromDb\(/, "Canvas freezing must use item-scoped project lookup.");

const membershipMutation = sliceFunction(collections, "updateContentPoolCollectionItems", "assertContentPoolCollectionTarget");
assertContains(membershipMutation, /getContentPoolItemOwnersByIdsFromDb\(/, "Membership writes must validate owners through item-scoped lookup.");
assertContains(membershipMutation, /listContentPoolCollectionItemsForItemIdsFromDb\(/, "Membership writes must read only affected memberships.");
assertNotContains(membershipMutation, /readContentProjectsFromDb|writeContentProjectsToDb|listContentPoolCollectionItemsFromDb\(/, "Membership writes must not read the whole content pool.");

assertContains(mediaBackfill, /readContentProjectsForItemIdsFromDb\(ids\)/, "Media backfill must read only containing projects.");
assertContains(mediaBackfill, /mutateContentProjectsForItemIdsInDb\(ids, scope,/, "Media backfill must write only containing projects.");
assertNotContains(mediaBackfill, /readContentProjectsFromDb|writeContentProjectsToDb/, "Media backfill must not use whole-pool reads or writes.");

assertContains(contentPage, /fetch\(`\/api\/content-pool\/desk\?/, "Content page must load the paginated desk API.");
assertContains(contentPage, /loadMoreContentDesk/, "Content page must expose load-more pagination.");
assertContains(contentPage, /deskNextCursor/, "Content page must track the desk cursor.");
assertNotContains(contentPage, /fetch\(["'`]\/api\/content-pool["'`]/, "Content page must not request the whole-pool snapshot.");
assertNotContains(contentPage, /mergeContentPoolSources|sortSources\(|libraryScopedSources/, "Content page must not rebuild or sort the whole pool client-side.");

console.log("Content-pool performance budgets passed.");
