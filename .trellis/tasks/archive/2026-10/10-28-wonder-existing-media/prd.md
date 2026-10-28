# Reuse existing Wonder reference media without overwriting

## Goal

Reuse already-registered Wonder reference media after ImportMedia returns MediaAlreadyExist, without deleting media or duplicating generation submissions.

## Requirements

- Official media API defines Overwrite=false as rejecting duplicate InputURL; user reported the exact duplicate error with an existing mediaId.
- Limit recovery to ImportMedia HTTP 400 with the exact MediaAlreadyExist code and a validated existing media ID. Never interpret unrelated errors or arbitrary URL text as a media ID.
- Reuse GetMedia readiness and Wonder third-party checks before submitting; keep Overwrite=false, cancellation, safe errors and JobId-only resume.
- No raw provider bodies/secrets in exceptions, no automatic overwrite/delete/retry, no live provider calls or runtime data changes.

## Acceptance Criteria

- [x] Add positive/negative extraction and action/status-specific runtime regression cases.
- [x] Implement ID reuse without skipping readiness, duplicating submit or retaining raw sensitive errors.
- [x] Run focused checks, lint/types/build and baseline; record existing blockers and live-acceptance limits.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
