import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createCutoverController, formatCutoverStatus, safeProgress, cutoverStages } from "../../scripts/storage/cutover-control.mjs";
import { within, loadCutoverConfig } from "../../scripts/storage/cutover-config.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "fluxpost-cutover-cli-"));
const stateDir = path.join(root, "data/oss-cutover");
const config = { version: 1, evidenceDir: "test-artifacts/evidence", onlineBackupDir: "data/backups/online", frozenBackupDir: "data/backups/frozen" };
const save = (file, value) => writeFile(path.join(root, file), JSON.stringify(value));
let started = [];
const fakeApp = async () => ({ status: "running", commit: "a".repeat(40) });
const options = { root, checkClean: async () => "b".repeat(40), inspectApp: fakeApp,
  runStep: async (stage, settings, progress) => { assert.equal(settings.evidenceDir, config.evidenceDir); started.push(stage); await progress({ verified: 2, total: 3 }); } };
const reset = async () => { await rm(path.join(stateDir, "state.json"), { force: true }); started = []; };
try {
  for (const dir of ["data/oss-cutover", config.evidenceDir, config.onlineBackupDir, config.frozenBackupDir]) await mkdir(path.join(root, dir), { recursive: true });
  await save("data/oss-cutover/config.json", config);
  await writeFile(path.join(root, ".env.local"), "RUNTIME_STORAGE_PROVIDER=tos\nSECRET=DO_NOT_SHOW\n");
  await save(`${config.evidenceDir}/post-delta-summary.json`, { source: 10, target_media: 10, source_missing_target: 0, target_extra_media: 0, size_mismatch: 0, inventoryAt: "2026-10-27T00:00:00Z" });
  await save(`${config.evidenceDir}/browser-results.json`, { results: [{ ok: true }, { ok: true }] });
  await save(`${config.evidenceDir}/reported.json`, []);
  await save(`${config.evidenceDir}/inventory-stage-a.json`, { target: [] });
  await save(`${config.evidenceDir}/core-data-before.json`, {});
  await save(`${config.onlineBackupDir}/receipt.json`, { bytes: 10, archiveDecodePassed: true, snapshotAt: "2026-10-27T00:00:00Z" });
  const controller = createCutoverController(options);
  const status = await controller.status();
  const text = formatCutoverStatus(status);
  assert(text.includes("10 / 10")); assert(text.includes("2026/10/27"));
  assert(text.includes("待执行")); assert(!text.includes("DO_NOT_SHOW"));
  assert.equal((await controller.continue()).result, "confirmation-required");
  assert.equal(started.length, 0);
  assert.equal((await controller.refresh({ confirmed: true })).result, "refreshed");
  assert.deepEqual(started, ["preflight", "inventory"]);
  assert.equal((await controller.continue({ confirmed: true })).result, "completed");
  assert.deepEqual(started.slice(2), cutoverStages);
  assert.equal((await controller.continue({ confirmed: true })).result, "already-completed");
  assert.equal(started.length, cutoverStages.length + 2);

  await reset();
  const dirty = createCutoverController({ ...options, checkClean: async () => { throw Object.assign(new Error(), { code: "CleanWorktreeRequired" }); } });
  await assert.rejects(dirty.continue({ confirmed: true }), { code: "CleanWorktreeRequired" }); assert.equal(started.length, 0);
  await save("data/oss-cutover/operation.lock", { pid: 1 });
  await assert.rejects(controller.refresh({ confirmed: true }), { code: "CutoverBusyOrInterrupted" });
  await rm(path.join(stateDir, "operation.lock"));

  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const blocking = createCutoverController({ ...options, runStep: async stage => {
    if (stage === "preflight") { entered(); await new Promise(resolve => { release = resolve; }); }
  } });
  const inFlight = blocking.refresh({ confirmed: true }); await waiting;
  await assert.rejects(controller.continue({ confirmed: true }), { code: "CutoverBusyOrInterrupted" });
  release(); await inFlight;

  await reset();
  const fails = createCutoverController({ ...options, runStep: async stage => {
    started.push(stage); if (stage === "references") throw Object.assign(new Error("private-secret"), { code: "Conflict" });
  } });
  await assert.rejects(fails.continue({ confirmed: true }), { code: "Conflict" });
  assert(!started.includes("config") && !started.includes("activate"));
  assert.equal((await fails.logs()).status, "failed");
  assert(!(await readFile(path.join(stateDir, "state.json"), "utf8")).includes("private-secret"));
  await assert.rejects(fails.continue({ confirmed: true }), { code: "InterruptedCutoverNeedsReview" });
  await assert.rejects(fails.refresh({ confirmed: true }), { code: "InterruptedCutoverNeedsReview" });

  await reset();
  assert.equal((await controller.continue({ confirmed: true, shouldStop: () => started.length >= 2 })).result, "stopped");
  assert.deepEqual(started, ["preflight", "freeze"]);
  await assert.rejects(controller.continue({ confirmed: true }), { code: "InterruptedCutoverNeedsReview" });

  assert.equal(safeProgress("private arbitrary output"), undefined);
  assert.equal(safeProgress('"private"'), undefined);
  assert.deepEqual(safeProgress('{"verified":4,"total":8,"key":"PRIVATE","token":"SECRET","message":"SECRET","code":"Oops"}'), { verified: 4, total: 8, code: "Oops" });
  assert.equal(safeProgress('{"code":"https://secret-url"}'), undefined);
  assert.throws(() => within(root, "data/backups/../../outside", "data/backups/"));
  assert.throws(() => within(root, "C:/outside", "data/backups/"));
  await save("data/oss-cutover/config.json", { ...config, evidenceDir: "../private" });
  await assert.rejects(loadCutoverConfig(root));

  const cli = path.resolve("scripts/storage/migrate.mjs");
  for (const args of [["--help"], ["continue"], ["start", "--yes"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10000, windowsHide: true });
    if (args[0] === "start") assert.equal(result.status, 1); else assert.equal(result.status, 0);
    assert(!result.stdout.includes("DO_NOT_SHOW"));
  }
} finally {
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true });
}
console.log("Cutover CLI offline: dated evidence, confirmation, locking, clean-tree guard, ordered phases, fail-stop, interrupted recovery refusal, redaction and safe paths passed.");
