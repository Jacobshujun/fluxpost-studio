import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, modules) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  Function("require", "module", "exports", output)((name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name === "next/server") return require(name);
    throw new Error(`Unexpected runtime dependency: ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const account = { id: "owner-a", role: "operator", displayName: "Owner A" };
const reads = [], ingests = [], tags = [], safetyCalls = [], targets = [];
let unauthenticated = false, denied = false, providerFailure = false;
const activity = { compactError: (error) => error.message, recordExecutionLog: async () => undefined };
const pool = {
  ingestCrawlItems: async (query, items, actor, options) => {
    ingests.push({ query, items, actor, options });
    return { id: "project", query, items, totalItems: items.length };
  },
  stripContentPoolItemsRaw: (items) => items.map((item) => { const copy = { ...item }; delete copy.raw; return copy; }),
  contentPoolProjectSummary: (project) => { const copy = { ...project }; delete copy.items; return copy; },
};
const service = load("src/lib/feishu-content-pool-import.ts", {
  "./activity-log": activity,
  "./content-safety-policy": { getContentSafetyPolicy: async () => ({ revision: 7 }), normalizeContentSafetyPolicySnapshot: (policy) => policy },
  "./content-pool": pool,
  "./feishu-content-import": { importFeishuContentByTaskNumbers: async (numbers, options) => {
    reads.push({ numbers, options });
    if (providerFailure) throw new Error("upstream failure");
    const items = numbers.filter((number) => number !== "MISSING").map((number) => ({ id: number, title: number, platform: "feishu", images: [], downloadedImages: [`/media/${number}.jpg`], raw: { private: "must not escape" } }));
    return { items, results: numbers.map((number) => ({ taskNumber: number, status: number === "MISSING" ? "not_found" : "imported", itemId: number === "MISSING" ? undefined : number, error: number === "MISSING" ? "number not found" : undefined })) };
  } },
  "./source-safety": { filterUnsafeSourceItems: async (items, context, policy) => {
    safetyCalls.push({ items, context, policy });
    return { items: items.filter((item) => item.id !== "FILTERED") };
  } },
  "./source-tagging": {
    markItemsAsSkippedTagging: (items) => items.map((item) => ({ ...item, contentTagging: { status: "skipped" } })),
    tagSourceItems: async (items) => { tags.push(items); return items.map((item) => ({ ...item, contentTagging: { status: "success" } })); },
  },
});
const route = load("src/app/api/crawl/feishu/route.ts", {
  "@/lib/activity-log": activity, "@/lib/content-pool": pool,
  "@/lib/feishu-content-pool-import": service,
  "@/lib/content-pool-collections": { requireContentPoolCollectionWriteTarget: async (actor, id) => { targets.push({ actor, id }); if (denied) throw new Error("inaccessible collection"); } },
  "@/lib/workspace-accounts": {
    requireWorkspaceAccount: async () => { if (unauthenticated) throw new Error("sign-in required"); return account; },
    isWorkspaceSignInError: (error) => /sign-in/.test(error.message),
  },
});
const request = (body) => new Request("http://127.0.0.1/api/crawl/feishu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const base = { query: "  Feishu project  ", taskNumbers: ["GOOD", "MISSING", "FILTERED", "GOOD"], collectionId: "library-a", skipTagging: true, enableVideoTranscription: true, videoFrameOriginalReference: false };
unauthenticated = true;
assert.equal((await route.POST(request(base))).status, 401);
assert.equal(reads.length, 0);
unauthenticated = false;
for (const body of [null, {}, { ...base, query: " " }, { ...base, query: "x".repeat(81) }, { ...base, taskNumbers: [] }, { ...base, taskNumbers: "GOOD" }, { ...base, taskNumbers: [1] }, { ...base, taskNumbers: ["GOOD,MISSING"] }, { ...base, taskNumbers: Array(201).fill("GOOD") }, { ...base, skipTagging: "true" }, { ...base, collectionId: 42 }]) {
  assert.equal((await route.POST(request(body))).status, 400);
}
assert.equal(reads.length, 0, "invalid requests must fail before external reads");
denied = true;
assert.equal((await route.POST(request(base))).status, 400);
assert.equal(reads.length, 0, "target access must be checked before external reads");
denied = false;
const response = await route.POST(request(base));
assert.equal(response.status, 200);
const result = await response.json();
assert.deepEqual(reads.at(-1), { numbers: ["GOOD", "MISSING", "FILTERED"], options: { enableVideoTranscription: true } });
assert.equal(targets.at(-1).actor, account);
assert.equal(targets.at(-1).id, "library-a");
assert.equal(ingests.at(-1).actor, account);
assert.equal(ingests.at(-1).options.collectionId, "library-a");
assert.equal(ingests.at(-1).query, "Feishu project");
assert.equal(safetyCalls.at(-1).items[0].videoFrameOriginalReference, false);
assert.equal(safetyCalls.at(-1).policy.revision, 7);
assert.deepEqual(result.results.map((item) => item.status), ["imported", "failed", "filtered"]);
assert.equal(result.summary.imported, 1);
assert.equal(result.summary.failed, 1);
assert.equal(result.summary.filteredUnsafe, 1);
assert.equal(result.summary.duplicates, 1);
assert.equal(result.items[0].raw, undefined);
assert.equal(result.project.items, undefined);
assert.equal(tags.length, 0);
const ingestCount = ingests.length;
await route.POST(request({ ...base, taskNumbers: ["MISSING", "FILTERED"] }));
assert.equal(ingests.length, ingestCount, "empty/filtered results must not ingest");
await route.POST(request({ query: "Default", taskNumbers: ["GOOD"], skipTagging: false }));
assert.equal(tags.length, 1);
assert.equal(reads.at(-1).options.enableVideoTranscription, false);
assert.equal(ingests.at(-1).options.collectionId, undefined);
assert.equal(ingests.at(-1).items[0].videoFrameOriginalReference, true);
providerFailure = true;
assert.equal((await route.POST(request(base))).status, 400);
assert.equal(ingests.length, ingestCount + 1);
console.log("Content-pool Feishu: auth, validation, pre-read destination checks, partial/filter results, ownership, flags and safe responses passed.");
