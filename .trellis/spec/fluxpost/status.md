# FluxPost Current Status

Last updated: 2026-08-21

## One-Line Status

Canvas workflow save serialization is verified and active on the clean port-3001 candidate.

## Current Focus

- Automatic and manual Canvas saves now share one serialized coordinator; newer edits queue with the prior response revision, covered manual clicks receive stable acknowledgement, and failures preserve dirty state until explicit retry.
- Server optimistic locking and the 900 ms automatic-save delay are unchanged. Deterministic race checks, mocked Chromium, TypeScript, lint, build, and the full offline baseline passed.

## Next Entry

Use the port-3001 Canvas normally and monitor the stable “保存中”/“画布已保存” feedback. Do not push or deploy production without separate approval.

## Recent Verification

- 2026-08-21: Canvas save coordinator and mocked Chromium proved one in-flight PATCH, revision chaining, latest-graph follow-up, covered manual acknowledgement, failure blocking, explicit retry, and stable save feedback; TypeScript, lint, build, full offline baseline, clean candidate identity, and `/canvas` HTTP passed.
- 2026-08-20: Real Faster Whisper `1.2.1` small/CPU/int8 verification produced 11 privacy-safe acoustic boundaries for the recent 16.136-second local input; landscape, portrait, rotate-90, delayed-audio, H.264/AAC, and full-duration FFmpeg fixtures passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
