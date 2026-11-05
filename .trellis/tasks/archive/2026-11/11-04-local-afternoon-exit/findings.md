# Local service interruption — 2026-11-04 afternoon

All times below are Asia/Shanghai (UTC+08:00). Investigation is read-only;
this task did not launch, restart, terminate or modify the application.

## Confirmed timeline

| Time | Evidence |
| --- | --- |
| 12:29:00 | Managed LAN server started from `48a5ccc5966c24518d83636bf60b8b034a863445`, slot `.next-local-a`, supervisor PID 24124 / server PID 4844. |
| 15:50:47 | Last retained output from that run: Next `Failed to find Server Action "x"`. The same error occurred at 12:54 and 13:08. |
| 17:29:21.941 | Local FRP client recorded connection refusal from `127.0.0.1:3001`. This proves the service was unavailable by this time; it is not the exact exit time. |
| 17:39:42–44 | Windows PowerShell engine-start events show the desktop public launcher, then the LAN launcher, then the managed `scripts/local/restart.ps1 -HostName 0.0.0.0`. |
| 17:40:12–13 | A new supervisor/server started from the same SHA, slot `.next-local-b`, and Next reported ready. `/api/version` agrees with the candidate and diagnostic receipts. |

## What the evidence supports

- The incident included loss of the local listener, rather than only a public
  tunnel or browser failure. FRP was alive to record the local connection error.
- Both old supervisor and server PIDs are absent. The old run has no final
  lifecycle/exit entry, no logged fatal error and no retained afternoon native
  report. The newly launched supervisor stderr is empty.
- Retained fatal reports are from 09:35, 10:13 and 11:18. The latter two
  correspond to old `52d761b` OOMs before the memory repair. They do not establish
  that this afternoon's incident was another OOM.
- Windows Application events 1000/1001/1002 contain no matching crash/hang
  record between 12:29 and recovery. No resource-exhaustion event was found in
  the checked recent System warning/error events. Windows has not rebooted:
  last boot is Nov 3 at 17:33. Checked Defender detection/action events do not
  identify a termination in this interval.
- Current runtime retains the 8-GiB heap ceiling and fatal/uncaught report
  flags; physical memory was plentiful at investigation time. Present memory
  is not evidence of its level at the unknown exit instant.

## Cause and confidence

**Exact cause: pending confirmation.** Abrupt loss of the supervisor together
with its child, without a child-exit receipt, is consistent with external
termination of the process tree or its hosting session/job. It does not prove
which actor or operation terminated it, and cannot exclude every unreported
native/process failure. No usable historical process-termination audit was
available in this investigation.

The existing supervisor writes an exit receipt when the child closes, but
cannot do so if the supervisor itself is also terminated. This is an already
documented diagnostic limitation (`local_diagnostics.md`, section 4).

The desktop public launcher invokes local startup when 3001 has no listener;
the recorded 17:39 invocation explains recovery. Reading both installed
launcher scripts found no process-kill operation. The managed restart script
stops the old listener only during activation, after building; that later
recovery operation cannot explain the refusal already recorded at 17:29.

`Server Action "x"` indicates an unknown action request (potential callers
include old clients or probes). The log has neither request attribution nor
a fatal stack. Its repetition over several hours and absence of an exit
record do not establish it as the crash trigger.

## Verification and next evidence

- Full documented baseline passed (including deterministic contracts, lint,
  TypeScript, production build, isolated 45678 HTTP smoke and SQLite).
  Ignored log: `test-artifacts/local-afternoon-exit-baseline-20261104.log`.
- Existing `http_smoke.js` passed against the actual loopback 3001 candidate.
  `/canvas`, `/review`, `/content`, `/batch-create` and `/api/version` returned
  200 on both loopback and the physical LAN address; both identities match
  `48a5ccc5966c24518d83636bf60b8b034a863445`.
- `git diff --check` passed. No application behavior or feature state changed;
  these checks establish current health, not the historical termination cause.
- No heap increase, automatic restart, task replay or business-code patch is
  justified by the available evidence.
- If this recurs, retain the current receipt before recovery overwrites it,
  and check supervisor and child independently. Attributing an external kill
  requires process-lifecycle auditing outside the killed process tree; the
  existing child-only fatal diagnostics cannot provide that attribution.
