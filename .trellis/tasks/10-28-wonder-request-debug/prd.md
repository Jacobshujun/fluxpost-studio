# Debug Wonder live request failure against official contract

## Goal

Diagnose the post-release Wonder failure from read-only run evidence and the official generation/API-key documentation. Make the confirmed authentication failure actionable without inventing RAM signing or sending paid requests.

## Requirements

- Latest persisted failure is ImportMedia HTTP 400 MissingSignatureNonce. Official API-key troubleshooting maps it to invalid key/site/OAuth/RAM permission, not a missing client nonce.
- Keep raw Authorization and action/version/date; match the user-provided official curl with Format=JSON in the form body and no query parameters. Never add signature headers, dual-location parameters or automatic retries.
- Add safe, action-specific operator guidance for this code while retaining HTTP status and RequestId. Preserve node credentials, workflows and OSS configuration.
- No live API probes, paid generation or queue mutation. User subsequently authorized committing and updating LAN using the existing clean-HEAD release command.

## Acceptance Criteria

- [x] Document source-backed diagnosis and limits of what can be inferred.
- [x] Reproduce the missing operator guidance with a failing offline test, then fix it.
- [x] Verify exact API-key header contract (including no nonce/signature), existing generation/resume tests, baseline, lint and types.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
