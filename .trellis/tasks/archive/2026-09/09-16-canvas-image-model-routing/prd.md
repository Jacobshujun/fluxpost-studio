# Node image models and explicit ToAPIs request contracts

## Goal

Each GPT image node can persist its own preset or arbitrary custom model ID without model-name-based adapter fallback.

## Requirements

- Trim custom IDs and reject empty explicit values; absent model retains the existing default.
- Preserve model and independent request format through save, reopen, copy, execution and retry.
- Offer requested Flare, Flare VIP and Official presets without asserting provider availability.
- Preserve 4K/4:3, distinguish input validation from upstream errors, redact secrets and never degrade on rejection.
- Reuse provider addresses and credentials. No paid calls in automated checks.

## Acceptance Criteria

- [x] Isolated request/persistence/browser checks and complete baseline pass.
- [x] Commit verified changes, then activate port 3001 using npm run local.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
