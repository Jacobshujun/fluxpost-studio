# FluxPost Current Status

Last updated: 2026-09-03

## One-Line Status

Canvas now includes a user-configurable "遮罩" media node for image/video derivatives; the implementation, structured-config fix, and full offline baseline are verified, and the current committed HEAD is active on port `3001`.

## Current Focus

- Active library types, APIs, URLs, and UI no longer expose `reference | vehicle`; deterministic private migration roots preserve old memberships and Canvas filters.
- Ordinary nested collections, personal favorites, asset notes, flat tags, one-level `all/any` smart folders, permission-aware SQL filters, signed keyset cursors, and server-side query selections share PostgreSQL/SQLite semantics.
- The library grid loads compact 60-item pages and thumbnail endpoints; mocked Chromium passed 1440x960 and 390x844 workflows without horizontal overflow or live services.
- Library gallery cards and preview-rail thumbnails now use contain-fit rendering, and landscape thumbnail generation/cache versioning preserves the complete source image instead of reusing cropped cover thumbnails.
- Canvas and simple mode use collection/smart-folder filters and freeze accessible asset snapshots before execution; new imports remain idle until manual AI tagging.
- The library page subscribes to the shared `fluxpost-theme` state and derives its surfaces, text, borders, controls, and accents from the active application theme instead of hardcoded light colors.
- The Canvas batch scheduler keeps its existing split layout and responsive behavior while using a full-width desktop panel for higher-frequency editing.
- Canvas V2 batch retries now preserve failed-task buttons for historical terminal schedules and expose a server-computed retryability marker for partial child runs whose underlying per-image node has failed items, including child results projected as review posts. V1/V2/shared schedule status projection now requires a valid target artifact before showing completed/partial, so upstream-only failures display as failed while raw CanvasRun diagnostics remain intact.
- Batch scheduler image sources use bounded auto-fill cards and absolutely positioned 1:1 thumbnail boxes with centered contain-fit rendering so full-width layouts do not crop images into strips.
- Batch scheduler thumbnails request the versioned server-side square contain variant; the original landscape thumbnail cache remains unchanged.
- Canvas batch scheduler copy-pool entries restore their two-column selectable card layout, truncation, and selected-state styling after a CSS regression removed the dedicated rules.
- Canvas interaction source and mocked Chromium checks pass for blank-area pan, Alt-only marquee multi-select, collapsed-by-default node library, mobile drawer access, and 390px overflow.
- Focused migration/query checks, TypeScript, lint (0 errors, 20 warnings), build, isolated HTTP/SQLite smoke, and the full baseline pass. An isolated 50,000-asset/1,000,000-label PostgreSQL benchmark met all P95 targets.
- 2026-09-03 missing-source generation fix: Weibo and provider normalization no longer infer titles from body text; generation is field-presence aware, textless items skip model calls, no-key fallbacks preserve empty fields, title persistence/repair no longer invents Xpeng copy, and simple image fallback wording is source-generic. Focused source/title/Weibo checks, TypeScript, lint (0 errors, 20 warnings), build, HTTP/SQLite smoke, and the full offline baseline passed.
- 2026-09-03 route state persistence: shared URL query state now restores page filters, selected entities, Canvas workflow/run, and operational panels across hard refresh and browser navigation; all page routes return 200 without redirecting to `/`. TypeScript, lint (0 errors, existing warnings), build, HTTP smoke, deterministic route-state check, SQLite, and the full offline baseline passed. Playwright browser refresh coverage remains pending because `playwright` is not installed in this workspace.
- 2026-09-03 review desk approval behavior: the "审查通过" action still saves the approved post and updates its local row, but no longer calculates or selects the next unreviewed post. The focused review desk check and complete offline baseline passed.
- 2026-09-02 Canvas batch retry regression fix: V2 child reconciliation now persists safe retryability from Canvas node attempts; failed children remain directly retryable for historical schedules. A targeted read of terminal schedules now recomputes retryability, and partial children with legacy failed `model.gpt-image` nodes are retryable as well as per-image failed-index runs. The schedule center loads that detail before rendering actions. Canvas scheduler check, TypeScript, lint (0 errors, 20 warnings), build, isolated HTTP/SQLite smoke, and the full offline baseline passed.
- 2026-09-02 Canvas batch result model: V1/V2 implementation differences are hidden behind one result-item projection. Leaf results now expose only queued/running/completed/failed/cancelled; failed image batches retain produced/failed counts and retryability. Task groups and top-level batches retain partial aggregation, with per-item, group, and batch-level retry actions. Historical records are corrected lazily while raw CanvasRun diagnostics remain unchanged. Canvas scheduler check, TypeScript, lint (0 errors, 20 warnings), build, isolated HTTP/SQLite smoke, and the full offline baseline passed.
- 2026-09-03 Canvas media mask node: added typed image/video `utility.media-mask` execution with normalized rectangle/rounded-rectangle regions, solid/blur/mosaic/image modes, video intervals/keyframe geometry, source-preserving deterministic derived-media caching, inspector controls, and an isolated contract check. TypeScript, lint (0 errors, existing warnings), build, HTTP/SQLite smoke, and the complete offline baseline passed.

## Next Entry

Continue authenticated operator review of the unified library and run the one-time runtime migration when approved.

## Risks And Unknowns

- The real 621-asset runtime database has not been migrated in this dirty-tree verification; the migration was exercised only against isolated fixtures and will run when an approved clean candidate is activated.
- The PostgreSQL collection-subtree benchmark measured P95 `252.6ms` against the `300ms` target and is the closest performance margin as data grows.
- No paid model, TOS write, TikHub, Feishu, Lark, publishing, or production action was exercised.
- Production remains unchanged until a separate deployment is explicitly approved.
- 2026-08-31 Canvas batch incident: repeated Vision failures were upstream `502` Cloudflare HTML responses from the configured OpenAI-compatible text gateway during a concurrent shared-stage burst; later requests succeeded, and the local baseline remains green. The Canvas run queue currently gives these runs one attempt, so recovery requires retrying the failed shared stage.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
