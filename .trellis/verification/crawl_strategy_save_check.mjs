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

function extractFunction(source, name) {
  const signatureIndex = source.indexOf(`function ${name}`);
  if (signatureIndex === -1) throw new Error(`${name} is missing.`);
  const bodyStart = source.indexOf("{", signatureIndex);
  if (bodyStart === -1) throw new Error(`${name} body is missing.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  throw new Error(`${name} body is not closed.`);
}

const page = read("src/app/page.tsx");
const saveHandler = extractFunction(page, "saveCurrentPlatformCrawlSettings");
const currentSetting = extractFunction(page, "getCurrentPlatformCrawlSetting");

assertContains(
  saveHandler,
  /const\s+nextSettings\s*=\s*getWorkspaceSettingsWithCurrentPlatformCrawlSetting\(\)/,
  "Saving crawl strategy should snapshot the current advanced platform controls.",
);
assertContains(
  saveHandler,
  /await\s+persistWorkspaceSettings\(nextSettings\)/,
  "Saving crawl strategy should persist workspace settings through the shared settings API.",
);
assertContains(
  saveHandler,
  /setWorkspaceSettings\(savedSettings\)/,
  "Saving crawl strategy should update the local workspace settings from the saved response.",
);
assertContains(
  saveHandler,
  /setMessage\("[^"]*简单版[^"]*"\)/,
  "Saving crawl strategy should tell operators that simple mode will use the saved setting.",
);
assertNotContains(
  saveHandler,
  /\/api\/crawl\/jobs|startCrawl\(/,
  "Saving crawl strategy must not start a crawl job.",
);

assertContains(
  page,
  /onClick=\{saveCurrentPlatformCrawlSettings\}[\s\S]*保存采集策略/,
  "Advanced crawl panel should expose a 保存采集策略 button wired to the save handler.",
);

assertContains(
  currentSetting,
  /contentType:\s*targetPlatform\s*===\s*"douyin"\s*\?\s*contentType\s*:\s*undefined/,
  "Douyin shared crawl strategy should include the selected content type.",
);
assertNotContains(
  currentSetting,
  /\bcookie\b/,
  "Shared simple-mode crawl strategy must not persist Douyin cookies.",
);

console.log("Crawl strategy save check passed.");
