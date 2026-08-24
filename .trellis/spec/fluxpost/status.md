# FluxPost Current Status

Last updated: 2026-08-24

## One-Line Status

Standalone Canvas GPT text and the per-image GPT reconstruction Canvas node are implemented and verified offline; no port-3001 candidate has been activated for this task.

## Current Focus

- `model.gpt-image-each@1` fans out 1-18 source images with default concurrency 8 (configurable 1-20), submits one reference image with `count=1`, persists child/provider state, aggregates ordered successes, and retries failed children only.
- Partial results update the original Canvas review draft with failure indices and are blocked from Feishu publishing; V2 scheduler image targets accept the new node.
- Focused checks and the full offline baseline passed without live providers.

## Next Entry

The implementation is ready for clean candidate activation; do not push or deploy without separate approval.

## Recent Verification

- 2026-08-24: Per-image GPT reconstruction node, provider resume, partial-draft/publish guard, V2 scheduler compatibility, focused mock-provider checks, and the full offline baseline passed without live providers.
- 2026-08-21: Standalone GPT text planning, prompt assembly, validation, bypass, build, smoke, and the offline baseline passed without live providers.
- 2026-08-21: Clean candidate activation and authenticated PostgreSQL draft refresh passed; fixtures were removed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
