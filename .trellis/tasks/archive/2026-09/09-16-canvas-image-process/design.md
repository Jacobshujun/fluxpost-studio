# Design

Client-safe image-process-contract owns defaults, validation, effective-config identity and report type. Server image-process uses installed Sharp, existing localImage pool, runtime materializer/storage and authorized directory snapshot resolution. Source content hash + effective config + encoder version determines cache; atomic staging and verified output metadata. No inherited source localPath/hash. Executor preserves imageBatch.

Dedicated route-local controls/result component shared by inline node and inspector. Optional CanvasMediaReference.imageProcessing report avoids new artifact kinds, schema or endpoints. Sequential processing; fail whole node on any item error. Prior successes remain cacheable for retries.

Defaults: JPEG, quality 90, min 75, source percentage 50, target 500 KiB, original size, scale 100%, longest 2160, custom 1080x1440 inside, white background. Transparency only for PNG/WebP.
