# Implementation Plan

1. Read targeted Trellis canvas, storage, API, and verification guidance; activate task after artifact review.
2. Add migration and snapshot domain helpers for owner-scoped directory groups, hashing, limits, and revalidation.
3. Extend canvas types/registry/serialization and implement authenticated scan, snapshot, preview, and feature-gate APIs.
4. Implement local-directory executor and UI controls, including audio selection and scan report states.
5. Implement slideshow layout/text rendering and FFmpeg executor with deterministic transitions, ratios, duration, and output probing.
6. Add slideshow editor UI, canvas template, and compose wiring.
7. Add V2 `directory-group` parameter/adapter, batch preset, and independent child task handling.
8. Add focused deterministic checks for contracts, scan/security, rendering, scheduling, and responsive behavior.
9. Run focused checks, TypeScript, lint, build, and `.trellis/verification/check.ps1`; update Trellis state/evidence, commit, and only then run `npm run local`.
