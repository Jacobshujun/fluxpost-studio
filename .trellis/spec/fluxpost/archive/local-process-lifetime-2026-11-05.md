# Local process disappearance investigation — 2026-11-05

## Scope

User requested investigating the cause before changing memory limits or adding
cache cleanup. No application source/configuration, queue state, process audit
policy or local activation was changed. No real application was started or
restarted. All times below are Asia/Shanghai.

## Incident evidence

- At 20:26–20:28, port 3001 had no listener and loopback `/api/version` refused
  connections. Both recorded supervisor PID 31880 and server PID 34300 were
  absent. The diagnostic receipt still said `running`.
- That receipt and its first lifecycle log identify a 15:12:59 start from
  `d2364ad603fd4762030573542fae49d946673ff6`, slot `.next-local-b`. The retained
  activation log passed health/identity/smoke and records the same PIDs.
- Local session history identifies the launching command at 15:12:27 as
  `npm run local:lan` from a development-tool command process. Its output was
  redirected to `data/gpt-image-probe/canvas-concurrency-lan.log`.
- The final server output is at 19:06:17, an unknown Server Action request.
  There is no final lifecycle event, logged OOM, uncaught/fatal stack or new
  native report. Retained native reports are the Nov 4 morning incidents.
  This does not prove that no memory issue is possible; it supplies no
  evidence of one in this incident.
- VS Code's existing main/extension-host logs show the renderer closing its
  MessagePort at 20:11:31.783 and old extension host PID 7768 exiting normally
  at 20:11:31.827–833. A new VS Code process/log session begins at 20:11:51.
- Checked Windows Application/System/Defender events do not attribute an app
  crash, resource exhaustion, sleep/shutdown or security-product termination
  to the incident. Windows last boot remains Nov 3. No usable historical
  4688/4689 process audit or Sysmon log was available.

Local evidence stays ignored: runtime receipts/logs, installed VS Code logs,
and development-tool session history. Do not copy their raw bodies to specs.

## Confirmed startup defect

The current command process belongs to a Windows Job Object. Read-only native
`QueryInformationJobObject` calls for basic/extended limits both returned
`LimitFlags=0x2800`: `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (0x2000) and
`JOB_OBJECT_LIMIT_BREAKAWAY_OK` (0x0800), without silent breakaway (0x1000).
Current VS Code/command-host processes also test as Job members; these
membership checks alone do not identify the exact Job of the old processes.

`scripts/local/restart.ps1` uses `Start-Process -WindowStyle Hidden` to start
the diagnostic supervisor. Hiding the window does not detach a process from
an inherited Job. This launcher has no explicit mechanism to leave the
hosting Job or delegate to an independent OS service/task. The supervisor
then starts the Node child normally. When the outer Job is closed, Windows
can terminate both processes, bypassing the child's close handler and the
supervisor's receipt/error handling.

## Isolated reproduction

No port was opened and no application, database, provider or Feishu task ran.
The fixture:

1. Extracted the actual `Start-CandidateServer` function from `restart.ps1`.
2. Stubbed HTTP/identity/smoke only, and invoked the real `supervise` export
   with a harmless Node child kept alive by a timer.
3. Created an owned Windows Job with the observed 0x2800 policy. Started a
   hidden fixture PowerShell suspended, assigned it to that Job, then resumed
   it. This avoids a race where descendants start before assignment.
4. Waited for the actual launcher to finish its stubbed readiness checks.
   Receipt: supervisor 16408 / child 18200, `status=running`.
5. Closed only the fixture Job handle. Within 700 ms, both fixture processes
   were gone. The receipt remained `running`, with no recorded exit code.

Owned fixture artifacts are under ignored
`test-artifacts/job-lifetime-98b549cdba104969918e14b0a1ef614f/`.
No historical/runtime PID was terminated in the experiment.

The existing Windows regression covers survival after the immediate launch
shell exits. It does not close a containing Job or terminate the editor host;
therefore it does not cover this reproduced failure mode.

## Conclusion and limits

**Confirmed:** managed startup can leave the local supervisor and child tied
to a development-tool Job lifetime. Closing that Job reproduces the exact
combination of missing processes, stale `running` receipt and absent fatal/
exit output seen here.

**Strongest supported explanation for Nov 5:** termination associated with
the old editor/extension-host shutdown. The launching context, recorded
editor shutdown and reproduced mechanism agree. The original processes'
exact Job membership, termination instant and terminating owner were not
historically audited; direct attribution remains pending confirmation.
Do not promote correlation to a claim that exit at 20:11:31 was observed.
The Nov 4 afternoon incident remains separately unattributed.

Increasing the heap or cleaning caches would not prevent Job termination.
The targeted follow-up is to make local runtime lifetime independent of the
command/editor host, preserve candidate/rollback/identity/diagnostic rules,
and add a regression that actually closes the containing Job. This is a
recommendation, not an implemented fix. The earlier user-requested 24-GiB
heap adjustment also remains unapplied while diagnosis has priority.

## Verification

The isolated reproduction passed as described. Full documented offline
baseline passed: deterministic contracts (including current local diagnostics),
lint (0 errors / 16 existing warnings), TypeScript, production build, isolated
45678 HTTP smoke and SQLite. Ignored log:
`test-artifacts/local-job-exit-investigation-baseline-20261105.log`.
`git diff --check` passed. The actual application remains stopped; isolated
baseline smoke is not runtime recovery evidence.
