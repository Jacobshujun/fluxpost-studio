# Library image deletion from preview

Users can delete the image they have opened in the library preview or detail panel.

## Acceptance

- Editable images expose a clearly labelled delete action; read-only images do not.
- Cancellation sends no deletion request. Confirmation deletes only the opened image, independently of batch selection.
- Pending deletion prevents duplicate requests. Failure preserves the image and displays its cause in the open panel.
- Success closes the preview, clears deleted detail/selection state, and refreshes assets and navigation counts.
- Desktop/mobile mocked browser checks and the project offline baseline pass without modifying real assets.

## Scope

Reuse the existing permission-aware confirmed batch deletion API with exactly one asset ID. Changes are confined to the library UI, its styles, focused browser verification, and Trellis task/status records.
