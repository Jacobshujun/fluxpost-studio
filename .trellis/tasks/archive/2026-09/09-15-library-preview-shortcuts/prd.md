# Library preview keyboard shortcuts

## Requirements

- While the library image preview is open, ArrowLeft/ArrowRight navigate with the same wrap behavior as the buttons, Delete requests confirmed deletion of the current editable image, and Escape closes the preview.
- Shortcuts are scoped to the preview, do not intercept editable inputs, composition or modified keys, and cannot act during a pending mutation.
- Holding Delete must not repeatedly request confirmation. Read-only assets cannot be deleted.
- Opening the preview focuses it; Tab stays within its controls and closing restores focus when the original trigger still exists.
- Preserve current deletion result behavior and existing mouse/touch controls.
- Verify cancellation, failure/retry, navigation identity, busy/read-only guards, focus and cleanup in the existing mocked desktop/mobile browser checks; run the full offline baseline.

## Scope

Library page component, existing library browser verification and Trellis task/status records only. No backend or runtime data changes.
