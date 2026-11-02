# Structured Filter Design

## Ownership

`src/lib/review-contract.ts`, `src/lib/review-posts.ts`, list/metadata routes,
`src/app/review/use-review-data.ts`, review filter components and related tests.
Reuse atomic `useUrlQueryParams`; no unrelated changes to the shared hook. Isolate
pure validation/calendar logic in a review-specific helper if needed, not a
universal query language.

## Proposed V1 Contract

Root `{ version: 1, search, match, groups }`: search field all/title/body/vehicle
and value; root all/any across groups. Group all/any children are predicates or
one subgroup level; subgroup children are predicates only. Root is a container,
not another editable group depth. Typed unions restrict values/operators by field.
Max 50 leaves in total. Bound container count and encoded payload/value size too;
freeze exact limits with fixtures before implementing the wire protocol.

Empty root is explicit no-filter state. Empty nested groups, incomplete predicates,
unsupported versions/fields/operators and malformed values are errors. A present
but empty `filters` parameter errors. Do not use defaulting enum codecs here.

URL stores relative intent; API carries validated resolved UTC intervals for the
query session. Distinct intent/resolved types use the same V1 field/operator
contract. No client-provided SQL identifiers/fragments.

Initial URL without filter params shows ready membership draft/editing/approved.
Explicit empty V1 root means no hidden status restriction. Translate old URLs to
equivalent visible state; legacy since/until retain exact instants, not Beijing
calendar reinterpretation. API requests without new filters use legacy code.
With new filters present, ignore old status/q/author/platform/since/until but NEVER
ignore account scope, sourceBatchId or cursor.

## SQL

Compile `owner AND batch AND (search AND expression) AND cursor` using existing
bindings/backend JSON extraction. Allowlist fields; dates use table columns.
Keep `ORDER BY updated_at DESC, id DESC` and LIMIT 51 lookahead.
Vehicle expression uses trimmed nonempty Feishu vehicle, otherwise task keyword;
candidates and predicates share it, with no inference or aliases. All text keeps
title/body/imagePrompt/taskKeyword/feishuVehicle scope. Preserve case-insensitive
literal contains using substring functions, not wildcard LIKE interpretation.
Freeze text equality/empty normalization consistently across both backends before
implementation; vehicle equality stays exact, not prefix or alias matching.

Normalize absent text to empty for null-safe negative operators; explicitly test
whitespace-empty behavior. Author follows current display-name -> owner-ID ->
unmarked-author expression. Platform/status use validated enum membership.
Metadata candidates use account/batch scope, not active filters.

## Calendar

Pure injected-clock helpers use fixed Beijing UTC+08:00, not host locale/timezone.
Strict YYYY-MM-DD parsing round-trips components to reject overflow. Monday weeks.
Last N calendar days: midnight today minus N-1 through tomorrow midnight.
Today/yesterday/week/month/range use [start,end); inclusive date end advances one
calendar day. Before date excludes that date (`< midnight`); after excludes that
date (`>= next midnight`). Exact date spans one whole calendar day.

Relative intent stays in URL. Resolve on Apply, explicit refresh, page re-entry
or history restoration; freeze across next/previous page and post-save refresh.
Panel reopening may update draft preview only; Cancel cannot alter applied query.
A changed applied interval resets cursors. Invalid N/date/instant/order errors.

## URL, Hook And UI

Atomic command updates all filter params/removes obsolete legacy params while
preserving batch/selected-post/unrelated URL state. Apply/clear adds a history
entry; search typing replaces current entry after debounce, not per-key history.
Back/forward must not immediately rewrite the restored URL.

Applied/panel states stay separate. Effective semantic query keys include resolved
bounds; changes reset cursors/checks once, preserve selected ID/full draft even
outside results. Keep abort/generation fences, bounded caches and changed-field
merge. Metadata stays separate; no filtered-hit label for overview statistics.
Malformed URLs visibly error instead of fetching unfiltered data.

## Performance And Compatibility

No DB migration/index addition by default. Measure both backends including large
OR sets and candidates before considering an index. List/metadata must not
materialize full documents. Keep current caps. Error responses must not present
old or unfiltered rows as valid results for rejected conditions.
