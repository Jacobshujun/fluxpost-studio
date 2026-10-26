# Delivery evidence - 2026-10-26

## State

Implementation and isolated acceptance completed. Commit awaits the required
Trellis commit-plan confirmation; task stays in_progress. No candidate activation,
real-user history scan or remote deployment. Existing OSS changes are preserved.

## Delivered

- Dual-backend result index, source associations, exclusions, transactional claims
  and 30-record resumable history pages; matching migration 007.
- Provenance-only adapters for Canvas outputs/partial child results, Klein queue,
  original cards, corroborated posts and reused Canvas associations.
- Automatic first scoped scan on library/navigation access. Progress, failures,
  duplicates, uncertain counts and explicit retry/rescan; no model retry.
- Per-output capture after OpenAI/ToAPIs/Klein/Qwen persistence, with owner/task
  context from Canvas, batch, simple and image endpoints. Gemini currently returns
  text only. Generic inputs and conversions never trigger capture.
- Durable runtime recovery receipts survive DB enrollment failures. If both local
  receipt storage and database fail, in-process failure requires explicit retry
  before restart; saved originals are returned without triggering another model call.
- Source/name/date/vehicle/unlabelled filters and matching smart-folder conditions;
  stable cursor paging, source details, single/batch manual vehicle edits.
- Owner isolation and admin-only unowned records, including team-flag legacy rows.
- Removal preserves originals/history and exclusions survive stale metadata writes.
- Controlled local/managed-cloud reads, traversal/symlink protection, local thumbnails
  and color analysis compatibility, explicit image/query errors.
- Normal Canvas and V1/V2 batch selectors share filters/smart folders, preserving
  snapshots until selection or explicit refresh.

## Verification

- Evidence and producer checks PASS, including V1 converted-original fallback,
  partial results, ownership and exact output persistence boundaries.
- generated_library_check.mjs PASS on isolated SQLite and loopback PostgreSQL unique
  schema (dropped afterward): all durable adapters, duplicate associations, 65-record
  scan/resume/repeat, expired leases, local files/Sharp, cloud-address fixtures,
  ACL, filters, cursors, smart folders, manual edits, exclusions, original retention,
  injected enrollment DB failure and durable replay without providers.
- Full baseline: all pre-lint checks PASS, then unchanged 17 errors in ignored local
  data import scripts. No gate weakened. baseline-delivery.log is local ignored evidence.
- Source lint: 0 errors, 16 existing warnings. TypeScript noEmit PASS.
- Production build PASS with existing broad-filesystem tracing warnings.
- Built config synchronization PASS; worker-disabled HTTP smoke PASS including
  generated-library GET/POST 401. Existing read-only SQLite check PASS.
- Generated browser suite: professional/editorial/creator x 1440/390 PASS. Every
  API/media request intercepted on port 45678. Covers combined filters, uncertain/
  failure state, missing thumbnail, source details, single vehicle edit, removal
  confirmation, smart folder, explicit refresh and V1/V2 filter/snapshot retention.
- Existing gallery browser suite: six cases PASS including old upload deletion,
  imports, permissions, viewer drafts and cursor behavior.
- Existing library colors/Canvas browser suite: six cases PASS.
- git diff --check PASS. Screenshots under ignored test-artifacts. No credentials,
  runtime data or media included in proposed commit.

## Limits and important findings

- Historical timestamps retain source-updated/source-completed basis and display
  as task time; no invented exact generation date. Unknown entry remains unknown.
- V1 GPT nodes without explicit model can return transcoded references at different
  URLs. Such outputs stay uncertain. Never infer from all post images or filenames.
- Deleted tasks/orphan files cannot be recovered. No real-user history imported in
  development; automatic scan begins after activation and authenticated library use.
- If both DB and receipt filesystem fail, retry before process restart is required.
- Worktree contains unrelated OSS changes, so npm run local remains blocked by its
  clean-tree guard even after this task's eventual commit. No bypass or remote release.

## Commit boundary

Task-owned source, migration, tests and Trellis artifacts only. Shared-file hunks:
image-generation.ts (capture only), media_cache_image_format_check.mjs (capture stub
only), feature_list.json (generated-library entry only). Do not stage OSS hunks.
Task .gitignore excludes verification logs. Commit confirmation then archive remains.
