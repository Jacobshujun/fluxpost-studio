import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const source = readFileSync(path.join(root, "src/lib/content-pool-tags.ts"), "utf8");
const contentPoolSource = readFileSync(path.join(root, "src/lib/content-pool.ts"), "utf8");
const routeSource = readFileSync(path.join(root, "src/app/api/content-pool/tags/route.ts"), "utf8");
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-content-pool-tags-"));

try {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "content-pool-tags.ts",
  }).outputText;
  const modulePath = path.join(temp, "content-pool-tags.js");
  writeFileSync(modulePath, output, "utf8");
  const tags = createRequire(import.meta.url)(modulePath);

  assert.deepEqual(tags.normalizeContentPoolCustomTags(undefined), []);
  assert.deepEqual(tags.normalizeContentPoolCustomTags(["  小鹏   MONA ", "小鹏 mona", "重点参考"]), ["小鹏 MONA", "重点参考"]);
  assert.deepEqual(tags.applyContentPoolCustomTagChanges(["保留", "删除"], { remove: [" 删除 "], add: ["新增"] }), ["保留", "新增"]);
  assert.equal(tags.matchesAllContentPoolCustomTags(["A", "B"], ["a", "b"]), true);
  assert.equal(tags.matchesAllContentPoolCustomTags(["A"], ["a", "b"]), false);
  assert.throws(() => tags.normalizeContentPoolCustomTags(["x".repeat(41)]), /40 characters/);
  assert.throws(() => tags.normalizeContentPoolCustomTags(Array.from({ length: 21 }, (_, index) => `tag-${index}`)), /at most 20/);

  assert.match(contentPoolSource, /listContentPoolTagSuggestions[\s\S]*filterWorkspaceOwnedRecords/);
  assert.match(contentPoolSource, /batchUpdateSourceItemCustomTags[\s\S]*canMutateWorkspaceContent/);
  assert.match(
    contentPoolSource,
    /if \(!canMutateWorkspaceContent\(account, item\)\) return item;\s*handledIds\.add\(item\.id\);/,
    "an unauthorized duplicate id must not hide a later owner-editable item",
  );
  assert.match(contentPoolSource, /if \(result\.items\.length\) await writePool\(pool\)/, "batch tags should write the pool once after partial processing");
  assert.match(contentPoolSource, /customTags:\s*normalizeContentPoolCustomTags\(previous\.customTags\)/, "recrawl must preserve manual custom tags");
  assert.match(routeSource, /requireWorkspaceAccount\(request\)/);
  assert.match(routeSource, /ContentPoolTagValidationError \? 400 : 500/, "tag API should distinguish invalid input from server failures");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Content-pool custom tag contracts passed.");
