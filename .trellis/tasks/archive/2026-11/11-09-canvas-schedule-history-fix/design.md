# Design

Reuse existing GET schedules view=summary with workflowId, limit=50, offset. SQL already scopes accounts/workflows before pagination. Keep only summaries in the Canvas navigation and retrieve a full schedule on selection. Keep selected detail separate from page membership so direct links do not rely on the first page. Mutations refresh the first page for newly created/copied schedules; ordinary saves update visible summary fields without reordering a partially loaded page.

Keep current detail while loading a replacement, surface errors, serialize pending draft saves before selection/page navigation. Invalidate in-flight list/detail and active refresh responses on unmount/selection changes. Key the modal by workflow identity. Show count plus previous/next page controls and clamp a deleted last page.

No database migration, runtime data repair, provider calls or global-limit increase. Legacy full-list endpoint and worker behavior remain unchanged. Revert source commit and reactivate prior clean candidate if activation fails (launcher owns rollback).

Browser evidence exposed repeated router replacements when a deep link orders scheduleId after panel. The shared query writer must compare the existing values of its own key before deleting/appending that key; unrelated parameter ordering is not a state change. Add deterministic scalar/repeated-value checks and retain the noncanonical deep-link browser case.
