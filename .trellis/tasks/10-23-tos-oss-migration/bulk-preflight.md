# Authorized bulk-copy preflight - 2026-10-26

Superseded gate: user subsequently confirmed no lifecycle rules. Live copy and
runtime progress pointers are in `bulk-run.md`; earlier not-started text is history.

User explicitly requested full migration after commit 6128b6b. This authorizes
copying the confirmed source prefix with same keys and verification, not bucket
policy changes, unrelated overwrites, history rewriting, deletion or activation.
No additional PUT/DELETE was performed in this preflight turn.

## Fresh inventory

Capture started 2026-10-26T11:16:31.981Z. These are live listings, not an atomic
snapshot; final freeze and differential scan are still required.

- Source prefix fluxpost/flux-lightmoment/: 69,263 objects, 213,102,381,749 bytes.
- Every listed source object has STANDARD storage class; no duplicate keys.
- Target whole bucket: 18,834 objects, 71,143,663,417 bytes; no duplicate keys.
- Same-key overlap: 8, exactly the known trial keys; no size mismatches.
  Size equality alone does not revalidate content; bulk resume must check hashes.
- Objects absent from destination: 69,255 / 213,101,333,919 bytes.
- Immutable local inventory copy (contains private keys, never commit):
  test-artifacts/tos-oss-bulk-preflight-e6e9bb05-492e-471b-aa51-dbccee731a2b.json.

## Destination safety gate

All SDK reads used secure HTTPS, V4, NODE_TLS_REJECT_UNAUTHORIZED=1 and no retries.

- GetBucketInfo: 200; location oss-cn-guangzhou, storage class Standard,
  public-read ACL, default SSEAlgorithm None. Owner identifiers not recorded.
- GetBucketACL: 200, public-read. No ACL modifications.
- GetBucketLifecycle: 403 AccessDenied, message "The bucket you access does not
  belong to you." Repeated once with same result.
- GetBucketVersioning: 403 AccessDenied; version policy unknown.
- GetBucketEncryption: 403 AccessDenied; default encryption can be read via
  BucketInfo, but this does not grant policy-management access.

Do not interpret inability to read lifecycle as an empty rule set or as proof of
invalid credentials. Object list/read and earlier trial writes worked. No new
credentials or broad administrative grants are requested. Actual caller/bucket
ownership and delegation remain unknown.

Bulk transfer has NOT started: automatic deletion/archival rules affecting the
prefix must be inspected first. User/provider can supply a lifecycle settings
screenshot/export (including rules matching all objects, prefix, or tags), or
grant the existing principal narrowly scoped read-only lifecycle access. Review
versioning if available as well. Do not change/delete rules without approval.

## Continuation

Once lifecycle safety is confirmed, implement/test the bulk engine (the trial
script is NOT suitable): bounded concurrency, immutable manifest, source-version
conditional reads, exact key/MIME/metadata preservation, destination create-only
PUT, streaming SHA-256 source/destination verification and durable per-file journal.
For existing differing content stop and report; never overwrite just because size
or ETag matches. Resume must validate the target against the journal, not silently
skip failed/partial items. No source deletes or application config changes.

This is local-SDK execution scope based on the performed trial, not evidence that
Aliyun's managed connector works. A managed transfer would require its own role/
connector/cost validation. Production effective configuration is still unverified.

## Verification

No application code changed. Project baseline rerun passes deterministic domains
then stops at the known 17 ignored runtime-script lint errors / 17 warnings.
Evidence: .tmp-oss-bulk-preflight-baseline.log. Context and diff checks pass.
Source, destination and application configuration remain unchanged by this turn.
