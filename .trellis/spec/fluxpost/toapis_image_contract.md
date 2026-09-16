# ToAPIs Image Contracts

## Scope

Applies to `buildToApisGenerationBody` in `src/lib/toapis-image-api.ts` and Canvas background propagation. Documentation read 2026-09-16:

- https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5/generation
- https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5-official/generation
- https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5-vip/generation

## Signatures

Simple strategy persistence (`PATCH /api/workspace/settings`, `POST /api/simple/runs` settings) adds nullable `imageModel` / `imageToApisRequestFormat` and optional `imageOutputFormat` / `imageOutputCompression`.

`buildToApisGenerationBody({ model, requestFormat, prompt, requestedSize, ratio, resolution, quality, count, background, referenceImages })` supplies JSON for `POST /v1/images/generations`. Accepted task IDs resume through `GET /v1/images/generations/{id}` before any new uploads or submissions.

Canvas registry helpers: `getCanvasVisibleInputPorts(node, connectedPortIds)`, `orderedCanvasGptImageInputs(inputs)` and `getCanvasRequiredInputPorts(node, availablePortIds)` share UI, executor, planner and bypass behavior.

## Contracts

Simple and Canvas share `ImageModelSelector` and preset metadata. Simple settings use JSON null to reset model/format overrides; omission preserves saved values during PATCH. Old settings default to route model/format, PNG and compression 100. Settings and run snapshots forward model/format/output fields through all three source, viral and original image paths; resume uses the saved run. Existing image-task counts remain unchanged (one output per task). Transparent background selects PNG atomically.

| Explicit requestFormat | Size | Quality | References |
| --- | --- | --- | --- |
| ratio (ordinary Flare/Sunburst) | ratio plus resolution | fixed high | reference_images |
| pixels (VIP/Official) | requested pixel size; no resolution | selected quality | image_urls |
| legacy (explicit older interface) | ratio plus resolution with historical 4K limits | selected quality | image_urls |

Both use n=1, optional background=transparent, and asynchronous task IDs. Omit background for normal generation. Do not send output_format/output_compression/response_format for these documented 2.5 contracts. Official defaults to PNG; custom pixel sizes remain subject to upstream acceptance.

Canvas/simple ratio/tier selectors already calculate pixels: 4K/4:3 maps to 3312x2480. VIP/Official uses those pixels; ordinary interfaces use ratio/tier. Public VIP docs accept image_urls as an alias in JSON generations; this path does not try multipart edits. Upstream custom-pixel acceptance remains unconfirmed. The gpt-image-2.5-official preset is intentionally submittable verbatim, but provider docs identify it as a series name, not an accepted model ID.

Transport is selected by the existing provider profile. Independent optional node config.model and config.toApisRequestFormat flow through ImageGenerationOptions. Presets write convenience model/format metadata; custom IDs preserve case and internal characters, trim surrounding whitespace, and reject explicit blanks. The server does not allow-list model IDs. Missing node model keeps the route default. Missing node format keeps the route format, configured with OPENAI_IMAGE_TOAPIS_FORMAT / OPENAI_IMAGE_BACKUP_TOAPIS_FORMAT (ratio | pixels | legacy). Only absent route settings migrate known historical default-model contracts; unknown route defaults use ratio. The request builder never selects an adapter from the submitted model name.

Explicit node model/format starts on primary (accepted tasks resume their saved route), never changes the shared route cache, and cannot fail over. Different node overrides stay independent. Per-image fingerprints include explicit model/format; legacy fingerprints remain unchanged. Model/format survive V1 upgrade, graph decoding, SQLite workflow persistence, clipboard copying and workflow export.

Canvas GPT image V2 supports optional `image_1` through `image_16`, one edge per port, with groups preserving their internal order. Display ports through the highest connected number plus one empty port, capped at 16. Disconnects never renumber other edges. Legacy `referenceUrls` precede legacy `references`, then numbered ports in numeric order; generation deduplicates URLs by first occurrence and enforces 16 total references. Hide the legacy input only when unwired. Bypass merges wired images in the same port order. Numbered run snapshots retain original inputs instead of inserting a second aggregate `references` input. Inline fields and the inspector share model controls, atomic transparent/PNG changes and the pixel mapper. No node address or credential fields are introduced.

