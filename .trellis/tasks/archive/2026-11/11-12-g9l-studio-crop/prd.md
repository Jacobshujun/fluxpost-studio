# G9L studio photo crop copies

User request: reduce excessive whitespace in local 小鹏G9L gallery photographs, especially studio shots.

Scope: one-time local library data operation, using existing library import/collection services. No application feature or runtime restart. Treat explicit cropping as deterministic pixel extraction, preserving the photographed vehicle.

Acceptance:
- Inspect all 47 direct members of 小鹏G9L; skip tight detail photographs.
- Individually choose rectangles retaining the complete vehicle, ground shadow and complete backdrop logos when retained.
- Save new high-resolution JPEG copies under a child collection 棚拍裁切版; preserve original bytes, metadata, memberships and frozen workflow URLs.
- Preserve original ownership/visibility and semantic tags; record provenance in each copy's note.
- Verify crop geometry, original hashes/rows unchanged, imported dimensions, public reads and before/after contact sheets.
- Keep image inventories, source URLs and operational scripts/receipts in ignored data/. Run the existing deterministic baseline and record only non-private aggregate evidence in Trellis.
