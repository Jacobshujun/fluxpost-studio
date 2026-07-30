# Implementation Plan

1. Confirm the user-selected candidate scope and remove the resolved question from `prd.md` during the convergence pass.
2. Create an isolated clean worktree and integration branch from GitHub `main` `0f6e499938ab1cf1dedd04230f2ff56d1dafd78f`.
3. Integrate Canvas commits `164cb9e` and `6227c7e`; resolve conflicts without regressing current production library, media, deployment, or authentication behavior.
4. Review the candidate diff specifically for Canvas routes, APIs, schema, workers, copy-library dependencies, package dependencies, and accidental unrelated changes.
5. Run Canvas/copy-library focused checks, focused lint, TypeScript, production build, and the full Trellis baseline from the clean candidate.
6. Commit the integration candidate, push it to a dedicated GitHub branch, and verify the remote full SHA.
7. Run read-only production preflight on 38: release/manifest/image, app/PostgreSQL, loopback/public HTTP, Nginx, Open WebUI, and disk headroom. Stop on any unhealthy or ambiguous state.
8. Run the deployment wrapper with the approved full SHA and wait for its build/health/rollback result.
9. Verify deployed SHA, `/canvas`, unsigned Canvas API boundaries, Canvas table existence, workers/container logs without secrets, app/PostgreSQL, Nginx HTTPS, Open WebUI, and retained prior release.
10. If any required post-check fails, roll back to the captured release and verify recovery. Otherwise record production evidence, update Trellis state, commit deployment records, and archive the task.

## Validation Commands

- `node .trellis/verification/canvas_workflows_check.mjs`
- `node .trellis/verification/canvas_scheduler_check.mjs`
- `node .trellis/verification/copy_library_check.mjs`
- `npx --no-install eslint <candidate Canvas and integration files>`
- `npx --no-install tsc --noEmit`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` with the documented Windows smoke port override
- Existing production 38 verification script plus targeted Canvas route/schema checks

## Stop Conditions

- Candidate contains unrelated debug artifacts, secrets, or unresolved conflict markers.
- Local Canvas, type, build, or candidate-focused lint checks fail.
- Production release identity, health, disk capacity, host key, or protected-service state is ambiguous.
- Deployment would require deleting/replacing volumes, changing Nginx/DNS/firewall, or exposing secrets.

## Rollback Points

- Before push: discard only the isolated integration worktree/branch; never reset the user's primary worktree.
- Before deploy: stop with production unchanged if any preflight check fails.
- After deploy: use `/opt/fluxpost-studio/bin/deploy.sh --rollback <captured-release-id>` and verify the original manifest, app/PostgreSQL, HTTPS, Nginx, and Open WebUI health.

## Outcome

- Candidate branch: `deploy/infinite-canvas-production`.
- Deployed SHA: `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3`.
- Production release: `20260729-061224-d05caddb1787`.
- Verified: remote SHA/image identity, `/canvas` and `/copy-library` HTTP 200, unsigned Canvas APIs HTTP 401, Canvas/copy PostgreSQL tables, zero Canvas queue/schedule rows, enabled background workers, healthy app/PostgreSQL/Nginx/Open WebUI, six retained volumes, and retained previous release.
- No paid provider, Feishu write, local-history import, DNS/Nginx/firewall change, or volume replacement was performed.
- Full baseline isolated one unchanged `origin/main` review-desk source/check mismatch; candidate-focused and all later baseline checks passed separately.
