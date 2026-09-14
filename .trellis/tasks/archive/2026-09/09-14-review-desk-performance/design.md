# Approved design

Single-post reads and save preconditions use primary-key queries. Source synchronization locks and updates only matching projects using the current transaction snapshot. Keep the existing awaited-body/background-status policy.

Review-only list/detail/metadata APIs expose compact summaries, SQL filters and 50-item keyset pages ordered by updated_at/id. Common generated-post API stays compatible. Review POST accepts postId plus changed fields and retains post.id compatibility.

Client separates list, detail, persisted draft and editing state. Request generations/abort guards prevent stale overwrites. Save merges acknowledge the submitted snapshot while retaining newer edits. Independent memoized list/gallery components avoid work while typing. Pagination uses a cursor stack; selected IDs and compact summaries persist across pages, capped at 200.

Authenticated per-post image endpoint resolves stored image indices; cache identity includes source/version, with 240px list and 960px editor variants. Reuse Sharp and bounded thumbnail pool. Local and remote sources follow existing managed media/security boundaries. Originals remain final assets.

Database changes are additive indexes only, supporting PostgreSQL and SQLite. Tests use isolated databases/media and intercepted browser APIs. Port 3001 stays unchanged.
