# Library names and simple-run material repair plan

Date: 2026-10-27. Planning only; no application or runtime data changes.

## Evidence and uncertainty

- The existing material diagnosis establishes 24,197 TOS URLs and a roughly
  4.77-million-character text prompt. The automatic selection/prompt code predates
  the October OSS migration. This is not proof that cloud copying changed inputs.
- `src/app/page.tsx` maps every loaded vehicle-library asset to submitted IDs;
  missing the named root also permits an unfiltered paginated library query.
- `src/lib/openai.ts` and `src/lib/original-creation.ts` serialize material URLs
  into text prompts. API resolution preserves authorized IDs as URL snapshots.
- Gallery cards and the viewer display `asset.name`. Uploaded assets preserve
  `name` and `originalName` separately from a hash-based storage object key in
  `src/lib/library-assets.ts`.
- Generated-image enrollment derives names from URL basenames in
  `generated-image-evidence.ts` / `generated-image-capture.ts`. The indexer uses
  `INSERT ... ON CONFLICT(id) DO NOTHING`, not an existing-asset rename operation.
  Newly indexed generated assets are a hypothesis for changed visible listings,
  not a confirmed explanation for the reported name changes.
- Whether original asset metadata changed, which records are affected, and
  availability of an authoritative pre-change name mapping: pending confirmation.

## Ordered execution

1. Preserve evidence and stop further damage. Do not resume storage copying,
   switch storage, replay failed jobs, restart 3001 or call paid models. Before
   any data repair, make a protected backup and a reversible per-ID change set;
   neither private names, URLs nor database contents belong in Trellis.
2. Read-only name audit. Compare the same asset IDs across database name columns,
   JSON metadata, API responses and UI; compare available pre-change backups and
   original import provenance. Separate uploads from generated-index additions.
   Record aggregate counts and evidence, not private material contents. Check
   filters/order to establish whether the same assets are being compared.
3. Repair the confirmed naming layer only. A display bug changes the mapping/UI;
   a metadata overwrite requires an evidence-backed transactional per-ID restore
   and a fix to its writer. Respect subsequent manual renames with compare-before-
   write checks. Keep normalized columns and JSON metadata consistent. Missing
   source names remain unresolved; never infer a name from a hash or mass-replace
   names from URL basenames. Do not rename storage objects, change asset IDs,
   ownership, collections, references or binary content to fix display names.
4. Fix material overflow independently of the name audit: remove automatic
   whole-library submission from the ordinary UI, prohibit missing-root query
   expansion, and remove material URL inventories from rewrite/original text
   prompts. Keep explicit selections, permission checks and ordered image-model
   references separate. Preserve source text/instructions. No first-N slicing,
   silent truncation or increased provider limits as substitutes for this fix.
5. Protect resume behavior. Old snapshots remain immutable; text requests must
   not expand their stored material lists. Audit image-task consumers too before
   allowing an operator-approved replay of a historically polluted snapshot.
   Do not reinterpret old implicit lists as new explicit selections automatically.
6. Verify, review and release. Use isolated SQLite/PostgreSQL fixtures and mocked
   provider requests. After checks and explicit release approval, commit the
   verified changes and activate the clean primary-worktree candidate through
   the documented local entry. No storage cutover is part of this repair.

## Affected files and verification

- Expected overflow edits: `src/app/page.tsx`, `src/lib/openai.ts`,
  `src/lib/original-creation.ts`; inspect simple API, normalization and resume
  consumers before deciding additional edits. Existing PRD/design still apply.
- Name edits remain conditional on audit evidence: library mapping/view,
  generated enrollment or the demonstrated metadata writer. No blind schema or
  database rewrite is approved by this plan.
- Rewrite and original request capture: empty, small and 24,197-URL fixtures have
  unchanged prompt size and unchanged source/instruction text; inventory URLs
  are absent. Verify old-snapshot request construction without real replay.
- Ordinary submissions have no implicit material IDs; missing-root tests issue
  no unfiltered query; explicit viral image selection retains order and access
  checks. Test actual requests, not just source-text assertions.
- Names: Chinese/spaces/percent signs, manual rename, generated/upload separation,
  storage-key independence, listing/search/detail/download consistency and
  rollback/conflict behavior where a data repair is actually needed.
- Run focused checks, mocked desktop/mobile checks, lint, types, build and the
  documented baseline. Known ignored-script lint failures must be reported, not
  suppressed; passing isolated checks is not full release acceptance.

## Delivery boundaries

Deliver a root-cause report for each symptom, minimal fixes, regression evidence
and (only if needed) a previewable reversible metadata repair. Filename recovery
is not promised until an authoritative mapping exists. No feature is done and no
live replay/storage migration is authorized by this planning document.

Planning verification: documented baseline rerun stopped at the existing lint
gate (17 errors, 17 warnings); it is not a passing full baseline. Local ignored
log: `.tmp-tos-repair-plan-baseline.log`. `git diff --check` passed.
