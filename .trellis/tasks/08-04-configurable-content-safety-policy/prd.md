# Configurable content safety policy

## Goal

Allow workspace administrators to define the content-safety categories, deterministic local rules, model review prompt, review scope, and score thresholds used by all future collection and generation work.

## Requirements

- The policy is global to the workspace. Signed-in users may read it; only administrators may save, reset, or run policy tests.
- The policy has a master switch, custom categories, ordered local rules, and independent local/model switches.
- Local rules match selected title/body/author fields through AND-ed condition groups whose terms use `any`, `all`, or `at_least`; the first enabled matching rule returns `allow`, `review`, or `filter`.
- A local `filter` is final. A local `review` invokes the model when enabled. A local `allow` invokes the model only when model scope is `all_non_filtered`.
- The model returns JSON with a 0-100 `riskScore`, configured category ids, and reasons. Workspace thresholds map the score to allow/review/filter.
- Model failure preserves the local result. A master-disabled policy allows content without calling the model.
- The system keeps only schema, permission, size, and output validation. Administrators may remove all content rules or disable the policy.
- Persist the current versioned policy in `app_meta` without a schema migration. Save/reset/model-test actions are auditable without logging prompt, terms, or sample content.
- Simple runs and advanced crawl jobs freeze the policy used at creation. Synchronous link imports read it once when the request starts. Historical records without snapshots use the shipped default policy.
- Add a database-backed Content Safety editor to `/config`, separate from `.env.local` fields, with category/rule editing, ordering, toggles, prompt, thresholds, reset, local dry-run, and explicit model test.
- Default deterministic checks must not call TikHub, text/image providers, ComfyUI, Feishu, or Lark.

## Acceptance Criteria

- [ ] Admins can save a valid policy, reset it, and receive a conflict for a stale expected revision; operators receive 403 for mutations and tests.
- [ ] Ordered local rules support exception-first behavior and all documented match modes/scopes.
- [ ] Model scores at 39/40/79/80 map correctly for default thresholds 40/80; invalid JSON, unknown categories, invalid scores, and request failures are handled explicitly.
- [ ] Xiaohongshu note `6a52fe8300000000060235f2` is not hard-filtered by the default local policy; explicit abusive text remains filtered.
- [ ] Simple runs, advanced crawl jobs, and synchronous link imports use stable policy snapshots.
- [ ] The admin UI works at desktop and mobile widths without overlap and never auto-runs a paid model test.
- [ ] Focused verification, TypeScript, lint, production build, full Trellis baseline, local restart, and HTTP smoke pass.

## Out Of Scope

- Per-account policies, regex, version-history rollback, import/export, and retroactive content-pool re-evaluation.
- Remote deployment without a separate exact-SHA candidate verification and explicit deployment approval.
