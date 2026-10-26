# TOS to OSS migration

## Scope

Prepare local port 3001 and current production for migration to Aliyun OSS
bucket `xpai-imc`, Guangzhou, SDK endpoint
`https://oss-cn-guangzhou.aliyuncs.com`. This phase covers credential safety,
read-only inventory, opt-in code adaptation and the subsequently authorized bounded
sample trial. Full copy and cutover remain outside this phase.

## Requirements

- Never print or commit `aliyun_oss_key.txt`, environment values, or object inventories.
- Preserve Object Keys and existing TOS behavior until explicitly configured otherwise.
- No production switch in this phase. Production cutover requires separate approval.
- Initial preparation was read-only. On 2026-10-26 the user authorized the proposed
  small trial; eight same-key objects were copied by a local script, not by the
  proposed Aliyun managed migration service. No further copy is authorized by the
  later request to organize and commit the integrated code.
- No historical-reference writes, source deletion, or runtime restart here.
- Later phases: sample copy, full copy and content verification, historical-reference
  migration, then switch with an approved short final write freeze.
- Retain source objects at least seven days after cutover; deletion needs separate approval.
- Never bypass TLS verification. Custom domain certificate mismatch blocks its use.
- Official Bucket HTTPS alone is not proof of object access or preview compatibility.

## Acceptance

- Credential file excluded from Git; no tracked secret or runtime report.
- Read-only inventory distinguishes confirmed local/production facts from unknowns.
- Explicit OSS adapter supports verified uploads, recovery, public URLs and pending files;
  TOS remains default with unchanged key layout and no silent provider fallback.
- Offline tests cover selection, SDK mapping, errors, TLS and URL behavior.
- Baseline and focused verification results recorded, including existing blockers.
- Remaining transfer, reference migration, browser/object acceptance and cutover gates
  documented without declaring migration complete.
