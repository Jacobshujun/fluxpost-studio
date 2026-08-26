# Canvas content pool selection and batch scheduling

## Goal

Make owner-visible content-pool material practical to find and inspect from an Infinite Canvas node, and make the same material available as a frozen V2 batch-scheduler main parameter so one selected source item can drive one main task.

## Background

- `input.content-pool` currently stores one flattened snapshot and emits title, body, source, images, and videos.
- Its Canvas inspector picker loads every project, flattens all items, filters only title/body/platform/author text, truncates to 100, and renders a native select.
- V2 scheduling already supports typed parameter sources, preflight freezing, main/child expansion, immutable launch, and explicit node-field adapters, but content-pool items are not a parameter type or source.
- The standalone content desk already exposes status/platform/sort and bulk behavior, while content-pool records also carry project, media type, content tags, cache status, scores, and timestamps.

## Requirements

### R1. Content-pool selection contract

- Add an authenticated, owner-scoped, read-only paginated selection endpoint.
- Filters cover one project or all projects, full-text query across title/body/author/source id, multi-value platform/status/media type/content tags, and optional complete-local-media status.
- Multiple content tags use AND semantics. Results support stable hot-score, published-time, and crawled-time ordering with an id tie-breaker.
- Duplicate source item ids across projects appear once. The compact response excludes `raw` and heavyweight analysis fields.
- Page size is bounded, cursors are validated, and response metadata includes projects, total matches, and the next cursor.

### R2. Single-node picker

- Replace the native select with a compact card list that exposes project, search, sort, progressive advanced filters, active-filter count, result count, paging, loading, empty, and retry states.
- Each row shows a stable thumbnail area, title/excerpt, project, platform, status, tags, score, and relevant time, with separate select and preview commands.
- Selecting one item freezes the same title/body/source/image/video fields used today. Local downloaded media remains preferred over remote media.
- The selected snapshot summary remains visible when filters hide the source or the source has since been deleted. Refreshing results and refreshing the selected snapshot remain separate commands.

### R3. V2 content-pool parameter

- Add a `content-pool` V2 parameter type, a content-pool source filter, a compact frozen value, and an explicit `content-pool-input` adapter.
- The type binds only to `input.content-pool` and is available only for main-task parameters.
- Source modes are manual ids and condition matching. Manual mode supports ordered multi-select, select-all-matches when the result fits the cap, and clear.
- Fixed expansion requires one value, each expansion creates one main task per frozen item, and random expansion samples unique items without replacement using existing V2 sampling behavior.
- At most 200 content-pool values may be frozen in one preview. A condition pool may exceed 200 only when random sampling freezes at most 200 values. The existing 2,000-child schedule limit still applies after expansion.
- Preflight resolves current owner access and freezes compact values. Launch and retry use the frozen values without rereading the source record.
- Missing or unauthorized manually selected ids fail preflight explicitly. No scheduler path mutates content-pool status or triggers external publishing.

### R4. Compatibility and UX quality

- Existing `input.content-pool` node version/config, saved workflows, V1 schedules, other V2 parameter sources, persistence tables, and normal run behavior remain compatible.
- Controls have visible labels and focus states, icon buttons have accessible names/tooltips, selection is not color-only, async actions expose busy/error feedback, and layouts avoid horizontal overflow at desktop and phone widths.
- No provider, Feishu/Lark, or runtime-data mutation is part of deterministic verification.

## Acceptance Criteria

- [ ] Combined filters, AND tags, stable ordering, pagination, owner isolation, deduplication, and the local-complete rule return the expected compact rows.
- [ ] The inspector can find, preview, select, retain, and explicitly refresh a single snapshot without a native all-items select.
- [ ] The scheduler can manually select or condition-match content-pool items, freeze no more than 200 values, and expand each value into an independent main task.
- [ ] Random selection is unique and capacity checked; missing manual ids, fixed-count mismatch, and over-cap full expansion fail before any Canvas run is created.
- [ ] The adapter writes the exact content-pool node snapshot fields and existing literal outputs remain unchanged.
- [ ] A launched preview remains runnable after the original content-pool item changes or disappears, and no content-pool status is written back.
- [ ] Existing Canvas workflow/scheduler checks, TypeScript, lint, build, the full offline baseline, and mocked desktop/mobile browser checks pass.

## Out of Scope

- Arbitrary AND/OR query builders or saved filter views.
- Batch node creation, a content-desk-to-Canvas shortcut, or a node-level batch-scheduler shortcut.
- Automatic analyzed/rewritten/published status inference or writeback.
- Database migrations or changes to external provider/publish behavior.
