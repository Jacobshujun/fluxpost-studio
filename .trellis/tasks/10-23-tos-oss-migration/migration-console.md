# Aliyun online migration console draft

Status: execution authorized on 2026-10-27; console access pending. No address,
role or managed migration task has been created by this agent.
An eight-object local SDK trial was subsequently executed. It was NOT an Aliyun
managed-service trial; connector/role/job acceptance remains untested. Do not rerun
the local sample command under the earlier commit authorization.

## 2026-10-27 cloud migration authorization

User explicitly requests immediate switch to Aliyun Data Online Migration.
Proceed with bounded managed trial, then same-key no-overwrite bulk after trial
validation; do not restart the local copy worker. No source deletion, historical
reference changes, application restart or production/storage cutover authorized.

Read-only `npm run migrate -- status` confirms the latest local attempt stopped
with EPERM at 11:31:57 CST, 9,799 rechecked objects, 0 new uploads. Live official
guide links to https://mgwnext.console.aliyun.com/ . Opening a dedicated interactive
Chrome window was rejected by tool policy. Do not retry via alternate launchers.
No authenticated console was reached and no managed task was submitted. Next:
user opens the official console and signs in; confirm accessible control path,
then inspect existing tasks/addresses before creating anything. Do not claim cloud
migration is running or that closing the PC is safe for a nonexistent cloud job.

## Preconditions

- Use an Aliyun RAM user, not the root account, with
  `AliyunOSSImportFullAccess` plus the creation permissions listed in the guide.
- Source must expose its TOS S3 endpoint. Desktop `TOS.txt` supplies
  `tos-s3-cn-guangzhou.volces.com`; use that exact console value, not a record I
  invent. The source IAM identity must list, read and read metadata for the bucket.
- Destination is `xpai-imc`, Guangzhou. Prefer automatic role authorization for
  the OSS destination; source TOS uses its separate read-only IAM credentials.
  Destination permissions include list/get/put/abort multipart on bucket/objects.
- Confirm destination lifecycle does not delete/archive newly migrated objects.
- Preserve all 18,580 pre-existing destination objects (69.73 decimal GB).
  Current source/destination same-key overlap is 0, but recheck immediately before
  creation because the source is still receiving writes.

## Source address

- Region: Guangzhou / `cn-guangzhou` (pending exact console label).
- Type: Volcengine TOS.
- Domain: `tos-s3-cn-guangzhou.volces.com` from the supplied TOS credentials file.
- Bucket: `seedance-gz-xpeng22365`.
- AccessKeyId / SecretAccessKey: use the TOS IAM credential; never paste into this
  repo or chat.
- Prefix: `fluxpost/flux-lightmoment/` (no leading slash, trailing slash required).

## Destination address

- Region: Guangzhou / `oss-cn-guangzhou`
  (pending exact console label).
- Type: Alibaba OSS.
- Bucket: `xpai-imc`.
- Prefix: `fluxpost/flux-lightmoment/`.
- Keep official OSS domain for SDK/tests. Do not use the broken custom domain.

## First task

Before any task, choose a tiny, bounded non-production prefix such as one known
small image. Because a separate destination prefix changes keys, use its actual
new key only to test transfer behavior; do not add it to the application.

- Name: include `trial`, date, and source-side scope; no secrets.
- Source/destination addresses: the records above.
- Bandwidth / files per second: start conservative and observe source load.
- Overwrite mode: `不覆盖` at minimum. `全部覆盖` is forbidden.
- Migration report: `推送` so success/failure/skipped evidence is retained.
- Migration log: `不推送` initially unless error-logging authorization is prepared.
- Filtering: a narrow trial scope only; no broad regex.
- Execution: one immediate/manual run with a small scope; no recurring schedule.

After task creation is separately approved, verify trial object key, exact size,
MIME, metadata, public read, image bytes and (for a video) HTTP Range/browser
playback. Do not rewrite app references or switch provider from trial evidence.

## Full task proposal

- Source and destination prefixes stay identical to preserve relative keys.
- Use `不覆盖` with migration report enabled. Recheck overlap immediately beforehand.
- Start with conservative bandwidth/files-per-second and observe both providers.
- No SLS push initially to avoid unrelated logging authorization/charges.
- No lifecycle override; verify destination bucket rules first.
- Transfer all 68k source objects, then obtain a frozen final inventory.
- Keep source writes active during bulk copy if needed, but require a short final
  write freeze plus delta/incremental task and repeat inventory before cutover.
- The service does not verify completeness. Count/size compare is necessary but not
  sufficient: perform per-object content comparison for the final cutover set.
- Verify representative JPEG/PNG/WebP/GIF/MP4/MOV including whitespace/non-ASCII
  keys and largest object, with HEAD, full bytes, Range and browser preview.
- ACL/StorageClass/encryption/tagging are not preserved. Apply intentional public
  access rules only after reviewing target bucket policy; never copy ACL blindly.

## Cutover gates

1. Approved production/local data inventory and frozen write set.
2. Full copy and report; zero unexplained failures/skips.
3. Source vs destination key/count/size/content verification.
4. Browser image/video and Feishu materialization acceptance.
5. Database/historical-reference rewrite plan and tested rollback.
6. Explicit local activation approval; production deployment is a separate approval.
7. Retain TOS at least 7 days; deletion needs separate approval.

## Still unknown

- Exact console labels and whether the TOS connector needs V4 signing or other
  vendor-specific options.
- Migration-service price for this job and expected TOS request/egress charges.
- Target bucket ACL policy, lifecycle, versioning and encryption.
- Effective production source configuration and production runtime references.
- Background delta/sync task behavior for this source type and its cost/safety.
