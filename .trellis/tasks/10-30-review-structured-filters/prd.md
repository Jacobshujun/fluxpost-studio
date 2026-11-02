# Review Structured Filters

## Goal And Scope

Own F1-F6, T1-T4 and C1-C4 in `../10-30-review-desk-usability/prd.md`: precise
vehicles, bounded boolean groups and Beijing dates with compact scoped queries.

## Requirements

- All-text/title/body/vehicle search; exact local vehicle candidates; removable
  ready initial condition; explicit search AND advanced expression.
- All parent fields/operators, group/subgroup all/any, no deeper nesting, max 50
  predicates. Apply/cancel panel edits, applied summary, clear entry, URL/history.
- Beijing calendar presets/date comparisons with half-open bounds and strict errors.
- New filters override legacy filter params; absent new filters preserve legacy
  semantics. Account and batch scope always apply.
- Overview/candidates describe allowed scope, not filtered hits. Keep 50-row pages,
  200 checks, compact payloads and current sort. Changes never discard drafts.

## Acceptance Criteria

- [ ] G7 excludes G7i/prefixed names/body-only mentions; multi-vehicle exact match.
- [ ] Example grouped query, negation, empty fields, no results and all/any work.
- [ ] OR cannot escape account/batch scope in either database.
- [ ] Invalid JSON/version/field/operator/date/depth/count errors explicitly.
- [ ] Midnight/Monday/month/year/leap day/range-end Beijing fixtures pass.
- [ ] DB created time remains unchanged by edits; relative bounds freeze for paging.
- [ ] Clear-all URL, old URLs, refresh/back/forward and panel cancel preserve intent.
- [ ] Slow search/detail/save cannot overwrite new state or unsaved text/order.
- [ ] Approval/publish contracts and lightweight list performance remain intact.

## Dependencies And Exclusions

After layout and ordering. No remote candidate fetch, saved searches, new storage,
full-post download or unrelated generic query-engine abstraction.
