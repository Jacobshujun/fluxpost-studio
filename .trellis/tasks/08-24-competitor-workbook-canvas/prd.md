# Excel Competitor Workbook Canvas

## Goal

Add a composable competitor-workbook input and hierarchical Canvas V2 batch scheduler. An administrator can freeze selected local `.xlsx` rows and parameter cards, reuse the existing prompt template, GPT-Image-2 V2, reference library, and post composer, then create exactly one local review draft per workbook row.

## Requirements

### Workbook input

- Add `input.competitor-workbook@1` with a server-local absolute `.xlsx` path, worksheet, preview row, and preview card configuration.
- Default to `文案汇总`; require `序号`, `标题`, `正文`, and `参数卡片1` through `参数卡片6`.
- A normal run outputs `title`, `body`, and `card` text ports for one-row/one-card testing.
- Batch preflight supports all rows or an inclusive range of at most 300 rows and freezes file SHA-256, worksheet, Excel row number, sequence, title, full body, and ordered non-empty cards.
- Fixed local paths are administrator-only. Paths, desktop directories, and workbook contents must not enter Trellis, activity logs, or public schedule/status responses.
- Use a Node Excel parser; do not depend on Python, an Excel client, or historical JSON paths in the `校验` sheet.
- Reject missing columns, invalid or relative paths, non-xlsx files, out-of-range selections, and oversized files.

### Composable workflow

- Ship a preset composed of workbook card to prompt template to existing `model.gpt-image@2`, then images plus workbook title/body to existing `compose.social-post`.
- Do not add a dedicated image node or change GPT-Image-2 V2's public configuration/execution protocol.
- Keep the default prompt editable or bypassable. It tells the model to preserve provided vehicle, price, and parameter facts without inventing data.
- Existing image-input or vehicle-library nodes can feed GPT `references`; one ordered reference set is shared by the batch.
- Freeze reference asset IDs, URLs, order, and accessibility at preflight. Retain the 16-reference limit; the workbook node does not copy references.

### Hierarchical scheduling

- Each frozen row is a main task and each non-empty parameter card is a child task.
- Child tasks run the card-image branch. When a row settles, aggregate successful images in Excel column order and create its single review draft.
- Schedule concurrency is configurable from 1 to 5, default 2. Enqueue progressively and continue respecting global Canvas worker and image-provider limits.
- Preserve durable pause, resume, cancel, process restart, failed-card retry, and failed-row retry behavior.
- One or more successful cards can create a `partial` draft. If every card fails, the row fails.
- A successful retry updates the original draft images without creating a duplicate, preserving card order.

### Draft policy and review

- Use workbook title/body verbatim without text-model rewriting.
- Preserve the full original body in the frozen snapshot. GeneratedPost creation retains the existing 20-visible-character title maximum and body target/max policy of approximately 800/1000 characters.
- Create only local review drafts; do not automatically run Feishu publishing.
- Review UI identifies source row, card number, and original card text, with a clear human-review state for generated Chinese text and numbers.

## Acceptance Criteria

- [ ] Registry, shared types, icon, configuration, and executor support `input.competitor-workbook@1` with three text outputs.
- [ ] An admin inspection API returns redacted worksheet/header/count/preview data; non-admin access is denied and public responses never contain the local path.
- [ ] A deterministic fixture parses 200 rows, 778 non-empty cards, and an existing `校验` sheet without consuming its JSON paths.
- [ ] Missing columns, blank rows, bad paths, non-xlsx files, oversized files, and invalid ranges have explicit failures.
- [ ] Batch preflight freezes row/card data and references so source-file changes after launch cannot alter queued work.
- [ ] Tests cover 3-6 children per row, ordered aggregation, and one shared reference group.
- [ ] Existing GPT-Image-2 V2 ratio, resolution, quality, count, format, compression, and 16-reference behavior remain compatible.
- [ ] Concurrency 1, 2, and 5 progressively enqueue; pause/resume/cancel/restart preserve snapshots.
- [ ] Tests cover one-card failure, all-card failure, partial draft, retry synchronization, and failed-row retry.
- [ ] A body longer than 1000 characters remains complete in its snapshot while the draft follows current policy; titles follow the 20-character limit.
- [ ] Automated verification never calls live GPT, image, or Feishu services.
- [ ] TypeScript, lint, build, full Trellis baseline, and desktop/mobile Canvas browser checks pass.

## Constraints

- The user's desktop workbook is a local verification sample only. Its path is never hardcoded, committed, or recorded in Trellis.
- Port 3001 runs only from a clean committed primary worktree candidate.
- Reuse the existing Canvas schedule and GeneratedPost persistence boundaries; do not create another queue or memory system.
