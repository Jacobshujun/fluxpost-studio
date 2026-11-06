# Design

- Asset-only sort type extends existing library sorts without changing copy-library behavior. SQL keyset ordering uses updated_at or MD5(seed + ':' + ID); SQLite deterministic function matches PostgreSQL md5. Cursor includes seed/filter/sort signature.
- Authenticated POST /api/library/assets/order accepts selected IDs and ordering settings, validates access and sorts IDs in SQL without loading full library. No snapshot refresh.
- Node config primitive librarySearch/libraryTag/libraryColor/libraryCollectionId/librarySmartFolderId/librarySort/libraryRandomSeed fields store controlled settings (compatible with flat config serialization). Key UI by node/workflow; guard list/order operations against props changes/unmount.
- Schedule filters retain optional sort/randomSeed through normalization, save/reload and conditional resolution. Manual pools preserve saved IDs.
- Shared ordering control/client hook handles atomic explicit actions. No localStorage. Name order follows existing SQL behavior; no schema migration.
