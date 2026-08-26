# FluxPost Current Status

Last updated: 2026-08-26

## One-Line Status

Trellis current facts are reconciled and the full offline baseline passes; legacy implementation tasks are archived and product review gates remain in the feature state machine.

## Current Focus

- Legacy implementation tasks are archived; active product gates live in `feature_list.json` rather than permanent task directories.
- Port `3001` serves clean candidate SHA `8f375c7fbbdbb463f6f5ef6ea252e7f430a161fc`.

## Next Entry

Choose the next product gate from `feature_list.json` and create one bounded Trellis task. Push and deployment require separate approval.

## Risks And Unknowns

- Features still marked `ready_for_review` retain their explicit live/provider/operator gates; task archival does not mark them `done`.
- Historical image attempts still require working Xray; the UI does not operate it.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
