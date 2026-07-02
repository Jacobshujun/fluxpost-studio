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

console.log("Content projects row-level mutation check passed.");