## Validation

| Input | Outcome |
| --- | --- |
| Ordinary 3:4 + 4k | Submit size=3:4, resolution=4k |
| VIP 4:3 + 4k, format=pixels | Submit size=3312x2480 without resolution; preserve upstream refusal |
| Custom ID with explicit format | Submit trimmed ID unchanged; never infer legacy |
| Blank explicit ID | Reject save and execution; missing field alone means default |
| Simple invalid output format, non-integer/out-of-range compression, transparent JPEG | Reject before settings write |
| Upstream unsupported size/model | Preserve bounded code/message with upstream label; no downgrade/failover |
| Official 3:4 + 4k with calculated pixels | Submit pixel size, omit resolution |
| Official exact size | Preserve pixels; check exact returned dimensions before persistence |
| count other than 1 | Input error; no retry/failover |
| transparent + JPEG | Input error; Canvas selection changes format to PNG |
| Official ratio/tier without calculated pixels | Input error, no silent square substitution |
| Second edge on image_1 / unknown image_17 | Graph persistence rejects input |
| Disconnect image_1 while image_2 remains | Keep image_1, image_2 and empty image_3; retain image_2 edge identity |

## Cases

Simple: good = custom ID survives JSON save/reload and frozen resume; base = old settings use defaults; bad = switching to default omits the override from PATCH and leaves the old model saved.

Good: transparent PNG with URL references. Base: legacy Canvas background omitted, preserving provider defaults and old per-image fingerprints. Bad: changing background while reusing completed per-image results; include non-default background in the fingerprint.

HTTP and accepted-task failures redact configured primary/backup keys, bearer tokens, common key patterns and URLs before UI/logging. JSON errors preserve code/message; HTML error pages are omitted. Input errors are labeled application validation; HTTP refusal remains labeled upstream even when categorized input.

## Tests

- `toapis_image_api_check.mjs`: explicit request formats, counts, transparent JPEG and pixel validation.
- `canvas_image_models_check.mjs`: actual outgoing preset/custom/VIP requests, primary isolation, default inheritance, single-attempt refusal and redaction.
- `canvas_workflow_draft_persistence_check.mjs`: real isolated SQLite save/reopen of trimmed IDs and independent defaults. Clipboard checks and per-image invalidation live in workflow/image-each checks.
- `image_background_check.mjs`: captured actual outgoing ordinary/Official requests with and without references.
- `image_exact_pixels_check.mjs`: Official exact-size preflight and unmodified bytes/mismatch rejection.
- `canvas_image_each_check.mjs`: controls, validation, propagation, background invalidation and legacy default reuse.
- `simple_image_dimensions_browser_check.py`: 1440px/390px background selection, PNG, 4K ratio preservation and reload.
- `canvas_workflows_check.mjs` / `canvas_image_each_check.mjs`: numbered port limits, round-trip, sparse expansion, numeric ordering, async resume, bypass and disabled-source planning.
- `canvas_gpt_inputs_browser_check.py`: mocked 1440px/390px controls, pixel output, persistence and nested connections; desktop pointer connection and source deletion.

## Wrong Versus Correct

Simple reset: wrong = serialize `{ imageModel: undefined }`; correct = send `{ imageModel: null, imageToApisRequestFormat: null }`. `simple_image_dimensions_check.mjs` covers validation, persistence, reset, API snapshots and resume; its browser companion covers both viewport widths, format controls and launch capture.

Wrong: send Official `size: "3:4", resolution: "4k"` through the legacy adapter. Correct: send its already calculated `size: "2480x3312"` without resolution. This is the application's mapping, not a guarantee of upstream custom-size acceptance. Never claim live generation or alpha-channel acceptance from mocked checks.

Wrong: unknown model suffix falls through to legacy. Correct: pass model as data and choose requestFormat independently. New same-interface model IDs need no code changes.

Wrong: infer reference order from edge creation order, or sort image_10 before image_2 lexically. Correct: traverse registered numeric port IDs; preserve that identity in saved workflows and resumed runs.
