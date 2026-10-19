# Library color palettes

2026-10-19: image-only gallery, Canvas library node, V1/V2 schedule pickers.

- Shared `library-color.ts`: six-digit hex normalization, CIELAB D65 math, DeltaE76 <=25, representative coverage >=0.05. One color combines with existing filters; normal sort order and frozen selections remain unchanged.
- Sharp samples the full first frame within 128x128, alpha-weights visible pixels, deterministically quantizes/merges Lab neighbors <10, retains up to six colors by original coverage. Transparent images have an empty successful palette. Source originals are never resized or rewritten.
- Additive `006_library_colors.sql` matches portable runtime schema. Independent palette state/color rows overlay asset reads; metadata saves exclude palette JSON. SQL indexed bounds/distance drive counts/cursors/query selections; SHA/version invalidate obsolete palettes without scanning media.
- New imports analyze original bytes automatically and persist explicit failed palettes without discarding imported assets. Existing assets are analyzed only through explicit authenticated `POST /api/library/colors/jobs` with mode `missing|failed`. GET list/latest and GET `/:id` return job counts/failures and readable/manageable coverage.
- Jobs capture manageable assets; active requester/asset uniqueness prevents duplicate work. Atomic claims permit two running items globally, 120s recoverable leases and claim-token completion fences. Startup wakes persisted work; failed media requires explicit retry. Workers recheck current account/ownership and reuse managed thumbnail-source transport limits (no redirects, image-only, 30MB, 20s).
- Color persistence uses generator-driven SQL transactions: SQLite executes the whole transaction synchronously; PostgreSQL awaits on one client. Do not hold the shared SQLite transaction across async yields.
- Gallery color is URL-backed; viewer colors honor dirty-draft guards then close/filter atomically. Palette buttons are siblings of selection/preview controls and isolate Canvas pointer events. Canvas node color is local search state; V1/V2 colors survive save/reload/preflight. Progress refresh runs only for an active explicit job and stops on failure/unmount.

Verification:

```powershell
node .trellis/verification/library_colors_check.mjs
node --env-file=.env.local node_modules/tsx/dist/cli.mjs .trellis/verification/library_colors_postgres_check.ts
$env:BROWSER_BASE_URL='http://127.0.0.1:45678'
python .trellis/verification/library_colors_browser_check.py
```

The first command is in the default offline baseline (isolated SQLite, real Sharp, intercepted storage/imports/worker downloads). PostgreSQL is opt-in, loopback-only and TEMP-table-only; it skips runtime initialization and never touches runtime rows. Browser tests require an existing worker-disabled isolated loopback server, reject 3001, intercept all APIs/media, and cover three themes at 1440/390. Library gallery regression and scheduler checks retain existing behavior and add color query/save contracts.

No video analysis, custom picker, multi-color conditions, color smart-folder fields, automatic historical scan, AI calls or remote release. Real library-wide backfill remains an operator action after activation.
