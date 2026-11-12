# G9L studio crop operation verification

Date: 2026-11-12 (Asia/Shanghai).

- One-time data operation through existing library collection/import/database services. No application source changes, provider generation, runtime activation, or production deployment.
- Inspected 47 direct original assets; cropped 36 whole-vehicle studio photographs and skipped 11 close-up/detail photographs.
- Created child collection 棚拍裁切版. New copies preserve source owner, visibility and semantic tags, with source name/ID and pixel rectangle recorded in each copy's note. New color palettes use actual cropped bytes. No AI tagging jobs were queued.
- Reviewed before/after contact sheets and adjusted four early rectangles plus three final rectangles to retain full background marks and suitable margins.
- Each downloaded original SHA-256 matched the existing asset. Each of 36 uploaded copies was downloaded and its full SHA-256 matched the imported bytes. All crop dimensions matched the stored library dimensions.
- All 47 original data JSON records and relational collection memberships remained unchanged. Original media was never overwritten; new copies have independent hashes and object keys.
- Existing owner-scoped library list service returned exactly 36 assets in the new child collection.
- Removed frame area: minimum 19.94%, maximum 53.75%, mean 37.62%. Resulting resolution: 9.23–19.22 MP. These percentages describe removed frame area, not a measured white-pixel ratio.
- Full deterministic baseline passed using the documented PowerShell wrapper and smoke port 45678; lint, types, production build, isolated HTTP smoke and SQLite checks passed. Port 3001 remained unchanged.
- Operational inventory, rectangles, original/cropped media, comparison sheets, import script, per-item receipts and detailed baseline log remain ignored local runtime artifacts under data/; none are committed.

Operational recovery: the storage client initially rejected an inherited `NODE_TLS_REJECT_UNAUTHORIZED=0` before uploading. Removed the variable only from the operation's child environment and reran with TLS verification enabled; collection lookup and content hashing made the import resumable.
