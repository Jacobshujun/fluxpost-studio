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
