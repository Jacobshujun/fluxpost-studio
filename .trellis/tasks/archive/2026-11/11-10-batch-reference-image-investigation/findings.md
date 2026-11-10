# Findings

Date: 2026-11-10 (Asia/Shanghai)

## Evidence

Read-only inspection of the operator-reported local batch and its immutable execution records established:

- The frozen graph connects a vehicle image through `utility.image-process` to GPT `image_1`. A separate modification-reference image connects directly to `image_2`. The scene image is converted to text through Vision, as wired.
- There are 10 main tasks and 36 child tasks. Every GPT node's persisted input has one image in `image_2` and no `image_1`. GPT completed in 35 children and failed during reference preparation in one; all 36 underlying child runs are `partial`.
- Vehicle preprocessing produced no image in any child. Across its 112 recorded attempts: 105 pixel-limit errors and seven fetch errors. Latest preprocessing attempts: 33 pixel-limit errors and three fetch errors. These attempts must not be confused with distinct child counts.
- The five frozen vehicle assets have dimensions 7996 x 5333 (42,642,668 pixels) or 8192 x 5464 (44,761,088 pixels), above the 40,000,000 input-pixel limit. Network failures prevented some attempts from reaching that validation.
- Preprocessing uses `resizeMode: original` and JPEG quality compression. The stored longest-edge value does not apply in this mode. The encoder also checks input metadata against the pixel limit before resizing, so selecting a smaller output size alone cannot admit these originals.

## Code path

- `src/lib/canvas/image-process-contract.ts`: input/output pixel budget is 40,000,000.
- `src/lib/canvas/image-encoder.mjs`: passes this budget as Sharp `limitInputPixels` before reading metadata and before resizing.
- `src/lib/canvas/runs.ts`: dependencies become ready after upstream terminal status, including failure. Only successful outputs enter the input map; missing required ports are checked, but a failed connected optional reference is not required.
- `src/lib/canvas/registry.ts`: GPT V2 requires a prompt; numbered image ports are optional. Ordered reference collection flattens only the available artifacts.
- `src/lib/canvas/executors.ts`: GPT builds references from available ordered inputs and calls `generateCanvasGptImages`. Consequently, the surviving `image_2` becomes the sole reference in the provider list; the prompt still refers to both images.

## Consequence and repair directions

The missing vehicle image originates before provider dispatch. A preprocessing rejection combines with permissive downstream execution to permit generation with incomplete reference input. The output cannot be relied on to preserve the intended vehicle identity, angle, and proportions.

Repair should separately address high-resolution input handling (bounded decode and explicit resize, or suitably resized source assets) and execution validation for connected references that fail upstream. Merely lowering JPEG quality or changing an inactive output-size field does not resolve the input check. Changes and any real-model replay remain outside this diagnostic task.

## Verification

The existing deterministic baseline passed on 2026-11-10: offline contracts, ESLint (zero errors / 16 existing warnings), TypeScript, production build, isolated HTTP smoke on port 45678, and SQLite checks. Local ignored log: `test-artifacts/reference-image-investigation-baseline.log`. No application code changed.

Queries used a dedicated diagnostic connection, `BEGIN READ ONLY`, and a bounded statement timeout; no runtime task rows were changed and no provider requests were replayed. The port-3001 runtime identity matched the inspected source HEAD.
