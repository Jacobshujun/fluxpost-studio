# Library Collection Picker And Move

## Requirements

- Replace the batch add-to-collection ID prompt with a searchable name/path picker.
- Add batch move from the current editable collection to another editable collection.
- Move replaces only direct membership in the source, preserving all other memberships and media.
- Descendant-only assets are unchanged; report unchanged and failed items accurately.
- Validate source and destination before writes. Save each asset's membership change in one existing database transaction.
- Support explicit and query selections, exclusions, cancellation, empty results, errors, and busy states.
- Verify desktop/mobile interaction and the complete offline baseline without touching real assets.

## Acceptance

- [x] Name/path picker supports adding and moving without typing IDs.
- [x] Domain regressions cover permission, same-target, missing-source membership, preservation, and query exclusions.
- [x] Browser checks and complete baseline pass.
