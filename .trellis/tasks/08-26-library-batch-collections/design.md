# Design

## Architecture

- `src/app/library/page.tsx` owns the route-local collection manager state and presentation.
- `POST /api/library/assets/batch` stays thin: authenticate, parse a shared request union, call the library domain helper, and return JSON.
- `src/lib/library-assets.ts` owns collection validation, per-asset authorization, idempotent relationship changes, and partial-result aggregation.
- Existing database adapters and `LibraryAsset.collectionIds` remain unchanged.

## API Contract

`LibraryCollectionBatchRequest` is one of:

- `{ action: "add_to_collections", role, assetIds, collectionIds }`
- `{ action: "create_collection_and_add", role, assetIds, name, parentId? }`
- `{ action: "remove_from_collection", role, assetIds, collectionId }`

`LibraryCollectionBatchResult` returns `{ action, collection?, assets, unchangedAssetIds, failures }` where `assets` are successfully changed records and failures contain `{ assetId, error }`.

## Validation And Data Flow

1. Normalize and deduplicate all submitted IDs; reject an empty asset selection or missing action-specific fields.
2. Validate every target collection before asset mutation. The collection must match `role` and be manageable by the signed-in actor under existing owner/admin rules.
3. For each asset, require edit access and membership in the submitted library role.
4. Add uses a stable union, remove deletes only the specified collection, and no-op records are returned in `unchangedAssetIds`.
5. Continue after per-asset failures and return a single deterministic aggregate result.
6. The client refreshes the current query after completion, preserving valid selection through the existing `loadAssets` reconciliation.

For `create_collection_and_add`, collection creation/reuse happens first through the existing domain function. If later per-asset updates partially fail, the valid collection remains and is returned with the partial result; no destructive rollback is attempted.

## UI

- Add a compact inline collection panel adjacent to the existing batch-tag panel pattern.
- Hierarchical checkbox rows show collection path, owner when useful, and current membership count.
- A search field filters by normalized collection name/path without changing server query state.
- Primary add action is disabled with no eligible target or while busy. Fully populated targets cannot be selected again.
- Inline new-collection input creates at `collectionId || undefined` and immediately performs the batch add.
- Current-collection removal is shown only when `collectionId` is active. Existing role removal remains a distinct command only in the all-images view.

## Compatibility And Rollback

- No schema or stored-record conversion is required.
- Existing single-asset collection routes and non-collection batch actions remain valid.
- Rollback is a code revert; data written by the feature is ordinary `collectionIds` state already understood by prior versions.
