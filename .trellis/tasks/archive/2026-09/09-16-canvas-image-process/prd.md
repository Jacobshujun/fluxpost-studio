# Canvas image processing node

## Goal

Implement the user-approved 图片处理 node plan (2026-09-16), including task artifacts, verification, commit and local activation. No remote deployment.

## Requirements

- Independent utility.image-process v1; batch uniform parameters, ordered images, bypass and existing downstream compatibility.
- Fixed quality (90), source-byte percentage or KB ceiling. Target quality range defaults 75–90. Impossible targets fail explicitly without reducing dimensions or quality floor. PNG remains lossless.
- Original/percentage/longest-edge/custom resolution; inside/center crop/pad; background color or transparency. Lanczos3, auto orientation, sRGB and metadata stripping.
- Static JPEG/PNG/WebP, <=20 images, <=30 MiB each, <=40M decoded pixels, output <=8192 per edge and <=40M pixels.
- Shared compact inline/inspector controls. Before/after preview, dimensions, bytes, savings, count and stale-configuration indication. Preserve sources and old transform behavior.

## Acceptance Criteria

- [x] Real offline encoding, impossible targets, order/source preservation/cache/error contracts.
- [x] Graph persistence, bypass, iteration/scheduler compatibility and desktop/mobile browser checks.
- [x] Full offline baseline, committed clean candidate activated on primary-worktree port 3001 (final APNG correction reactivation follows archive).

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
