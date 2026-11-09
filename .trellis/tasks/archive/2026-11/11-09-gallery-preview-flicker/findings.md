# Gallery preview navigation flicker

Date: 2026-11-09. Analysis only; application source and listener unchanged.

## Evidence

- Local `/api/version` and Git HEAD: `b015f7caa5fa562bd2468bd26427b2a723ed2b36`.
- `src/app/library/page.tsx:363-385`: changing requestedId starts a detail GET. While asset.id differs, Viewer returns a plain loading Dialog instead of ViewerEditor. The prior editor/dialog is unmounted.
- `page.tsx:385`: ViewerEditor is keyed by asset.id, so the complete editor and nested dialog are recreated for every asset.
- `page.tsx:489-491`: Dialog mounts with showModal and cleans up with close/focus restoration.
- `library.module.css:8,10`: generic modal width is 640px; viewer is viewport minus 40px in each dimension. This creates a large geometry change during navigation.
- `page.tsx:467-474`: original image starts loading after the new editor mounts. Thumbnail rail uses thumbnailUrl only; there is no adjacent-original preparation or decode-before-swap.

Headless Chromium loaded the existing 3001 application's page/static assets. All API and image requests were intercepted with synthetic data, all external origins aborted, and non-GET API requests rejected. No runtime records or real media were accessed. Detail and original-image responses were held independently to inspect intermediate DOM states; these are controlled reproduction states, not real-network latency measurements.

At a 1440x960 viewport:

| State | Open dialog size | Original dialog connected | Modal calls since next click |
| --- | --- | --- | --- |
| Before | 1400x920 | yes | none |
| Detail pending | 640x121.5 | no | close, showModal |
| Original pending | 1400x920 | no | close, showModal, close, showModal |
| Loaded | 1400x920 | no | unchanged |

The detail-pending modal contained zero image elements. The new editor displayed the original-loading indicator. Request inspection showed originals requested on demand, without adjacent-original preloading. This establishes dialog replacement/geometry churn as a direct cause, with original loading producing an additional empty-image interval. No claim is made about the operator's precise flash duration or browser-specific compositing behavior.

## Recommended repair

1. Own one stable Dialog and viewer layout at the Viewer level for its whole open session. Initial loading, navigation loading and errors stay inside this shell. Asset-keyed draft editors must not own the shell.
2. Separate requested asset from the currently displayed asset. Retain the current image while the target detail and original are prepared; swap image, title, index and editable metadata coherently once the target is decoded. Show a small switching indicator. On failure, keep the current image and expose target-specific retry/cancel rather than replacing the dialog.
3. Reset only asset-specific state at successful transition: draft, zoom, natural dimensions, pan and errors. Preserve shell geometry, focus and details-panel visibility. Merely removing the editor key would risk carrying edits and image state into another asset.
4. Preserve dirty-edit confirmation, close/history behavior, owner permissions and pagination. Use request identity/abort guards so late responses cannot overwrite a newer target; disable target-dependent writes while switching.
5. Optionally preload only adjacent originals/metadata in a bounded per-viewer cache after current-image readiness. Invalidate mutated/deleted entries and release references on close. This improves speed but does not replace the shell/swap repair.

Likely implementation scope: `src/app/library/page.tsx`, loading presentation in `src/app/library/library.module.css`, and a focused browser regression under `.trellis/verification/`. No database/API schema or shared Canvas/content preview changes are needed for this diagnosis.

## Repair acceptance

- Delay details and original independently: same dialog DOM node/rectangle/backdrop throughout; no navigation-triggered close/showModal; current image remains until replacement readiness.
- Cold and warm cache, next/previous, thumbnail clicks, keyboard and browser history; repeated quick navigation cannot show a stale response.
- Initial loading, detail failure, original failure/retry and paginated navigation remain usable.
- Unsaved edits: cancel/discard/save-and-continue preserve asset identity; no cross-asset drafts or writes.
- Portrait/landscape/large images, fit/zoom/pan, desktop/mobile and three themes remain correct.
- Existing deterministic baseline plus focused browser regressions pass before any commit and 3001 activation.

## Verification of current source

`TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed: deterministic checks, ESLint (0 errors / 16 existing warnings), TypeScript, production build, isolated HTTP smoke and SQLite check. This validates the existing baseline, not a flicker fix. Browser intermediate-state evidence above demonstrates a gap in current visual-transition coverage.
