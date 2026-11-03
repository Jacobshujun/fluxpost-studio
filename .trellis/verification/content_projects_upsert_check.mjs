import { readFileSync } from "node:fs";
import path from "node:path";

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

const database = read("src/lib/database.ts");
const contentPool = read("src/lib/content-pool.ts");

assertContains(
  database,
  /export async function writeContentProjectsToDb\(projects: ContentProject\[\]\)[\s\S]*INSERT INTO content_projects[\s\S]*ON CONFLICT\(id\) DO UPDATE/,
  "writeContentProjectsToDb should use row-level upsert for content_projects.",
);

assertContains(
  database,
  /export async function writeContentProjectsToDb\(projects: ContentProject\[\]\)[\s\S]*created_at = content_projects\.created_at/,
  "content_projects upsert should preserve the original created_at value.",
);

assertNotContains(
  database,
  /export async function writeContentProjectsToDb\(projects: ContentProject\[\]\)\s*\{\s*await replaceJsonRows\("content_projects"/,
  "writeContentProjectsToDb should not call full-table replacement for content_projects.",
);

assertContains(
  database,
  /export async function applyContentPoolCollectionMembershipChangesFromDb[\s\S]*INSERT INTO content_pool_collection_items[\s\S]*ON CONFLICT DO NOTHING/,
  "content-pool membership writes should be row-level idempotent inserts, not whole-project rewrites.",
);

assertContains(
  database,
  /export async function mutateAllSourceProjectsInDb[\s\S]*SELECT data_json FROM content_projects ORDER BY id FOR UPDATE[\s\S]*UPDATE content_projects SET updated_at=\$1, data_json=\$2::jsonb WHERE id=\$3/,
  "tag rename/delete should update only changed content_projects rows inside one transaction.",
);

assertContains(
  database,
  /export async function mutateContentProjectByNormalizedQueryInDb\([\s\S]*SELECT id, data_json FROM content_projects WHERE normalized_query = \$1 FOR UPDATE/,
  "ingest/create should lock and update only the project selected by normalized_query.",
);

assertContains(
  database,
  /export async function mutateContentProjectsForItemIdsInDb\([\s\S]*SELECT id, data_json FROM content_projects[\s\S]*FOR UPDATE/,
  "batch item writes should lock only projects that contain the selected item ids.",
);

assertContains(
  database,
  /export async function readContentProjectsForItemIdsFromDb\([\s\S]*findContentProjectIdsForItemIdsFromDb\(ids\)[\s\S]*readContentProjectsByIdsFromDb\(projectIds\)/,
  "item-id reads should resolve projects by indexed item lookup before loading rows.",
);

const ingest = contentPool.slice(
  contentPool.indexOf("export async function ingestCrawlItems"),
  contentPool.indexOf("export async function createSourceItem"),
);
assertContains(ingest, /mutateContentProjectByNormalizedQueryInDb\(/, "Crawl ingestion should upsert only the target project.");
assertNotContains(ingest, /writePool\(|writeContentProjectsToDb|readContentProjectsFromDb/, "Crawl ingestion should not read or write the whole content pool.");

const updateItem = contentPool.slice(
  contentPool.indexOf("export async function updateSourceItem"),
  contentPool.indexOf("export async function deleteSourceItem"),
);
assertContains(updateItem, /mutateContentProjectsForItemIdsInDb\(/, "Single-item edits should mutate only containing projects.");
assertNotContains(updateItem, /writePool\(|writeContentProjectsToDb|readContentProjectsFromDb/, "Single-item edits should not read or write the whole content pool.");

const deleteItem = contentPool.slice(
  contentPool.indexOf("export async function deleteSourceItem"),
  contentPool.indexOf("export async function batchUpdateSourceItemStatus"),
);
assertContains(deleteItem, /mutateContentProjectsForItemIdsInDb\([\s\S]*deleteContentPoolCollectionItemsForItemsFromDb\(deletedItems\)/, "Deleting a content item should clean its library memberships after the row-level project write.");
assertNotContains(deleteItem, /writePool\(|writeContentProjectsToDb|readContentProjectsFromDb/, "Single-item deletion should not read or write the whole content pool.");

const mediaBackfill = read("src/lib/media-backfill.ts");
assertContains(mediaBackfill, /readContentProjectsForItemIdsFromDb\(ids\)/, "Media backfill should load only projects containing selected items.");
assertContains(mediaBackfill, /mutateContentProjectsForItemIdsInDb\(ids, scope,/, "Media backfill should write only projects containing selected items.");
assertNotContains(mediaBackfill, /writeContentProjectsToDb|readContentProjectsFromDb/, "Media backfill should not read or write the whole content pool.");

console.log("Content projects row-level mutation check passed.");
