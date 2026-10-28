# Wonder Existing Media Repair

## Evidence And Scope
- User reported ImportMedia HTTP 400 MediaAlreadyExist with an existing mediaId; read-only PostgreSQL inspection confirmed the exact message grammar in the latest persisted duplicate error. Do not reclassify it as an authentication failure or infer success of subsequent generation.
- Official media contract: https://open.yikeai.com/docs/develop/api/media.html . Overwrite=false rejects duplicate InputURL; true deletes the existing media and registers again. The error message ID suffix is an observed provider response, not a separately documented JSON schema.
- The implementation normalizes only ImportMedia/HTTP400/exact duplicate code with a validated ID into the existing MediaId path. It then uses unchanged GetMedia normal/third-party readiness, and submits once. No raw provider-body exception, delete, overwrite, retries, cache, database or UI migration added.

## Verification
- Expanded runtime negative case reproduced the overly broad initial handling: HTTP500 duplicate was incorrectly followed by GetMedia. Narrowed normalization fixes this boundary; malformed IDs, unrelated codes/actions/statuses remain failures.
- Contract cases cover structured ID and observed message, missing/invalid IDs, wrong codes and misleading URL/text. Runtime cases cover existing reference -> GetMedia -> single submit, unchanged Overwrite=false, no extra reference persistence, Wonder third-party failure, resume query-only, error redaction and no leaked raw body.
- Wonder contract/runtime checks, changed-source/test ESLint, TypeScript, production build, built config synchronization and read-only SQLite check passed. Full baseline passed all domain checks then stopped at the existing 17 local data-script lint errors (17 warnings); no gate weakened. Ignored logs: test-artifacts/wonder-existing-media-{baseline,build,db}.log.
- Optional isolated HTTP smoke launch was blocked by the execution tool policy before starting a process; no HTTP/UI walkthrough of the new code is claimed. LAN was not restarted.

## Release Boundary
- Repair is local and uncommitted; LAN remains e939d18. No real Yike call, paid generation, manual task replay, configuration/credential/workflow edit or runtime-data mutation occurred.
- Full live generation remains unverified. Reused Wonder media without a ready third-party asset still fails/waits explicitly; do not silently overwrite it to satisfy registration settings.
- Follow-up authorization: user explicitly requested commit and LAN update. Rechecked focused contracts/runtime/lint/types successfully. Activate only clean primary-worktree HEAD through npm run local:lan; no manual paid acceptance or failed-task replay is included.

## Prevention
- Category: provider error-to-business-result boundary and missing duplicate-path coverage. Curl/auth alignment alone could not cover a later media conflict.
- Keep exact code/action/status checks and positive/negative fixtures in the normal offline tests; document reuse versus destructive Overwrite in the domain spec rather than treating every HTTP400 as retryable.

## Authorized LAN Activation
- Implementation commit 63925fbaef2f513604e628b395f8728c010ab5c8; after archive/journal, npm run local:lan activated clean primary-worktree HEAD ec0cd9f1283011ea4b1f548adb089d98a1d38444 in .next-local-b.
- Build, local/LAN runtime/state/build-manifest identity, 0.0.0.0:3001 binding, loopback/LAN HTTP smoke and Canvas HTTP200 passed. LAN entry: http://10.182.144.38:3001/canvas . Ignored evidence: test-artifacts/wonder-existing-media-lan-activation.log and wonder-existing-media-lan-receipt.json.
- Normal workers remain enabled; no manual provider probes, paid acceptance, failed-task replay, credential/model/OSS configuration rewrite or remote deploy. Earlier uncommitted/unactivated notes describe the pre-release stage. Subsequent release-record-only commits do not change active application code.
