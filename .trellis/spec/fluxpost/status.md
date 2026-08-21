# FluxPost Current Status

Last updated: 2026-08-21

## One-Line Status

Standalone Canvas GPT text is implemented and verified for the clean port-3001 candidate.

## Current Focus

- `model.gpt-text@1` accepts optional upstream text while instructions stay required and bypass stays input-dependent.
- Focused checks and the full offline baseline passed without live providers.

## Next Entry

Use the port-3001 Canvas normally; do not push or deploy without separate approval.

## Recent Verification

- 2026-08-21: Standalone GPT text planning, prompt assembly, validation, bypass, build, smoke, and the offline baseline passed without live providers.
- 2026-08-21: Clean candidate activation and authenticated PostgreSQL draft refresh passed; fixtures were removed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
