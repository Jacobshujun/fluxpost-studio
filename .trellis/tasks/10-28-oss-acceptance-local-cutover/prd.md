# OSS acceptance and local cutover

## Goal

Finish the existing cloud migration with minimal operator work, preserve all
materials and existing application features, and prepare a reversible local-only
storage switch. Do not repeat the completed bulk copy.

## Confirmed facts

- User approved task creation and subsequently approved Stage A read-only checks
  on 2026-10-28, then explicitly requested execution of the described backup,
  incremental copy, reference/config changes and local activation. Production and
  source deletion remain excluded; readiness gates still apply.
- User confirmed concurrent Wonder Image updates are intentional; preserve them.
- User confirmed the new api/ directory is intentional. It contains eight local
  credential text files; do not read or commit them. Exclude this secret directory
  from Git rather than mixing it into the migration commit.
- Aliyun managed copy ended on 2026-10-27 at 21:53:46 Asia/Shanghai.
- Local report parsing found 71,400 unique source keys: 41,215 transferred and
  30,185 skipped (all SKIP_SYNC). All source/destination keys, sizes and CRC64
  values match. Separate skipped records match the total list exactly.
- Source and destination bytes total 218,923,370,125; skipped bytes total
  117,912,675,594. Source MD5 values are unavailable. These are report facts,
  not a fresh cloud inventory or independent full content verification.
- Prior full local database backup is from 2026-10-27. User prefers manual backups.
- Existing migration implementation/evidence is in the 10-23-tos-oss-migration task.

## Requirements

- R1: First perform read-only, bounded media acceptance and scoped inventory.
  No provider generation, Feishu writes, uploads, deletes or runtime changes.
- R2: Identify new, missing and size-changed keys relative to the completed report;
  distinguish migration report objects from application media.
- R3: Check representative ordinary-library, generated-image and collected-video
  delivery, including browser preview, strict TLS and video Range support.
- R4: Before any later switch, explain unresolved risks and obtain separate approval
  for write freeze, manual backup, delta copy, reference changes and activation.
- R5: Preserve current features, ownership and unrelated OSS objects. Keep TOS
  at least seven days after an eventual switch; deletion needs separate approval.
- R6: Keep credentials, object lists, runtime references and receipts ignored/local.
- R7: User now requests a lightweight Chinese CLI before cutover. Default migration
  entry must show dated real evidence, current phase, elapsed time and counters;
  offer refresh, confirmed continuation and sanitized logs. Reuse existing work,
  add no web app/service, and never start the old bulk worker by accident.
- R8: The CLI must refuse concurrent execution, unsafe paths, dirty activation,
  stale/incomplete evidence and unsupported recovery. Failures stop the pipeline;
  stopping the viewer is not rollback. Database rewrite remains transactional.
- R9: User approved preserving unknown/missing historical URLs and changing only
  verified OSS references. User subsequently explicitly requested full cutover now
  without reducing history scope. Execute confirmed CLI after verification/commit;
  preserve library and copy-library data and retain TOS.

## Acceptance

- Read-only stage reports coverage, failures, inventory differences and limitations
  in plain language; report equality is never described as fresh cloud proof.
- Cutover readiness requires verified media delivery, a final stable inventory,
  exact reference-change scope, backup/restore evidence and rollback instructions.
- Local cutover, if separately approved, preserves historical previews and new
  uploads and passes existing offline checks and approved runtime acceptance.
- Local full cutover was explicitly authorized and completed on 2026-10-28;
  live acceptance and remaining limitations are recorded in verification.md.

## Out of scope

Production deployment, source deletion, automatic backup scheduling, restoring the
retired generated library, unrelated refactors, bucket-wide access-policy changes,
and automatic retries or restarting the old local copy worker.
