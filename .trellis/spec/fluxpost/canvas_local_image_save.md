# Canvas Local Image Saving

## 1. Scope / Trigger

`utility.save-images@1` automatically writes files when `config.outputFolder` contains a non-whitespace folder. Empty/missing folders retain browser-only downloads. Paths belong to the application host, including when accessed over LAN. The node remains an outputless, non-bypassable passive sink with its existing required multi-connection images input.

## 2. Signatures

`saveCanvasImagesToFolder({ runId, nodeId, outputFolder, filenamePrefix, urls, previous?, checkpoint })` returns `CanvasSaveImagesMetadata`. Config adds optional `outputFolder: string`; node metadata adds `saveImages`. Existing JSON node-run storage carries the metadata; no table or route is added.

## 3. Contracts

- Relative directories resolve against `process.cwd()`. Absolute host-native paths are accepted and missing directories are created. `canvasLocalDirectoryEnabled()` applies the existing `CANVAS_LOCAL_DIRECTORY_ENABLED` / `FLUXPOST_RUNTIME_MODE` policy.
- Keep ordered `outputs.downloads` image references. Materialize through the existing runtime-media helper and inspect actual image bytes. Preserve original bytes; enforce 1–30 images and 30 MB per image.
- Files use `<prefix>_<ordinal padded to at least four digits>.<actual extension>`. Continue above existing matching numbered files and use exclusive `wx` creation to handle races without overwriting. Numbering is not capped at 30.
- Metadata contains run/node identity, resolved folder, prefix, and ordered URL/status/path/SHA-256/claimed/error records. Checkpoint the proposed path before creation and ownership after exclusive creation, before writing. Only owned, same-run/node/config/input records whose file hashes still match can skip a retry write. New runs create new files. Missing/changed files receive a new exclusive target; changed user files remain intact.
- Ordinary failed writes remove only their own incomplete file; successful files remain. Interrupted writes can leave incomplete files, which are never overwritten on recovery. Checkpoint failures stop execution. No exactly-once guarantee is claimed for an interrupted write before durable ownership is recorded.
- Image failures are recorded individually; a node with any failed save finishes failed with download references and metadata. Download authorization additionally accepts failed save nodes carrying local-save metadata; owner-visible immutable snapshot checks remain required.
- The node and inspector share prefix/folder controls. The result shows current-attempt folder/count/errors; historical download results remain explicitly labeled and never supply the current save summary.
- Inline text inputs keep a focused local draft and stay visible while focused, even when the canvas enters overview zoom. Editing does not open the mobile inspector over the active input. Browser keyboard checks click and focus the actual input before typing; changed values must survive autosave/refresh.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Missing/blank folder | Existing browser-only behavior |
| Non-text, controls, URL, Windows drive-relative path | Reject configuration |
| Windows drive/UNC path on a non-Windows host | Explicit unsupported-path error |
| Environment disabled | Explicit local-directory-disabled error |
| Existing target file | Increment filename; never overwrite |
| Permission, disk-space, folder-is-file error | Visible per-image failure; preserve earlier successful files |
| Invalid/oversized source | Fail that item, clean temporary source |
| Checkpoint unavailable | Stop writes; propagate failure |

## 5. Good / Base / Bad

- Good: a batch writes to `output/车型`, preserves actual PNG/JPEG bytes, and concurrent runs get distinct numbered files.
- Base: an older workflow without `outputFolder` executes and downloads as before.
- Bad: silently treating a local write failure as success, using another run's save receipt, or reading a historical folder as the current attempt's destination.

## 6. Tests Required

- `node .trellis/verification/canvas_local_image_save_check.mjs`: real isolated files, Unicode/relative folders, bytes, concurrency, owned/unowned checkpoint recovery, missing/modified files, partial retry, permissions/disk-full stubs, limits, and executor outputs.
- Existing download/workflow/scheduler checks cover failed-save downloads, portable config, and frozen child/aggregate config.
- `python .trellis/verification/canvas_local_image_save_browser_check.py`: intercepted APIs on a worker-disabled loopback server via `BROWSER_BASE_URL` (never 3001), three themes at 1440/390, editing/autosave/refresh and current-failure versus historical-download separation.
- Run the complete baseline; document unchanged runtime-data lint blockers without editing user data.

## 7. Wrong vs Correct

Wrong: check existence then overwrite, or assume a planned filename belongs to this run. Correct: exclusive creation, durable ownership before writing, then hash-verified same-run recovery. Path metadata alone cannot prove ownership after a concurrent collision.
