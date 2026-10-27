# Design

## Boundaries
- `wonder-image-contract.ts` validates endpoint/model/parameters and decodes provider responses without network access.
- `wonder-image.ts` owns HTTP, media registration/readiness, image validation, runtime media persistence and cancellation.
- A dedicated credential module/API follows the Qwen encrypted owner-scoped pattern but has independent storage identifiers and labels.
- Canvas registry, executor, iteration whitelist and Canvas UI expose the node and persist async JobIds through the existing `onProviderTaskUpdate` mechanism.

## Data Flow
1. Canvas text plus node prompt becomes `Input.Prompt`; references become ordered `MediaId` values.
2. Public references are validated then registered with `ImportMedia`; local references are validated and uploaded through the existing configured runtime object storage first.
3. `ImportMedia` is followed by `GetMedia` until `Normal`; only then is `SubmitImageGenerationJob` called.
4. The returned JobId is persisted on the Canvas node run. Existing run recovery later calls `GetImageGenerationJob` instead of submitting again.
5. Finished signed result URLs are fetched without credentials, validated and persisted as stable runtime image artifacts.

## Provider Contract
- Only the documented Shanghai/Singapore HTTPS root endpoints are allowed.
- API Key is sent verbatim in `Authorization`, with action/version/date headers and URL-encoded form fields.
- Supported image parameters are count 1-4, resolution 1K/2K/4K and ratio 16:9/9:16/4:3/3:4/1:1.
- Provider error bodies and signed URLs are never copied into durable errors.

## Compatibility
- No environment variables, schema migrations, generated-library restoration or changes to existing Qwen/GPT nodes.
- The existing Canvas 30-second async requeue is retained as the scheduler contract for all provider nodes.
