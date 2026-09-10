# Explicit per-image iteration regions

User approved implementation on 2026-09-09. Add a reusable image iteration region independent of schedule children. Build the inner workflow once; execute for each of 1-18 images. Inputs: images, shared text, shared references. Selected text/images outputs retain original order. No nested regions, video or external writes inside.

Default all-success policy; optional at-least-one. Retry failures retaining successes. Repair after partial delivery marks downstream stale until explicit refresh; never auto-publish. Explicit schedule sharing freezes outputs after consumption; reject child-parameter dependencies. Old workflows unchanged. No commit, activation, production calls or deployment.

Acceptance: five-image pairing/order, shared inputs, invalid counts, failures/retry/cancel/recovery/isolation, schedule multi-port snapshots, editing/save/copy/import, desktop/mobile mock checks and offline baseline.

All implementation acceptance checks passed; see verification.md. Live-provider and PostgreSQL multi-process acceptance remain operator gates and are not claimed.
