# Advanced configuration image proxy toggle

## Goal

Let administrators switch remote image traffic between Xray and direct access without controlling the Xray process.

## Requirements

- Add OPENAI_IMAGE_PROXY_ENABLED beside the retained proxy URL; preserve existing routing until explicitly changed.
- Reuse admin-only configuration persistence and apply to subsequent requests without restarting.
- Direct mode skips proxy listener checks and shows accurate network guidance.
- Keep text, Feishu, ComfyUI, loopback bypass and accepted-task recovery unchanged.
- Preserve unrelated edits, real configuration and live provider boundaries. On 2026-09-10 the user subsequently authorized commit and port-3001 activation; preserve LAN binding, with no push or remote deployment.

## Acceptance Criteria

- [x] Isolated checks cover defaults, validation, persistence and off/on address retention.
- [x] Local checks cover proxy/direct/off/on, closed proxy and direct health/errors.
- [x] Admin boundaries, focused contracts and complete offline baseline pass.
- [x] Trellis records verification and pending manual acceptance.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
