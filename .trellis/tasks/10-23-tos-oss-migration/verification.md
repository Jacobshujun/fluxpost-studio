# Preparation evidence - 2026-10-23

Latest evidence: `integration-verification.md` records the subsequently executed
eight-object LOCAL SDK trial and Qwen/library integration. Earlier no-copy/access
blocker statements below are dated history, not current state.

## 2026-10-26 correction and resumed read-only inventory

This section supersedes the earlier source-signing / target-permission diagnosis.
Desktop TOS/TOS.txt contains the same credentials as the local configuration;
desktop aliyun/aliyun_oss_key.txt matches the ignored project key file. Files were
parsed in memory; no secrets were printed or copied. Unrelated doubao_key.txt was
not read.

Root causes reproduced with bounded read-only calls:
- TOS list without continuationToken returns 200; explicitly passing
  continuationToken: undefined returns 403 SignatureDoesNotMatch. Omit unset
  pagination fields; do not change credentials.
- OSS SDK defaults to V1; bucket returns AccessDenied with message
  `V1 signature is forbidden.` V4 bucket-info succeeds (200); HEAD for a deliberately
  nonexistent key returns NoSuchKey (404). This was NOT evidence of missing IAM access.
- V4 list without empty fields returns 200; prefix: "" returns SignatureDoesNotMatch.
  Omit empty marker/prefix fields. Adapter and operator inventory now require V4.
- No permissions, runtime config, FRP, certificates, objects or database rows changed.

Completed live current-object pagination on 2026-10-26 (not a frozen cutover snapshot):
- Source prefix fluxpost/flux-lightmoment/: 68,017 objects, 208,709,146,015 bytes
  (208.71 decimal GB). Not an entire-bucket/version inventory.
- Target bucket: 18,580 existing objects, 69,731,332,790 bytes (69.73 decimal GB).
  Zero keys overlap with the source-prefix inventory, zero target keys under that
  prefix. Preserve ALL pre-existing target objects; do not treat target as empty.
- Actual existing target JPEG anonymous Range GET on official domain: 206,
  image/jpeg, attachment disposition, bytes 0-31/1821655. This is real object-read
  evidence but NOT browser image/video acceptance or proof of a copied source object.
- Same custom domain still fails ERR_TLS_CERT_ALTNAME_INVALID. A source library key
  still returns 206 on TOS and 404 on OSS. No copying has occurred in this task.
- Local read-only reference scan now covers 13 tables / 14 columns, including
  execution_logs. Live source data changes; final freeze/delta inventory remains.
- Raw object keys remain only in ignored .tmp-storage-inventory.json.
- Production internal access has not been reattempted or resolved.

New offline assertions cover V4 and two-page TOS/OSS inventory with no empty signing
parameters. Red test confirmed missing V4 before fix. Focused tests, changed-file
lint and TypeScript pass. Production build and isolated built-config factory check
pass. Full baseline deterministic checks pass, then stop at the same existing
17 lint errors / 17 warnings. Port 3001 remains f3f1d8a1e09e6eecdb29fad4f7edc83ecad6ee22.
No commit or activation. Logs: .tmp-oss-1026-baseline.log / .tmp-oss-1026-build.log.

User tutorial: https://help.aliyun.com/zh/data-online-migration/user-guide/migrate-data-to-oss
Extraction was attempted with installed Tavily CLI but requires authentication;
article body has NOT been read. Do not claim confirmed TOS/S3 connector support,
service fees, overwrite policy or managed migration setup based on this link alone.
Desktop TOS file supplies an S3 endpoint, but compatibility with Aliyun's managed
migration service remains to be checked in the guide/console before task creation.
No cloud migration job, upload or source cleanup has been started.

## 2026-10-26 readiness and guide follow-up

User authorized these read-only checks. Fresh paginated inventories:
- Source: 68,023 objects / 208,759,438,972 bytes; +6 objects / +50,292,957
  bytes versus the scan 7 minutes earlier. Live writes are occurring.
- Target: 18,580 / 69,731,332,790 bytes; 0 new/changed target objects between the
  two scans; 0 source-target key overlap; 0 target keys under source prefix.
- Source has 0-byte objects: 0; largest object 292,470,984 bytes; objects >5 GiB: 0;
  55 keys with whitespace; 65 keys with non-ASCII; 0 multi-part concerns inferred.
- Top source extensions: jpg 31,049; png 28,211; webp 7,572; mp4 1,178; gif 8;
  mov 5. These counts are current inventory, not a cutover snapshot.
- TOS HEAD on representative jpg/png/webp/mp4/gif/mov, whitespace, non-ASCII and
  largest keys: HTTP 200 with size, content-type, ETag, Last-Modified and no
  attachment disposition. This verifies bytes/metadata read, not full-target copy.
