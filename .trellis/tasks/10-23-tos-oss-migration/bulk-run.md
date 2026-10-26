# Live bulk copy - 2026-10-26

## Approval and scope

User requested full migration, then confirmed the provider page has no lifecycle
rules. Treat lifecycle safety as operator confirmation; SDK lifecycle/versioning
policy reads still return 403. No policy was modified. Full copy applies only to
the confirmed prefix fluxpost/flux-lightmoment/ in source bucket
seedance-gz-xpeng22365, destination xpai-imc/Guangzhou with identical keys.
This is a local SDK transfer, not an Aliyun managed job. It consumes local network,
source reads/egress, destination writes/reads/storage; no pricing total is claimed.

No source deletes, history rewrites, app restart, production release or provider
switch. Production effective configuration remains unverified. Keep source >=7
days after eventual cutover; deletion needs separate consent.

## Manifest and worker

- Frozen list capture: 2026-10-26T11:26:22.623Z (live listing, not atomic snapshot).
- 69,309 source objects / 213,275,063,400 bytes, all STANDARD in the list.
- Initial target overlap: 8 trial keys, preflight sizes equal; hashes rechecked.
- Input checksum/job id:
  b7f2674ee0721e9656a6a1741701c22e698556a53801eea3b026989e5ef73bed.
- Runner: scripts/storage/bulk-migrate.mjs; transfer boundary: bulk-core.mjs.
- First startup refused SourceConfigMismatch before writes: local TOS_REGION is
  unset. Corrected to the same cn-guangzhou default used by app and inventory;
  added executable regression. No credentials/config were changed.
- Launched hidden Node worker PID 46412 at 2026-10-26T11:35:19.451Z.
  Always verify PID/command line and lock before assuming this process still runs.
- At 11:35:37Z: 55 verified / 184,361,583 bytes; 47 new uploads, 8 existing verified,
  zero failures. This is only a progress snapshot, NOT completion.

Runtime state (ignored, contains object keys; never commit):
- data/oss-migration/progress.json: latest aggregate state and journal location.
- data/oss-migration/active.lock: active PID, job and attempt; exclusive writer.
- data/oss-migration/<job-id>/manifest.json: immutable source/target list.
- data/oss-migration/<job-id>/<attempt-id>/journal.ndjson: fsynced object receipts.
- data/oss-migration/<job-id>/<attempt-id>/staging/: at most two bounded files.
- .tmp-oss-bulk-worker-out.log / .tmp-oss-bulk-worker-error.log: sanitized worker
  output. Initial input path is in .tmp-oss-bulk-manifest-path.txt.

## Guarantees and limits

- Explicit --apply and FLUXPOST_OSS_NO_LIFECYCLE_CONFIRMED=1; strict TLS=1;
  fixed buckets/prefix/endpoints, V4, zero SDK retries, two concurrent workers.
- Reject invalid/duplicate/out-of-scope keys, non-STANDARD list entries, files
  >1 GiB, missing ETag/time, append/symlink types or changed source metadata.
- Source conditional HEAD/GET pins manifest ETag; size/time/metadata checked.
- SHA-256 streamed to a unique local file before any PUT. Target PUT has
  x-oss-forbid-overwrite=true. Existing target requires full byte hash verification.
- MIME/cache/encoding/disposition/language/expiry and x-tos-meta-* mapped to
  x-oss-meta-* are copied and checked; default target Standard/public-read/None-SSE
  was confirmed via BucketInfo. Native Last-Modified is not preserved; source time
  stays in the durable journal. Versioning/encryption/tags/ACL are not cloned.
- Full target GET uses If-Match; size/hash and final source/target HEAD required
  before verified receipt. Subsequent external mutations are not prevented.
- Journal intent is flushed before upload, uploaded receipt before verification.
  Failure stops new dispatch; the second in-flight object can finish. No retries,
  overwrites, policy changes or deletes are used to hide failure.
- Resumption revalidates source and existing target fully; it avoids repeated PUT
  but repeats reads/hashes. No blind checkpoint skipping. A changed source/target
  needs operator review/new manifest, not forced replacement.
- Background process is not a Windows service: PC shutdown ends it; abrupt death
  may leave a lock and staging bytes. Do not remove a lock without proving that
  its recorded process is absent. No external scheduler/automatic restart installed.
- Completion marker is snapshot-verified, not full migration/cutover. Live source
  continues writing, so another final freeze/delta inventory is mandatory.

## Operator actions

Read status without triggering cloud calls:

```powershell
Get-Content data/oss-migration/progress.json
```

Graceful stop (only on explicit operator instruction):

```powershell
New-Item -ItemType File -Path data/oss-migration/STOP
```

This stops new objects at task boundaries; wait for current objects and status
stopped/failed. It does not cancel objects already being uploaded or delete them.
Before resuming, verify process/lock, inspect failures and intentionally remove
the STOP marker. Use the exact original input manifest; do not replace it with a
moving latest inventory. Then run (requires authorized continuation):

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = '1'
$env:FLUXPOST_OSS_NO_LIFECYCLE_CONFIRMED = '1'
node --env-file=.env.local scripts/storage/bulk-migrate.mjs --apply data/oss-migration/input-b7f2674ee0721e9656a6a1741701c22e698556a53801eea3b026989e5ef73bed.json
```

## Checks

bulk_migration_check.mjs uses temporary files/fake SDKs: exact keys, conditional
reads, SHA mismatch, metadata mismatch, 403, concurrent collision, journal failure,
byte cap, source mutation, opt-in, exclusive lock, serialized counters, two-worker
bound, STOP and fail-fast behavior. Registered in offline baseline. No live writes
from tests. Red test preceded implementation. Default-region regression passes.

Final checks: both initial and final complete baseline runs passed deterministic
domains then stopped at the known 17 ignored-runtime-script lint errors / 17
warnings. Changed-file ESLint, TypeScript and diff checks pass. No application code
changed, so no server build/restart was needed. Evidence:
.tmp-oss-bulk-final-baseline.log. Bulk scripts are included in the authorized LAN
release commit; exact launch-code
SHA-256 fingerprints are saved beside the runtime journal. Do not edit/restart the
runner during a live attempt without reviewing the lock and progress.

At 11:40:45Z: 1,008 objects / 3,188,512,227 bytes verified (1.50% of manifest
bytes); 1,001 uploaded, 8 existing verified, zero failures. Uploaded may lead
verified while a file is awaiting read-back. Worker PID 46412 remains running;
read progress.json for newer state. No final delta or completion claim.

User subsequently authorized commit and LAN activation. The restart script builds
an inactive slot before stopping only the listener on 3001. Bulk PID 46412 is not
that listener and remains independent; its running code hashes must match source.
Pre-release snapshot: 3,274 verified / 10.37 GB, zero failures. Effective local
config (including persistent override) remains provider=tos, TOS_ENABLED=true,
OSS_ENABLED=false. No configuration values or credentials are included in commits.
