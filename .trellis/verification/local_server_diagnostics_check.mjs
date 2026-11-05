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
  assert(args.includes("--max-old-space-size=24576"));
  const heapProbe = spawnSync(process.execPath, [...args.slice(0, 6), "--input-type=module", "-e",
    "import v8 from 'node:v8'; console.log(v8.getHeapStatistics().heap_size_limit);"], {
    encoding: "utf8", timeout: 15000,
  });
  assert.equal(heapProbe.status, 0, heapProbe.stderr);
  assert(Number(heapProbe.stdout) >= 24576 * 1024 * 1024, "managed child must have at least 24 GiB heap allowance");
  assert(!args.some((value) => /heapsnapshot|heap-prof|inspect|report-on-signal/.test(value)));
  writeFileSync(fixture, "throw new Error('diagnostic-fixture');");
  const failed = spawnSync(process.execPath, [...args.slice(0, 6), fixture], {
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
      . ${quote(path.resolve('scripts/local/independent-process.ps1'))}
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

    // Keep the supervised child alive until AFTER its launcher's kill-on-close
    // Job has been closed. Shell-exit-only coverage cannot catch this regression.
    const releaseFile = path.join(psRoot, "finish-child");
    writeFileSync(fixture, `import {existsSync} from 'node:fs';
      console.log('job-child-running');
      const deadline = setTimeout(() => process.exit(9), 12000);
      const timer = setInterval(() => {
        if (existsSync(${JSON.stringify(releaseFile)})) {
          clearInterval(timer); clearTimeout(deadline);
          console.error('job-child-finished');
        }
      }, 50);`);
    const independentHelper = path.resolve("scripts/local/independent-process.ps1");
    const argvFixture = ["", "with spaces", 'a"b', "trailing\\", "before\\\"quote", "中文路径", "literal $() ` ; &"];
    const argvScript = path.join(psRoot, "argv-probe.mjs");
    const argvOutput = path.join(psRoot, "argv.json");
    writeFileSync(argvScript, `import {writeFileSync} from 'node:fs';
      writeFileSync(${JSON.stringify(argvOutput)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),value:process.env.FLUXPOST_JOB_FIXTURE}));
      console.error('independent-stderr');`);
    const jobLauncher = `${readFileSync(psFile, "utf8")}
      [IO.File]::WriteAllText((Join-Path $projectRoot 'launcher-ready'), [string]$server.Id)
      Start-Sleep -Seconds 20`;
    const deniedLauncher = `$ErrorActionPreference='Stop'
      . ${quote(independentHelper)}
      try {
        Test-IndependentNode -WorkingDirectory ${quote(psRoot)} -DiagnosticsRoot ${quote(psDiagnostics)}
        [IO.File]::WriteAllText(${quote(path.join(psRoot, "denied-result"))}, 'UNEXPECTED SUCCESS')
      } catch {
        [IO.File]::WriteAllText(${quote(path.join(psRoot, "denied-result"))}, $_.Exception.Message)
      }`;
    const outsideJobProbe = `$ErrorActionPreference='Stop'
      $ProgressPreference='SilentlyContinue'
      . ${quote(independentHelper)}
      Test-IndependentNode -WorkingDirectory ${quote(psRoot)} -DiagnosticsRoot ${quote(psDiagnostics)}`;
    const jobTestFile = path.join(temporaryRoot, "job-lifetime.ps1");
    writeFileSync(jobTestFile, `\uFEFF$ErrorActionPreference='Stop'
      Add-Type -Path ${quote(path.resolve(".trellis/verification/windows_job_fixture.cs"))}
      . ${quote(independentHelper)}
      function Wait-File([string]$file) {
        $deadline=[DateTime]::UtcNow.AddSeconds(10)
        while (-not (Test-Path -LiteralPath $file)) {
          if ([DateTime]::UtcNow -gt $deadline) { throw 'Fixture readiness timed out' }
          Start-Sleep -Milliseconds 50
        }
      }
      $job=New-Object WindowsJobFixture($true)
      try {
        $launcher=$job.Start((Join-Path $PSHOME 'powershell.exe'), '${Buffer.from(jobLauncher, "utf16le").toString("base64")}', ${quote(psRoot)})
        Wait-File ${quote(path.join(psRoot, "launcher-ready"))}
        $receipt=Get-Content -LiteralPath ${quote(path.join(psDiagnostics, "current-run.json"))} -Raw | ConvertFrom-Json
        $supervisor=Get-Process -Id $receipt.supervisorPid
        $child=Get-Process -Id $receipt.serverPid
        $job.Dispose()
        Start-Sleep -Milliseconds 200
        if (Get-Process -Id $launcher -ErrorAction SilentlyContinue) { throw 'Fixture Job did not terminate launcher' }
        $supervisor.Refresh(); $child.Refresh()
        if ($supervisor.HasExited -or $child.HasExited) { throw 'Server died with launcher Job' }
        [IO.File]::WriteAllText(${quote(releaseFile)}, 'finish')
        if (-not $supervisor.WaitForExit(5000)) { throw 'Supervisor did not record child completion' }
      } finally { $job.Dispose(); [IO.File]::WriteAllText(${quote(releaseFile)}, 'finish') }
      $denied=New-Object WindowsJobFixture($false)
      try {
        $null=$denied.Start((Join-Path $PSHOME 'powershell.exe'), '${Buffer.from(deniedLauncher, "utf16le").toString("base64")}', ${quote(psRoot)})
        Wait-File ${quote(path.join(psRoot, "denied-result"))}
        $failure=Get-Content -LiteralPath ${quote(path.join(psRoot, "denied-result"))} -Raw -Encoding UTF8
        if ($failure -notmatch 'Cannot start independent local process') { throw ('Wrong restrictive Job result: '+$failure) }
      } finally { $denied.Dispose() }
      $env:FLUXPOST_JOB_FIXTURE='inherited-in-memory'
      $argvProbe=Start-IndependentNode -NodeArguments @(${[argvScript, ...argvFixture].map(quote).join(",")}) -WorkingDirectory ${quote(psRoot)} -RedirectStandardError ${quote(path.join(psRoot, "argv.stderr"))}
      if (-not $argvProbe.WaitForExit(5000) -or $argvProbe.ExitCode -ne 0) { throw 'Argument probe failed' }
      $outsideJob=[FluxPost.Local.IndependentProcess]::Start((Join-Path $PSHOME 'powershell.exe'),
        @('-NoProfile','-NonInteractive','-EncodedCommand','${Buffer.from(outsideJobProbe, "utf16le").toString("base64")}'),
        ${quote(psRoot)}, ${quote(path.join(psRoot, "outside-job.stderr"))})
      if (-not $outsideJob.WaitForExit(10000) -or $outsideJob.ExitCode -ne 0) { throw 'Non-Job launch/preflight failed' }
    `);
    const jobTest = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", jobTestFile], {
      encoding: "utf8", timeout: 30000,
    });
    assert.equal(jobTest.status, 0, jobTest.stderr || jobTest.stdout);
    const afterJobClose = JSON.parse(readFileSync(path.join(psDiagnostics, "current-run.json"), "utf8"));
    assert.equal(afterJobClose.status, "exited");
    assert.equal(afterJobClose.exitCode, 0);
    assert.equal(afterJobClose.commit, "2".repeat(40));
    assert(logText(path.join(psDiagnostics, "logs")).includes("job-child-finished"));
    assert.equal(readFileSync(path.join(psDiagnostics, "supervisor.stderr.log"), "utf8"), "");
    const argvResult = JSON.parse(readFileSync(argvOutput, "utf8"));
    assert.deepEqual(argvResult.args, argvFixture);
    assert.equal(argvResult.cwd, psRoot);
    assert.equal(argvResult.value, "inherited-in-memory");
    assert.match(readFileSync(path.join(psRoot, "argv.stderr"), "utf8"), /independent-stderr/);
    assert.equal(readFileSync(path.join(psRoot, "outside-job.stderr"), "utf8"), "");
    assert(!readdirSync(psDiagnostics).some((name) => name.startsWith("launch-probe-")));
    console.log("Windows Job closure survival, restrictive Job rejection, argv/environment/cwd and stderr passed.");
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