- Local source-reference scan: 14 columns across 13 tables; not a production scan.

Playwright read these official pages with normal certificate validation:
- migration implementation, updated 2026-10-14;
- background, updated 2026-09-15;
- preparation, updated 2026-09-21;
- subsequent operations, updated 2026-09-09.
The migration page lists 火山引擎对象存储 / TOS as a supported source. The page's
source-type controls are rendered in a narrow horizontal scroller; raw text exposes
the full sequence but did not expose a stable TOS tab selector to Playwright.
Do not claim the exact TOS-specific fields beyond what the page text states.

Confirmed guide constraints relevant to this migration:
- Aliyun migration service does not guarantee consistency/completeness; full
  verification is the operator's responsibility.
- Same-key target files are overwritten under "全部覆盖"; "不覆盖" skips them.
  Current scan has no overlap, but recheck immediately before task creation.
- Source prefix must omit leading slash and end with slash. Applying both source
  and destination prefix fluxpost/flux-lightmoment/ should preserve relative keys.
  UI behavior must still be verified with a small sample.
- A single task handles one bucket; 68k objects is not an account-wide scope.
- Attributes not guaranteed across providers include StorageClass and ACL. Public
  image/video delivery must be tested after copy; official-domain sample Range GET
  alone is not enough.
- Preparation requires a RAM user, migration-service permissions, source
  list/read/metadata credentials, destination list/get/put/abort permissions
  (prefer automatic role authorization), and lifecycle/KMS awareness if configured.
- "后续操作" manages reports/jobs; the service still does not replace content
  verification. "同步任务" documentation may be evaluated later for delta sync.

No task, RAM role, source/destination address, copy, rewrite, config switch,
restart, commit or deployment was created. No paid call. TOS remains source.

Final 2026-10-26 readiness rerun: focused OSS/inventory tests, JSON, changed-file
lint, TypeScript and full baseline deterministic domains pass; baseline again stops
at the pre-existing 17 lint errors / 17 warnings. No production build was necessary
after the latest guide-only/migration-script changes, but the preceding build and
built-config test passed. 3001 runtime remains f3f1d8a1e09e6eecdb29fad4f7edc83ecad6ee22.

### TOS-tab and final readiness confirmation

The migration page has a hidden-selector TOS tab (DOM id changes per render).
Clicking the tab by its current id exposed the following guide facts:
- Source type: Volcengine TOS; domain must be the TOS table's S3 Endpoint.
- Source AccessKeyId/SecretAccessKey, bucket, optional prefix ending in `/`.
- Supported TOS attributes: x-tos-meta-*, LastModifyTime, Content-Type,
  Cache-Control, Content-Encoding, Content-Disposition, Content-Language, Expires.
- Not migrated: StorageClass, ACL, server-side encryption, Tagging, and other
  unlisted attributes may be undefined. HNS buckets are unsupported.
- If TOS is not S3-compatible, the guide recommends HTTP migration instead.

A second fresh scan at 03:08:48Z found source 68,030 objects / 208,786,696,759
bytes and target unchanged at 18,580 / 69,731,332,790 bytes; direct source-target
key overlap remains 0. Source grew 13 objects / 77,550,744 bytes over the first
2026-10-26 scan, confirming continuous writes. This is still a moving inventory,
not a final manifest. No copy/task/role/address exists.

Console draft: `.trellis/tasks/10-23-tos-oss-migration/migration-console.md`.
It deliberately marks console labels, migration pricing, effective production
configuration, target lifecycle/ACL/encryption/versioning and delta-task behavior
as pending confirmation. Exact TOS source domain from the supplied file is
`tos-s3-cn-guangzhou.volces.com`; source bucket is `seedance-gz-xpeng22365`.
  The TOS tab was later selected directly by its rendered DOM id and its guide
  fields were captured into the draft; production pricing/permissions remain pending.

## Delivered, not activated

- Secret excluded by `.git/info/exclude`, `.gitignore`, and `.dockerignore`.
  No tracked file/history entry for `aliyun_oss_key.txt`; credentials never printed.
- Explicit `RUNTIME_STORAGE_PROVIDER=tos|oss`, default `tos`; `OSS_ENABLED=false`
  by default. Separate masked OSS settings; no runtime environment file changed.
- OSS 6.23.0 adapter maps HEAD/PUT/stream/delete into existing verified media
  boundary. Object key builder unchanged. Backend-specific pending paths;
  failed-upload retention uses the operation's captured provider.
- Selected backend drives library, image generation, Canvas processing/upload,
  recovery and status. Old TOS URLs remain recognized during transition.
