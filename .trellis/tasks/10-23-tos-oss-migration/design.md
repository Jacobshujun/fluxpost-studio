# Design

Keep the shared runtime-media boundary and key/URL helpers. Add an explicit
`RUNTIME_STORAGE_PROVIDER=tos|oss` selector (default tos), separate OSS settings
and an ali-oss SDK adapter translating HEAD/PUT/delete into the existing verified
client contract. Preserve existing exported TOS names where callers/API contracts
already depend on them; their status describes the selected backend. New logic
uses neutral selection helpers. Do not rename durable database fields or URLs.

Pending bytes are backend-specific (`data/tos-pending`, `data/oss-pending`), so a
provider switch cannot accidentally replay old files into the wrong backend.
OSS uses V4 signatures (target rejects V1). Inventory omits empty/undefined query
fields to avoid SDK signature mismatches; two-page offline fixtures enforce this.
Keep HTTPS validation enabled, no silent fallback to TOS or insecure custom host.
OSS preview URLs enter the existing media proxy, which redirects managed URLs
to their public origin. Thus browser/object delivery must be verified before switch;
the proxy does not hide attachment headers, ACL or TLS problems.

Read-only inventory uses explicit environment loading, List/HEAD/GET only, and
PostgreSQL READ ONLY transactions. Raw reports remain ignored local state; task
evidence records aggregates only. Never import app stores that initialize schema
or workers during inventory. Production config has both base env and a config
volume override; effective settings must be inventoried, not inferred from local.

Later migration needs an immutable per-environment manifest (key, length, MIME,
hash/version), streaming copy without key normalization, checksum comparison
(ETags are not portable content hashes), collision checks, differential re-scan,
DB/queue/snapshot/outbox reference map, backups and explicit rollback manifests.
No blanket text replacement across third-party URLs or signed query strings.
Rollback requires retaining source data and accounting for post-switch OSS writes.

## Authorized bulk implementation

User confirms destination lifecycle has no rules (operator evidence, not SDK proof).
Fixed bucket/prefix allowlist, private immutable per-job manifest and exclusive
writer lock. Two workers, at most 1 GiB per staged file. SHA-256 is computed during
conditional TOS GET to disk, then compared with a conditional full OSS GET. Create
only with x-oss-forbid-overwrite; existing objects must match bytes and supported
headers or stop. Forward MIME/cache/encoding/disposition/language/expiry and user
metadata (x-tos-meta-* to x-oss-meta-*); do not mutate bucket policy. Native modified
time is not writable in OSS: record source time in journal, not claim preservation.
Reject non-standard storage/append/symlink inputs for review. One persistent
append-and-fsync journal records write intent before upload and success only after
read-back verification. Stop dispatch on first error; current two objects may finish.
No automatic retries; rerun validates existing destination content rather than
trusting size or old receipts. Ctrl-C/STOP file stops dispatch without deleting
cloud objects; abrupt termination leaves staged bytes/journal for inspection.
Final write freeze and delta inventory remain separate from this live snapshot.

## Memory-only multipart continuation (user request)

The earlier attempt stopped on ABORT_ERR after 8,086 verified objects / 25.16 GB.
The reason for that network abort is not established. User requested the TOS SDK
range-read / OSS SDK multipart-upload approach without a local binary staging
file. A new attempt uses the same immutable manifest and exclusive writer lock,
eight workers each holding at most one 8 MiB payload buffer plus SDK overhead.
Each ranged TOS GET is conditional on manifest ETag and validates 206, Content-
Range, length and ETag. Initiate multipart with retained MIME/metadata/ACL, upload
one part at a time, then Complete with x-oss-forbid-overwrite. Abort an incomplete
multipart transaction on failure; this does not delete a completed object.
Source SHA-256 accumulates from chunks; target conditional ranged GET recomputes
the entire SHA-256. Existing objects are fully read/compared and never skipped by
size alone. Journal records multipart uploadId before first part. No binary is
stored on disk; progress and private receipts remain local. This still routes
network traffic through the Windows host; it is not cloud-to-cloud direct transfer.

## Production alongside migration

User requires content production and migration concurrently. Keep TOS/app workers
unchanged. Reduce migration to two workers with shared 4 MiB/s payload admission
pacing (not an OS-level instantaneous bandwidth cap). Use original manifest and
fsynced successful receipts from the same job only. Reuse SHA verification only
when receipt source ETag/time/size/hash and live source HEAD plus target ETag/size/
metadata still match; otherwise full verification or explicit source-change error.
Receipts are not a frozen global audit: final delta/full verification remains.
Retry only idempotent SDK HEAD/GET/upload-part calls for explicit network codes or
408/429/5xx, max three attempts with 1s/3s waits and visible retry records. Never
retry ambiguous multipart init/complete, authorization, collision or integrity errors.
Unknown RequestError remains an error unless an underlying transient code exists.

## Operator CLI

Chinese menu plus status/watch/start/stop commands via npm run migrate. No SDK
calls in status/watch; display latest attempt verification separately from loaded
historical proofs and new uploads. Watch polls only local status, Ctrl-C exits
viewer, not worker. Start reuses current job's hash-checked immutable manifest,
requires explicit confirmation and existing operator lifecycle evidence, detects
active worker/lock, and launches detached windowsHide Node with strict TLS and
private per-launch log files. Do not edit/stop existing bulk worker to test CLI.
Separate controller lock serializes operator actions. Dead locks are removed only
after proving PID absent; unrelated/unknown PID is an explicit manual-review gate.
STOP writes the existing graceful-stop marker; never kill process or clear it
while a worker lives. Default non-TTY invocation is read-only status, not writes.
This is current fixed-manifest resume, not automated inventory/delta/cutover.
