# Isolate Local Development From The Stable App

## Goal

Keep the currently usable application on port 3001 stable while new features and bug fixes are developed, built, and verified. Development iterations must not become versions that the operator needs to manage.

## Background

- The operator uses the local application while development is in progress.
- Port 3001 is the only local application environment and must keep one usable candidate at a time.
- The primary worktree is the only allowed project directory. Sibling candidate directories and linked worktrees are prohibited.
- The current launcher builds into the same `.next` directory that a primary-worktree server would read, so a new build is not sufficiently isolated from the running application.

## Requirements

- Keep port 3001 serving its current committed candidate while a replacement is built.
- Use two ignored build slots inside the primary worktree, with only one active at a time.
- Build the clean committed `HEAD` into the inactive slot before stopping the current listener.
- Switch port 3001 only after the replacement build succeeds.
- If replacement startup or health verification fails, restart the previous build slot and report the failed update explicitly.
- Preserve the existing clean-worktree guard, full-SHA runtime identity, loopback/LAN bindings, normal background workers, configuration selection, HTTP smoke, and production parity contract.
- Do not create or use a sibling candidate directory or linked worktree.
- Do not expose secrets or include runtime data in Git.

## Acceptance Criteria

- [x] AC1: `npm run local` selects the inactive local build slot and builds into it without changing the active slot.
- [x] AC2: A failed build leaves the current port-3001 listener untouched.
- [x] AC3: A successful build replaces port 3001 with the clean committed `HEAD`, reports candidate identity, and records the active slot as ignored local runtime state.
- [x] AC4: A failed startup or health check restores the prior slot and prior runtime identity when a prior managed slot exists.
- [x] AC5: The launcher rejects dirty or non-primary worktrees before build or listener replacement.
- [x] AC6: Default builds and production standalone builds retain their existing output behavior when no local slot is selected.
- [x] AC7: Focused runtime checks, type-check, lint, production build, and the complete offline baseline pass without external provider calls.

## Out Of Scope

- Running a second application server or exposing a second local port.
- Creating a development-preview command or hot-reload environment.
- Changing production deployment, runtime data, credentials, provider configuration, or application features.
- Keeping a user-facing history of intermediate development versions.
