# Frontend Development Guidelines

FluxPost Studio is a dense local operations workspace built with Next.js App Router, React, TypeScript, Tailwind/PostCSS, and `lucide-react`.

## Applies To

- App pages in `src/app/page.tsx`, `src/app/review/page.tsx`, and `src/app/distribution-check/page.tsx`.
- Shared page styling in `src/app/globals.css`.
- Browser calls into route handlers under `src/app/api/**/route.ts`.
- UI-facing types from `src/lib/types.ts`.

## Pre-Development Checklist

- Read [Directory Structure](./directory-structure.md) before adding files or moving UI behavior.
- Read [Component Guidelines](./component-guidelines.md) before changing page components or controls.
- Read [State Management](./state-management.md) before adding new UI state, fetch flows, or polling.
- Read [Type Safety](./type-safety.md) before changing API payloads or shared UI types.
- Read [Quality Guidelines](./quality-guidelines.md) before finishing any UI change.
- Read the FluxPost project layer at `.trellis/spec/fluxpost/index.md` for product, verification, and boundary rules.

## Guidelines Index

| Guide | Description |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Where pages, API routes, route-specific helpers, and shared logic live. |
| [Component Guidelines](./component-guidelines.md) | Local component shape, props, controls, icons, and layout expectations. |
| [Hook Guidelines](./hook-guidelines.md) | How this project uses React hooks inside page modules. |
| [State Management](./state-management.md) | Local page state, server state, owner-scoped data, and refresh behavior. |
| [Quality Guidelines](./quality-guidelines.md) | Required checks, forbidden UI shortcuts, and review focus. |
| [Type Safety](./type-safety.md) | TypeScript and API contract conventions. |

## Quality Check

- Run the FluxPost baseline from `.trellis/spec/fluxpost/verification.md` when code changes are made.
- Confirm changed UI still uses existing operational layout patterns from `src/app/globals.css`.
- Verify browser-facing API changes preserve signed-in workspace ownership and clear error responses.
- Do not add marketing-style landing content for the main workspace; the first screen should stay the usable tool.
