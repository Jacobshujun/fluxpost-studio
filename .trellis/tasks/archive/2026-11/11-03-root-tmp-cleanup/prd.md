# Root temporary artifact cleanup

## Request

User explicitly requested cleanup after a read-only inventory of root `.tmp*` entries.

## Scope and constraints

- Clean historical root `.tmp-*` entries only; no app source, live runtime data, configuration, build slots or service restart.
- Preserve recent artifacts (2026-10-27 onward), storage/migration evidence and artifacts related to outstanding video/layer/Gemini/Qwen/text tasks.
- Preserve selected files and old directory contents in one ignored, local recovery ZIP under `test-artifacts/`, except rebuildable `node_modules`, `.next`, Python caches and incremental TypeScript cache.
- Before recursive deletion, verify each resolved target is a direct child of the primary workspace, is `.tmp-*`, has no reparse points, has no tracked files and is not referenced by a running application/helper process.
- Verify recovery archive integrity and unchanged source hashes before deletion. Never print credentials or artifact contents.

## Acceptance criteria

- Historical root clutter and old build dependency/cache copies are removed with before/after counts and byte totals.
- Non-rebuildable removed content has a verified local recovery archive.
- Excluded temporary evidence remains present.
- Port 3001 retains its listener and application identity and responds successfully.
- Run the documented isolated offline baseline; record its actual result.
- No unrelated tracked edits or runtime configuration changes.
