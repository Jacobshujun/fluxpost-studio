# Canvas smart-folder selection

## Requirements

- The Canvas library image node offers readable smart folders alongside ordinary collections.
- Selecting a smart folder filters both the initial page and subsequent pages, preserving selected image snapshots.
- Batch scheduler smart-folder choices survive update/save/reload and are applied when resolving assets, instead of reverting to all images.
- Preserve explicit collection descendant scope during scheduler normalization.

## Acceptance

- Focused scheduler round-trip and mocked browser checks cover smart-folder selection and ordinary collection switching.
- Full offline Trellis baseline passes without external service calls.
- Commit verified changes and activate the clean local candidate through `npm run local`.
