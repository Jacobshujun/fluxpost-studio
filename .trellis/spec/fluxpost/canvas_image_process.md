# Canvas image processing contract

## Scope and signatures

`utility.image-process@1` accepts/outputs standard `images` artifacts and permits bypass and iteration membership. `processCanvasImages(items, config, ownerUserId, signal?)` holds the localImage pool only during encoding. Source reads and storage happen outside that pool. No additional endpoint or database schema. The old image-transform node is unchanged.

Encoding runs in the traced `src/lib/canvas/image-encoder.mjs` Node child with a 120-second deadline. Cancellation or timeout kills the child and waits for process closure before releasing capacity. Queued resource acquisition and source downloads accept cancellation; cancellation prevents the next item and downstream execution. An already-started storage upload must settle before its execution slot is released.

## Configuration and outputs

`image-process-contract.ts` owns defaults and effective-field validation/identity. Fixed quality defaults to 90; percent/size ceilings search quality 75–90 by default. Percentage means maximum output bytes / source bytes, and KB uses 1024 bytes. PNG is lossless without palette conversion. Impossible targets fail, never silently resize or drop below the quality floor.

Resolution original/percent/longest/custom uses auto-oriented dimensions, Lanczos3, sRGB, metadata removal. Custom inside does not pad; cover is centered; contain pads. JPEG flattens transparency into the selected opaque background.

Outputs rebuild name, MIME, dimensions and SHA; never retain source localPath or SHA. Optional `CanvasMediaReference.imageProcessing` contains source URL/dimensions/bytes, output dimensions/bytes, actual quality, target bytes, savings and effective config identity. This survives existing JSON run persistence and supports stale-parameter UI feedback. ImageBatch and source order are retained.

## Validation and failure

Static JPEG/PNG/WebP only; 1–20 items, 30 MiB per input, 40M decoded/output pixels, output edge <=8192. Animated/corrupt/oversized media and impossible targets fail the entire node with the item ordinal; no partial downstream artifact. Original media is never overwritten.

Sharp/libvips exposes animated WebP pages but not APNG animation in metadata. Check PNG chunks for `acTL` explicitly rather than silently processing its first frame; the real-byte contract check includes both formats.

Directory URLs resolve through the owner-scoped snapshot, never trust an arbitrary item.localPath. Local and downloaded files both have actual size checks. Source content SHA + effective config + Sharp/libvips renderer version key an atomic local cache. Cached bytes are SHA/size verified and republished through runtime storage. Cache artifacts belong under ignored data/cache; outputs follow existing local/TOS settings.

## Examples and verification

### One-click production reuse

`WorkspacePromptSettings.imageProcessing` and `SimpleRun.imageProcessing` accept
`ImageProcessConfig | null`; omission preserves saved settings during PATCH,
null disables processing. Settings without the field default to JPEG quality 90,
original resolution (WebP when the saved generation background is transparent).
Explicit JPEG flattens alpha into its selected background.

New runs freeze the normalized config. Historical run snapshots without the field
resume with null, never with newly enabled workspace defaults. Source, viral and
original paths call `processSimpleImages(urls, config, ownerUserId)` before saving
their posts. It preserves order, chunks at 20 and uses the existing local pool,
cache and storage. Review/download/Feishu consume the resulting post URLs; no
historical files are rewritten. Invalid settings fail before storage; impossible
targets fail before post delivery rather than returning uncompressed images.

Regression coverage: `simple_image_dimensions_check.mjs` covers settings, frozen
resume, three-path wiring and source-post persistence/failure; the real encoder
and batching checks are in `canvas_image_process_check.mjs`. The existing simple
dimension browser check covers compression disable, save/reload, launch payload,
and disabled controls at 1440/390px. Shared controls remain Canvas-compatible.

- Base: JPEG quality 90 and original resolution.
- Good: 50% source-size ceiling encodes within quality limits and reports exact savings.
- Bad: 1 KB target below minimum-quality output fails explicitly; do not silently shrink dimensions or return the source as success.
- `canvas_image_process_check.mjs`: real encoders, orientation, alpha, dimensions, budgets, targets, ordered batches/cache/ownership, download byte sniffing, graph round-trip/bypass/iteration/scheduler and executor batch identity.
- `canvas_image_process_browser_check.py`: intercepted APIs at 1440px/390px, conditional inline/inspector controls, keyboard isolation, save/reload, stale results, desktop pointer connection and image preview. Requires worker-disabled loopback smoke server; rejects 3001.
