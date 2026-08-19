# Seedance reference mentions design

## Boundaries

- `src/lib/canvas/seedance-references.ts` owns the browser/server-safe reference document contract, fixed-reference ordering, marker parsing, Prompt serialization, and validation.
- `src/app/canvas/page.tsx` owns the Seedance inspector upload/gallery and `@` mention editor. It may inspect the editable graph to expose only deterministic upstream image inputs.
- `src/app/api/canvas/media/route.ts` owns the `seedance-reference` upload mode and rejects it unless TOS is enabled and fully configured.
- `src/lib/canvas/executors.ts` resolves the effective Prompt and canonical image order before the first Ark POST, and persists resolved inputs for run history.
- `src/lib/canvas/runs.ts` preserves already-resolved inputs while resuming a pending provider task.
- `src/lib/canvas/registry.ts` and `src/lib/canvas/graph.ts` own backward-compatible node defaults and graph/preflight validation.
- `src/lib/canvas/seedance.ts` remains the Ark HTTP adapter and receives only a final plain Prompt plus ordered public URLs.

## Persisted Config Contract

Keep `model.seedance` at version 1 and stay within `CanvasNodeConfig` flat scalar/string-array values:

```ts
{
  prompt: string;                 // editor document with opaque mention markers
  referenceUrls: string[];        // direct TOS uploads in user order
  mentionIds: string[];           // parallel lookup arrays
  mentionUrls: string[];
  duration: number;
  ratio: string;
  resolution: string;
  generateAudio: boolean;
  watermark: boolean;
  complianceRisk: string;
}
```

An inserted mention is stored in `prompt` as an internal marker such as `{{seedance-image:<uuid>}}`. The inspector renders the marker as a non-editable `@图片N` chip; users never see or type the UUID. `mentionIds[index]` maps to `mentionUrls[index]`. Unknown, duplicate, malformed, or unbound markers are validation errors.

Historical nodes have no new keys. Their empty node-local Prompt falls back to the existing upstream `prompt` artifact and their image input order keeps the current behavior.

## Reference Sources And Ordering

The authoring menu contains only:

1. Direct `referenceUrls` uploaded on the Seedance node.
2. URLs from directly connected `input.images@1` nodes.
3. Frozen URLs from directly connected `input.library-images@1` nodes.

Dynamic model/image-tool outputs remain valid unmentioned runtime images but never appear in the authoring menu.

Canonical request order is deterministic:

1. Direct reference URLs in their configured order.
2. Active mentioned upstream URLs in first-mention order.
3. Remaining upstream runtime image URLs in incoming artifact order.
4. Duplicate URLs are removed by first occurrence.

This makes every displayed/serialized image number match the request content order while allowing unknown dynamic outputs to append without shifting mentioned references. Reordering direct images changes their displayed number but not the marker-to-URL binding. Removing a bound URL leaves an invalid chip and blocks execution rather than rebinding it.

## Prompt Resolution

- A non-empty node-local Prompt is authoritative.
- If the node-local Prompt is empty, join non-empty upstream text artifacts using the existing edge-order behavior.
- If both are non-empty, fail before Ark submission.
- For a local Prompt, replace each active marker with `图片N`, where N is the one-based index in canonical request order.
- Validate the final plain Prompt against the existing 2,000-character limit after marker expansion.
- A literal user-authored `@图片N` without a structured marker has no binding guarantee and is left as ordinary text.

The create request remains:

```json
{
  "content": [
    { "type": "text", "text": "让图片1中的人物驾驶图片2中的汽车" },
    { "type": "image_url", "image_url": { "url": "https://.../person.jpg" }, "role": "reference_image" },
    { "type": "image_url", "image_url": { "url": "https://.../car.jpg" }, "role": "reference_image" }
  ]
}
```

## Upload Contract

`POST /api/canvas/media` accepts `mode=seedance-reference` only when `TOS_ENABLED=true` and all TOS runtime-media fields are configured. It applies the existing image sniffing/size boundary, limits formats to the overlap supported by the browser and Seedance, persists through `saveRuntimeImageUpload`, and verifies the returned URL is HTTP(S) before returning success. No node config is changed on failure.

Existing `canvas-image` and `gpt-reference` modes keep their current behavior.

## Run Persistence And Resume

Before the first POST, the executor resolves:

- the final plain Prompt;
- canonical ordered image items named `图片1`, `图片2`, and so on;
- existing video inputs.

The executor returns these as `resolvedInputs`, so the node run stores the exact provider-facing text and media order. When the Ark task is pending, resume performs GET by persisted task ID before any re-resolution. `runs.ts` must retain the node run's stored resolved inputs on resume instead of replacing them with newly collected raw inputs.

## UI Behavior

- The Seedance inspector has a dedicated Prompt composer, direct-upload command, ordered thumbnails, and a combined fixed-reference strip.
- Typing `@` opens a keyboard-accessible menu of fixed images with thumbnail and current `图片N` label.
- Selecting an item replaces the active `@` query with a non-editable mention chip and saves the marker/binding.
- Direct references support preview, move up/down, and remove controls. Removing a referenced image visibly marks the chip invalid until restored or deleted.
- The upstream Prompt port remains visible for compatibility; inspector copy explains a conflict only through inline validation state, not instructional feature prose.
- The layout must remain usable at the existing desktop and mobile Canvas widths without horizontal overflow.

## Validation Matrix

- Empty local and absent upstream Prompt: blocked.
- Non-empty local plus effective upstream Prompt: blocked.
- Marker missing from binding arrays: blocked.
- Bound URL absent from fixed/current runtime references: blocked.
- More than nine deduplicated images: blocked.
- Direct upload without verified TOS or returning a local URL: rejected before config mutation.
- Existing upstream-only node without markers: allowed.
- Pending provider task: GET only; no upload, re-resolution, or POST.

## Compatibility And Rollback

- No node version, artifact kind, graph schema, or database migration is introduced.
- Old graphs decode because all new config keys are optional and defaults are applied only to newly created nodes.
- Rollback removes the dedicated editor/upload behavior and resolver while leaving unknown flat config keys harmless to old execution; direct reference URLs remain data but are ignored by the rolled-back executor.

## Verification

- Extend deterministic Canvas checks for config compatibility, static-reference discovery, document parsing, canonical order, invalid/deleted bindings, Prompt-source conflict, request payload, and pending-task input preservation.
- Extend media route/source checks for TOS gating and HTTP(S)-only success without real TOS or Ark calls.
- Run TypeScript, lint, build, the full offline Trellis baseline, and a local mocked browser walkthrough at desktop and mobile widths.
- Do not run a paid Seedance task.
