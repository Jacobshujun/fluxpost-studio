# Local And Remote Production Parity Design

## Architecture

GitHub `main` is the integration history. Remote production and a sibling local mirror worktree run one exact deployed commit from that history. The root worktree is development-only and never supplies port `3001`. Runtime configuration and data remain environment-specific.

## Runtime Identity

Add a server-only identity owner and `GET /api/version`.

- `FLUXPOST_RELEASE_SHA`: optional for development, mandatory full lowercase SHA for versioned runtimes.
- `FLUXPOST_RUNTIME_MODE`: `development`, `local-production`, or `production`.
- Response: `{ commit: string | null, mode, versioned }` with no-store/nosniff headers.
- The route never reads Git or local paths. Identity is immutable for the process lifetime.

The endpoint is public because commit hashes are public identifiers and automation must not require an account. It returns no configuration or host information.

## Production Injection

`release.manifest` stays authoritative. `activate_release` reads and validates the target manifest commit and passes it to Compose with mode `production`. Deploy, automatic rollback, and manual rollback therefore identify the release actually activated rather than a global candidate variable.

## Local Mirror

Use a configurable sibling mirror root, defaulting beside the repository, with immutable release worktrees under `releases/<full-sha>`. Synchronization resolves an explicit SHA or the production endpoint, fetches refs, proves ancestry in `origin/main`, creates or validates the target release worktree, installs/builds before stopping port `3001`, starts with mirror identity, then requires HTTP and identity equality. A sibling `current.json` stores only the active commit, release path, and update time so an activation failure can restart the previous release without mutating either worktree.

The configuration file path is explicit or supplied through a local user environment value. Its contents are never copied or displayed.

## Development Runtime

Port `3000` uses a wrapper that sets development mode and disables background workers by default, preventing simultaneous development and mirror processes from consuming the same queues. `dev:lan` also uses `3000`; `3001` is reserved.

## Parity Checker

A read-only command validates structured `/api/version` responses, local/remote mode and SHA equality, mirror HEAD and cleanliness, and production ancestry in `origin/main`. Deterministic tests use temporary Git repositories and local HTTP fixtures.

## Dirty Root Migration

The historical root is never merged wholesale. Inventory remains classified as exact-main duplicates, superseded production files, archived-task duplicates, and local-only review items. Approved local-only behavior is reapplied onto separate branches from `origin/main`; cleanup waits for an explicit retain/discard decision.

## Rollout And Rollback

Implement and verify on the clean branch, push the unchanged full SHA, run candidate verification/preflight, and request separate deployment approval. After activation, verify production identity and synchronize the mirror. Existing remote rollback restores the prior manifest-derived identity; local activation failure leaves remote production unchanged and reports the previous local SHA.

## Compatibility And Security

- `/api/config`, production volumes, configuration mounts, and health behavior remain unchanged.
- Identity contains no secret or path.
- Baseline checks never access production or external providers.
- Explicit-SHA resolution is only valid for identity-enabled releases. The current pre-identity production commit cannot be version-proven; the first mirror synchronization follows deployment of this feature.
