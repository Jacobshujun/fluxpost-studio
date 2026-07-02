# Component Guidelines

## Page Modules

FluxPost currently keeps page-local UI components in the same page file. Examples:

- `src/app/review/page.tsx` defines `Metric`, `FieldLabel`, `PostThumb`, `StatusBadge`, and `PublishStatusCard` below the main `ReviewPage`.
- `src/app/distribution-check/page.tsx` keeps audit controls and result rendering in the route page module.
- `src/app/page.tsx` owns the main workspace modules and should preserve the existing top-level workspace flow.

Use this pattern for UI that is route-specific. Extract a shared component only when it is used across pages or would remove meaningful duplication.

## Props

- Prefer explicit TypeScript prop objects inline for small local components, as in `Metric({ label, value }: { label: string; value: string | number })`.
- Use shared domain types from `src/lib/types.ts` for generated posts, source items, runs, and publish states.
- Keep callback props narrow and command-like; avoid passing broad mutable page state into helpers.

## Controls And Icons

- Use `lucide-react` icons for visible actions when an icon exists. Existing examples include refresh, publish, preview, approve, delete, and search actions in `src/app/review/page.tsx`.
- Buttons should expose concrete commands such as save, approve, publish, refresh, select, or delete.
- Keep operational controls compact and scan-friendly; this app is a workbench, not a marketing site.

## Styling

- Use existing classes and CSS variables from `src/app/globals.css`, such as `field`, `soft-button`, `primary-button`, `status-badge`, `ops-panel`, and page-specific review/distribution classes.
- Keep card radii and control geometry consistent with the existing operational UI.
- Do not create nested cards or decorative page sections for tool surfaces.

## Accessibility And Feedback

- Preserve semantic controls: real `button`, `input`, `textarea`, `select`, and checkbox elements.
- Long-running actions should show busy states, disabled controls, or progress text. Existing examples include `busy` in `src/app/review/page.tsx` and job progress polling in distribution/simple-run flows.
- User-visible failures should surface as messages from API responses, not silent console-only errors.

## Avoid

- Do not introduce a UI component library without a strong local need.
- Do not add visible instructional copy that explains keyboard shortcuts or implementation details.
- Do not let text overflow fixed buttons or compact panels; use truncation or layout changes that preserve readability.
