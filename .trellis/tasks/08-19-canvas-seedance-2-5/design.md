# Seedance 2.5 Canvas Node Design

## Boundaries

- `src/lib/canvas/seedance.ts` owns Ark request construction, input validation, HTTP execution, response decoding and provider-specific errors.
- `src/lib/canvas/executors.ts` maps Canvas artifacts/config to the adapter and preserves the existing provider task resume flow.
- `src/lib/canvas/runs.ts` performs configuration-only preflight. It must not make a paid or remote provider request.
- `src/lib/canvas/registry.ts` owns the visible node fields and graph validation.
- `src/lib/config.ts` owns Ark base URL, API key, Seedance model and request timeout configuration.
- `.trellis/verification/canvas_workflows_check.mjs` owns deterministic contract coverage with mocked fetch behavior/source assertions.

## Request Contract

Creation uses `POST {ARK_BASE_URL}/contents/generations/tasks` with JSON:

```json
{
  "model": "doubao-seedance-2-5-260628",
  "content": [
    { "type": "text", "text": "..." },
    { "type": "image_url", "image_url": { "url": "https://..." }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "https://..." }, "role": "reference_video" }
  ],
  "generate_audio": true,
  "ratio": "9:16",
  "duration": 8,
  "resolution": "720p",
  "watermark": true
}
```

Status uses `GET {ARK_BASE_URL}/contents/generations/tasks/{encodedTaskId}`. Both use `Authorization: Bearer` and JSON headers. Each individual HTTP request uses an abort timeout; the Canvas worker remains responsible for polling across persisted runs.

## Response Contract

- Create response must contain a non-empty `id`.
- Status is normalized from the Ark task `status`.
- `failed` returns `error.message` or `error.code` as an explicit failure.
- `succeeded` must contain `content.video_url`; otherwise it remains pending only for non-terminal statuses and fails clearly for a terminal response without output.
- Raw provider JSON is retained only in-memory for normalization and is not logged with authorization headers.

## Compatibility

- Keep `model.seedance` at version 1 because Canvas serialization currently requires an exact registry version and has no migration layer.
- Existing saved configs may contain `modelVersion` from Dreamina. The new executor ignores that legacy field and resolves the Ark model from application configuration.
- Existing `duration`, `ratio`, `resolution`, and `complianceRisk` values remain valid.
- New boolean fields fall back to registry defaults when absent from an older saved node.

## Configuration

- Reuse `ARK_BASE_URL` and `ARK_API_KEY`.
- Add `ARK_SEEDANCE_MODEL` with default `doubao-seedance-2-5-260628`.
- Add `ARK_SEEDANCE_REQUEST_TIMEOUT_MS` for create/status HTTP requests.
- Remove active Dreamina CLI configuration fields and status exposure once all consumers and checks are migrated.

## Error And Safety Policy

- `ArkSeedanceNeedsConfigError` maps missing API key to Canvas `needs_config`.
- HTTP bodies are decoded defensively from `unknown`; errors include status and provider message but never request headers.
- Inputs are validated before network access, including prompt limits, accepted ratios/resolutions, media counts, extensions and HTTP(S) reachability.
- Compliance risk `high` remains blocked by graph validation.

## Rollback

The change is isolated to the adapter/imports/config/registry/check contracts. Rollback restores the Dreamina adapter and fields; no database or graph migration is performed, so stored workflows remain structurally compatible.
