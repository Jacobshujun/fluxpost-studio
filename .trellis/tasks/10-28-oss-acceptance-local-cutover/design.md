# Design

## Boundaries

Keep this as one sequential operational task: inventory findings determine the
reference mapping and delta required for cutover. Do not dispatch agents. Preserve
the current worktree and authorized Wonder Image changes.

First stage is read-only. Use explicit List/HEAD/GET operations with TLS verification
and no automatic retries. Scope both inventories to fluxpost/flux-lightmoment/;
exclude aliyun_import_report/ from application-media comparisons. Prefer the
official OSS endpoint, not the previously failing custom domain.

## Evidence flow

1. Use user-supplied total/skipped reports as the dated copy snapshot.
2. Select at most eight representative images/videos from transferred and skipped
   groups; include ordinary-library material when identifiable from read-only data.
3. Limit initial sample body reads to 32 MiB aggregate; HEAD larger objects and use
   bounded Range reads. Record skipped coverage rather than downloading huge media.
   Browser media checks must also respect the budget; inspect small fixtures first.
4. Read scoped source/target object listings and compare keys/sizes with the report.
   List ETags are not portable cross-provider content hashes. Identify same-size
   possible changes using available versions/times/checksum evidence; do not claim
   equality merely from size. An unfrozen inventory is provisional.
5. If database reference discovery is needed, use the dedicated read-only connection
   in a READ ONLY transaction. Never import stores that initialize schemas/workers.
   Export aggregate counts only to task evidence.

The existing scripts/storage/inventory.mjs is reference material, not a command to
run unchanged: its target listing is bucket-wide, its sample may be unrelated, and
it probes the custom domain. Reuse safe SDK setup with scoped explicit operations.
Store raw evidence under ignored test-artifacts/ or data/, not in task documents.

## Later cutover design gate

Pending read-only findings: enumerate exact database fields, queues, snapshots,
outbox references and config layers requiring change. Do not replace arbitrary URL
substrings or alter unrelated services. Review source/target public permissions and
Content-Type/Content-Disposition behavior without modifying bucket policies.

After separate operator approval, quiesce new writes and drain work, create and
validate a current database backup, capture relevant config securely, establish the
final delta and verify it, then apply a reviewed reversible reference mapping and
storage setting. Backup and reverse mapping must exist before mutations.

Any code repair requires existing verification, commit, and clean primary-worktree
activation via npm run local:lan or npm run local as appropriate. No alternate
worktree or port-3001 bypass. Production is a separate approval and task scope.

Rollback must account for new OSS objects written after switching: reverting only
the provider setting can orphan these references. Retain both stores and use an
explicit write-freeze and object/reference reconciliation before rollback. Define
the exact procedure after the inventory; no cutover until this gate is resolved.

## Historical-reference finding and proposed boundary

Full text/JSON discovery found historical addresses not represented in either
current cloud inventory. The token scanner reports 535 candidate keys; 46 may be
truncated tokens matching longer keys, so this is NOT a confirmed missing-file
count. Three library-path candidates were checked with HEAD and return 404 on
both providers. All current 2,301 library assets have valid source object keys.

Proposed mapping must parse exact source URLs, preserve object keys and unsigned
query/fragment components, and change only references whose objects were verified
at OSS. Preserve unknown/missing/signed/ambiguous references verbatim, recording
aggregate exceptions for review. No blanket hostname replacement, broken-reference
deletion, filename guessing or rebuilding retired generated indexes. User review
of this preservation policy is needed before mutation; unresolved references block
any claim of full historical independence from TOS or source deletion readiness.
