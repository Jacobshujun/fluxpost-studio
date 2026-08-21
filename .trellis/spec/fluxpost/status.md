# FluxPost Current Status

Last updated: 2026-08-21

## One-Line Status

Canvas subtitle manual revision editor is verified, committed, and active on the clean port-3001 candidate.

## Current Focus

- Successful subtitle runs now persist structured timelines; the full-screen editor supports synchronized video/waveform/timeline, text/time correction, segment CRUD/split/merge, undo/redo, explicit draft saves, and dirty-close protection.
- Owner/workflow/node/video-scoped revisions use optimistic locking; frozen workflow snapshots skip Whisper only for a matching video SHA-256 and isolated apply runs only the subtitle node.
- PostgreSQL/SQLite revision and waveform cache schemas, deterministic domain/FFmpeg/cache checks, and mocked desktop/mobile Playwright coverage passed without external provider calls.
- Port 3001 activated the clean subtitle editor candidate with matching version identity and healthy `/canvas` response.

## Next Entry

Rerun an operator-selected video once to create structured subtitle metadata, then use “校对字幕” and validate one real manual re-burn. Do not push or deploy production without separate approval.

## Recent Verification

- 2026-08-21: Canvas subtitle editor domain/API/schema/cache checks, TypeScript, lint, build, two full offline baselines, and mocked desktop/mobile Playwright passed; clean work commit `af6e12b1cbacf9b9651b2f78a3e9b6fe2980e3f3` was activated with matching `/api/version` and healthy `/canvas`.
- 2026-08-20: Real Faster Whisper `1.2.1` small/CPU/int8 verification produced 11 privacy-safe acoustic boundaries for the recent 16.136-second local input; landscape, portrait, rotate-90, delayed-audio, H.264/AAC, and full-duration FFmpeg fixtures passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
