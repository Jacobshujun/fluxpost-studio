# Gemini live provider acceptance and debugging

## Goal

Test and debug the deployed Gemini node against the provider supplied by the user on 2026-10-19. The user explicitly authorizes small live text/image acceptance calls and local provider configuration for this task. Keep credentials out of tracked files, output and evidence.

## Scope

- Confirm the supplied endpoint resolves, supports HTTPS and exposes the native Gemini protocol/model IDs.
- Use minimal synthetic text/images for live calls through the actual adapter/executor when reachable.
- Save working Gemini-only configuration locally; preserve unrelated settings/data.
- Fix only confirmed application defects, with focused regression checks and verified clean-HEAD activation if code changes.

## Acceptance

- [ ] Provider endpoint/model confirmed and live text/image behavior recorded without credentials.
- [ ] Local configuration and node verified, or exact external blocker documented.
- [x] Offline Gemini/config checks and project baseline outcome recorded.

## Current finding

Testing was explicitly paused by the user on 2026-10-19. A later instruction updates the selected model to gemini-3.8-flash-high; it does not resume live calls. The existing local config already has that exact model, so no configuration write or restart was necessary. No active diagnostic request remains.

The original linsuan.org endpoint returns NXDOMAIN. The user corrected the endpoint to https://lingsuan.org and selected gemini-3.8-flash. Node fetch with certificate verification succeeds against both model-list routes. Python urllib was denied with HTTP 403, so that client result does not establish application accessibility.

The actual Canvas executor/native adapter returns HTTP 404 for the requested model. A bounded diagnostic confirms the provider says no configured account in this group supports gemini-3.8-flash. The native model list has 14 entries and excludes that exact ID; it includes gemini-3.8-flash-tiered and gemini-3-flash. The OpenAI-compatible list includes the requested ID but a minimal compatible generation request also returns HTTP 404 Resource not found. Awaiting the user's model choice; do not silently change the requested model or persist failing settings.
