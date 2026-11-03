# Local crash investigation — 2026-11-03

All times below are Asia/Shanghai. This report records a bounded read-only
investigation; the exact fatal trigger remains pending confirmation.

## Confirmed observations

| Start | npm log last write (approximate exit) | Result |
| --- | --- | --- |
| 16:34:38 | 16:38:10 | `npm run start -- -H 0.0.0.0 -p 3001`, exit 134 |
| 16:39:10 | 16:43:45 | Same command, exit 134 |

The npm logs record Node v24.12.0 / npm 11.6.2, the primary project working
directory, and both `verbose exit 134` and `verbose code 134`. Exit times use
filesystem timestamps, not a timestamped fatal error. Copies were preserved
before npm's ten-log retention could remove them:

- `test-artifacts/local-crash-20261103/163438-start-exit134.log`
- `test-artifacts/local-crash-20261103/163910-start-exit134.log`

The final prior activation log reports listener PID 25800 and candidate
`f8e5ff3d2ba65452df7f3949fd719b38d6a4f7b0`. At inspection, that process was gone.
The replacement listener PID 9372 started at 16:46:32, bound `0.0.0.0:3001`,
and `/api/version` returned the same candidate SHA. Its process ancestry is
`npm run start` -> `cmd next start` -> Node/Next. The installed public launcher
was started at 16:46:03. No restart was performed during this investigation.

## Corroboration and limits

- Windows Application events since noon contain no matching Node/npm/app crash.
  Resource-Exhaustion logs contain no matching afternoon memory-pressure event.
  No matching Node crash dump or WER report was located in the checked standard
  directories. These absences do not exclude a V8/native fatal error.
- Windows reports approximately 93.6 GiB usable physical RAM and 78.3 GiB free
  at inspection. A separate Node process with the same executable reports a
  default V8 heap limit of 4288 MiB. The live server's exact inherited heap
  configuration and historical memory peak were not measured. Observed live
  private memory was approximately 0.6–0.7 GiB, not a crash-time measurement.
- A read-only PostgreSQL transaction showed Feishu publish completed at
  16:36:09, and the retained application activity for 16:39–16:43 contained only
  an image-transport startup check. This does not prove which requests ran:
  HTTP request access logs are absent. No basis to attribute both exits to
  Feishu publishing, provider errors, or content-pool queries.
- `scripts/local/restart.ps1` starts the server hidden without redirecting
  stdout/stderr. Existing desktop/public launchers retain FRP logs, not the
  Node server's fatal output. npm retains the exit code but no fatal stack.
- The current server's hidden console was read without changing the server;
  the local-only snapshot `current-console-local.txt` contains its startup
  banner and readiness message. It cannot recover destroyed old consoles.

## Conclusion and follow-up

Both reported failures have matching server exit records with code 134, which
is consistent with an abort-style termination. It does not uniquely identify
V8 heap exhaustion, a native assertion, or another fatal runtime cause. Do not
report OOM or a specific application function as established fact.

To resolve the remaining uncertainty, retain timestamped stdout/stderr and a
fatal diagnostic report on the next managed startup, then correlate the fatal
stack with the active operation and memory peak. Configure such reports as
ignored local artifacts; Node reports may contain environment secrets. A
logging/launcher implementation and another service restart are outside this
read-only investigation. Do not increase heap limits as a presumed fix.

## Verification

Initial baseline stopped at the pre-existing typical-context budget gate:
72007 bytes > 71680 bytes. Compress the lightweight status while recording this
result, then rerun the unchanged baseline. Application source is unchanged.

After compressing the status summaries, the full unchanged baseline passed:
context budgets, deterministic contracts, lint (0 errors / 16 existing warnings),
TypeScript, production build, built config synchronization, HTTP smoke on 45678
and SQLite. Log: `test-artifacts/local-crash-20261103/baseline.log`.
`git diff --check` passed. At the final check, PID 9372 still had its original
16:46:32 start time and `/api/version` still returned `f8e5ff3...`.

Only investigation documents and the current status are committed. Do not
restart the active service merely to load documentation changes while operator
work is running. No source fix or claim of crash resolution is made.
