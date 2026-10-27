import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { createController, formatStatus } from "../../scripts/storage/migration-control.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "fluxpost-migration-cli-"));
const data = path.join(root, "data", "oss-migration");
await mkdir(data, { recursive: true });
const manifest = JSON.stringify({ capturedAt: "2026-10-26T00:00:00Z", settings: { bucket: "seedance-gz-xpeng22365", prefix: "fluxpost/flux-lightmoment" },
  source: { count: 1, bytes: 3, objects: [{ key: "fluxpost/flux-lightmoment/a.png", size: 3, etag: "etag", modified: "2026-10-26T00:00:00Z", storageClass: "STANDARD" }] }, target: { objects: [] } });
const job = createHash("sha256").update(manifest).digest("hex");
await mkdir(path.join(data, job));
await writeFile(path.join(data, job, "manifest.json"), manifest);
await writeFile(path.join(root, ".env.local"), "fixture only");
await writeFile(path.join(root, "aliyun_oss_key.txt"), "fixture only");
let progress = { job, attempt: "attempt", pid: 111, status: "failed", lifecycleEvidence: "operator-confirmed-no-rules", verifiedObjects: 0, verifiedBytes: 0, totalObjects: 1, totalBytes: 3, failures: 1 };
const save = () => writeFile(path.join(data, "progress.json"), JSON.stringify(progress));
let processes = new Map();
let launches = 0;
const controller = createController({ projectRoot: root, env: {}, probe: async p => processes.get(p.pid) || "absent", wait: async () => {},
  launch: async ({ manifestPath, outPath, errorPath, env }) => {
    launches++;
    assert.equal(manifestPath, path.join(data, job, "manifest.json"));
    assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, "1");
    assert.equal(env.FLUXPOST_OSS_NO_LIFECYCLE_CONFIRMED, "1");
    assert(outPath.startsWith(data + path.sep));
    assert(errorPath.startsWith(data + path.sep));
    processes.set(222, "match");
    progress = { ...progress, pid: 222, status: "running", failures: 0 };
    await save();
    await writeFile(path.join(data, "active.lock"), JSON.stringify({ pid: 222, id: job, attempt: "attempt" }));
    return 222;
  } });
