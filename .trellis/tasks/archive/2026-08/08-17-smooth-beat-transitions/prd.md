# Smooth Beat-Synced Video Transitions

## Goal

Improve the external `0814/make-videos.ps1` script so image videos use smooth, varied transitions and stable music-aware cuts without flash or glitch artifacts.

## Requirements

- Preserve the existing `.bat` entry point, `-Root`, `-Force`, natural sorting, media validation, atomic output replacement, and encoding compatibility.
- Compute a per-folder duration from image count: `clamp(1.1 + imageCount * 1.15, 8, 15)`, capped by source audio duration.
- Read audio from the beginning and never loop it.
- Replace independent local peak searches with robust onset candidates and globally selected cuts with frame quantization, boundary guards, and minimum shot spacing.
- Use a deterministic smooth transition pool without flash, glitch, color shift, or hard cuts.
- Add deterministic 2%-5% Ken Burns motion after foreground/background composition.
- Bump encoder metadata so prior outputs are rebuilt.
- Do not modify FluxPost application code.

## Acceptance Criteria

- [x] PowerShell parses without errors and the generated FFmpeg filter graph executes.
- [x] Every multi-image cut uses a 0.24-0.42 second smooth transition centered on its selected cut.
- [x] Selected cuts are frame-aligned, ordered, and at least 0.65 seconds apart when the target duration permits.
- [x] Outputs use the computed duration and do not repeat short audio.
- [x] Outputs remain H.264 Main level 4.0, 1080x1920, 25fps, yuv420p, AAC-LC 48kHz stereo.
- [x] Representative 1, 4, 8, and 12-image folders encode successfully, including folders 17 and 18 with short audio.
- [x] Repeated planning for the same folder produces identical cuts, effects, and motion choices.

## Out Of Scope

- Automatic selection of a later music segment.
- Manual per-folder audio offsets.
- Changes to the FluxPost web application or deployment.
