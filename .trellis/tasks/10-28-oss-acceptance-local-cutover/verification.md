# Read-only acceptance - 2026-10-28

## Authorization and runtime

User approved Stage A only. No cloud writes/deletes, database writes, new backup,
provider calls, Feishu writes, activation, production access or automatic retries.
Preserved intentional Wonder Image changes. Git HEAD is documentation commit
0c6ac4b; live LAN candidate reports 57cba03. No application source was changed.

## Managed-copy report (local files)

71,400 unique keys, 41,215 transferred and 30,185 skipped with SKIP_SYNC. Source
and target path, size and CRC64 match for every row. Separate skipped records
match the total-list subset exactly. Total bytes 218,923,370,125, including
117,912,675,594 skipped bytes. MD5 comparison unavailable on the source side.
This is dated service evidence, not independent current content verification.

## Fresh cloud inventory

Read-only scoped List calls between 09:36:35 and 09:36:48 Asia/Shanghai:

- TOS: 71,552 application objects.
- OSS: 71,400 application objects plus two migration report objects, excluded
  from media comparison.
- All 71,400 reported keys exist in both current inventories with matching sizes.
- No reported source key disappeared or changed its listed size/modified time.
- 152 source-only keys absent from the dated report: 130,384,944 bytes (about
  130.4 decimal MB). Categories: 96 generated and 56 crawled media; extensions:
  86 JPG, 22 PNG, 44 WebP. No source/destination shared-key size mismatch.
- This is not a write-frozen snapshot; repeat final inventory before cutover.
  Same-size edits are not excluded by size comparison; cross-provider ETags
  are not treated as portable hashes.

## Media samples

Eight unique small objects: five JPEG/PNG/WebP images and three MP4/MOV videos;
both transferred/skipped groups and a library-path object are represented.
Public HTTPS source/target GETs returned 200. Complete bytes matched SHA-256 and
expected sizes for all eight; images also decoded with Sharp. All three OSS
video Range 0-31 requests returned 206 with correct Content-Range and bytes.

Real headless system Chrome, with TLS checks enabled and no app API access,
loaded all five images and advanced playback in all three videos. Only eight
allowlisted OSS GETs occurred; no blocked requests. Node body reads were
1,842,074 bytes; including browser reserved reads, the budget was 2,763,063 bytes,
below 32 MiB. This samples delivery, not full authenticated app/Feishu acceptance
or complete long-video playback. OSS returns Content-Disposition: attachment;
embedded previews work, but top-level navigation may download instead.

Initial inspection refused inherited NODE_TLS_REJECT_UNAUTHORIZED=0 before any
network activity. Inspection child processes then explicitly used strict TLS;
no persistent environment or running-app setting was changed. The source public
base is configured as a hostname, so the checker explicitly builds its HTTPS URL.

## Read-only database discovery

Dedicated diagnostic connection used BEGIN READ ONLY and ROLLBACK; no app stores
were imported. Scanned 82 text/JSON columns in 15 selected media/workflow tables.
Source-domain references occur in 11 tables / 12 columns, including 2,301 library
assets (both public_url and data_json), 8,429 generated posts, 6,236 runtime posts,
29 workflow definitions, 37,264 runs and 111,516 node runs. Counts overlap and are
not unique objects. Queue references also exist; do not replace strings blindly
or replay old publishing jobs. Only aggregate counts were exported.

This is a first reference map, not a complete discovery of every signed/encoded
URL, filesystem outbox, config overlay, database field or local/production consumer.
Those boundaries and post-switch rollback remain design gates before mutations.

## Verification and limitations

- Offline scope, traversal, HTTPS-origin, byte-budget, redaction and no-cloud-write
  call checks passed before live access. These helper checks are not full unit tests.
- Existing baseline was invoked and failed at the initial context budget:
  typical code-task context 73,911 bytes versus limit 71,680 (before status edits).
  It did not reach domain tests/lint/build. No gate was weakened, and unrelated
  context documents were not rewritten to bypass this existing blocker.
- Final baseline re-run also stopped at context budget (72.45/70 KB before the
  final wording edit); log .tmp-oss-acceptance-baseline-final.log. git diff --check passed.
- No independent whole-dataset download/hash pass; report CRC64 and fresh listings
  are distinct evidence. No final write freeze, delta copy or current backup yet.
- Initial database discovery passed; exact transactional mapping/rollback design
  remains pending. No claim of cutover readiness or completed migration feature.

## Local evidence

Ignored test-artifacts/oss-acceptance-20261028/ contains reported.json,
samples.json, sample-results.json, browser-results.json, inventory.json, delta.json
and downloaded sample bytes plus reference-summary.json. Operational read helpers
are ignored .tmp-oss-acceptance.mjs, .tmp-oss-browser.py and
.tmp-oss-reference-scan.mjs. Baseline output is ignored
.tmp-oss-acceptance-baseline.log. Keep object paths and raw reports out of Git.

Next: finalize reversible reference mapping, then obtain separate approval for the final
write freeze, current backup, incremental copy, scoped reference updates and
local activation. Do not launch the old local bulk worker or delete TOS.

## Authorized execution checkpoint - 2026-10-28

User explicitly requested execution, then confirmed api/ was an intentional
concurrent addition. Its eight text files are operator credentials (contents not
read); added /api/ to .gitignore to prevent accidental secret commits. No application
source was edited. The current application/listener and source files are untouched.

