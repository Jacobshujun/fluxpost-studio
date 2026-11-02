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
  contentPool,
  /await writePool\(pool\);\s*if \(options\.collectionId\)[\s\S]*applyContentPoolCollectionMembershipChangesFromDb/,
  "crawl ingestion should keep project upserts separate from membership writes.",
);

assertContains(
  contentPool,
  /await writePool\(pool\);\s*await deleteContentPoolCollectionItemsForItemsFromDb\(deletedItems\)/,
  "deleting a content item should clean its library memberships after the project write.",
);

console.log("Content projects row-level mutation check passed.");
