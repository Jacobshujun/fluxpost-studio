# Repair Wonder Image references and Yike requests

## Goal

Repair Wonder Image image ingress to match GPT-Image-2 and correct documented Yike request omissions without replaying real tasks.

## Requirements

- Upload, paste, drag, preview, reorder and remove up to nine references using the GPT-style Canvas UI and numbered ports.
- Preserve existing node IDs, encrypted credentials, old reference connections and saved workflows.
- Correct JSON response selection, third-party media readiness and sanitized action-specific errors.
- Keep user-selected model IDs and the completed OSS migration unchanged; no live generation or media registration.

## Acceptance Criteria

- [x] Offline checks prove ordered ingress, old/new ports, limits, bypass, iteration, resume, upload validation and provider request/error contracts.
- [x] Three-theme desktop/mobile mocked browser checks, TypeScript, changed-source lint and production build pass.
- [x] Run the full baseline and report pre-existing failures without weakening gates.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
