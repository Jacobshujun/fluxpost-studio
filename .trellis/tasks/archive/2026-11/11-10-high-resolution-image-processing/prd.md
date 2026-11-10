# High-resolution image processing

## Requirement

The operator's library includes 6K/8K sources that exceed the current 40 MP decoder limit. Existing image-processing nodes must accept these sources, including original-resolution JPEG compression, without rewriting source assets or historical jobs.

## Scope and acceptance

- Accept static JPEG/PNG/WebP sources up to 100,000,000 decoded pixels within the existing 30 MiB input-file limit.
- Allow original-size output through 8192 x 8192; larger accepted inputs must use an explicit resize mode to fit the existing 8192-pixel output-edge limit.
- Preserve selected geometry, quality/size targets, animation rejection, cancellation, bounded native encoding concurrency, caching, and source immutability. Do not resize silently.
- Verify real 8K landscape and square encoding, above-8K resizing, over-budget input rejection, and oversized output rejection in the existing isolated regression check.
- Run the full deterministic baseline, commit the verified changes, then activate the same clean primary-worktree candidate on port 3001, preserving its binding.
- No provider replay or changes to upstream-failure scheduling behavior in this task.

## Implementation and validation

Separate input/output pixel budgets in `image-process-contract.ts`; consume them in `image-encoder.mjs`. Extend `canvas_image_process_check.mjs` with real-byte fixtures and update `canvas_image_process.md` and lightweight task/status evidence. Validate with the focused check and `.trellis/verification/check.ps1` before local activation.
