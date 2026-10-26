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
