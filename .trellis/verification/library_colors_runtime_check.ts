import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";
import { extractLibraryPalette } from "../../src/lib/library-color-extraction";
import { hexToLab, libraryColorMatches, normalizeLibraryColor } from "../../src/lib/library-color";
import type { LibraryAsset } from "../../src/lib/types";

async function main() {
  const root = process.env.FLUXPOST_COLOR_FIXTURE;
  assert(root, "Isolated fixture is required");
  const project = process.cwd();
  const schema = readFileSync("src/lib/library-color-schema.ts", "utf8").replace(/\r\n/g, "\n").split("`")[1];
  assert.equal(readFileSync("db/migrations/006_library_colors.sql", "utf8").replace(/\r\n/g, "\n").split("\n").slice(1).join("\n"), schema);
  process.chdir(root);
  const db = await import("../../src/lib/database");
  const store = await import("../../src/lib/library-color-store");
  const library = await import("../../src/lib/library-assets");
  const actor = { id: "owner", displayName: "Owner", role: "operator" as const };
  const other = { id: "other", displayName: "Other", role: "operator" as const };
  const admin = { id: "admin", displayName: "Admin", role: "admin" as const };
  const now = "2026-10-19T00:00:00.000Z";
  const profile = { scenes: [], vehicleModels: [], vehicleColors: [], angles: [], people: "unknown" as const, customTags: [] };
  const solid = (background: string) => sharp({ create: { width: 80, height: 80, channels: 4, background } }).png().toBuffer();
  const red = await solid("#D43C3C"); const blue = await solid("#3876C7");
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const rp = await extractLibraryPalette(red, hash(red)); const bp = await extractLibraryPalette(blue, hash(blue));
  assert.equal(rp.colors[0].hex, "#D43C3C"); assert.equal(rp.colors[0].coverage, 1);
  assert(libraryColorMatches(rp.colors, "#CC4040")); assert(!libraryColorMatches(rp.colors, "#3876C7"));
  assert.throws(() => normalizeLibraryColor("red")); assert.equal(normalizeLibraryColor("#aabbcc"), "#AABBCC");
  assert(Math.abs(hexToLab("#FFFFFF")[0] - 100) < .001);
  for (const neutral of ["#000000", "#888888", "#FFFFFF"]) assert.equal((await extractLibraryPalette(await solid(neutral), "fixture")).colors[0].hex, neutral);
  const raw = Buffer.alloc(100 * 100 * 4);
  for (let i = 0; i < 10000; i++) { raw.set(i < 7500 ? [212, 60, 60, 255] : [56, 118, 199, 255], i * 4); }
  const two = await sharp(raw, { raw: { width: 100, height: 100, channels: 4 } }).png().toBuffer();
  const tp = await extractLibraryPalette(two, "fixture");
  assert(Math.abs(tp.colors[0].coverage - .75) < .001); assert.equal(tp.colors.length, 2);
  assert.deepEqual((await extractLibraryPalette(two, "fixture")).colors, tp.colors);
  raw.fill(0); for (let i = 0; i < 1000; i++) raw.set([56, 118, 199, 255], i * 4);
  const transparent = await sharp(raw, { raw: { width: 100, height: 100, channels: 4 } }).png().toBuffer();
  assert.deepEqual((await extractLibraryPalette(transparent, "fixture")).colors, [{ hex: "#3876C7", coverage: 1 }]);
  assert.equal((await extractLibraryPalette(await solid("#00000000"), "fixture")).colors.length, 0);
  await assert.rejects(extractLibraryPalette(Buffer.from("corrupt"), "fixture"));
  const frames = Buffer.concat([Buffer.from(Array(16).fill([212, 60, 60, 255]).flat()), Buffer.from(Array(16).fill([56, 118, 199, 255]).flat())]);
  const animated = await sharp(frames, { raw: { width: 4, height: 8, channels: 4, pageHeight: 4 } }).gif({ delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  assert.equal((await extractLibraryPalette(animated, "fixture")).colors[0].hex, "#D43C3C");

  function asset(id: string, owner = actor.id, visibility: "team" | "private" = "private"): LibraryAsset {
    return { id, ownerUserId: owner, ownerDisplayName: owner, name: id, originalName: `${id}.png`, objectKey: `fixture/library/${id}.png`,
      publicUrl: `https://colors.invalid/fixture/library/${id}.png`, mimeType: "image/png", extension: ".png", byteSize: red.length,
      sha256: hash(Buffer.from(id)), collectionIds: [], visibility, aiTags: profile, manualOverrides: {}, effectiveTags: profile,
      taggingStatus: "idle", cleanupStatus: "ready", createdAt: now, updatedAt: now };
  }
  for (let i = 0; i < 65; i++) {
    const a = asset(`red-${String(i).padStart(3, "0")}`); await db.saveLibraryAssetToDb(a); await store.saveLibraryPalette(a.id, { ...rp, sha256: a.sha256 });
  }
  for (const a of [asset("private-other", other.id), asset("team-other", other.id, "team"), asset("blue"), asset("small-red"), asset("missing"), asset("failed"), asset("stale")]) await db.saveLibraryAssetToDb(a);
  for (const id of ["private-other", "team-other"]) await store.saveLibraryPalette(id, { ...rp, sha256: asset(id).sha256 });
  await store.saveLibraryPalette("blue", { ...bp, sha256: asset("blue").sha256 });
  await store.saveLibraryPalette("small-red", { ...rp, sha256: asset("small-red").sha256, colors: [{ hex: "#D43C3C", coverage: .049 }, { hex: "#3876C7", coverage: .951 }] });
  await store.saveLibraryPalette("failed", { ...rp, sha256: asset("failed").sha256, status: "failed", colors: [], error: "Broken image" });
  await store.saveLibraryPalette("stale", { ...rp, sha256: asset("stale").sha256, version: 0 });
  const page1 = await library.listLibraryAssets(actor, { color: "#D43C3C", limit: 24 });
  assert.equal(page1.total, 66); assert.equal(page1.assets.length, 24); assert(page1.nextCursor);
  const all = [...page1.assets]; let cursor = page1.nextCursor;
  while (cursor) { const page = await library.listLibraryAssets(actor, { color: "#D43C3C", limit: 24, cursor }); all.push(...page.assets); cursor = page.nextCursor; }
  assert.equal(new Set(all.map((a) => a.id)).size, 66); assert(all.every((a) => a.palette?.status === "completed"));
  await assert.rejects(library.listLibraryAssets(actor, { color: "#3876C7", cursor: page1.nextCursor }));
  assert.equal((await library.listLibraryAssets(admin, { color: "#D43C3C" })).total, 67);
  assert.equal((await library.listLibraryAssets(actor, { color: "#D43C3C", search: "team" })).total, 1);
  const ids = await library.resolveLibrarySelectionIds(actor, { mode: "query", filters: { color: "#D43C3C" }, excludedAssetIds: ["red-000"] });
  assert.equal(ids.length, 65); assert(!ids.includes("private-other"));
  const editable = await library.getLibraryAsset(actor, "red-000");
  const edited = await library.patchLibraryAsset(actor, editable.id, { name: "Changed concurrently", note: "keep this note" });
  await store.saveLibraryPalette(edited.id, { ...bp, sha256: edited.sha256 });
  const preserved = await library.getLibraryAsset(actor, edited.id);
  assert.equal(preserved.name, "Changed concurrently"); assert.equal(preserved.note, "keep this note"); assert.equal(preserved.palette?.colors[0].hex, "#3876C7");
  const coverage = await store.libraryColorCoverage(actor); assert.equal(coverage.manageableMissing, 2); assert.equal(coverage.manageableFailed, 1);
  const job = await store.enqueueLibraryColorJob(actor, "missing");
  assert.equal(await store.enqueueLibraryColorJob(actor, "missing"), job); assert.equal((await store.getLibraryColorJob(actor, job))?.total, 2);
  const adminOverlap = await store.enqueueLibraryColorJob(admin, "missing");
  assert.equal((await store.getLibraryColorJob(admin, adminOverlap))?.total, 0, "active assets must be deduplicated across requesters");
  assert.equal(await store.getLibraryColorJob(other, job), undefined);
  const claims = await Promise.all([store.claimLibraryColorItem(), store.claimLibraryColorItem(), store.claimLibraryColorItem()]);
  assert.equal(claims.filter(Boolean).length, 2);
  const first = claims[0]!; const second = claims[1]!;
  const recovered = await store.claimLibraryColorItem(new Date(Date.now() + 121_000)); assert(recovered);
  assert.equal(await store.completeLibraryColorItem(first, { ...rp, sha256: first.sha256 }), false, "expired claimant cannot overwrite recovered result");
  await store.completeLibraryColorItem(recovered, { ...bp, sha256: recovered.sha256 });
  await store.completeLibraryColorItem(second, { ...rp, sha256: second.sha256 });
  assert.equal((await store.getLibraryColorJob(actor, job))?.status, "completed");
  const retry = await store.enqueueLibraryColorJob(actor, "failed"); assert.equal((await store.getLibraryColorJob(actor, retry))?.total, 1);
  const failedClaim = await store.claimLibraryColorItem(); assert(failedClaim);
  await store.completeLibraryColorItem(failedClaim, { ...rp, sha256: failedClaim.sha256 });
  assert.equal((await store.libraryColorCoverage(actor)).manageableFailed, 0);

  // Run the real bounded worker against intercepted media; no provider/storage writes.
  await db.saveWorkspaceAccountToDb({ ...actor, username: "owner", passwordHash: "fixture-only", status: "active", createdAt: now, updatedAt: now });
  for (const id of ["worker-a", "worker-b", "worker-c", "worker-corrupt"]) await db.saveLibraryAssetToDb(asset(id));
  const workerJob = await store.enqueueLibraryColorJob(actor, "missing");
  let running = 0; let maximum = 0; let reads = 0;
  globalThis.fetch = async (input, init) => {
    assert(String(input).startsWith("https://colors.invalid/fixture/")); assert.equal(init?.redirect, "error");
    running++; reads++; maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, 5)); running--;
    return new Response(new Uint8Array(String(input).includes("corrupt") ? Buffer.from("broken") : red), { headers: { "content-type": "image/png" } });
  };
  delete process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS;
  const worker = await import("../../src/lib/library-colors");
  await worker.ensureLibraryColorWorker();
  const finished = await store.getLibraryColorJob(actor, workerJob);
  assert.equal(reads, 4); assert(maximum <= 2); assert.equal(finished?.completed, 3); assert.equal(finished?.failed, 1); assert.equal(finished?.status, "completed");
  assert((await library.getLibraryAsset(actor, "worker-corrupt")).palette?.error);
  const require = createRequire(path.join(project, "src/lib/library-assets.ts"));
  const compiled = ts.transpileModule(readFileSync(path.join(project, "src/lib/library-assets.ts"), "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  let uploads = 0;
  Function("require", "module", "exports", compiled)((name: string) => name === "./runtime-media-storage" ? {
    persistLibraryObject: async () => { uploads++; return { objectKey: `fixture/import/${uploads}.png`, publicUrl: `https://colors.invalid/fixture/import/${uploads}.png` }; },
    deleteRuntimeMediaObject: async () => assert.fail("unexpected storage rollback"),
  } : require(name), mod, mod.exports);
  const importing = mod.exports as typeof library;
  const imported = await importing.importLibraryAsset(actor, { bytes: blue, originalName: "new.png" });
  assert.equal(imported.status, "imported"); assert.equal(imported.asset.palette?.colors[0].hex, "#3876C7");
  assert.equal((await importing.importLibraryAsset(actor, { bytes: blue, originalName: "duplicate.png" })).status, "skipped_duplicate");
  assert.equal(uploads, 1);
  const brokenImport = await importing.importLibraryAsset(actor, { bytes: Buffer.from([137,80,78,71,13,10,26,10]), originalName: "broken.png" });
  assert.equal(brokenImport.status, "imported"); assert.equal(brokenImport.asset.palette?.status, "failed");
  assert((await library.getLibraryAsset(actor, brokenImport.asset.id)).palette?.error, "analysis failure must remain explicit without losing imported asset");
  console.log("Library colors: real pixels/animation, SQLite migration/query/permissions/paging/selection, independent edits, jobs/leases/retry and bounded worker passed.");
}
void main();
