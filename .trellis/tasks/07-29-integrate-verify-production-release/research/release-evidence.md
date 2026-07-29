# Release Integration Evidence

## Git Lineage

- Refreshed `origin` on 2026-07-29. `origin/main` remains `0f6e499938ab1cf1dedd04230f2ff56d1dafd78f`.
- The deployed Canvas candidate is `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3` on `origin/deploy/infinite-canvas-production`.
- `origin/main` is the merge base and direct ancestor of the deployed candidate. The candidate adds clean integration commits `1b0b8d8`, `5ac1101`, and `d05cadd`.
- Local dirty `main` points to `2279f31`, has 14 local-only commits and 7 remote-only commits, and is not a safe release base.
- Member-upload fix `9092a11954ff980ae48c038091001eb082d7db55` exists only on local `main` and changes `src/app/library/page.tsx` plus its deterministic check and specs.
- Because `origin/main` is an ancestor of the deployed candidate, a new candidate descended from `d05cadd` can later fast-forward GitHub `main` without force-push.

## Approved Feature Inventory

- Existing deployed Canvas and copy-batch code remains the release base.
- Port the LAN-safe member upload queue-id behavior from `9092a11`.
- Port the completed shared-library task contracts: default team visibility, six stable server-side sorts, versioned image cursors, selection preference, desktop marquee selection, copy batch actions, selection shortcuts, and fixed copy-library scrolling.
- Relevant tracked implementation/check files are limited to the two library pages and CSS modules, the library import route, the image/copy domain modules, shared types, and their focused deterministic checks.
- Relevant new helper modules are `library-sort.ts`, `list-selection.ts`, `marquee-selection.ts`, `use-library-list-sort.ts`, and `use-marquee-selection.ts`.
- The user subsequently approved executing the grouped cleanup and release plan. The expanded candidate also includes the verified legacy local-material retirement, local Next build slimming, Canvas condition-random unique copy assignment, bounded Canvas queue concurrency, and directly related Canvas run/retry reliability fixes.

## Overlap Risk

- The same dirty files also contain unrelated legacy-material removal, image-role removal, and tag-input changes that are not part of the approved shared-library task.
- Therefore copying whole dirty files into the candidate is unsafe. Port requirement-owned hunks against `d05cadd`, preserving all remote production contracts while retiring only the approved legacy local-material types, routes, tables, and migration path.
- Unrelated changes under `src/app/content/page.tsx`, configuration, Feishu, review upload, Docker/deployment scripts, broad Trellis verification rewrites, unfinished tasks, screenshots, and `.tmp-*` paths remain excluded unless a focused candidate failure proves a direct dependency.
- Targeted comparison found the root deployment wrapper at version 2 while the candidate already contains version-3 wrapper locking and candidate verification; copying root deployment files would be a regression, so they remain excluded.
- Root Feishu table-id/CLI edits and review-upload delegation have no release-owned task/evidence boundary and remain excluded. Root media and broad verification diffs also contain branch-divergence noise and must not be copied wholesale.
- `src/lib/canvas/runs.ts` and `src/lib/canvas/scheduler.ts` mix separately owned behavior. Port random-copy, queue-concurrency, stale-error, and retry-order hunks independently and verify each contract.

## Expanded Local Evidence

- Legacy local-material retirement has focused API/schema/simple-run checks, TypeScript, changed-file lint, builds/restarts, HTTP route probes, and read-only PostgreSQL/SQLite evidence recorded in the task/status files.
- Local build slimming has a completed seven-item acceptance checklist covering default non-standalone builds, Docker standalone wiring, tracing exclusions, build/start behavior, and preservation of runtime media/config.
- Canvas condition-random copy assignment has completed deterministic scheduler/workflow checks for no-replacement sampling, strict capacity errors, whole-batch resampling, and single-content snapshot preservation.
- Canvas queue concurrency and run reliability have focused concurrency, workflow, and scheduler checks; final candidate verification must still run the full baseline and must not restart port 3001 while a real simple run is active.

## Release And Promotion Contract

- Build the candidate in an isolated Git worktree/branch descended from `d05cadd`; do not mutate or clean local dirty `main`.
- Commit all candidate code, tests, and pre-release Trellis facts before final verification. Any content change creates a new SHA and invalidates earlier evidence.
- Push a dedicated candidate branch, verify remote SHA equality, run read-only production preflight, and request explicit approval for that full SHA.
- Deploy only with `/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>`.
- Promote GitHub `main` only after production verification. Use a normal fast-forward push; abort and rebuild if remote `main` moved.
- The deployed release wrapper preserves named volumes and restores the prior release on activation failure. Post-deploy failure requires manifest-aware rollback before main promotion.
