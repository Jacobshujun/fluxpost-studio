# Integrated OSS trial and commit evidence - 2026-10-26

This file supersedes earlier "no copy" statements in verification.md. Those entries
describe preparation before the user authorized a small trial. The user later
confirmed other-window Qwen/library commits and requested one integrated commit of
the remaining work. No push, activation, full copy or production switch authorized.

## Preserved upstream work

- Qwen image node: 0b775c7, with subsequent documentation commits.
- Generated image library: bbe4ff9, archived by 0d17775.
- Both already exist in branch history. Do not squash, amend, duplicate or revert.
- Shared config/storage tests and baseline must include both features and OSS.

## Actual trial (previous turn)

- LOCAL SDK transfer, not Aliyun online-migration service. Eight same-key objects,
  1,047,830 bytes; target public-read object ACL, create-only PUT header, no deletes.
- Authenticated source/target complete GET hashes match SHA-256 for all eight.
- Anonymous HTTPS GET returned 200 with equal bytes/hashes; six JPEG/PNG/WebP/GIF
  images decode and loaded in Chrome, including Chinese/space/emoji keys.
- MP4 and MOV parsed by ffprobe; later strict-TLS Chrome muted playback reached
  ended at 0.3s and 1.973991s respectively, with nonzero video dimensions.
- Both video Range bytes=0-31 requests returned 206 / 32 bytes and correct totals.
- Official host responses use Content-Disposition: attachment. Embedded preview
  passed, but top-level navigation/download behavior is not equivalent to inline.
- Logs: test-artifacts/tos-oss-trial-2026-10-26.json and
  test-artifacts/oss-trial-video-verification.json (ignored local data).
- No local/production config switch or historical-reference rewrite occurred.
- These are small samples, not large-file/full-set integrity verification. Trial
  only copies MIME and bytes, not the full metadata contract required for migration.

## Inventory caveat

The recovered after-trial inventory was captured at 2026-10-26T10:39:33.780Z.
Compared with the earlier 18,580-object inventory it contains 18,699 objects:
165 added (8 trial, 157 other), 46 earlier keys absent, 0 changed ETag/size among
surviving earlier keys. Net bytes grew 438,892,322, NOT just the trial's 1,047,830.
This interval includes other writers. Neither actor nor reason for differences is
confirmed. Do not claim the whole bucket was unchanged apart from the trial.
Fresh coordinated inventories/version review are mandatory before full migration.
No attempt was made to repair, restore or delete these unrelated objects.

## Script hardening before commit

- --apply-trial required before credentials/SDK activity; no default write.
- At most 20 selected objects / 10 MiB, positive sizes and source-prefix boundary.
- Both inventory and fresh target HEAD collisions stop; PUT forbids overwrite.
- Unique local receipts save upload intent before PUT, upload result before GET and
  verified size/hash/MIME after GET, retaining partial evidence on failure.
- Executable offline fixtures cover no authorization, budget, inventory/live
  collisions, mismatched content and successful durable receipts. No live replay.
- This is a bounded operator tool, not a resumable full migration engine. Source
  version pinning, full metadata/ACL policy, frozen manifest and delta plan remain.

## Verification of combined tree

- Combined baseline: generated provenance/producer/library, Qwen contracts/runtime/
  persistence, OSS, trial safety and all other deterministic domains pass. Stops at
  existing 17 ignored runtime-script lint errors / 17 warnings; gate unchanged.
- Tracked/new source ESLint: 0 errors / 16 existing warnings. TypeScript passes.
- Next production build and isolated built-config synchronization pass.
- Worker-disabled port-45678 HTTP smoke, SQLite and intercepted 1440/390 storage
  settings browser checks pass. No port-3001 activation.
- Logs: .tmp-oss-integration-baseline.log, .tmp-oss-integration-lint.log,
  .tmp-oss-integration-build.log. Secret/environment/runtime outputs stay ignored.

## Next

Finish commit only. Keep migration task/feature in progress. Obtain effective
production inventory and choose/validate actual full-transfer mechanism, review
target writers/lifecycle and costs, then separately authorize bulk copy. Final
write freeze, checksum verification, history rewrite, activation and production
approval remain. Retain TOS >=7 days after switch; deletion requires separate consent.
