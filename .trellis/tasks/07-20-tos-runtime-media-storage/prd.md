# Volcengine TOS runtime media storage

## Goal

Store all newly created or cached FluxPost runtime media in Volcengine TOS so browser delivery no longer consumes the `82.158.226.10` VPS disk and outbound bandwidth.

Existing media remains in the current Docker volumes and must continue to work. The deployment at `104.243.21.233` is out of scope.

## Confirmed Facts

- Runtime media currently lives under `public/media/crawl` and `public/generated`.
- Runtime records store media URL strings rather than binary data, so no database schema migration is required.
- The target deployment is `82.158.226.10` / `flux.lightmoment.net`.
- TOS credentials are supplied in `C:\Users\Administrator\Desktop\TOS.txt`; their values must never be copied into Git, Trellis, logs, or responses.
- The configured TOS region is `cn-guangzhou`; the deployment object prefix is `fluxpost/flux-lightmoment`.

## Requirements

- Add an environment-driven TOS integration using the official Node SDK. It must be disabled by default.
- Upload newly cached crawl images, source videos, selected video frames, generated images, ComfyUI outputs, review uploads, and Feishu-imported media.
- Do not migrate historical media or administrator-managed external material directories.
- Publish new media as HTTPS TOS URLs using object-level `public-read`; do not widen the entire bucket ACL.
- Return a media URL only after upload and `headObject` size verification succeed. Include an ETag-derived cache version in the URL.
- Remove successful local staging files. After exhausted upload retries, move the file under `data/tos-pending/<object-key>`, record an explicit error, and fail the owning operation according to its existing error semantics.
- Provide an idempotent pending-file reconciliation path. It may upload and remove pending files but must not silently mutate or resume the original business task.
- Keep temporary files needed by ffmpeg, model input, transcription, and Feishu CLI only for the duration of the operation.
- Treat configured TOS URLs as durable cached media in cache status and UI labels.
- Preserve current local-media behavior when TOS is disabled and preserve historical local URLs after TOS is enabled.
- Expose only non-sensitive TOS readiness booleans from the public config status. Advanced config must mask secrets and allow only known TOS keys.
- Provide an admin-only live TOS probe that verifies upload, HEAD, anonymous public GET, byte Range behavior, and cleanup without becoming part of the default baseline.

## Acceptance Criteria

- [ ] Offline verification covers disabled mode, key/URL construction, upload verification, retry exhaustion, pending retention, successful local cleanup, object reuse, and forced overwrite without calling TOS.
- [ ] Every in-scope runtime media producer returns a TOS URL when enabled and leaves no successful persistent copy in the public media volumes.
- [ ] Model image input, image editing, video transcription, and Feishu attachment publishing can consume TOS media through bounded temporary files that are cleaned up.
- [ ] Existing local `/media/...` and `/generated/...` records still load.
- [ ] Advanced configuration masks both TOS credentials and the admin live probe returns no credentials or signed request details.
- [ ] Lint, TypeScript, build, Trellis baseline, and local production restart pass.
- [ ] The target VPS deploys with existing PostgreSQL, Nginx, Open WebUI, Dongchedi, RunningHub, and Seedance services undisturbed.
- [ ] Live probe on `82.158.226.10` proves public object GET and Range `206` before TOS is enabled for normal writes.
- [ ] The Trellis feature remains `ready_for_review` unless live application media production evidence is complete.

## Out Of Scope

- Historical media migration or deletion.
- Uploading administrator-managed external material folders.
- Changing the old VPS deployment.
- Bucket-wide public-read policy or ACL changes.
