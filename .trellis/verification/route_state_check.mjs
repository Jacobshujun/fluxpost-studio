import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const helperPath = "src/lib/use-url-query-state.ts";
assert.equal(existsSync(path.join(root, helperPath)), true, "URL query state helper must exist");
const helper = read(helperPath);
for (const snippet of ["useRouter", "usePathname", "URLSearchParams", "router.replace", "popstate", "listCodec", "enumCodec"]) {
  assert.ok(helper.includes(snippet), `URL query state helper is missing ${snippet}`);
}

for (const page of [
  "content", "library", "review", "canvas", "original", "copy-library", "distribution-check", "config",
]) {
  const source = read(`src/app/${page}/page.tsx`);
  assert.match(source, /use-url-query-state/, `${page} page must use the shared URL state helper`);
}

assert.match(read("src/app/review/page.tsx"), /useUrlQueryParams\(reviewFilterHistoryMetadata\)/);
assert.match(read("src/app/review/page.tsx"), /params\.set\("postId", id\)/);
assert.match(read("src/app/canvas/page.tsx"), /useUrlQueryState\("workflowId"/);
assert.match(read("src/app/library/page.tsx"), /useUrlQueryParams\(\)/);
assert.match(helper, /window\.history\.pushState/);
assert.match(helper, /window\.dispatchEvent\(new PopStateEvent\("popstate"\)\)/);
// Equivalent key values must not reorder URL parameters and trigger competing router replacements.
const ast = ts.createSourceFile(helperPath, helper, ts.ScriptTarget.Latest, true);
const writer = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "writeValue");
const js = ts.transpileModule(writer.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const windowFixture = { location: { search: "?workflowId=flow&panel=schedules&scheduleId=old" } };
const writeQueryValue = Function("window", `${js};return writeValue;`)(windowFixture);
const replacements = [];
const scalar = { serialize: (value) => value ? [value] : [] };
for (const [key, value] of [["workflowId", "flow"], ["scheduleId", "old"], ["panel", "schedules"]]) {
  writeQueryValue(key, value, scalar, "/canvas", (url) => replacements.push(url));
}
assert.deepEqual(replacements, [], "same decoded values must preserve query order");
writeQueryValue("scheduleId", "new", scalar, "/canvas", (url) => replacements.push(url));
assert.equal(new URL(replacements.at(-1), "http://fixture").searchParams.get("scheduleId"), "new");
writeQueryValue("panel", "", scalar, "/canvas", (url) => replacements.push(url));
assert.equal(new URL(replacements.at(-1), "http://fixture").searchParams.has("panel"), false);
windowFixture.location.search = "?tag=a&other=keep&tag=b";
writeQueryValue("tag", ["a", "b"], { serialize: (values) => values }, "/library", (url) => replacements.push(url));
assert.equal(replacements.length, 2, "unchanged repeated values do not rewrite unrelated keys");
writeQueryValue("tag", ["b", "a"], { serialize: (values) => values }, "/library", (url) => replacements.push(url));
assert.deepEqual(new URL(replacements.at(-1), "http://fixture").searchParams.getAll("tag"), ["b", "a"]);
console.log("Route state persistence contracts passed.");
