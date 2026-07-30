# Technical Design

## Candidate Construction

Build the production candidate in an isolated clean Git worktree based on the full GitHub `main` SHA. Integrate the Canvas commits there so the user's dirty primary worktree remains untouched. Resolve conflicts in favor of current production behavior except where Canvas needs an explicit additive route, schema, worker, library, or configuration contract.

The candidate must preserve current remote deployment safeguards and add Canvas as part of the existing Next.js application. No separate process, port, proxy rule, or database is introduced.

## Runtime Boundaries

- Browser traffic continues through Nginx to the existing loopback app port.
- Canvas route handlers use the existing workspace session and owner boundaries.
- PostgreSQL remains the runtime store. Application startup may create missing Canvas tables through the existing database readiness path.
- `src/instrumentation.ts` starts the persisted Canvas run and scheduler workers in normal Node production runtime.
- Generated/crawled media continues through existing TOS/local runtime-media rules and named volumes.

## Deployment Flow

1. Verify the candidate locally and push its exact full SHA to a dedicated remote branch.
2. Read production state without printing secrets or runtime user data.
3. Invoke `/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>` on 38.
4. Let the release wrapper build an immutable image, health-check it, switch `current`, and retain prior releases.
5. Run post-deploy read-only checks against release identity, containers, Nginx, HTTPS, Canvas route/API, schema presence, and protected services.

## Compatibility

No local Canvas rows are copied. Existing production accounts, libraries, generated posts, settings, and media remain in their current volumes. Canvas tables are additive. Existing app routes and Nginx routing remain unchanged.

## Follow-Up Full-Feature Convergence

This task is the first bounded production release, not the final branch reconciliation. After Canvas is healthy on production, complete functional convergence should proceed from the then-current GitHub `main`, never by replacing it with the divergent local branch or committing the current working tree wholesale.

1. Inventory every local-only commit and uncommitted file by owning feature, required dependencies, verification evidence, and production relevance.
2. Classify temporary screenshots, downloaded repositories, generated output, runtime data, and debug scripts as non-product artifacts and exclude them from Git.
3. Reapply or cherry-pick each product feature onto clean integration branches rooted at current GitHub `main`, resolving conflicts against the production behavior already present there.
4. Land changes in dependency order: deployment/runtime foundations; database and shared domain contracts; Canvas and libraries; configuration/media/Feishu integrations; UI refinements; Trellis evidence.
5. Verify each bounded integration locally. Group only mutually dependent changes into one release; deploy independent groups separately with exact SHAs and rollback gates.
6. For schema-affecting releases, capture a root-only production database backup and verify restore metadata before deployment. Keep migrations additive and idempotent.
7. Do not copy local runtime rows or media as part of code convergence. Any future local-data import requires a separate export/import design with owner-id mapping, reference validation, TOS/local-media handling, and an explicit operator gate.
8. Once GitHub `main` contains all approved functionality and production matches it, make that branch the sole deployment source. Preserve or archive remaining local experiments separately instead of force-pushing or resetting over user work.

### Why The Staged Approach Is Required

- GitHub `main` contains production fixes that are absent from the local Canvas lineage, while the local lineage contains Canvas code absent from GitHub `main`; replacing either side loses working behavior.
- The primary working tree mixes product changes with unrelated Trellis edits, temporary screenshots, downloaded repositories, and debug artifacts, so its current filesystem state is not a reviewable release unit.
- Canvas batch scheduling depends on copy-library, database, worker, media, and provider contracts. Integrating by dependency boundary makes conflicts explicit and testable.
- Production state lives in PostgreSQL and named volumes. Separating code releases from data imports preserves existing accounts, media, configuration, and rollback safety.
- Small exact-SHA releases let the existing manifest-aware wrapper identify and reverse the release that caused a regression; one large convergence release would make diagnosis and rollback materially harder.

## Rollback

The pre-deploy release id and manifest commit are captured. If wrapper health fails, rely on automatic rollback. If Canvas-specific post-checks fail after wrapper success, invoke the manifest-aware rollback to the captured release and re-run health checks. Never use `docker compose down -v`, global prune, or manual volume replacement.

## Security And External Effects

Do not read or print environment values, database URLs, tokens, account data, or provider credentials. Verification must not run paid or external-write nodes. Database inspection is limited to table-name existence and queue counts/status aggregates where needed; no payload JSON is printed.
