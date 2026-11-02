# Review Desk Contracts

## Filters

GET `/api/review/posts` accepts version-1 JSON `filters`; see
`src/lib/review-filters.ts`. A root contains search, all/any match and groups;
groups contain predicates or one subgroup level. Maximum 50 predicates and 50
groups, 16,000 raw JSON characters, 1,000-character text values and 100 enum values.
Unknown versions/fields/operators, incomplete groups and invalid dates are errors.

Search AND advanced conditions; owner and sourceBatchId stay outside user OR.
New filters replace legacy filter parameters, not scope/cursor. Absent filters
keep legacy API semantics. Explicit empty V1 groups represent no hidden status
condition; initial UI ready condition is visible/removable.

Vehicle uses publication normalization: trimmed nonempty Feishu vehicle, otherwise
trimmed task keyword. SQL trim matches JS whitespace on both engines. No body,
prefix or alias inference. Candidates and overview metadata use permitted
account/batch scope, never filtered-hit counts. Lists stay compact, 50 rows/page,
200 selected IDs and descending `(updated_at,id)` order.

URL intent uses atomic `useUrlQueryParams`. Apply commits panel drafts; cancel
does not. Filter changes reset pages/checks but preserve the editor. Date rules
use Beijing UTC+8, Monday weeks, inclusive calendar days and half-open intervals.
Near-N includes today. Before/after exclude the selected day. Creation filters
read `created_at`, not JSON. Relative query clocks freeze across pagination and
save-refresh; refresh/re-entry/application recomputes. Cursors carry the clock
for clients that omit `asOf`. Invalid new URLs never trigger unfiltered fetching.

## Image Order

Ordinary `imagePrompts?: string[]` is a shared ReviewPatch field aligned with
imageUrls. Legacy relevant edits initialize via existing prompt precedence;
explicit empty prompts remain empty. Server rejects malformed supplied arrays.
Legacy URL replacement without a corresponding prompt array clears the stale
mapping instead of silently keeping mismatched prompts. Page saves always send
the unchanged index-aligned `imagePrompts` alongside a replaced or regenerated
URL sequence, so this loading path never erases user prompt edits.

Insertion transforms URLs/prompts/preview together; never identify an ordinary
slot by URL equality. Series cards move whole records by stable ID, including
missing-image cards, with no fixed original slots. Keep roles, candidates and QA;
update indices and project available URLs. No image pixels or source image tasks
are rewritten. Save persists order; first available image is display/publish first.

Manual regeneration AND background resumption find the semantic cover rather
than assuming index zero. One media lock covers uploads, replacements,
regenerations, ordering, saves, approval and publishing while any series card is
generating or validating. Async results capture the source URL or card identity
and are refused when the slot changed; returned regenerated cards merge by ID
without discarding unsaved local order. Series drafts never append images outside
the card list. Missing cards later filled with images stay at their current
position.

## Gallery Layout

`<960px`: one column. `>=960px`:
`grid-template-columns: repeat(auto-fill, minmax(145px, 1fr))`. Do not raise the
145px track minimum: a classic 15px scrollbar leaves about 303px of gallery
content at a 960px viewport, and two 147px tracks still fit while 150px does not.
Headless Chrome uses overlay scrollbars and hides this failure; keep the
simulated classic-scrollbar case.

`.review-gallery-preview` owns `aspect-ratio: 4 / 3`; tiles use `min-height: 0`.
Never restore the old fixed 360/430px tile heights. The prompt editor is 46px
idle and 110px on focus; `prefers-reduced-motion` disables the transition.

Hero rules apply only to ordinary galleries
(`.review-gallery:not(.review-gallery-series)`) and only when the gallery
container is at least 470px wide:

- viewport height `>=1000px`: first image spans all columns, 16:9 preview
  capped at 260px;
- viewport height 900-999px: first image spans 2 columns, capped at 160px;
- below 900px: no hero.

Series galleries never get a hero because their cards are the fixed sequence.
The editor split at `>=960px` is
`minmax(320px, 1.05fr) minmax(240px, 1fr)`.

Ordering controls are one overlay group per tile: drag, up, down and delete at
top-right with a 6px inset, 24px buttons and a 2px gap. The index badge stays
top-left at 6px and must not overlap the group. Missing series cards use the
same group without delete and reserve 44px top padding for it. Keep the
`拖动配图 N`, `上移配图`, `下移配图` and `删除配图` labels.

## Layout And Checks

Wide >=1600: three columns and the batch column replaces the drawer trigger;
960-1599: list/editor with batch drawer; narrow/short viewports allow page
scrolling. Preserve three themes, collapsed AI editing and independent-scroll
filter editor. Expanded AI keeps a usable minimum editor height. An invalid filter
URL clears visible and selectable rows instead of leaving stale hidden posts for
batch actions; the applied summary shows raw text values and localized only for
enums and date presets.

`review_usability_browser_check.py` asserts at least two gallery tracks at
960px+, fully visible image counts (2 at 1280x720, 4 at 1440x900 and
1920x1080), badge/tool separation, the classic 15px scrollbar case, series
layout at 1280x1024 and 1920x1080, edge autoscroll with a 16-image fixture, and
reduced-motion prompt behavior. Baseline includes `review_usability_check.mjs`
plus existing review checks. Separate PostgreSQL benchmark and intercepted
browser checks are documented in `verification.md`; never use port 3001 as the
fixture server.
