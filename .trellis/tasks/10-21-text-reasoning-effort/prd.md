# 文本模型思考强度配置

## Goal

Add one admin-visible text reasoning effort setting and apply it to every OpenAI-compatible text request without changing the default provider behavior.

## Requirements

- Add `OPENAI_TEXT_REASONING_EFFORT` with `default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`; default and clear omit the parameter.
- Show a Chinese-labelled select after the text model and persist through the existing admin-only advanced-config path.
- Send `reasoning.effort` for Responses and `reasoning_effort` for Chat Completions across generation, vision, tagging, safety review, distribution review, video-frame review, and viral image analysis.
- Keep the reference-library model independent while sharing the same effort. Do not affect Gemini, image generation, or video generation.
- Invalid values must fail explicitly before persistence or at config load; never silently downgrade or retry without the field.

## Acceptance Criteria

- [x] All eight values, blank/clear/default behavior, persistence, reload, shared API/worker state, and invalid-input rejection pass isolated checks.
- [x] Both endpoint shapes and all request modules send the configured value while preserving existing fields; default sends neither field.
- [x] The config page shows the Chinese options, saves/reloads the selection, restores default, and has no overflow at 1440/390 in all three themes.
- [x] Source lint, TypeScript, production build, built-config synchronization, isolated HTTP smoke, and documentation/env examples pass; the pre-existing unrelated lint blocker is recorded.
- [ ] Live provider acceptance for a chosen model/effort remains an explicit operator gate.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