try {
  assert.equal((await controller.status()).state, "idle");
  await save();
  assert.equal((await controller.status()).state, "failed");
  assert.equal((await controller.start({ confirmed: false })).result, "confirmation-required");
  assert.equal(launches, 0);
  processes.set(111, "unknown");
  await assert.rejects(controller.start({ confirmed: true }), /ProcessIdentityUnknown/);
  processes.set(111, "foreign");
  await assert.rejects(controller.start({ confirmed: true }), /ProcessIdentityUnknown/);
  processes.clear();
  await writeFile(path.join(data, "active.lock"), JSON.stringify({ pid: 111, id: job }));
  await writeFile(path.join(data, "STOP"), "stop");
  const started = await controller.start({ confirmed: true });
  assert.equal(started.result, "started");
  assert.equal(launches, 1);
  await assert.rejects(readFile(path.join(data, "STOP")), { code: "ENOENT" });
  assert.equal((await controller.start({ confirmed: true })).result, "already-running");
  assert.equal(launches, 1);
  assert.equal((await controller.stop({ confirmed: false })).result, "confirmation-required");
  assert.equal((await controller.stop({ confirmed: true })).result, "stop-requested");
  assert.equal((await controller.status()).state, "stopping");
  assert.equal((await controller.start({ confirmed: true })).result, "already-running");
  await readFile(path.join(data, "STOP"));
  processes.clear();
  assert.equal((await controller.status()).state, "interrupted");
  progress = { ...progress, status: "snapshot-verified", verifiedObjects: 1, verifiedBytes: 3 };
  await save();
  assert.equal((await controller.start({ confirmed: true })).result, "snapshot-complete");
  assert.equal(launches, 1);
  progress = { ...progress, status: "failed" };
  await save();
  await writeFile(path.join(data, job, "manifest.json"), manifest + " ");
  await assert.rejects(controller.start({ confirmed: true }), /ManifestHashMismatch/);
  assert.equal(launches, 1);
  await writeFile(path.join(data, job, "manifest.json"), manifest);
  await writeFile(path.join(data, "controller.lock"), "manual review");
  await assert.rejects(controller.start({ confirmed: true }), /ControllerBusy/);
  await rm(path.join(data, "controller.lock"));
  progress = { ...progress, job: "../escape" };
  await save();
  await assert.rejects(controller.start({ confirmed: true }), /InvalidJobIdentity/);
  const text = formatStatus({ state: "failed", progress: { ...progress, totalObjects: 100, verifiedObjects: 40, totalBytes: 1000, verifiedBytes: 500, lastErrorCode: "ECONNRESET", secret: "DO_NOT_SHOW", journalPath: "PRIVATE" } });
  assert(!text.includes("DO_NOT_SHOW") && !text.includes("PRIVATE"));
  assert(text.includes("50.0%") && text.includes("ECONNRESET"));
  progress = { ...progress, job, lifecycleEvidence: "unconfirmed" };
  await save();
  await assert.rejects(controller.start({ confirmed: true }), /LifecycleConfirmationRequired/);
  progress.lifecycleEvidence = "operator-confirmed-no-rules";
  await save();
  const noStart = createController({ projectRoot: root, env: {}, probe: async () => "absent", wait: async () => {}, launch: async () => 333 });
  await assert.rejects(noStart.start({ confirmed: true }), /WorkerExitedDuringStartup/);
  assert.equal((await noStart.status()).worker, undefined);

  // Real detached launch against a temporary fake worker; no SDK, network or app.
  if (["win32", "linux"].includes(process.platform)) {
    await mkdir(path.join(root, "scripts", "storage"), { recursive: true });
    await writeFile(path.join(root, "scripts", "storage", "bulk-migrate.mjs"), `
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('data/oss-migration');
const manifest=process.argv[3];
const job=path.basename(path.dirname(manifest));
const progress={job,pid:process.pid,status:'running',lifecycleEvidence:'operator-confirmed-no-rules',totalObjects:1,totalBytes:3};
const save=()=>{fs.writeFileSync(path.join(root,'progress.json.tmp'),JSON.stringify(progress));fs.renameSync(path.join(root,'progress.json.tmp'),path.join(root,'progress.json'));};
fs.writeFileSync(path.join(root,'active.lock'),JSON.stringify({pid:process.pid,id:job}),{flag:'wx'});save();
const timer=setInterval(()=>{if(fs.existsSync(path.join(root,'STOP'))){clearInterval(timer);progress.status='stopped';save();fs.unlinkSync(path.join(root,'active.lock'));}},100);
setTimeout(()=>{clearInterval(timer);process.exit(0)},15000).unref();
`);
    const real = createController({ projectRoot: root, env: { ...process.env, FLUXPOST_OSS_KEY_FILE: path.join(root, "aliyun_oss_key.txt") } });
    let pid;
    try {
      const started = await real.start({ confirmed: true });
      assert.equal(started.result, "started");
      pid = started.snapshot.worker.pid;
      assert.equal((await real.start({ confirmed: true })).result, "already-running");
      assert.equal((await real.stop({ confirmed: true })).result, "stop-requested");
      let stopped;
      for (let i = 0; i < 12; i++) {
        await sleep(250);
        stopped = await real.status();
        if (!stopped.worker) break;
      }
      assert.equal(stopped.state, "stopped");
      pid = undefined;
    } finally {
      // Only the exact child returned by this test launch is eligible for cleanup.
      if (pid) { try { process.kill(pid); } catch (error) { if (error.code !== "ESRCH") throw error; } await sleep(500); }
    }
  }
} finally {
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(root, { recursive: true });
}
console.log("Migration CLI offline: status, confirmation, duplicate prevention, PID safety, STOP, manifest hash, controller lock and redaction pass.");
