# Verification

- New mixed-media regression reproduced `unsupported rich-text insert` before the fix.
- Xiaopeng import, video quality selection, link import and simple link run focused checks passed after the fix.
- Read-only reported-page normalization now returns 959 Unicode body characters, seven unique images, three video URLs and mixed media with a primary video. Previous image-only incident remains 334 characters/seven images. No media download, provider generation or runtime mutation was used for this comparison.
- Full documented baseline passed its domain checks and reached the unchanged ignored-data lint blocker (17 errors). Not a full baseline pass.
- Source lint (`npm run lint -- --ignore-pattern 'data/**'`) passed with zero errors and 17 existing warnings; TypeScript, production build, built-config synchronization, SQLite check and worker-disabled HTTP smoke on 45678 passed. Smoke server stopped after verification.
- Pre-activation read-only checks found zero unexpired running leases in Canvas, image, simple, publishing and original-batch queues. Delivery uses committed clean HEAD through `npm run local:lan` and its runtime identity/HTTP checks.
- Reimport is needed for failed tasks. All distinct source video URLs survive normalization, but existing media cache/download handles one primary video, not multiple separate video assets.
