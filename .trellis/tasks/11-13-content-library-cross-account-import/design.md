# Design

Collection/import is an explicitly authorized contribution capability for all authenticated members. It differs from reading or managing another owner's library. Existing routes authenticate before target validation and external work.

`requireContentPoolCollectionWriteTarget` resolves an existing library for an authenticated actor without requiring ownership. `ingestCrawlItems` and `createSourceItem` stamp both project and item with the resolved library owner; absent a destination they keep the initiating account owner. Existing row-level project mutation, membership persistence, recrawl/manual-field preservation and deduplication remain in use. No schema or historical data migration.

Desk summaries expose `ingestCollections` containing only id, name, path and owner display name for all collections. The capture dropdown consumes that list and identifies the owner. Existing `collections`, projects, counts, tags, source reads and mutation permissions remain scoped to owner/admin. This avoids accidentally enabling private-library browsing through a shared navigation list.

Keyword/link/Feishu/manual routes already validate the same target before provider work or writes. Existing responses strip project items and raw source payloads. Import operations can refresh a previously imported source within the destination owner's matching query, following the existing manual-field protection rules.

Rollout: focused isolated multi-user persistence and browser checks, complete baseline, commit, archive task, then activate the existing LAN candidate from clean primary HEAD. Revert this commit to restore the former owner-only contribution behavior; do not migrate/delete runtime content.
