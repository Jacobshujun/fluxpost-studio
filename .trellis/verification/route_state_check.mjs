import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

assert.match(read("src/app/review/page.tsx"), /useUrlQueryState\("postId"/);
assert.match(read("src/app/canvas/page.tsx"), /useUrlQueryState\("workflowId"/);
assert.match(read("src/app/library/page.tsx"), /useUrlQueryState<View>\("view"/);
console.log("Route state persistence contracts passed.");
