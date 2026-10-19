# FluxPost Current Status

Last updated: 2026-10-19

## One-Line Status

Gemini Canvas text/vision implementation and offline verification are complete; clean-commit LAN activation remains. NVENC encoding (concurrency 1), cancellation recovery and gallery operator gates remain.

## Current Focus

- Gemini: native generateContent, independent config/model/proxy, ordered text/images and cancellation implemented. Offline provider/config/graph/iteration/V2, Canvas regression, six three-theme desktop/mobile browser cases, types, changed lint, production build/config synchronization and isolated HTTP/SQLite pass. Baseline domain checks pass; existing lint blocker below. Clean LAN activation remains. No live calls. Task: `.trellis/tasks/10-19-canvas-gemini-node/`.
- NVENC: real output/reconstruction/layer/slideshow/mask checks, CPU baseline, types, source lint, build and isolated HTTP/SQLite pass. Clean d031d1a LAN activation and full-SHA identity/smoke/0.0.0.0:3001 passed after the operator batch drained. Decode/filters/audio remain CPU; unsupported tiny GPU dimensions fail explicitly.
- Cancellation: worker/resource/storage/scheduler/iteration, temporary-table PostgreSQL SQL, types, lint/build/HTTP/SQLite pass. Scoped recovery preserved all 30 completed snapshots and resumed abandoned work. Normal operator observation remains.
- Gallery UX: both phases pass runtime/filter/batch and six three-theme 1440/390 browser checks; clean 3147e19 local activation passed. Authenticated operator review remains.

## Next Entry

Commit verified Gemini implementation and activate LAN 3001 after the read-only work-drain check. Preserve provider gates and historical runs.

## Risks And Unknowns

- Existing ignored runtime-import scripts have 17 lint errors; full baseline previously stopped there. At Gemini startup the typical context exceeded 70 KB by 477 bytes; older status details were archived without weakening the gate.
- Gemini credentials/model and real provider acceptance remain pending confirmation. No paid calls are authorized for this task.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid model, TOS write, TikHub, Feishu, Lark or publishing acceptance was exercised. Gallery changes remain local. Nine high-severity transitive advisories remain; no forced audit fix.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.

## History

Pre-Gemini state and detailed 2026-10-19 evidence: `archive/status-2026-10-19-before-gemini.md`. Earlier entry: `archive/status-2026-10-14-library-ux.md`. Task evidence is under `.trellis/tasks/archive/`; handoff/progress history is read only by bounded latest markers or targeted lookup.
