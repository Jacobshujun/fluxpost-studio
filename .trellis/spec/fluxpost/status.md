# FluxPost Current Status

Last updated: 2026-10-21

## One-Line Status

Iteration shared references have verified numbered inputs. Commit and local/LAN activation are authorized; existing live/operator gates remain.

## Current Focus

- Iteration references: numbered ports, legacy-first ordering, persistence/runtime and 1440/390 three-theme checks pass. Existing 17 lint errors block full baseline; remaining checks pass separately. Code committed as 6d43165; Gemini records also authorized for commit to permit clean local/LAN activation. Runtime identity: `/api/version`. Evidence: `.trellis/tasks/archive/2026-10/10-21-iteration-reference-inputs/verification.md`.
- Text reasoning: admin config offers `OPENAI_TEXT_REASONING_EFFORT` (`default` + seven efforts) across all OpenAI-compatible text calls. Default omits the field. Config/request/built-sync/browser, source lint, types, build, HTTP and SQLite pass. Evidence: `.trellis/tasks/10-21-text-reasoning-effort/verification.md`.
- Local API tools installed: `.trellis/tasks/archive/2026-10/10-21-local-api-panels/`.
- Canvas placement: pointer/viewport conversion and first-node view stability verified; evidence: `.trellis/tasks/archive/2026-10/10-20-canvas-node-placement/`.
- Gemini: native text/images, independent config/proxy, cancellation and offline/browser/build/HTTP/SQLite pass; live acceptance paused. Evidence: `.trellis/tasks/archive/2026-10/10-19-canvas-gemini-node/verification.md`.
- NVENC, cancellation and gallery: archived real/queue/browser checks and clean activations passed; decode/filters/audio stay CPU, normal recovery observation and operator review remain.

## Next Entry

Text reasoning provider support for the chosen model/effort is untested; no live calls were sent. Gemini live testing also stays paused. User selected gemini-3.8-flash-high; local config already contains it and a provider key. Availability is untested. Earlier gemini-3.8-flash returned unsupported-account/model 404. Evidence: `.trellis/tasks/10-19-gemini-live-acceptance/`. Runtime SHA: `/api/version`.

## Risks And Unknowns

- Existing ignored runtime-import scripts have 17 lint errors; full baseline previously stopped there. At Gemini startup the typical context exceeded 70 KB by 477 bytes; older status details were archived without weakening the gate.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid model, TOS write, TikHub, Feishu, Lark or publishing acceptance was exercised. Gallery changes remain local. Nine high-severity transitive advisories remain; no forced audit fix.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.

## History

Pre-Gemini state and detailed 2026-10-19 evidence: `archive/status-2026-10-19-before-gemini.md`. Earlier entry: `archive/status-2026-10-14-library-ux.md`. Task evidence is under `.trellis/tasks/archive/`; handoff/progress history is read only by bounded latest markers or targeted lookup.
