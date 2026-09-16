# Design

Optional config.model and toApisRequestFormat retain node identity. Presets fill independent request-format metadata, custom input preserves it and exposes a format selector. The provider profile still owns transport and URL. ToAPIs body builders take ratio/pixels/legacy explicitly and never infer a submitted model's contract. Missing route format uses a narrow historical default-model migration; unknown defaults use ratio. Explicit node overrides cannot fail over.

Public documentation rechecked 2026-09-16 through read-only GETs: ordinary /gpt-image-2.5/generation.md uses ratio and resolution; /gpt-image-2.5-vip/generation.md uses pixel size without resolution, async tasks, and URL references in generations. VIP edits documentation also describes multipart URL edits, but no alternate endpoint is tried. Existing mapper translates 4K/4:3 to 3312x2480. Actual pixel acceptance is upstream-defined and untested live.

Model and format propagate through ImageGenerationOptions and per-image fingerprints. Serialization trims IDs while preserving absence. Provider error details are bounded and credential-redacted before reaching logs/UI.
