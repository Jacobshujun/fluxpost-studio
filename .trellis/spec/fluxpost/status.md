# FluxPost Current Status

Last updated: 2026-08-26

## One-Line Status

The verified Canvas retry candidate runs exact SHA `e58b37b0767da79ea365c214945755a0e8a0c16b` on local LAN port `3001`, GitHub `main`, and production `https://flux.lightmoment.net`.

## Current Focus

- The deployed Canvas candidate restores V2 partial child and row retry only for failed `model.gpt-image-each` children; V1, shared, generic partial, review, and Feishu behavior remains unchanged.
- Legacy implementation tasks are archived; active product gates live in `feature_list.json` rather than permanent task directories.
- Production release `20260826-094620-e58b37b0767d` is healthy behind host Nginx, with prior release `20260826-080626-f8e2caa8d97c` and two rescue images retained.
- Port `3001`, GitHub `main`, and production passed exact-SHA parity at `e58b37b0767da79ea365c214945755a0e8a0c16b` before this completion-only metadata record.

## Next Entry

Operator-review the restored retry against a representative partial image task on the LAN candidate or production. Any later change requires a new immutable candidate and separate production approval.

## Risks And Unknowns

- Features still marked `ready_for_review` retain their explicit live/provider/operator gates; task archival does not mark them `done`.
- Historical image attempts still require working Xray; the UI does not operate it.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
