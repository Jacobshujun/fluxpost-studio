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

const generatedPosts = read("src/lib/generated-posts.ts");
const database = read("src/lib/database.ts");

assertContains(
  generatedPosts,
  /import\s+\{[^}]*deleteGeneratedPostFromDb[^}]*deleteGeneratedPostsFromDb[^}]*saveGeneratedPostToDb/s,
  "Generated post store should import row-level save/delete helpers from database.ts.",
);
assertContains(
  generatedPosts,
  /export async function saveGeneratedPost[\s\S]*await saveGeneratedPostToDb\(nextPost\)/,
  "saveGeneratedPost should use single-row upsert.",
);
assertContains(
  generatedPosts,
  /export async function updateGeneratedPost[\s\S]*await saveGeneratedPost\(nextPost,\s*account\)/,
  "updateGeneratedPost should persist through single-row upsert, not full-table replacement.",
);
assertContains(
  generatedPosts,
  /export async function deleteGeneratedPost[\s\S]*await deleteGeneratedPostFromDb\(postId\)/,
  "deleteGeneratedPost should use row-level delete.",
);
assertContains(
  generatedPosts,
  /export async function batchUpdateGeneratedPostStatus[\s\S]*saveGeneratedPost\(/,
  "Batch generated-post status updates should use row-level upsert.",
);
assertContains(
  generatedPosts,
  /export async function batchDeleteGeneratedPosts[\s\S]*await deleteGeneratedPostsFromDb\(Array\.from\(foundIds\)\)/,
  "Batch generated-post deletes should use row-level delete.",
);
assertNotContains(
  generatedPosts,
  /writeGeneratedPosts\(/,
  "Runtime generated-post mutations should not call full-table replacement helpers.",
);

assertContains(
  database,
  /export async function deleteGeneratedPostFromDb\(postId: string\)[\s\S]*DELETE FROM generated_posts WHERE id = \$1/,
  "database.ts should expose PostgreSQL row-level generated-post delete.",
);
assertContains(
  database,
  /export async function deleteGeneratedPostsFromDb\(postIds: string\[\]\)[\s\S]*DELETE FROM generated_posts WHERE id = ANY\(\$1::text\[\]\)/,
  "database.ts should expose PostgreSQL batch row-level generated-post delete.",
);
assertContains(
  database,
  /DELETE FROM generated_posts WHERE id = \?/,
  "database.ts should expose SQLite row-level generated-post delete.",
);

console.log("Generated posts row-level mutation check passed.");
