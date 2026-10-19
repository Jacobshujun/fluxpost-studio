# 在无限画布中新增 Gemini 节点

## Goal

Add a local Canvas Gemini text/vision node using the native generateContent API, independent configuration and optional proxy. The user approved this scope and implementation on 2026-10-19.

## Requirements

- Register model.gemini v1 with multi-text prompt and optional ordered images inputs, text output, instruction/model fields and prompt-to-text bypass.
- Default instruction: 请根据输入文字和图片完成任务，使用中文回答。 Global model starts empty; nodes may override it.
- Support ordinary/V2/iteration execution, saved workflows, portable files, cancellation and existing retry behavior without new database tables.
- Admin-only independent key/base/model/proxy/timeout settings must update subsequent requests immediately. Never return secrets or store them in graphs.
- Native inlineData supports JPEG/PNG/WebP, at most 8 images, 7MiB each and a 20MB serialized request. Fail explicitly rather than resize/drop images.
- One request snapshots configuration. Cancel and timeout cover input reads, concurrency wait, provider request and response body. Logs exclude user content and credentials.
- Deliver a verified committed LAN candidate on port 3001 after work drains. No remote deployment or paid/live Gemini calls in this task.

## Acceptance Criteria

- [x] Offline provider/config/error/size/proxy/cancellation tests pass.
- [x] Graph, portable, V2 and iteration compatibility pass, including bypass and downstream text.
- [x] Mocked browser cases pass in three themes at desktop/mobile widths.
- [x] Existing checks/types/changed lint/build/HTTP/SQLite pass; unrelated baseline failures are recorded accurately.
- [ ] Clean committed candidate is active on LAN 3001 with matching SHA and health. Live provider acceptance stays pending.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
