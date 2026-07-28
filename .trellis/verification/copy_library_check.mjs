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
  const collectionRoute = read("src/app/api/copy-library/route.ts");
  const detailRoute = read("src/app/api/copy-library/[id]/route.ts");
  const page = read("src/app/copy-library/page.tsx");
  const css = read("src/app/copy-library/copy-library.module.css");
  const home = read("src/app/page.tsx");

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
  const copyLibrary = loadTypeScriptModule(copySource, "copy-library.ts", {
    "./database": databaseStub,
    "./workspace-ownership": ownershipStub,
  });

  assert.deepEqual(copyLibrary.normalizeTags([" Launch ", "launch", "EV", "ev"]), ["Launch", "EV"]);
  assert.throws(() => copyLibrary.normalizeTags("launch"), /array/i);

  const owner = { id: "owner", displayName: "Owner", role: "operator" };
  const teammate = { id: "teammate", displayName: "Teammate", role: "operator" };
  const admin = { id: "admin", displayName: "Admin", role: "admin" };
  const privateEntry = await copyLibrary.createCopyLibraryEntry(owner, {
    title: "Private launch",
    body: "Private body",
    tags: ["Launch", "EV"],
  });
  const teamEntry = await copyLibrary.createCopyLibraryEntry(owner, {
    title: "Team launch",
    body: "Shared body",
    tags: ["Launch", "SUV"],
    visibility: "team",
  });
  assert.equal(privateEntry.visibility, "private");
  assert.equal(privateEntry.canEdit, true);
  assert.deepEqual((await copyLibrary.listCopyLibraryEntries(teammate)).entries.map((entry) => entry.id), [teamEntry.id]);
  assert.equal((await copyLibrary.getCopyLibraryEntry(teammate, teamEntry.id)).canEdit, false);
  await assert.rejects(copyLibrary.getCopyLibraryEntry(teammate, privateEntry.id), /not found/i);
  await assert.rejects(copyLibrary.updateCopyLibraryEntry(teammate, teamEntry.id, { title: "Blocked" }), /read-only/i);
  assert.equal((await copyLibrary.updateCopyLibraryEntry(admin, teamEntry.id, { title: "Admin edit" })).title, "Admin edit");
  assert.deepEqual((await copyLibrary.listCopyLibraryEntries(owner, { tags: ["launch", "ev"] })).entries.map((entry) => entry.id), [privateEntry.id]);
  assert.deepEqual(copyLibrary.parseCopyLibraryFilters(new URL("http://local/api/copy-library?tag=Launch&tag=EV,SUV")).tags, ["Launch", "EV", "SUV"]);

  for (const snippet of ["搜索标题、正文或标签", "人工标签", "仅自己", "团队共享", "确认删除这篇文案"]) {
    assert.ok(page.includes(snippet), `Copy-library page is missing ${snippet}.`);
  }
  assert.match(page, /fetch\(`\/api\/copy-library/);
  assert.match(page, /method: selected \? "PATCH" : "POST"/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /selectedIdRef[\s\S]*setDraft\(draftFromEntry/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => \{[\s\S]{0,300}setDraft/, "Delayed draft synchronization can erase fast user input.");
  assert.match(home, /href="\/copy-library"/);
  assert.match(css, /@media\s*\(max-width:/);

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