### Backup

- Private data/backups/oss-cutover-20261028/ is ACL-restricted to the current
  Windows account and SYSTEM. It holds runtime.dump, .env.local backup and receipt.
- Online exported PostgreSQL snapshot: 09:56:31 CST. Custom-format dump size
  785,855,528 bytes; SHA-256 recorded locally; pg_restore --file=NUL decoded the
  entire archive successfully. No restore into the active database occurred.
- Role cannot CREATE DATABASE and is not superuser; no full restore drill was
  possible. No privilege changes. This online backup is not a final cutover freeze.

### Task preflight

No live leases in Canvas/simple/image/publish/original/tagging queues at inspection.
Canvas had 61 historical running rows but zero runnable queued entries; image queue
had 30 old runnable records and one old running record. Instrumentation has no
standalone image-generation queue worker, but these records were not reset, deleted
or retried. Recent completed/failed Canvas and publish writes exist. This is not
proof that all producer activity is frozen; listener was not stopped.

### Delta copy

- Fresh inventory at 09:57:30 CST found 185 source-only files / 263,731,668 bytes,
  up from the earlier 152-file snapshot. Target shared-key sizes matched.
- Bounded single-worker helper called the existing tested bulk-core copyOne only
  for the missing set. Maximum admitted scope: 500 objects / 512 MiB; strict TLS,
  no automatic retries, source conditional reads, target create-only multipart,
  fsynced intent/verification receipts. No old bulk runner restart.
- Target bucket identity, region, Standard/public-read defaults and encryption
  default checked before writing; no bucket-wide policy changes.
- 09:59:57-10:01:45 CST: all 185 uploaded and verified with full SHA-256 and
  metadata checks. Zero failures; 263,731,668 bytes verified. No existing object
  was overwritten, and no source object was deleted.
- 10:09:29-10:09:42 CST fresh listing: 71,585 source and 71,585 target media keys,
  zero source-missing/target-extra/size-mismatched media keys. Two OSS migration
  reports excluded. This is not an atomic/frozen inventory or full rehash of old
  objects; final local cutover still requires its own quiescence gate.

### Historical-reference discovery

Read-only cursor scan across accessible public text/JSON columns (excluding account
and session tables) inspected 171,515 matching column rows. It found 55,425 unique
candidate object keys, including 535 not in either inventory. Token parsing can
truncate paths: 46 candidates are prefixes of existing longer keys. Do NOT equate
535 candidates with 535 confirmed lost files or impacted users.

Three library-path candidates received anonymous HEAD on both providers: all six
responses were 404. This confirms existing historical gaps for these samples,
not a failure of copying the enumerated source objects. Separately checked all
2,301 current library assets: object keys exist in TOS inventory and public URLs
decode to those exact keys. No current library inventory omission was found.

Propose preserving historical missing/ambiguous references unchanged and mapping
only verified target objects; await operator review before database mutation.
Do not auto-delete old records or replace filenames by guess. No DB/config changes,
new provider jobs, Feishu writes, listener restart or production deployment occurred.

### Checks and receipts

- node .trellis/verification/bulk_migration_check.mjs: PASS.
- node .trellis/verification/oss_storage_check.mjs: PASS.
- git diff --check and feature JSON parsing: PASS.
- Full baseline remains blocked at the documented context-budget gate; no waiver
  or falsely claimed build/app acceptance. Re-run result retained in ignored log.
- Raw receipts remain ignored: delta-latest.json and delta-*/ manifest/journal/
  summary, post-delta-summary.json, url-scan.json and historical-missing-head.json
  under test-artifacts/oss-acceptance-20261028/. Backup details remain in its private
  backup directory. Helpers .tmp-oss-backup.mjs, .tmp-oss-delta.mjs and
  .tmp-oss-url-inventory.mjs are local operational artifacts, not application code.

## CLI delivery and pre-cutover verification

Maintained helpers now live in scripts/storage/cutover-*.mjs and cutover-local.ps1.
Default npm run migrate exposes Chinese status/refresh/continue/logs. Legacy copy
commands moved under explicit copy subcommand. No background service added.
Status shows dated evidence rather than fabricated percentage; stage boundaries,
elapsed time, counters and safe errors are persisted under ignored data/oss-cutover.

Offline cutover controller, historical CLI and verified-reference checks passed.
Changed-source lint and TypeScript pass. Prior production build, built-config sync,
isolated HTTP smoke and SQLite pass on unchanged application source. Full baseline
passes domain checks then fails at the known 17 ignored-data-script lint errors;
context budget was fixed by archiving old verification prose, not weakening limits.

PostgreSQL TEMP test verifies string-only JSON rewriting, preservation of large
numeric lexemes, optimistic update, persisted hashes and exact reversal. Live dry
run identified about 161,204 rows / 163,505 cells across 12 tables; no updates yet.
Unknown/signed/missing references remain unchanged. Source TOS retained.

User requested full cutover after CLI development. Core preservation receipt now
records 1,637 copy entries, 2,301 assets, 24 collections, 2,230 memberships,
5,302 labels, one favorite and seven smart folders. Non-URL core tables must retain
their exact content digests after activation. Counts are a point-in-time snapshot.