- Next externalizes ali-oss (its optional proxy-agent import cannot be bundled).
- Legacy `tos*` status fields, probe route and helper names remain API-compatible;
  some internal logs still use TOS wording. No historical data rewrite exists yet.

## Read-only inventory

Command (explicit operator action, never baseline):

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = '1'
node --env-file=.env.local scripts/storage/inventory.mjs --target
```

Raw report: ignored `.tmp-storage-inventory.json`. It can contain object keys;
never commit it. Inventory lists only current source prefix; future full migration
must also review versions, other prefixes, metadata/ACL, lifecycle and outbox files.

- Local configured provider is TOS, enabled, prefix `fluxpost/flux-lightmoment`.
- TOS ListObjectsV2: HTTP 403 `SignatureDoesNotMatch`. No complete count/byte total.
  Cause (credentials/signing/config) remains unconfirmed; public reads can still work.
- OSS ListObjects: HTTP 403 `AccessDenied`. Need confirmed ListObjects permission
  for xpai-imc; do not infer the key is invalid or that the bucket is empty.
- Read-only PostgreSQL transaction via dedicated diagnostic role: source host
  references in 12 tables / 13 columns. Largest counts: canvas_node_runs 105947,
  canvas_runs 35283, generated_posts 7875, runtime_posts 5717; library_assets 2301
  rows in each of public_url/data_json; feishu_publish_queue 1226. Counts are rows
  per column, not distinct objects, and are not a frozen final-cutover manifest.
- One existing library Object Key: source anonymous Range GET returned 206,
  image/png, attachment disposition, bytes 0-31/2127944. Same key on official OSS
  domain returned 404. This confirms that sample is not migrated, not OSS preview.
- Official target HTTPS root: TLS passed, HTTP 403. Custom domain:
  `ERR_TLS_CERT_ALTNAME_INVALID`. No TLS bypass, real target preview unverified.
- Local `/api/version`: f3f1d8a1e09e6eecdb29fad4f7edc83ecad6ee22.
  Production: 12982377aaa8a5dcbb2c31d711c24672af7e7e43. Both HTTP 200.
- Production SSH failed public-key authentication using default identity and
  fluxpost_codex_ed25519. No internal production inventory/config/DB access.
- Inherited shell environment had NODE_TLS_REJECT_UNAUTHORIZED=0 (first npm install
  warned). All storage/network probes explicitly set it to 1; adapter/inventory
  reject 0. Host/global environment was not edited. Remove unsafe inheritance
  before eventual activation; never use it to work around the custom certificate.

## Verification

- New OSS test initially failed on missing implementation; now passes selection,
  invalid provider, default-off, strict TLS/HTTPS, exact key, Buffer/stream mapping,
  HEAD/PUT/delete, 403 vs 404, size mismatch, library/recovery and dual-host recognition.
- Advanced config source and built factory tests pass masked credentials,
  save/reload/clear, invalid selection and API/worker shared config.
- Existing TOS and updated Canvas/HEIC consumer fixtures pass.
- Complete baseline deterministic domains pass. Full command stops at existing
  ignored import-script lint failures: 17 errors / 17 warnings. Not weakened.
- Tracked-source plus new-source lint: 0 errors / 16 existing warnings.
- TypeScript, Next production build, built config sync, isolated HTTP smoke on
  worker-disabled 45678 and SQLite check pass. No port-3001 restart.
- Mocked Chrome config UI passes at 1440/390: masked credentials, explicit provider
  selection, save/reload, no horizontal overflow; all APIs intercepted, no writes.
- Current npm audit reports 21 advisories (2 moderate/18 high/1 critical), including
  existing Next critical advisory; none names ali-oss. No forced/unrelated upgrades.
  Audit baseline counts in older docs are stale. Release security review remains.

## Next gates

1. Obtain authorized production read access; read effective production base and
   config-volume overrides. Source list/read and target V4 list are now confirmed.
2. Freeze/recheck complete manifests and source versions/ACL/MIME/metadata; approve
   the console trial copy. Browser image/video and Range acceptance remain mandatory;
   current byte probe is not a playable-video check.
3. Implement separate streamed copy with same keys, checksums (not cross-provider
   ETag equality), resumable manifest and collision detection; then full/delta copy.
4. Plan transactional reference rewriting across snapshots/queues/JSON/text columns,
   backups and rollback. Current runtime upload size verification is NOT migration
   content verification and must not be reused as proof of identical objects.
5. Approve final write freeze and production switch separately; retain TOS >=7 days
   after cutover, deletion only with separate confirmation. Account for new OSS
   writes in rollback. No source cleanup performed.

No commit, push, environment switch, object PUT/delete, reference rewrite or
production deployment was performed. Task remains in progress.
