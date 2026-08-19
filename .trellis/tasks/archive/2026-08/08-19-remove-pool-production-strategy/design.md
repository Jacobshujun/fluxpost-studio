# Design

## Behavior Boundary

The main workspace's `WorkspacePromptSettings` remains the single persisted policy source. A simple run freezes those settings at enqueue time. Content-pool secondary creation continues to enqueue `sourceMode="pool"` through the same simple-run worker.

## Data Flow

1. Crawl/import, safety assessment, tagging, and content-pool persistence remain unchanged except that persistence no longer synthesizes `productionPlan`.
2. Simple-run selection ranks safe tagged sources by hot score and applies only media availability when images are requested.
3. Draft generation passes `settings.textInstruction`, visual-tag-derived image tasks, image size/quality, and explicit run switches.
4. `generatePost` builds its model prompt directly from those inputs. It ignores legacy source/post production plans.
5. Pool runs still normalize `writeFeishu` to `false` and save drafts for review.

## Compatibility

- Keep `ProductionPlan` and optional historical fields in shared types so existing database JSON can deserialize without migration.
- Generated posts may retain historical plan fields when loaded, but new generation does not populate or consume them.
- Viral mode retains its explicit viral text/image task construction, but no longer needs an automatic base production plan.

## Verification

- Replace deterministic checks that require pickup-record blocking or automatic plan prompt constraints with checks proving their absence and proving workspace-prompt control.
- Run affected checks first, then TypeScript, lint, build, and the complete offline baseline.
