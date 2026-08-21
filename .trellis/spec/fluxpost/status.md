# FluxPost Current Status

Last updated: 2026-08-21

## One-Line Status

Canvas incomplete-draft persistence is fixed, verified, and active on the clean port-3001 candidate.

## Current Focus

- Canvas create/update/import now decode graph structure before persistence validation, so unfinished nodes and missing run inputs can be saved without weakening malformed graph rejection.
- Run planning retains full config/input/provider readiness checks. Isolated SQLite round-trip, malformed-config rejection, save-race checks, TypeScript, lint, build, and the full offline baseline passed.

## Next Entry

Use the port-3001 Canvas normally and monitor draft saves across refreshes. Do not push or deploy production without separate approval.

## Recent Verification

- 2026-08-21: Clean candidate activation and authenticated PostgreSQL draft refresh passed; fixtures were removed.
- 2026-08-21: Canvas incomplete-draft persistence, structural decoding, execution-readiness separation, isolated SQLite round-trip, malformed-config rejection, save-race checks, and the full offline baseline passed.
- 2026-08-20: Real Faster Whisper `1.2.1` small/CPU/int8 verification produced 11 privacy-safe acoustic boundaries for the recent 16.136-second local input; landscape, portrait, rotate-90, delayed-audio, H.264/AAC, and full-duration FFmpeg fixtures passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
