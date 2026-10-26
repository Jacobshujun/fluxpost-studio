# Design

## Verified existing contracts

- Shared pool: library_assets; SQL/cursors in database.ts, domain in library-assets.ts.
- GeneratedPost.imageUrls is not generation proof; imageTasks describes inputs.
- image_generation_queue.outputUrls records Klein outputs; old jobs can be unowned.
- Canvas node runs hold type, inputs, outputs, attempts and image-each checkpoints;
  parent runs own identity. Bypass/input/preview/save/processing is not proof.
- Original cards carry candidateUrls and imageUrl; verify producer before admission.
- library-thumbnails.ts currently accepts managed remote addresses only.
- image-generation.ts/runtime-media-storage.ts have pre-existing OSS changes.

## Persistence

Add generated-result index and one-to-many provenance links to existing library
asset IDs. Identity is owner plus canonical persisted original URL, never across
owners. Do not strip meaningful cloud parameters. Use deterministic IDs, unique
constraints and transactional insert-if-absent, not read-then-overwrite. Record
original filename/time, entry, task/node/output identity and structured vehicle.
Keep exclusion tombstones independent of visible rows. Duplicate sync adds links
but preserves manual tags, collections, visibility and favorites.

Implement SQLite/PostgreSQL schema and migration parity. A durable enrollment
receipt/outbox makes crash recovery and indexing retry independent of paid model
execution. Failed enrollment is visible rather than silently discarded.

## Evidence and enrollment

Typed adapters consume queue outputs, Canvas model outputs/child checkpoints,
original card candidates and corroborated post references. Unproven post images
are uncertain; do not infer from paths or filenames. Post references join existing
evidence before adding links. Keep already-saved outputs from failed tasks.

New production records provenance at actual generated-output persistence, not
generic persistRuntimeMedia (also used for inputs/conversions). Propagate owner,
entry and stable task identity to OpenAI/ToAPIs/Klein/Qwen/Gemini/card writers.
Receipt each output immediately so a later image failure cannot lose earlier ones.

## Backfill

Persist source-specific keyset watermarks, counters and record errors. Bounded
pages and transactional leases avoid concurrent counter corruption. Idempotent
receipts make replay safe. Unknown evidence differs from read/index failure.
First backfill is a durable automatic job; no unbounded browser request or hidden
polling loop. Explicit reconciliation must respect exclusions.

## Shared query/UI contract

Add generated-only, entry, original filename, generation-date and unlabelled vehicle
filters. SQL EXISTS source predicates avoid duplicates; authorization precedes
counts and pages. Generation time is immutable for stable cursor ordering.
Extend smart-folder validation/compiler/editor with equivalent rules.

Gallery adds generated navigation, badges/details, status/retry and removal wording.
Single/batch vehicle edits use manual overrides. Both Canvas selectors serialize
new fields through draft normalization and V1/V2 snapshots; never auto-refresh.

## Media and rollback

Reuse URLs. Local reads resolve only controlled application-generated roots with
encoded traversal and symlink protection; reject arbitrary absolute request paths.
Managed cloud policy remains. Missing media produces an explicit error.

Additive rollout; no real data backfill in tests. Rollback disables enrollment, not
original files/provenance. Dirty OSS work blocks candidate activation, not tests.
