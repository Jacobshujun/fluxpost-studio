# Directory Structure

## App Router Layout

- `src/app/layout.tsx` owns the root HTML/body shell and global metadata.
- `src/app/page.tsx` is the main all-in-one workspace for crawl, production, materials, simple mode, and account surfaces.
- `src/app/review/page.tsx` is the standalone review desk for generated posts and Feishu publishing.
- `src/app/distribution-check/page.tsx` is the Feishu distribution audit workspace.
- `src/app/globals.css` contains shared visual language, responsive layout rules, and module-specific class groups such as review and distribution panels.

Do not add a marketing landing page in front of these operational workspaces.

## API Boundary

- Browser-facing endpoints live under `src/app/api/**/route.ts`.
- Route handlers should stay thin: authenticate, parse input, call `src/lib/**`, and return `NextResponse.json(...)`.
- Shared product logic, persistence, provider calls, queues, and normalization live in `src/lib/**`, not inside page components.

Reference routes:
- `src/app/api/simple/runs/route.ts` queues owner-scoped simple runs.
- `src/app/api/publish/feishu/route.ts` stages Feishu publish work.
- `src/app/api/distribution-check/route.ts` queues distribution audit jobs.

## Shared Logic

Keep reusable behavior in focused `src/lib` modules:

- `src/lib/types.ts` for shared domain types.
- `src/lib/config.ts` for environment-derived app configuration.
- `src/lib/database.ts` for runtime persistence.
- `src/lib/simple-runs.ts`, `src/lib/feishu-publish-queue.ts`, and `src/lib/distribution-check.ts` for durable workflow logic.
- `src/lib/media-cache.ts`, `src/lib/image-generation.ts`, and `src/lib/video-transcription.ts` for media/provider work.

## Static And Runtime Files

- Runtime databases and JSON migration artifacts live under `data/`.
- Generated AI images live under `public/generated/`.
- Crawled media and extracted frames live under `public/media/`.
- Do not treat those runtime paths as Trellis context or source fixtures unless a deterministic check explicitly does so.

## Avoid

- Do not move domain logic into React page files for convenience.
- Do not create a parallel docs, memory, TODO, or handoff directory outside `.trellis/`.
- Do not point new checks at `docs/harness.disabled/` or `scripts/harness.disabled/`; active checks live in `.trellis/verification/`.
