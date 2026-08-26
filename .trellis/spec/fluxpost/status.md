# FluxPost Current Status

Last updated: 2026-08-26

## One-Line Status

Production, GitHub `main`, and the verified local product candidate now run exact SHA `f8e2caa8d97c3ea80e7a7571c600afe50e34b59c`; the local branch may contain only the separate completion-record commit above that product SHA.

## Current Focus

- Legacy implementation tasks are archived; active product gates live in `feature_list.json` rather than permanent task directories.
- Production release `20260826-080626-f8e2caa8d97c` is healthy behind host Nginx, with retained rollback release `20260817-015812-e086872de90a`.
- Port `3001`, GitHub `main`, and production passed exact-SHA parity at `f8e2caa8d97c3ea80e7a7571c600afe50e34b59c` before this completion-only metadata record.

## Next Entry

Choose the next product gate from `feature_list.json` and create one bounded Trellis task. Any later product push or production activation requires separate approval and a new immutable candidate.

## Risks And Unknowns

- Features still marked `ready_for_review` retain their explicit live/provider/operator gates; task archival does not mark them `done`.
- Historical image attempts still require working Xray; the UI does not operate it.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
