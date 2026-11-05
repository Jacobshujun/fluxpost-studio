# Design

- A focused memory module validates stored V1 filters with the existing parser and strips asOf. A review-local hook resolves the existing account-session API once, restores via replaceState and exposes readiness and notices.
- Explicit URL filter keys retain precedence, including legacy keys. Dedicated entry scope is latched before auto-selection. Ordinary entries receive a history-state marker retained by atomic URL updates, so refresh after automatic postId selection stays ordinary; copied postId links without that marker stay dedicated.
- Existing URL state remains the query source. No list/detail/metadata request starts before initialization completes. Applied valid URL changes in ordinary sessions persist; popup drafts stay local.
- Storage operation failures produce visible feedback. Session failures disable memory with a distinct notice while review remains usable. Invalid saved data is removed and reported.
- Preserve search debounce, date-clock freezing, paging/selection invalidation and draft preservation. Empty results offer the existing clear command.
