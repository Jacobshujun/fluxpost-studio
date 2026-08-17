# Single Candidate Environment Design

## Local lifecycle

Port `3001` has one active role at a time. `npm run dev` provides an unversioned development preview with background workers disabled by default. Candidate preparation runs `npm ci` before activation. After changes are committed, `npm run local:restart` uses the current worktree directly, requires it to be clean, runs the production build before replacing the listener, injects mode `candidate` plus HEAD, and validates `/api/version` and the HTTP smoke.

No release worktree hierarchy or `current.json` pointer is created. Local configuration can be selected by an explicit path or the user-level `FLUXPOST_LOCAL_CONFIG_FILE`; its contents are neither copied nor printed.

## Runtime identity

`GET /api/version` returns only `commit`, `mode`, and `versioned`. Valid modes are `development`, `candidate`, and `production`. Candidate and production require a full lowercase SHA.

## Promotion data flow

```text
clean local HEAD -> port 3001 candidate tests -> GitHub branch/main
                 -> VPS isolated candidate verifier -> exact-SHA deploy
                 -> local/GitHub/production parity check
```

The deployed SHA is derived from the target release manifest, including rollback, so production reports the activated release rather than a mutable branch.

## Cleanup and recovery

The historical dirty root is preserved by Git branch and annotated tag before cleanup. The archive contains only unique tracked WIP and task evidence, not dependencies, build output, data, media, configuration, or secrets. Cleanup happens only after production and rollback readiness are verified.

## Failure behavior

A dirty or invalid local HEAD fails before build or listener replacement. Dependency installation is a pre-activation gate because Windows locks the running Next SWC binary in the active worktree. Build failures leave the existing listener intact. Identity or smoke failures fail activation explicitly. A parity mismatch identifies whether local runtime, local HEAD, GitHub `main`, or production differs.
