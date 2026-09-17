# Verification — 2026-09-17

- Offline composition checks: full SHA reads remain on render and reject a mismatched video hash even after inspection. Inspection performs zero digest reads. Concurrent and repeated local inspections share one probe; changed stat and separate owner cause a new probe. Failed probes retry. Remote metadata expires at 60 seconds. Private snapshots enforce owner lookup before cache.
- Loader checks: complete upload metadata (including hasAudio=false) needs zero requests; two active requests, duplicate suppression, failure slot release, queued retry and close cancellation pass. Late completion cannot publish or start queued work after disposal.
- Browser: creator/professional/editorial at 1440 and 390 px pass the existing geometry, undo/redo, video, persistence and contrast checks. Additional loading scenarios at both sizes pass upload reuse across reopen, metadata preload, editing while slow, duplicate layers, independent failure/retry, preserved position/history and close/reopen races. Browser exit 0; narrow screenshot inspected.
- Full offline baseline passed with process exit 0: domain checks, lint (0 errors, 17 existing warnings), TypeScript, build, HTTP smoke on worker-disabled 45680, SQLite. Final log: test-artifacts/layer-compose-loading-baseline-final.log (ignored local evidence).
- The first successful baseline used PowerShell merged-stream redirection, which surfaced Node experimental warnings as NativeCommandError despite reaching success. The final run captured stdout/stderr outside PowerShell through Python subprocess and confirmed exit 0; no check or warning was suppressed.
- One existing literal-output assertion was updated to include the newly preserved hasAudio field. No existing checks were weakened.
- Browser APIs and media were intercepted; no provider calls or real workflow changes. The browser smoke on 45679 was stopped after checks.

Scope limits: cold remote URLs with missing metadata still require download; no proxy transcodes or remote media download cache in this batch. Metadata-only preload is a browser hint. Server materialization already in progress continues after a browser abort.

Delivery: verified code is committed before the primary-worktree npm run local activation. Production is unchanged.
