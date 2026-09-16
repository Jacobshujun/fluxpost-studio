# Simple GPT image strategy parity

## Requirements
- Match Canvas model presets, custom IDs and explicit ToAPIs format selection.
- Expose PNG/JPEG, JPEG compression and calculated pixels alongside ratio, resolution, quality and background.
- Persist choices and freeze simple runs across reference, viral and original generation and resume.
- Preserve default-model reset over JSON PATCH; reject invalid settings before persistence.
- Preserve one output per existing image task and existing source selection/count rules.

## Acceptance
- Offline regression covers persistence, defaults/reset, invalid input, frozen resume and provider forwarding.
- Mocked desktop/mobile browser checks cover editing, save/reload and launch.
- Full project baseline passes; commit and activate clean local port 3001 candidate.
