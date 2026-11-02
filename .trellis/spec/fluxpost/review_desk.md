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
mapping instead of silently keeping mismatched prompts.

Insertion transforms URLs/prompts/preview together; never identify an ordinary
slot by URL equality. Series cards move whole records by stable ID, including
missing-image cards, with no fixed original slots. Keep roles, candidates and QA;
update indices and project available URLs. No image pixels or source image tasks
are rewritten. Save persists order; first available image is display/publish first.

Manual regeneration AND background resumption find the semantic cover rather
than assuming index zero. Async operations disable ordering; returned regenerated
cards merge by ID without discarding unsaved local order. Missing cards later
filled with images stay at their current position.

## Layout And Checks

Wide >=1600: three columns; 960-1599: list/editor with batch drawer; narrow/short
viewports allow page scrolling. Preserve three themes, collapsed AI editing and
independent-scroll filter editor. Expanded AI keeps a usable minimum editor height.

Baseline includes `review_usability_check.mjs` plus existing review checks.
Separate PostgreSQL benchmark and intercepted browser checks are documented in
`verification.md`; never use port 3001 as the fixture server.
