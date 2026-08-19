# Remove content-pool automatic production strategy

## Goal

Remove the automatic industry/competitor/Xpeng/video/pickup-record production strategy from content-pool secondary creation and ordinary simple runs. Production behavior must be controlled by the main workspace's persisted text prompt, image-tag prompts, and explicit media controls.

## Background

- `src/lib/production-plan.ts` currently classifies every source and can change or block production based on detected direction and media type.
- `src/app/content/page.tsx` displays that derived strategy in the content-pool detail pane.
- `src/lib/simple-runs.ts` and `src/lib/openai.ts` currently consume stored or recomputed plans during generation.
- Both the main workspace and content desk already read the same persisted `WorkspacePromptSettings`.

## Requirements

- Remove the content-pool production-strategy card and its industry/competitor/Xpeng/video/pickup-record/unknown presentation helpers.
- Stop creating or recalculating automatic production plans when content is ingested, created, edited, or refreshed.
- Stop simple-run candidate selection from excluding pickup-record content. Existing media eligibility remains: when image generation is enabled, a source still needs usable image/video-frame input.
- Stop text generation from reading stored, recomputed, or caller-supplied automatic production plans, including historical plans already persisted in source records.
- Use the frozen main-workspace settings on each run: `textInstruction`, image-tag prompts, image size/quality, and explicit media switches.
- Keep visual-tag image routing (`APP`/interior keep, exterior/text/people prompt selection) because those prompts are directly configured in the main workspace.
- Preserve content safety filtering, source tagging, hot-score ranking, content-pool persistence, review staging, and owner scoping.
- Preserve content-pool `writeFeishu=false` review-first behavior.
- Keep legacy `ProductionPlan` fields/types readable for historical records; no destructive data migration is required.

## Acceptance Criteria

- [x] New or refreshed content-pool items are not assigned an automatic `productionPlan`.
- [x] Historical `productionPlan` values do not affect new simple-run generation.
- [x] Pickup-record and competitor-video labels no longer block production by themselves.
- [x] The model prompt contains the main workspace text instruction and selected image tasks, without automatic direction/decision/material/brief constraints.
- [x] Content-pool secondary creation continues to use shared workspace settings and cannot auto-publish to Feishu.
- [x] The content desk no longer shows the removed production-strategy UI.
- [x] Focused deterministic checks, TypeScript, lint, build, and the FluxPost offline baseline pass.

## Out Of Scope

- Changing the content-safety policy or visual-tag taxonomy.
- Removing legacy production-plan columns/JSON fields from stored records.
- Enabling automatic Feishu publishing from content-pool secondary creation.
