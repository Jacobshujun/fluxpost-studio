# ToAPIs Image Contracts

## Scope

Applies to `buildToApisGenerationBody` in `src/lib/toapis-image-api.ts` and Canvas background propagation. Documentation read 2026-09-16:

- https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5/generation
- https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5-official/generation

## Signatures

`buildToApisGenerationBody({ model, prompt, requestedSize, ratio, resolution, quality, count, background, referenceImages })` supplies JSON for `POST /v1/images/generations`. Accepted task IDs resume through `GET /v1/images/generations/{id}` before any new uploads or submissions.

Canvas registry helpers: `getCanvasVisibleInputPorts(node, connectedPortIds)`, `orderedCanvasGptImageInputs(inputs)` and `getCanvasRequiredInputPorts(node, availablePortIds)` share UI, executor, planner and bypass behavior.

## Contracts

| Models | Size | Quality | References |
| --- | --- | --- | --- |
| gpt-image-2.5-flare / gpt-image-2.5-sunburst | ratio plus resolution | fixed high | reference_images |
| gpt-image-2.5-flare-official / gpt-image-2.5-sunburst-official | requested pixel size; no resolution | selected quality | image_urls |

Both use n=1, optional background=transparent, and asynchronous task IDs. Omit background for normal generation. Do not send output_format/output_compression/response_format for these documented 2.5 contracts. Official defaults to PNG; custom pixel sizes remain subject to upstream acceptance.

Canvas/simple ratio/tier selectors already calculate a pixel size. Official uses those pixels; ordinary models use ratio/tier. Never apply the older-model 4K ratio allow-list to either supported 2.5 family. Match the documented full names; do not infer that VIP or unknown suffixes share the contract.

Canvas GPT image V2 supports optional `image_1` through `image_16`, one edge per port, with groups preserving their internal order. Display ports through the highest connected number plus one empty port, capped at 16. Disconnects never renumber other edges. Legacy `referenceUrls` precede legacy `references`, then numbered ports in numeric order; generation deduplicates URLs by first occurrence and enforces 16 total references. Hide the legacy input only when unwired. Bypass merges wired images in the same port order. Numbered run snapshots retain original inputs instead of inserting a second aggregate `references` input. Inline fields and the inspector share atomic transparent/PNG changes and the pixel mapper; no node-local route override is introduced.

## Validation

| Input | Outcome |
| --- | --- |
| Ordinary 3:4 + 4k | Submit size=3:4, resolution=4k |
| Official 3:4 + 4k with calculated pixels | Submit pixel size, omit resolution |
| Official exact size | Preserve pixels; check exact returned dimensions before persistence |
| count other than 1 | Input error; no retry/failover |
| transparent + JPEG | Input error; Canvas selection changes format to PNG |
| Official ratio/tier without calculated pixels | Input error, no silent square substitution |
| Second edge on image_1 / unknown image_17 | Graph persistence rejects input |
| Disconnect image_1 while image_2 remains | Keep image_1, image_2 and empty image_3; retain image_2 edge identity |

## Cases

Good: transparent PNG with URL references. Base: legacy Canvas background omitted, preserving provider defaults and old per-image fingerprints. Bad: changing background while reusing completed per-image results; include non-default background in the fingerprint.

## Tests

- `toapis_image_api_check.mjs`: exact model names, field shapes, counts, transparent JPEG and pixel validation.
- `image_background_check.mjs`: captured actual outgoing ordinary/Official requests with and without references.
- `image_exact_pixels_check.mjs`: Official exact-size preflight and unmodified bytes/mismatch rejection.
- `canvas_image_each_check.mjs`: controls, validation, propagation, background invalidation and legacy default reuse.
- `simple_image_dimensions_browser_check.py`: 1440px/390px background selection, PNG, 4K ratio preservation and reload.
- `canvas_workflows_check.mjs` / `canvas_image_each_check.mjs`: numbered port limits, round-trip, sparse expansion, numeric ordering, async resume, bypass and disabled-source planning.
- `canvas_gpt_inputs_browser_check.py`: mocked 1440px/390px controls, pixel output, persistence and nested connections; desktop pointer connection and source deletion.

## Wrong Versus Correct

Wrong: send Official `size: "3:4", resolution: "4k"` through the legacy adapter. Correct: send its already calculated `size: "2480x3312"` without resolution. This is the application's mapping, not a guarantee of upstream custom-size acceptance. Never claim live generation or alpha-channel acceptance from mocked checks.

Wrong: infer reference order from edge creation order, or sort image_10 before image_2 lexically. Correct: traverse registered numeric port IDs; preserve that identity in saved workflows and resumed runs.
