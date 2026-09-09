# Canvas content collection node

## Goal

Add a Canvas node labelled 内容采集, reusing 采集与内容池 collection with automatic tagging disabled by default.

## Requirements

- Add a new node alongside existing source-video and content-pool nodes.
- Reuse existing collection services; preserve original page defaults.
- Skip content and visual AI tagging by default.
- User approved the revised per-link batch implementation on 2026-09-09, and explicitly requested generic downstream support including vision analysis.
- User raised the required design scenario: 20 input links, a downstream per-image reconstruction node, and automated batch scheduling.

## Implemented Link-Batch Scope

- Link/ID import through the existing service and supported platform selector. Keyword-driven expansion remains a separate pending design, as identified in the batch planning revision; the original keyword collection page is unchanged.
- Revised recommendation: batch scheduling expands input links into one main task per source, and automatically runs collection then downstream nodes within each task.
- Each task outputs only its own title, body, source link, images and videos; never mix media across links.
- Per-image reconstruction iterates that task's image group internally, not a second source-level Cartesian expansion.
- Preserve successful collection output for downstream retries; recollection requires an explicit new attempt rather than rerunning all successful acquisition.
- Single-node execution collects only; a connected full run proceeds downstream. Multi-link execution must explicitly use the batch schedule rather than silently processing only one link.
- Keyword-mode automatic expansion remains pending design confirmation because result count is unknown before collection; do not treat keyword strings as source items.
- Show failures, partial success, empty results and missing configuration honestly; do not present demo items as real successful collection.
- No Cookie input or credentials are added to saved/exported workflow configuration.

## Acceptance Criteria

- [x] Node settings/test selection persist; saved runs and per-task frozen outputs remain separate from editable workflow configuration.
- [x] Reuse importSourceLinks with skipTagging=true unless explicitly enabled; do not change existing routes/defaults.
- [x] Existing safety/media processing and authenticated execution ownership are preserved.
- [x] Five outputs support vision, per-image reconstruction and other compatible downstream nodes.
- [x] Twenty distinct links produce twenty main tasks with one source-scoped collection stage each.
- [x] Source failures remain task-local, downstream retries reuse frozen collection, and runs never patch editable node settings asynchronously.
- [x] Downstream-specific missing/above-limit image errors remain explicit without truncation or source mixing.
- [x] Existing collection, Canvas and scheduler regression checks pass.
- [x] Offline contract/runtime tests and mocked 1440px/390px browser flows pass; final baseline rerun recorded in implement.md.

## Notes

- No live providers or real user-data mutations in default tests.
- Do not create another application environment/worktree or replace the port-3001 candidate.
- Commits and candidate activation require separate explicit authorization.
