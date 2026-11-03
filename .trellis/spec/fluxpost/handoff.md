# Handoff

Last updated: 2026-08-26

This file is an on-demand history library. Do not read it during default startup; read the latest marker block only when recent cross-session history is needed.

## 最近一条
<!-- TRELLIS-LATEST-START -->
2026-11-03 content-pool performance: P0 library row-level operations, P1 desk
pagination/raw stripping, and P1d row-level content-project writes are committed
as `ebfc7da` and active on 3001 (slot `.next-local-a`, loopback/LAN `/content`
200, `/api/version` SHA match). Full baseline (0 lint errors/16 warnings),
TypeScript, build, isolated browser check, real PostgreSQL read-only timing
(desk 960 ms, summary 898 ms, 4,692 items, 66 KB page) and temporary-schema SQL
smoke pass. Remaining: authenticated create/add/desk/ingest/batch timings. P2
item table remains out of scope; see task `11-03-content-pool-performance`.

2026-10-27 latest: ordinary-library incident recovered after user approval.
Old code depended on already-dropped generated tables, so the gallery failed
despite 2,301 ordinary assets remaining. Recovery code 4791dcc is active on LAN
3001; error UI no longer claims an empty gallery on fetch failure. Current DB
backup decoded; all 11 library tables match its inventory after authenticated
desktop/mobile acceptance. Generated indexing stays retired; no remote release.
Evidence: tasks/archive/2026-10/10-27-10-27-remove-generated-image-library/
recovery-verification.md. Never roll back to schema-incompatible 72dca31.

Newest 2026-10-27: user requested operator CLI. `npm run migrate` opens Chinese
menu; status/watch read local progress, start resumes fixed manifest with
confirmation/process/lock checks, stop uses graceful STOP (not process kill).
See cli-guide.md. Real worker unchanged; tests use isolated fake workers only.
Later live check: real PID 37572 stopped EPERM at 03:15:58Z, 17,090 proofs
revalidated, 0 new uploads. No real STOP/kill sent. CLI correctly shows failed;
exact filesystem syscall unknown. Do not claim migration running or auto restart.

Newest 2026-10-27: explicit resume after denial SUCCEEDED via normal Start-Process.
PID 37572, original manifest, two workers, 4 MiB/s payload pacing. 30,184 prior
proofs loaded; current HEAD checks are reusing receipts without full redownload.
See coexistence.md and data/oss-migration/progress.json; verify process before
claiming running. Workbench cba71dc/TOS unchanged, no deletion/cutover.

LATEST 2026-10-27: migration NOT running; PID 33960 stopped ECONNRESET at 02:06Z.
User wants production alongside migration. Tested two-worker payload pacing,
same-job SHA receipt reuse with current HEAD validation and bounded retries.
Start-Process invocation was blocked by tool policy; no retry/workaround/new PID.
Continue from `.trellis/tasks/10-23-tos-oss-migration/coexistence.md`.
Keep TOS/workbench unchanged. Changes uncommitted, no uploads in this turn.

2026-10-27 latest: RequestError stopped the next attempt at 30,184 verified /
117.90 GB. User authorized continue; failed 13 MB object now hash-verified.
Unchanged runner resumed original manifest, PID 33960, eight memory-only workers;
revalidates existing objects with counters starting at zero. Inspect process/lock
and progress.json, never launch a second writer. See memory-multipart.md.

Latest: first two-worker staged-file bulk attempt stopped on ABORT_ERR after
8,086 verified / 25.16 GB; source retained, original manifest and journals intact.
User requested 8 MiB in-memory TOS range / OSS multipart, eight workers. New
attempt PID 5092 under same manifest; at 12:43:23Z reverified 532 existing,
zero errors. Check ignored `data/oss-migration/progress.json` and PID/lock before
action. See `.trellis/tasks/10-23-tos-oss-migration/memory-multipart.md`.
No binary staging, no source deletion or production/storage cutover. LAN remains
cba71dc. After snapshot completes, coordinate final write freeze/delta separately.

2026-10-26: User confirmed other-window changes and authorized integrated commit.
Qwen 0b775c7 and generated-library bbe4ff9 remain intact in history. OSS changes
include explicit provider/V4, secret exclusion, inventory and guarded trial tools.
Eight samples were copied by LOCAL SDK, not Aliyun managed migration; SHA-256,
images and MP4/MOV playback/Range passed. Whole-target preservation is unproven:
between inventories, 157 other keys appeared and 46 old keys were absent.
Integrated deterministic tests/types/build/smoke and config desktop/mobile pass;
baseline stops at known 17 ignored-script lint errors. No paid Qwen calls.
Continue from `.trellis/tasks/10-23-tos-oss-migration/integration-verification.md`.
At that earlier integration point: no bulk migration, history rewrite, push,
activation or production switch. Keep
task in progress; coordinate target writers and production inventory before bulk
copy. TOS retention >=7 days after switch; deletion needs separate confirmation.
<!-- TRELLIS-LATEST-END -->

## 历史记录

- Full pre-migration handoff preserved at `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`.
- Use heading, date, keyword, or feature id search before opening long archive sections.

## 2026-08-26 reconciliation (previous latest)

2026-08-26 Trellis reconciliation is complete and the full isolated baseline passes.

Completed:
- Classified legacy active tasks from task artifacts, Git commits, archived copies, feature state, and stable decisions.
- Archived completed implementation tasks and removed duplicate active copies while preserving manual/production gates in `feature_list.json`.
- Reconciled current path, retired-host boundaries, release wording, history rules, and startup context size.
- Verified JSON, context/marker budgets, all focused checks, TypeScript, lint, production build, isolated HTTP smoke, and SQLite without external production calls.

Next:
- Resume from `status.md` and choose a bounded `ready_for_review` product gate when needed.
- Do not push or deploy without separate approval.
