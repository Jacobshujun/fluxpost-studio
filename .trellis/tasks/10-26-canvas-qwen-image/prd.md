# Canvas Qwen-Image-3.0-Pro node

## Goal

Add an independent Canvas Qwen-Image-3.0-Pro image node using GPT image interactions and outputs as a reference, without changing GPT behavior.

## Requirements

- Endpoint and API key must be entered inside the node, not Advanced Configuration (user confirmed 2026-10-26).
- Follow the supplied synchronous POST contract: Bearer auth, model `qwen-image-3.0-pro`, `input.messages[].content[].text`, and `parameters.prompt_extend` (default true).
- Accept local/upstream prompt text; emit standard image artifacts for preview and downstream save/review.
- Keep keys outside graph JSON, snapshots, history, clipboard, exports and logs. Preserve existing secret stripping in `src/lib/canvas/serialization.ts:83` and `src/lib/canvas/iteration.ts:118`.
- Save node credentials server-side for reuse after reload, expose only configured state, allow replacement/removal, enforce ownership and bind keys to endpoints.
- Validate configuration before calls; honor cancellation and persist validated images through existing media storage before success. No paid retries or GPT fallback.
- Preserve pending OSS modifications; no live paid calls, port-3001 restart or deployment by default.

## Acceptance Criteria

- [x] Node palette, text input, image output and downstream artifact contracts work offline.
- [x] Endpoint and masked key entry are in-node; no Advanced Configuration additions.
- [x] Offline tests assert exact URL/header/body, including prompt extension disabled and ordered references.
- [x] Missing config, invalid responses, provider failures, cancellation and failed storage never report success in isolated checks.
- [x] Reload reuses saved keys without plaintext responses; unauthorized use and endpoint substitution fail.
- [x] Exports, clipboard and run snapshots contain no keys; imported/shared workflows require recipient credentials.
- [x] Registered executor/iteration authorization and V2 planning contracts pass; real multi-user execution remains an acceptance gate.
- [x] Focused tests, baseline, lint/types/build and mocked desktop/mobile checks run; unchanged lint blocker documented in verification.md.

## Scope And Planning Gate

- Support ordered 0-3 reference images: zero means T2I, 1-3 means I2I. Validate each input <=10MB, dimensions 1-8000 and aspect ratio <=10:1. Support public/local Canvas images via validated inline data.
- Tutorial confirms native output choices[].message.content[].image, with URLs expiring in 24 hours; persist originals promptly. Optional native size/count controls follow documented limits, not GPT tiers. No mask/multipart or async mode.
- Existing GPT/Gemini credential placement is unchanged.
- User requested implementation including I2I on 2026-10-26 ("please refer to tutorial to deploy"). Proceed with local development/verification; activation/production remain separate.
- Contract source: user attachment 5967228a-78a4-49e6-870f-adef710eba45, Qwen image generation/editing API reference, DashScope synchronous section.
