# Verification - 2026-09-17

## Diagnosis
- Local `/api/version` reported clean candidate `78908e7beda62a718e2e063e3af3e77a6f11ed06`,
  including the prior source-binding repair.
- Read-only PostgreSQL inspection located the latest reported workflow run at
  13:55:58 UTC, with layer composition failing at 13:59:07 UTC. Both media layers
  had node/port bindings. The failure was ENOENT opening the final output MP4.
- A read-only HEAD for that exact output returned 200, video/mp4, 27,363,200 bytes;
  its local output file was absent. No object writes or runtime row changes.
- `persistRuntimeMedia` verifies storage and removes the local file. The renderer
  then computed SHA-256 from the removed output. The fix captures it beforehand.

## Regression
- The new consuming-storage fixture failed on old code with output-file ENOENT.
- `node .trellis/verification/canvas_layer_compose_check.mjs` passes after the fix:
  PNG/MP4, fresh/cached outputs, canonical returned URL, digest equal to uploaded
  bytes and preserved storage cleanup, plus existing rendering/binding checks.
- Adjacent image-processing and media-tools persistence callers do not read the
  output file after storage; image processing retains its precomputed digest.
- Full offline baseline passed with explicit exit 0 on worker-disabled port 45680:
  domain checks, lint (0 errors, 17 existing warnings), TypeScript, production
  build, HTTP smoke and SQLite. Log:
  `test-artifacts/layer-compose-persistence-baseline-final.log`.
  The first log also reported baseline success, but PowerShell stream redirection
  returned exit 1; rerunning with direct child file descriptors confirmed exit 0.
- No frontend behavior changed; browser verification is not required for this
  file-lifecycle ordering fix. Existing real Sharp/FFmpeg tests cover output bytes.

## Retrospective
- Category: cross-layer contract and test-coverage gap. Existing persistence mocks
  retained the file, hiding the production storage cleanup behavior.
- The earlier binding repair addresses a separate failure and is present in the
  failed run. This defect happens after rendering and persistence succeed.
- Prevention: document output metadata-before-persistence in the composition
  contract and verify consuming storage at the producer boundary.
- No UI changes, paid generation, workflow replay, Feishu messages or publishing.
- The reported run had already completed its downstream publish job with a post
  containing no composition video. Do not replay the whole workflow as diagnosis.
- Pre-activation read-only queue checks found historical unfinished rows; the
  newest running Canvas lease expired on September 16, with no active publish or
  distribution jobs. No queue rows were repaired or removed.
