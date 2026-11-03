import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLogWriter, limits, prepareDiagnostics, pruneReports, serverArguments, supervise } from "../../scripts/local/server-diagnostics.mjs";

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "fluxpost-diagnostics-"));
try {
  const root = path.join(temporaryRoot, "with spaces");
  prepareDiagnostics(root);
  assert.equal(limits.logBytes * limits.logFiles, 100 * 1024 * 1024);
  const logs = path.join(root, "logs");
  const reports = path.join(root, "reports");
  const policy = { ...limits, logBytes: 256, logFiles: 3 };
  let writer = createLogWriter(logs, policy);
  writer.write("stdout", Buffer.alloc(2000, "a")); // A single chunk spans and evicts multiple files.
  writer.write("stderr", "newest-error");
  writer.close();
  assertLogBudget(logs, policy);
  assert(logText(logs).includes("newest-error"));
  assert.match(logText(logs), /\d{4}-\d\d-\d\dT.* stderr/);
  for (let start = 0; start < 6; start++) {
    writer = createLogWriter(logs, policy);
    writer.write("lifecycle", `run-${start}`);
    writer.close();
    assertLogBudget(logs, policy); // Many quiet restarts also bound the file count.
  }
  assert(logText(logs).includes("run-5"));
  writeFileSync(path.join(logs, "operator-note.txt"), "keep");
  writer = createLogWriter(logs, policy);
  writer.write("stdout", "last");
  writer.close();
  assert.equal(readFileSync(path.join(logs, "operator-note.txt"), "utf8"), "keep");

  const now = Date.now();
  for (let i = 1; i <= 6; i++) {
    const name = `report.20261103.120000.123.${i}.json`;
    writeFileSync(path.join(reports, name), "x".repeat(100));
    utimesSync(path.join(reports, name), new Date(now - i * 1000), new Date(now - i * 1000));
  }
  writeFileSync(path.join(reports, "operator.json"), "keep");
  pruneReports(reports, now, { ...limits, reportBytes: 250 });
  assert.equal(readdirSync(reports).filter((name) => name.startsWith("report.")).length, 2);
  assert(readdirSync(reports).includes("report.20261103.120000.123.1.json"));
  pruneReports(reports, now + 8 * 86400_000);
  assert.deepEqual(readdirSync(reports), ["operator.json"]);
  for (let i = 1; i <= 5; i++) writeFileSync(path.join(reports, `report.20261103.120000.123.${i}.json`), "{}");
  pruneReports(reports);
  assert.equal(readdirSync(reports).filter((name) => name.startsWith("report.")).length, 3);

  const fixture = path.join(temporaryRoot, "fixture.mjs");
  writeFileSync(fixture, `process.stdout.write('fixture-out'); process.stderr.write('fixture-error'); process.exitCode = 134;`);
  const result = await supervise({ root, cwd: temporaryRoot, args: [fixture], env: { ...process.env, FLUXPOST_RELEASE_SHA: "1".repeat(40), FLUXPOST_NEXT_DIST_DIR: ".next-local-a" } });
  assert.equal(result.code, 134);
  const receipt = JSON.parse(readFileSync(path.join(root, "current-run.json"), "utf8"));
  assert.equal(receipt.exitCode, 134);
  assert.equal(receipt.status, "exited");
  assert.equal(receipt.commit, "1".repeat(40));
  assert.equal(receipt.slot, ".next-local-a");
  assert(receipt.serverPid > 0 && receipt.startedAt && receipt.exitedAt);
  assert(logText(logs).includes("fixture-out"));
  assert(logText(logs).includes("fixture-error"));
  assert(logText(logs).includes('"exitCode":134'));

  // Real Node uncaught-exception report in an isolated child: no server, providers or heap dump.
  const args = serverArguments(root, temporaryRoot, "127.0.0.1", 3001);
  assert(!args.some((value) => /heapsnapshot|heap-prof|inspect|report-on-signal/.test(value)));
  writeFileSync(fixture, "throw new Error('diagnostic-fixture');");
  const failed = spawnSync(process.execPath, [...args.slice(0, 5), fixture], {
    cwd: temporaryRoot, env: { ...process.env, FLUXPOST_REPORT_SECRET_FIXTURE: "not-in-report-22a" },
    encoding: "utf8", timeout: 15000,
  });
  assert.equal(failed.status, 1, failed.stderr);
  const reportFiles = readdirSync(reports).filter((name) => name.startsWith("report."));
  const nativeReport = reportFiles.map((name) => readFileSync(path.join(reports, name), "utf8")).find((text) => text.includes("diagnostic-fixture"));
  assert(nativeReport, failed.stderr);
  assert(!nativeReport.includes("not-in-report-22a"));
  const parsedReport = JSON.parse(nativeReport);
  assert.equal(parsedReport.environmentVariables, undefined);
  assert.equal(parsedReport.header.networkInterfaces, undefined);

  // Receipt I/O failure after startup must not terminate the running fixture.
  const failureRoot = path.join(temporaryRoot, "io-failure");
  const survived = path.join(temporaryRoot, "child-survived.txt");
  writeFileSync(fixture, `import { mkdirSync, writeFileSync } from 'node:fs';
    setTimeout(() => {
      mkdirSync(${JSON.stringify(path.join(failureRoot, "current-run.json.tmp"))});
      process.stdout.write('x'.repeat(2000));
      setTimeout(() => { writeFileSync(${JSON.stringify(survived)}, 'completed'); process.exitCode = 7; }, 100);
    }, 100);`);
  const ioFailure = await supervise({ root: failureRoot, cwd: temporaryRoot, args: [fixture], policy });
  assert.equal(ioFailure.code, 7);
  assert.equal(readFileSync(survived, "utf8"), "completed");
  assert(ioFailure.receipt.diagnosticError);
  assertLogBudget(path.join(failureRoot, "logs"), policy);

  // A preflight storage failure fails explicitly, before a child can be started.
  const blocked = path.join(temporaryRoot, "not-a-directory");
  writeFileSync(blocked, "fixture");
  await assert.rejects(supervise({ root: blocked, args: [fixture], cwd: temporaryRoot }));
  assert(!readdirSync(temporaryRoot).some((name) => name.endsWith(".heapsnapshot")));
  const restart = readFileSync("scripts/local/restart.ps1", "utf8");
  assert(restart.indexOf("Diagnostics preflight failed") < restart.indexOf('Write-Host "== Replace existing server'));
  assert.match(restart, /server-diagnostics\.mjs/);
  assert.match(restart, /-RedirectStandardError \$diagnosticsErrorPath/);
  assert.match(restart, /Start-CandidateServer -Slot \$previousState\.slot/);
  if (process.platform === "win32") {
    // Execute the actual launcher function with fake HTTP/smoke and a harmless
    // child. This exercises Windows quoting, env inheritance and launch-parent exit.
    const psRoot = path.join(temporaryRoot, "powershell launch with spaces");
    const psDiagnostics = path.join(psRoot, "data/local-diagnostics");
    prepareDiagnostics(psDiagnostics);
    mkdirSync(path.join(psRoot, "scripts/local"), { recursive: true });
    mkdirSync(path.join(psRoot, ".trellis/verification"), { recursive: true });
    writeFileSync(fixture, "console.log('detached-child-running'); setTimeout(() => { console.error('detached-child-finished'); }, 1000);");
    writeFileSync(path.join(psRoot, "scripts/local/server-diagnostics.mjs"), `
      import {supervise} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/local/server-diagnostics.mjs")).href)};
      const result = await supervise({root:${JSON.stringify(psDiagnostics)},cwd:${JSON.stringify(psRoot)},args:[${JSON.stringify(fixture)}]});
      process.exitCode=result.code;`);
    writeFileSync(path.join(psRoot, ".trellis/verification/http_smoke.js"), "process.exitCode=0;");
    const functionSource = restart.slice(restart.indexOf("function Start-CandidateServer {"), restart.indexOf('Write-Host "== Build committed candidate'));
    const quote = (text) => `'${text.replaceAll("'", "''")}'`;
    const psFile = path.join(temporaryRoot, "launch-fixture.ps1");
    writeFileSync(psFile, `$ErrorActionPreference='Stop'
      $controllerRoot=${quote(psRoot)}
      $projectRoot=$controllerRoot
      $slotNames=@('.next-local-a','.next-local-b')
      $HostName='0.0.0.0'
      $Port=3001
      $Commit='${"2".repeat(40)}'
      function Invoke-WebRequest { param($Uri,[switch]$UseBasicParsing,$TimeoutSec); return @{StatusCode=200} }
      function Invoke-RestMethod { param($Uri,$TimeoutSec); return @{mode='candidate';commit=$Commit;versioned=$true} }
      ${functionSource}
      $server=Start-CandidateServer -Slot '.next-local-b' -Commit $Commit
      if ($server.Id -le 0) { throw 'No supervisor PID' }
    `);
    const launched = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psFile], { encoding: "utf8", timeout: 15000 });
    assert.equal(launched.status, 0, launched.stderr || launched.stdout);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const detachedReceipt = JSON.parse(readFileSync(path.join(psDiagnostics, "current-run.json"), "utf8"));
    assert.equal(detachedReceipt.status, "exited");
    assert.equal(detachedReceipt.exitCode, 0);
    assert.equal(detachedReceipt.commit, "2".repeat(40));
    assert.equal(detachedReceipt.slot, ".next-local-b");
    assert(logText(path.join(psDiagnostics, "logs")).includes("detached-child-finished"));
    assert.equal(readFileSync(path.join(psDiagnostics, "supervisor.stderr.log"), "utf8"), "");
  }
  console.log("Bounded rotation, quiet starts, report age/count/bytes, real exit-134 capture, native report privacy, preflight and runtime I/O failure passed.");
} finally {
  // mkdtemp owns this exact test directory; never touch runtime artifacts.
  assert(path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir()) + path.sep));
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function assertLogBudget(directory, policy) {
  const retained = readdirSync(directory).filter((name) => name.endsWith(".log"));
  assert(retained.length <= policy.logFiles);
  let total = 0;
  for (const name of retained) {
    const bytes = statSync(path.join(directory, name)).size;
    assert(bytes <= policy.logBytes);
    total += bytes;
  }
  assert(total <= policy.logBytes * policy.logFiles);
}
function logText(directory) {
  return readdirSync(directory).filter((name) => name.endsWith(".log")).map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
}
