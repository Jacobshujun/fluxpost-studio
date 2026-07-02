import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const page = read("src/app/page.tsx");
const route = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const types = read("src/lib/types.ts");

assertContains(
  page,
  /body:\s*JSON\.stringify\(\{[\s\S]*materialPaths:\s*productionMaterialPaths[\s\S]*settings:\s*settingsForRun/,
  "Simple-mode start request must include the current advanced production material paths.",
);

assertContains(
  page,
  /<ImageSizeInput[\s\S]*value=\{settings\.imageSize\}[\s\S]*onChange=\{\(value\) => onSettingsChange\(\{\s*imageSize:\s*value\s*\}\)\}[\s\S]*ariaLabel="[^"]+"[\s\S]*listId="compact-image-size-presets"/,
  "Simple and compact mode should expose a manual GPT image-size input and write into workspace settings.",
);

assertContains(
  route,
  /materialPaths\?:\s*string\[\]/,
  "Simple run API request body should accept materialPaths.",
);
assertContains(
  route,
  /materialPaths:\s*Array\.isArray\(body\.materialPaths\)\s*\?\s*body\.materialPaths\s*:\s*\[\]/,
  "Simple run API should pass materialPaths through to startSimpleRun.",
);

assertContains(
  types,
  /export type SimpleRunInput = \{[\s\S]*materialPaths:\s*string\[\]/,
  "SimpleRunInput should persist the material paths used by a simple run.",
);

assertContains(
  simpleRuns,
  /materialPaths:\s*normalizeMaterialPaths\(input\.materialPaths\)/,
  "Simple run input normalization should keep material paths.",
);
assertContains(
  simpleRuns,
  /materialPaths:\s*normalizedInput\.materialPaths/,
  "Simple-mode generatePost should receive normalized material paths.",
);
assertContains(
  simpleRuns,
  /materialCount:\s*normalizedInput\.materialPaths\.length/,
  "Simple run activity log should record material path count without exposing paths.",
);

console.log("Simple/advanced production config sync check passed.");
