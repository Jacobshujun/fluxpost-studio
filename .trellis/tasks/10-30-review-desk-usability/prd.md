# Review Desk Usability

## Goal

Restore usable laptop post lists, reliable image ordering and precise composable
filters without redesigning the three themes or changing approval/publishing.

## Authorization And Background

- Source: user's optimization plan and task-creation consent, 2026-10-30.
- User subsequently approved implementation, commits and LAN candidate activation.
  Activation still requires passing verification and a clean committed worktree.
- Preserve existing edits in `eslint.config.mjs`,
  `.trellis/spec/fluxpost/status.md` and `.trellis/spec/fluxpost/verification.md`.
- Existing review has compact server-side cursor pages, scoped metadata, bounded
  selection and stale-request protection.

## Requirements

### L: Layout

- L1: >=1600 CSS px: list/editor/batch columns. 960-1599: list/editor columns
  plus batch-panel trigger displaying selected count.
- L2: <960: vertical page scroll. Very short viewports also allow page scroll
  instead of clipping controls, even at desktop widths.
- L3: Compact statistics; remove duplicate status controls. Keep search, filter
  entry, compact selection and pagination reachable; reserve most height for posts.
- L4: Independent-scroll advanced-filter overlay, applied summary and clear entry.
  Editing actions remain reachable. AI editing starts collapsed and scrolls when
  expanded without crushing images or body.

### F: Search And Composition

- F1: Search all text/title/body/vehicle. All text retains the existing scope.
  Vehicle defaults to exact matching with local candidates.
- F2: Vehicle uses trimmed nonempty `feishuVehicle`, otherwise `taskKeyword`.
  No body inference, aliases or prefix expansion. Candidates use permitted
  account/source-batch scope, not remote Feishu options.
- F3: Advanced fields: title/body/task keyword/image prompt/vehicle/author/
  platform/status/creation time/update time. Text operators: contains/not contains/
  equals/not equals/empty/not empty. Enums: in/not in. Vehicle: exact multi-select.
  All/any between and within groups; top-level groups plus subgroups only; max
  50 predicates and no unlimited nesting.
- F4: Explicit search AND advanced relationship. Initial ready status is visible
  and removable; no hidden state restriction. Empty applied filters remain empty
  after refresh instead of restoring the default.
- F5: Apply commits advanced edits; cancel preserves applied state. Effective
  filter changes reset paging/checks, never the current editing draft.
- F6: Atomic URL state supports refresh/sharing/back/forward. No templates,
  favorites or additional persistence system.

### T: Time

- T1: Created/updated fields, default updated; retain list sorting.
- T2: All time, today, yesterday, this/last week, this/last month, last 7/30 days,
  custom last N days, exact date, range, before and after, also inside groups.
- T3: Display Beijing time. Monday starts weeks; last N includes today; date
  ranges include both days. Use inclusive-start/exclusive-end boundaries.
- T4: Relative rules recalculate on apply, refresh or page re-entry; pagination
  reuses boundaries. Panel open/cancel cannot change applied results. Invalid
  dates/N/reversed ranges produce errors, not fallback to all time.

### O: Image Order

- O1: Ordinary/series handle drag uses insertion, with drag/drop feedback, edge
  autoscroll, cancellation and up/down keyboard/touch alternatives. Distinguish
  file uploads from internal reorder.
- O2: Reorder local drafts; existing Save persists. First available image is
  display/publish first image. Prompt/preview identity survives duplicate URLs.
  Disable order changes during upload/replacement/generation/save and prevent
  stale async results from writing to a different slot.
- O3: Series moves retain stable card IDs, prompts, candidates, QA and roles;
  update order indices. All cards, including missing-image cards, move freely by
  insertion without fixed or reserved original slots. Keep missing cards and
  their data, not their old positions. Do not rewrite pixels or page text.
  Regeneration references original cover identity, not array position.
- O4: Optional ordinary per-image prompts enter post/save contracts. Legacy first
  edits use current parsing precedence. Series prompts stay card-owned; never
  rewrite source image tasks to implement ordering.

### C: API And Data

- C1: Versioned structured `filters` on GET `/api/review/posts`. When present,
  use new semantics without stacking legacy filters; absence retains old behavior.
  Invalid new input errors explicitly, never silently widening the query.
- C2: Parameterized PostgreSQL/SQLite SQL with field/operator allowlists. Owner
  and source-batch restrictions always remain outside user OR expressions.
- C3: Keep 50-row cursor pages, 200-item checks, compact payloads and account/batch
  overview metadata rather than filtered-hit statistics.
- C4: Created filters use database creation time; edits change update time only.

## Acceptance And Child Ownership

| Child | Requirements | Acceptance |
| --- | --- | --- |
| `../10-30-review-desk-layout` | L1-L4 | 1280x720, 1440x800, 1512x982, 1920x1080, 390x844 and low-height/zoom; three themes; complete laptop card initially visible; sustained scrolling; reachable paging/actions; no horizontal overflow |
| `../10-30-review-image-ordering` | O1-O4 | First/last and multi-item moves, cancel, duplicate URLs, save/reload, upload/delete/replace then sort; missing cards/candidate changes/original cover identity; publishing order |
| `../10-30-review-structured-filters` | F1-F6, T1-T4, C1-C4 | G7 excludes G7i and body-only mentions; AND/OR/exclusion/empty/multi-vehicle; owner/batch isolation; no results; invalid inputs; date boundaries; URL/history/races |
| Parent integration | All | Resets retain unsaved text/order; approval/publish parameters unchanged; SQL parity; no full download; focused checks and full baseline |

Time fixtures: Beijing midnight, Monday, month/year transitions, leap day and
range end. Query fixtures: `(G7 OR G9) AND (draft OR editing) AND body NOT contains
test-drive`, cross-owner OR, empty filters, unknown version and 51 predicates.
Regressions include stale list/detail/save responses, URL restoration/history,
unsaved drafts and existing approval/publishing parameters/image order.

## Safety And Exclusions

No overall redesign, unlimited nesting, filter templates, model calls, Feishu
writes, production deployment, source-task rewrites or generated-library revival.
No test mutations of real data, worktrees or sibling candidates. Only the approved
final LAN activation may replace port 3001 after verification and commits. Implementation tests use isolated SQLite,
disposable local PostgreSQL schemas and intercepted browser fixtures on a
worker-disabled service. Full baseline uses `TRELLIS_SMOKE_PORT=45678`; candidate
activation is separate after verification and commit.

## Confirmed Clarification

On 2026-10-30 the user rejected fixed missing-card slots: all cards support free
insertion ordering. This supersedes the original requirement to retain missing
cards' original slots; retain card identity/data instead. Implementation and LAN activation were subsequently explicitly approved.
