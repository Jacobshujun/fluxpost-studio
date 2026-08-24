# FluxPost Current Status

Last updated: 2026-08-24

## One-Line Status

Per-image Canvas GPT reconstruction supports shared reference images and is verified and active on port 3001 from the clean committed candidate.

## Current Focus

- `model.gpt-image-each@2` sends `[current source, ...shared references]` for each of 1-18 source images, with at most 15 shared references.
- V1/V2 migration, ordering, limits, provider resume, failed-only retry, workflow persistence, schedulers, build, smoke, and full baseline passed without live providers.
- Partial results keep their existing review-draft and Feishu publish guards.

## Next Entry

Use the port-3001 Canvas candidate for operator review. Do not push or deploy without approval.

## Recent Verification

- 2026-08-24: Shared-reference per-image checks, full baseline, clean candidate activation, matching version identity, and `/canvas` HTTP 200 passed.
- 2026-08-24: Original per-image node, provider resume, publish guards, scheduler compatibility, baseline, candidate activation, and HTTP smoke passed.
- 2026-08-21: Standalone GPT text checks, baseline, candidate activation, and authenticated draft refresh passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
