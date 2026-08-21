# FluxPost Current Status

Last updated: 2026-08-21

## One-Line Status

Canvas subtitle Windows UTF-8 transport fix is verified, committed, and active on the clean port-3001 candidate.

## Current Focus

- Canvas subtitle protocol v4 explicitly transports Python stdout as UTF-8, invalidates possibly corrupted v3 caches/outputs, and preserves local Faster Whisper timing with no Ark fallback.
- FFprobe normalizes rotation/displayed dimensions and stream origins; ASS, output metadata, and the actual-video inspector preview use the same displayed size.
- Deterministic non-ASCII process transport, landscape/portrait/rotate-90 FFmpeg, delayed origins, full duration, browser geometry, and explicit failures are covered.
- Privacy-safe real-media verification on the recent `1280x720 / 16.136009s` input produced 11 acoustic segments from `0ms` through `15940ms` without recording subtitle text.
- Port 3001 activated the clean UTF-8 fix candidate with matching version identity and healthy `/canvas` response.

## Next Entry

Rerun an operator-selected Chinese video through the Canvas subtitle node; v4 will bypass any corrupted v3 timeline/output cache. Do not push or deploy production without separate approval.

## Recent Verification

- 2026-08-21: Canvas subtitle v4 UTF-8 checks and full offline baseline passed; clean work commit `67608048adea28ec42164c1a7ac1ea556d8d9b68` was activated with matching `/api/version` and `/canvas` HTTP 200.
- 2026-08-20: Real Faster Whisper `1.2.1` small/CPU/int8 verification produced 11 privacy-safe acoustic boundaries for the recent 16.136-second local input; landscape, portrait, rotate-90, delayed-audio, H.264/AAC, and full-duration FFmpeg fixtures passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
