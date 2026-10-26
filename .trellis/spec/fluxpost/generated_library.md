# Generated Image Library

## 1. Scope

Generated originals join the existing asset library, collections, tags, favorites,
smart folders and Canvas selectors. No independent media store, directory scanning,
model inference or upload/move occurs during indexing.

## 2. Signatures

- `GET /api/library/assets`: existing filters plus `generated=true`,
  `generationEntry=canvas|batch|simple|images|unknown`, `filename`, `generatedFrom`,
  `generatedBefore`, `unlabelledVehicle=true`; repeated `vehicleModel` remains.
- `GET /api/library/generated`: authenticated scoped progress, failure details and
  automatic first history scan. Navigation also initializes the owner's scan.
- `POST /api/library/generated`: `action=retry|rescan`, or
  `{action:"vehicle",selection:LibrarySelection,vehicle:string}` for manual edits.
- `LibrarySmartFolderField`: generated/is, generationEntry/equals|one_of,
  filename/contains|not_contains, generatedAt/before|after,
  unlabelledVehicle/is and vehicleModel/equals|one_of.
- Portable schema: `generated-image-schema.ts` and migration
  `007_generated_image_library.sql`; results, source links and scan cursors.

## 3. Contracts

- Original identity is SHA256 of serialized owner plus persisted original URL,
  including meaningful query parameters. Different owners never deduplicate.
  Source associations have separate deterministic identities. No bytes are moved.
- Generated assets use an owner/URL/content namespaced cache fingerprint and a
  synthetic object key; neither authorizes object deletion. Existing upload
  content-hash deduplication and actual storage keys remain unchanged.
- Result states: queued, indexing, indexed, failed, excluded. Transactional claims
  and token fences prevent duplicate creation and stale index completions. Lease
  expiry gets one scheduled wake, not a polling loop.
- New model outputs are captured only after `persistRuntimeMedia` succeeds inside
  output writers. Async-local context propagates owner, entry, task and source.
  OpenAI/ToAPIs, Klein and Qwen are covered; Gemini currently produces text only.
- Runtime recovery receipts live in `data/generated-image-outbox`, never Trellis.
  Database failure retains receipts and logs an enrollment error. Replay/retry is
  indexing-only. If both recovery storage and database fail, return the already
  saved original, retain an in-process error and require retry before restart;
  never turn enrollment failure into another paid generation request.
- History scans use 30-record keyset pages, per-record transactional checkpoints
  and separate phases for model node outputs, queue outputs, original card
  candidates, corroborated posts, and reused-node associations. Exceptions preserve
  the last committed cursor and show failed state; explicit retry resumes it.
- Queue output and card candidate receipts survive failed/partial parent states.
  Generic post images need corroboration. Reused Canvas outputs can add links to
  existing evidence, not establish new generation proof.
- V1 GPT nodes without explicit model can return transcoded source fallbacks.
  Different output and input URLs therefore do NOT establish generation. Such
  ambiguous outputs remain uncertain. Never admit all post images or orphan files.
- Source timestamps retain `timeBasis`; only `saved` is an actual per-output save
  time. History shows task timestamps explicitly. Created time stays immutable for
  stable descending keyset pagination.
- Ownerless history remains administrator-only even if visibility becomes team.
  Ordinary owned sharing follows existing library rules.
- Removal creates an exclusion and never deletes original media/history. Direct
  lookup, SQL lists and tag suggestions honor exclusion even after stale metadata
  writes. Subsequent backfill cannot resurrect the image.
- Vehicle comes only from structured source fields and manual overrides. Sync and
  explicit AI tagging cannot replace manual/source vehicle information.
- Local reads reject traversal, arbitrary paths and symlink escapes outside the
  application's real public/generated root; cloud reads retain managed-URL policy.
- Normal Canvas and V1/V2 schedule filters share serialization/query rules. Only
  selection or explicit refresh changes snapshots; filter changes do not.

## 4. Errors

| Input/state | Result |
| --- | --- |
| Missing sign-in | 401, no scan or retry write |
| Unknown generation entry/date or cursor mismatch | Explicit validation error |
| Missing/unmanaged/corrupt/oversized image | Failed indexing/thumbnail; no substitute |
| Duplicate task reference | Existing asset plus idempotent source association |
| Excluded result | Remains absent; original still exists |
| Uncertain source | Counted as uncertain, not advertised as fully recovered |
| Source scan failure | Failed state with last checkpoint; retry does not regenerate |

## 5. Cases

Good: failed parent with one saved child indexes that child, later post adds a
source link, manual vehicle survives rescan, Canvas keeps its selected snapshot.
Base: no task output evidence means no import.
Bad: glob public/generated, enroll every persisted media file, infer vehicle from
a prompt, claim task updatedAt is exact generation time, or delete synthetic keys.

## 6. Verification

Baseline includes `generated_image_evidence_check.mjs`,
`generated_image_producer_check.mjs` and `generated_library_check.mjs` (isolated SQLite).
Opt-in loopback PostgreSQL: `node --env-file=.env.local
.trellis/verification/generated_library_check.mjs --postgres` uses/drops a unique
schema. No production rows or provider/storage writes.

`python .trellis/verification/generated_library_browser_check.py` intercepts every
API/media request at worker-disabled `BROWSER_BASE_URL` (rejects 3001); desktop and
mobile across professional/editorial/creator. Existing gallery/colors checks remain.

## 7. Wrong vs Correct

Wrong: `post.imageUrls.map(importImage)` or generic storage hooks.
Correct: provider output save -> durable provenance -> shared deduplication/index;
post/reference associations join an owner-matched proven original.
