# In-memory multipart continuation

## 2026-10-27 authorized resume

User asked to continue. Prior PID 5092 had exited; progress recorded failed at
2026-10-26T14:35:01.998Z with RequestError, 30,184 verified objects and
117,899,533,182 bytes, one error. No active.lock or STOP marker. No abort-failed
events found in that attempt's journal. The exact cause of RequestError remains
unknown; do not call it confirmed network loss.

The one failed manifest object (13,142,412 bytes) was retried once through the
same core, create-only, and verified SHA-256 and metadata successfully. It was
absent from the destination at the recovery HEAD. Recovery receipts were fsynced
under ignored data/oss-migration/recovery-*.ndjson. No other live samples or policy
changes were performed.

After offline tests, restarted unchanged 697ba81 runner on ORIGINAL immutable
manifest under hidden PID 33960 at 2026-10-27T01:12:33.738Z. Single exclusive lock,
strict TLS, eight workers and 8 MiB in-memory ranges. At 01:12:59Z, 49 existing
objects / 127,606,221 bytes reverified, zero errors. New attempt counters reset;
previous 30,184 successful copies are not lost or overwritten. All existing objects
are fully re-read/hashed, so this resumption adds read traffic and takes time.
No new code, auto-retry loop, cloud deletion, history rewrite, LAN restart or
production/storage switch. Inspect progress.json and actual process before claims.

Baseline rerun: .tmp-oss-resume-1027-baseline.log. All pre-lint checks passed;
stopped at existing ignored runtime scripts: 17 errors / 17 warnings. Diff and
context-budget checks pass. At 01:14:19Z: new attempt reverified 133 objects,
zero failures, process still running. No full-migration completion claim.

## Earlier attempts

Previous local staged-file attempt: `data/oss-migration/progress.json` reported
`failed`, `ABORT_ERR`, 8,086 verified objects and 25,155,861,930 verified bytes;
one failure. PID 46412 was gone and `active.lock` absent. Reason for abort is
not proven; changing transfer method does not prove network reliability.
Journal and previously created objects remain intact. No source deletion or
overwrite of existing OSS objects. The user supplied a method sketch that reads
TOS in 8 MiB ranges and writes OSS multipart parts directly from RAM. This was
implemented with installed JavaScript SDKs (not Python tos/oss2):

- 8 workers, 8 MiB per active part, no binary disk staging. SDK overhead can
  add memory on top of ~64 MiB of application payload buffers.
- Pin source ETag and require correct 206/Content-Range/length/ETag for each
  TOS SDK ranged GET; preserve MIME, cache and user metadata on OSS init.
- OSS init/uploadPart/complete with create-only header on completion; journal
  intent and uploadId before transfer, abort incomplete multipart on failure.
- Full source SHA-256 while transferring, full destination ranged GET SHA-256
  read-back; existing objects are hashed on both sides, never skipped by size.
- Final source/target HEAD checks and durable verified journal before success.
- Traffic still flows through the local PC's network, despite no disk files.
- Original immutable manifest remains 69,309 objects / 213.28 GB from
  2026-10-26T11:26:22Z. Objects written after listing require a later delta.

Offline safety tests pass including create-only collision and abort-on-failure.
One-part 482,502-byte and multi-part 9,741,856-byte real TOS-to-OSS transfers
verified exact hashes and metadata via new core without disk staging. These are
new valid copies, not evidence of 69k-object completion. Do not rerun the trial
script or create a second writer. Standard baseline and runtime evidence follow
after continuation; known ignored-data lint blocker remains.

No object key or credential is stored here. Operational receipts and private
manifest remain in ignored `data/oss-migration/`.

## Verified execution

- Initial prior attempt: stopped independently on ABORT_ERR, one failed object;
  8,086 verified / 25.16 GB remain stored, PID 46412 and lock both absent.
- Real one-part 482,502-byte and two-part 9,741,856-byte transfers with SHA-256
  passed with no binary staging. Offline multi-part boundary and failure cases pass.
- Same immutable original manifest `b7f2674e...` resumed under hidden PID 5092;
  8 workers, strict TLS, single exclusive lock. At 12:43:23Z: 532 prior objects
  reverified (1.76 GB) in the NEW attempt, no new uploads or failures yet.
  New attempt counters restart at zero: previous 8,086 are not lost; journal under
  the previous attempt remains and existing OSS objects receive full hash checks.
- No incremental/final delta, cutover, URL rewrite, source deletion, LAN restart
  or production change in this turn. The process is not a service; keep PC online.
- Full baseline offline domains pass then stop at the existing 17 ignored-script
  lint errors / 17 warnings. Focused, TypeScript and changed-file lint pass.
  Evidence: ignored `.tmp-oss-memory-baseline.log`, local progress.json.

Final baseline repeated after offline two-part regression: all pre-lint domains
pass; same 17 ignored-script errors / 17 warnings at lint. Focused two-part,
TypeScript, changed-file lint and diff check pass. At 12:45:35Z resumed attempt
reverified 1,406 existing objects, uploaded 0 new objects, 0 errors; PID 5092
is running. These counters restart at each attempt; previous 8,086 remain OSS
objects and are being fully rechecked. No final completion claim.
