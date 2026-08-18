# Support current Dongchedi article paths

## Goal

Fix category discovery and article canonicalization for current /article/{id} URLs while preserving legacy /ugc/article/{id} input compatibility.

## Requirements

- Discover same-host Dongchedi article links using the current `/article/{id}` path as well as the legacy `/ugc/article/{id}` path.
- Canonicalize newly discovered and numeric-ID article requests to the current `https://www.dongchedi.com/article/{id}` URL.
- Preserve direct-import compatibility for legacy `/ugc/article/{id}` input URLs and keep existing host, protocol, redirect, challenge, size, and count guards unchanged.
- Keep discovery static-HTTP based. Playwright remains diagnostic-only and must not become a runtime dependency.
- Report an explicit access/login-shell error when authenticated article markup is unavailable instead of implying that a valid empty category was processed.

## Acceptance Criteria

- [x] A fixture containing current `/article/{id}` links yields ordered, deduplicated candidates capped at 30.
- [x] Legacy `/ugc/article/{id}` links remain accepted and normalize to current canonical article URLs.
- [x] External-host lookalikes, invalid IDs, non-HTTPS category URLs, and non-category paths remain rejected.
- [x] Existing direct Dongchedi import and category workflow checks pass without live provider calls.
- [x] Lint, TypeScript, build, and the complete deterministic Trellis baseline pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
