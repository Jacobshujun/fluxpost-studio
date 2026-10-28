# Wonder Authentication Diagnosis

## Confirmed Evidence
- Read-only PostgreSQL inspection of the latest failed Wonder node shows ImportMedia HTTP 400, code MissingSignatureNonce, and no generation submission. No runtime rows or credentials were changed.
- Official generation contract matches the implemented form JobType/Model/Input/Resolution/AspectRatio/N fields: https://open.yikeai.com/docs/develop/api/atomic/generation.html#submitimagegenerationjob .
- The official API-key curl places `Format=JSON` in the form body while the prose requires it in the query. Follow the user-provided executable example: root URL, form-only Format, no dual-location compatibility behavior. A regression test verifies the exact decoded fields, qwen-image-2.0 and Chinese prompt without changing saved models. Live behavior of this placement change is unverified; do not claim it fixes or cannot cause the observed 400.
- Official API-key guide explicitly maps MissingSignatureNonce to invalid key, site/endpoint mismatch, legacy missing OAuth reauthorization, or missing RAM AliyunYikeFullAccess: https://open.yikeai.com/docs/develop/api/gs2r7ibxs7okrsci.html . It requires raw Authorization and says not to add other authentication headers; ImportMedia is listed as supporting API keys.
- Exact cause is not established. Official troubleshooting lists account-side possibilities, not proof of an invalid operator key; the user reports authentication is correct. Do not infer a bad model, bad OSS image, or missing client nonce. Historical opaque HTTP 400 remains unproven.

## Implementation And Checks
- Added action/status/RequestId-preserving guidance for MissingSignatureNonce and matched the official curl's form-only Format. No signing, retry, model override, secret rewrite or workflow migration.
- New offline assertion reproduced the missing guidance before implementation. API-key headers are now asserted as an exact set, excluding RAM nonce/signature headers. Submit/import/resume authentication failures are covered.
- Wonder contract/runtime checks, changed-source/test ESLint and TypeScript passed after curl alignment. Final full baseline passed all domain checks and stopped at the existing 17 local data-script lint errors (17 warnings). No gate was weakened; latest log is ignored test-artifacts/wonder-curl-alignment-baseline.log (earlier diagnostic run: wonder-auth-debug-baseline.log). Edits are not committed or activated; actual generation remains unverified pending a live request comparison.

## Operator Boundary
- LAN remains 3f71997; this diagnostic change is not activated. No live provider requests or paid generation were sent, and no failed task was manually replayed.
- User reports authentication is correct. Account-side causes listed by documentation are hypotheses, not a finding of invalid credentials. A provider comparison with the same key/request would be needed to establish the cause; none was sent. Never paste keys into chat or tracked files.

## Release Authorization
- User explicitly requested commit and LAN update after reviewing the curl alignment. Rechecked Wonder contract/runtime, changed-source lint and TypeScript successfully before committing. Activate only through npm run local:lan from clean primary-worktree HEAD; verify build, runtime/state/manifest SHA, LAN binding and HTTP/Canvas health. This authorization does not request a manual paid generation or failed-task replay.

## Why Previous Checks Did Not Resolve This Failure
- Category: incomplete executable-request comparison plus missing documented error interpretation. Previous JSON/media/ingress corrections did not establish provider success; mocks cannot prove provider authorization or infer the live cause.
- The improved post-release diagnostics expose the exact first failing action and code, unlike the earlier opaque HTTP400. This is new discriminating evidence, not proof that previous unknown failures had the same cause.
- Prevention: preserve the official API-key contract with an exact header assertion and test this misleading legacy error explicitly. Capture the mapping in the domain spec; do not invent nonce signing from the English error text.
