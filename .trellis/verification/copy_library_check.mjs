import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-copy-library-"));

try {
  const types = read("src/lib/types.ts");
  const database = read("src/lib/database.ts");
  const postgresMigration = read("db/migrations/001_initial_postgres.sql");
  const copySource = read("src/lib/copy-library.ts");
  const sortSource = read("src/lib/library-sort.ts");
  const marqueeSource = read("src/lib/marquee-selection.ts");
  const listSelectionSource = read("src/lib/list-selection.ts");
  const collectionRoute = read("src/app/api/copy-library/route.ts");
  const detailRoute = read("src/app/api/copy-library/[id]/route.ts");
  const page = read("src/app/copy-library/page.tsx");
  const css = read("src/app/copy-library/copy-library.module.css");
  const home = read("src/app/page.tsx");

  assert.match(css, /\.filters select option[^}]*background:var\(--panel-solid\)[^}]*color:var\(--foreground\)/, "Copy-library native options must keep a solid, theme-aware background and readable text.");

  assert.match(types, /export type CopyLibraryEntry\b/);
  assert.match(types, /export type CopyLibraryEntryView\b/);
  assert.ok((database.match(/CREATE TABLE IF NOT EXISTS copy_library_entries/g) || []).length >= 2, "Both runtime database schemas must create copy_library_entries.");
  assert.match(postgresMigration, /CREATE TABLE IF NOT EXISTS copy_library_entries/);
  for (const helper of ["listCopyLibraryEntriesFromDb", "getCopyLibraryEntryFromDb", "saveCopyLibraryEntryToDb", "deleteCopyLibraryEntryFromDb"]) {
    assert.match(database, new RegExp(`export async function ${helper}\\b`), `Missing row-level database helper ${helper}.`);
  }
  assert.match(database, /SELECT data_json FROM copy_library_entries WHERE id = \$1/);
  assert.match(database, /ON CONFLICT\s*\(id\)\s+DO UPDATE/);
  assert.match(database, /DELETE FROM copy_library_entries WHERE id = \$1/);

  for (const route of [collectionRoute, detailRoute]) assert.match(route, /requireWorkspaceAccount\(request\)/, "Every copy-library route must require authentication.");
  assert.match(detailRoute, /read-only[\s\S]*return 403/);
  assert.match(detailRoute, /not found[\s\S]*return 404/);

  const records = new Map();
  const databaseStub = {
    deleteCopyLibraryEntryFromDb: async (id) => { records.delete(id); },
    getCopyLibraryEntryFromDb: async (id) => records.get(id),
    listCopyLibraryEntriesFromDb: async () => [...records.values()],
    saveCopyLibraryEntryToDb: async (entry) => { records.set(entry.id, structuredClone(entry)); return entry; },
  };
  const ownershipStub = {
    isWorkspaceAdmin: (account) => account.role === "admin",
    scopeWorkspaceOwner: (account) => ({ ownerUserId: account.id, ownerDisplayName: account.displayName }),
  };
  const librarySort = loadTypeScriptModule(sortSource, "library-sort.ts", {});
  const marquee = loadTypeScriptModule(marqueeSource, "marquee-selection.ts", {});
  const listSelection = loadTypeScriptModule(listSelectionSource, "list-selection.ts", {});
  const copyLibrary = loadTypeScriptModule(copySource, "copy-library.ts", {
    "./database": databaseStub,
    "./library-sort": librarySort,
    "./workspace-ownership": ownershipStub,
  });

  assert.deepEqual(copyLibrary.normalizeTags([" Launch ", "launch", "EV", "ev"]), ["Launch", "EV"]);
  assert.deepEqual(copyLibrary.normalizeTags(["小鹏X9 白色 后45度", "小鹏X9"]), ["小鹏X9 白色 后45度", "小鹏X9"]);
  assert.throws(() => copyLibrary.normalizeTags("launch"), /array/i);

  const owner = { id: "owner", displayName: "Owner", role: "operator" };
  const teammate = { id: "teammate", displayName: "Teammate", role: "operator" };
  const admin = { id: "admin", displayName: "Admin", role: "admin" };
  const defaultTeamEntry = await copyLibrary.createCopyLibraryEntry(owner, {
    title: "Default team launch",
    body: "Default shared body",
    tags: ["Default"],
  });
  const privateEntry = await copyLibrary.createCopyLibraryEntry(owner, {
    title: "Private launch",
    body: "Private body",
    tags: ["Launch", "EV"],
    visibility: "private",
  });
  const teamEntry = await copyLibrary.createCopyLibraryEntry(owner, {
    title: "Team launch",
    body: "Shared body",
    tags: ["Launch", "SUV"],
    visibility: "team",
  });
  assert.equal(defaultTeamEntry.visibility, "team");
  assert.equal(privateEntry.visibility, "private");
  assert.equal(privateEntry.canEdit, true);
  assert.deepEqual(new Set((await copyLibrary.listCopyLibraryEntries(teammate)).entries.map((entry) => entry.id)), new Set([defaultTeamEntry.id, teamEntry.id]));
  assert.equal((await copyLibrary.getCopyLibraryEntry(teammate, teamEntry.id)).canEdit, false);
  await assert.rejects(copyLibrary.getCopyLibraryEntry(teammate, privateEntry.id), /not found/i);
  await assert.rejects(copyLibrary.updateCopyLibraryEntry(teammate, teamEntry.id, { title: "Blocked" }), /read-only/i);
  assert.equal((await copyLibrary.updateCopyLibraryEntry(admin, teamEntry.id, { title: "Admin edit" })).title, "Admin edit");
  assert.deepEqual((await copyLibrary.listCopyLibraryEntries(owner, { tags: ["launch", "ev"] })).entries.map((entry) => entry.id), [privateEntry.id]);
  assert.deepEqual(copyLibrary.parseCopyLibraryFilters(new URL("http://local/api/copy-library?tag=Launch&tag=EV,SUV")).tags, ["Launch", "EV", "SUV"]);
  assert.equal(copyLibrary.parseCopyLibraryFilters(new URL("http://local/api/copy-library?sort=owner-desc")).sort, "owner-desc");
  assert.equal(copyLibrary.parseCopyLibraryFilters(new URL("http://local/api/copy-library?sort=invalid")).sort, "newest");

  const sortFixtures = [
    { actor: { id: "sort-alpha", displayName: "张三", role: "operator" }, title: "Alpha", updatedAt: "2026-01-02T00:00:00.000Z" },
    { actor: { id: "sort-beta", displayName: "李四", role: "operator" }, title: "Beta", updatedAt: "2026-01-01T00:00:00.000Z" },
    { actor: { id: "sort-gamma", displayName: "王五", role: "operator" }, title: "Gamma", updatedAt: "2026-01-03T00:00:00.000Z" },
  ];
  for (const fixture of sortFixtures) {
    const entry = await copyLibrary.createCopyLibraryEntry(fixture.actor, {
      title: fixture.title,
      body: `${fixture.title} body`,
      tags: ["SortFixture"],
    });
    records.set(entry.id, { ...records.get(entry.id), updatedAt: fixture.updatedAt });
  }
  const sortedTitles = async (sort) => (await copyLibrary.listCopyLibraryEntries(admin, { tags: ["SortFixture"], sort })).entries.map((entry) => entry.title);
  assert.deepEqual(await sortedTitles("newest"), ["Gamma", "Alpha", "Beta"]);
  assert.deepEqual(await sortedTitles("oldest"), ["Beta", "Alpha", "Gamma"]);
  assert.deepEqual(await sortedTitles("name-asc"), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(await sortedTitles("name-desc"), ["Gamma", "Beta", "Alpha"]);
  assert.deepEqual(await sortedTitles("owner-asc"), ["Beta", "Gamma", "Alpha"]);
  assert.deepEqual(await sortedTitles("owner-desc"), ["Alpha", "Gamma", "Beta"]);

  assert.deepEqual(marquee.makeScreenRect(40, 30, 10, 5), { left: 10, top: 5, right: 40, bottom: 30, width: 30, height: 25 });
  assert.equal(marquee.screenRectsIntersect(
    { left: 10, top: 10, right: 30, bottom: 30 },
    { left: 25, top: 25, right: 40, bottom: 40 },
  ), true);
  assert.equal(marquee.screenRectsIntersect(
    { left: 10, top: 10, right: 20, bottom: 20 },
    { left: 21, top: 21, right: 40, bottom: 40 },
  ), false);
  assert.deepEqual([...listSelection.selectIdRange(["a", "b", "c", "d"], new Set(["a"]), "b", "d", false)], ["b", "c", "d"]);
  assert.deepEqual([...listSelection.selectIdRange(["a", "b", "c", "d"], new Set(["a"]), "b", "d", true)], ["a", "b", "c", "d"]);
  assert.deepEqual([...listSelection.selectIdRange(["a", "b"], new Set(["a"]), undefined, "b", false)], ["b"]);
  assert.equal(listSelection.isEditableSelectionTarget({ closest: (selector) => selector.includes("textarea") ? {} : null }), true);
  assert.equal(listSelection.isEditableSelectionTarget({ closest: () => null }), false);
  assert.equal(listSelection.isEditableSelectionTarget(null), false);

  for (const snippet of ["搜索标题、正文或标签", "人工标签", "仅自己", "团队共享", "确认删除这篇文案"]) {
    assert.ok(page.includes(snippet), `Copy-library page is missing ${snippet}.`);
  }
  assert.match(page, /fetch\(`\/api\/copy-library/);
  assert.match(page, /method: selected \? "PATCH" : "POST"/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /selectedIdRef[\s\S]*setDraft\(draftFromEntry/);
  for (const label of ["最近更新", "最早更新", "标题 A-Z", "标题 Z-A", "提交人 A-Z", "提交人 Z-A"]) assert.ok(page.includes(label), `Copy sort option missing ${label}.`);
  assert.match(page, /useLibraryListSort\(copyLibrarySortStorageKey\)/);
  assert.match(page, /useMarqueeSelection[\s\S]*data-marquee-id/);
  assert.match(page, /batchVisibility[\s\S]*batchDeleteOpen/);
  assert.match(page, /selectAllEntries[\s\S]*event\.key\.toLowerCase\(\) === "a"/);
  assert.match(page, /event\.shiftKey[\s\S]*selectIdRange\(entryIds, current, anchorId, entry\.id, additive\)/);
  assert.match(page, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(page, /isEditableSelectionTarget\(event\.target\)/);
  assert.match(page, /event\.key === "Escape"[\s\S]*clearBatchSelection/);
  assert.match(page, /event\.key === "Delete"[\s\S]*setBatchDeleteOpen\(true\)/);
  assert.match(page, /type="checkbox" checked=\{allSelected\}/);
  assert.match(page, /visibility: "team"/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => \{[\s\S]{0,300}setDraft/, "Delayed draft synchronization can erase fast user input.");
  assert.match(home, /href="\/copy-library"/);
  assert.match(css, /@media\s*\(max-width:/);
  assert.match(css, /\.marquee\{[^}]*position:fixed/);
  assert.match(css, /\.selectBox input:checked\+span/);
  assert.match(css, /\.page\{[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(css, /\.libraryPane\{[^}]*min-height:0/);
  assert.match(css, /\.list\{[^}]*flex:1[^}]*min-height:0[^}]*overflow:auto/);

  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageRatios=['1:1'];exports.toApis4kImageRatios=['16:9'];", "utf8");
  for (const name of ["types", "node-utils", "registry"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"');
    writeFileSync(path.join(temp, `${name}.js`), transpile(source, `${name}.ts`), "utf8");
  }
  const require = createRequire(import.meta.url);
  const registry = require(path.join(temp, "registry.js"));
  const graph = loadTypeScriptModule(read("src/lib/canvas/graph.ts"), "graph.ts", {
    "./registry": registry,
    "./types": require(path.join(temp, "types.js")),
  });
  const executors = loadTypeScriptModule(read("src/lib/canvas/executors.ts"), "executors.ts", {
    "../feishu-publish-queue": {},
    "../generated-posts": {},
    "../image-generation": {},
    "../openai": {},
    "./dreamina": {},
    "./media-tools": {},
    "./node-utils": require(path.join(temp, "node-utils.js")),
    "./registry": registry,
  });

  const definition = registry.getCanvasNodeDefinition("input.copy-library");
  assert.deepEqual(definition.outputs.map((output) => [output.id, output.kind]), [["title", "text"], ["body", "text"]]);
  assert.equal(definition.fields[0].kind, "copy-library-picker");
  const snapshotNode = {
    id: "copy-node",
    type: "input.copy-library",
    version: 1,
    position: { x: 0, y: 0 },
    config: {
      entryId: teamEntry.id,
      entryTitle: teamEntry.title,
      snapshotTitle: "Frozen title",
      snapshotBody: "Frozen body",
      snapshotTags: ["Launch"],
      snapshotAt: teamEntry.updatedAt,
    },
  };
  assert.equal(graph.validateCanvasGraph({ nodes: [snapshotNode], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }).valid, true);
  const beforeSourceChange = executors.resolveCanvasLiteralOutputs(snapshotNode);
  await copyLibrary.updateCopyLibraryEntry(owner, teamEntry.id, { title: "Changed source", body: "Changed source body" });
  assert.deepEqual(executors.resolveCanvasLiteralOutputs(snapshotNode), beforeSourceChange, "Canvas literal output must use the frozen node snapshot.");
  assert.deepEqual(beforeSourceChange, {
    title: { kind: "text", value: "Frozen title" },
    body: { kind: "text", value: "Frozen body" },
  });

  console.log("Copy library domain, API, UI, persistence, and Canvas snapshot checks passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName,
  }).outputText;
}

function loadTypeScriptModule(source, fileName, stubs) {
  const loadedModule = { exports: {} };
  const require = createRequire(import.meta.url);
  Function("require", "module", "exports", "structuredClone", `${transpile(source, fileName)}`)(
    (name) => {
      if (name === "node:crypto") return require("node:crypto");
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw new Error(`Unexpected ${fileName} import: ${name}`);
    },
    loadedModule,
    loadedModule.exports,
    structuredClone,
  );
  return loadedModule.exports;
}
