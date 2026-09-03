# Canvas Media Mask Implementation Plan

1. Add the versioned mask region/config and `utility.media-mask` node type, ports, defaults, field metadata, and registry validation.
2. Add executor dispatch for exactly one image or video artifact, including frozen config normalization and typed output errors.
3. Extend Canvas media tools with deterministic image masking, video masking, interval handling, rounded masks, overlay materialization, fingerprint caching, and atomic persistence.
4. Add inspector/editor controls for regions, shape, mode, coordinates, opacity, color/overlay, video intervals, and keyframes using existing Canvas responsive styles and icon conventions.
5. Add isolated verification fixtures for config validation, image modes, video output/audio/duration, interval/keyframe behavior, cache identity, source preservation, and snapshot freezing.
6. Run focused Canvas checks, then TypeScript, lint, build, isolated HTTP/SQLite smoke, and the full Trellis baseline.
7. Review the final diff for scope drift, update stable specs only if a reusable project fact is discovered, then commit the verified change.

## Risky Files And Rollback Points

- Risky shared contracts: `src/lib/canvas/types.ts`, `registry.ts`, `executors.ts`; rollback these together if existing node validation regresses.
- Risky media behavior: `src/lib/canvas/media-tools.ts`; keep new filter construction isolated and preserve existing media-tool paths.
- Risky UI surface: Canvas inspector/editor components and global Canvas styles; verify desktop/mobile containment before acceptance.
- Runtime media under `public/generated/` is local state and must not be committed.

## Required Commands

- Focused new Canvas mask verification script(s) under `.trellis/verification/`.
- `$env:TRELLIS_SMOKE_PORT = "45678"; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`
- `npx --no-install tsc --noEmit`
- `npm run lint`
- `npm run build`
