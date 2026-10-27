# Canvas Wonder Image Node

## Requirements
- Add an independent `model.wonder-image` Canvas node named Wonder Image, with text and 1-9 image inputs and image outputs.
- Configure endpoint, model, prompt, count, resolution, aspect ratio and a node-local API key in the Canvas UI.
- Use the documented Yike `2026-07-07` API, asynchronous submit/query operations and media registration.
- Preserve provider JobIds for restart-safe resume and keep credentials out of workflows, runs and exports.
- Keep the retired generated-image index and unrelated providers unchanged.

## Acceptance Criteria
- Offline request, media, resume, credential, persistence, scheduler and browser checks pass.
- No real provider or paid API calls occur during verification.
- TypeScript/build and the existing documented baseline run; unrelated known lint failures remain explicit.
- The feature is ready for operator live acceptance, not marked live-verified.
