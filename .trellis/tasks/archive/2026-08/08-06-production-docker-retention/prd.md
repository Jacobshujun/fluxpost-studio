# Production Docker retention and cleanup

## Goal

Bound production Docker disk growth caused by historical FluxPost verification and rollback images while preserving the running release, two recent rollback options, runtime volumes, failed-release evidence, and unrelated Docker workloads.

## Background

- Confirmed production observations supplied by the operator on 2026-08-06:
  - PostgreSQL occupies about 827 MiB and FluxPost media, generated files, and configuration volumes total about 100 MiB.
  - The running `fluxpost-app` image occupies about 1.24 GB.
  - Historical `fluxpost-app:rescue-*` images span 2026-07-22 through 2026-08-05.
  - Each unused `fluxpost-verification:*` image occupies about 2.77-2.78 GB because it includes `npm ci`, source, Bash, ffmpeg, and Git.
  - Conservative reclaimable space is 11.29 GB, subject to shared image layers and BuildKit cache accounting.
- The existing Dockerfile already uses a multi-stage `node:24-bookworm-slim` build and `.dockerignore` excludes dependencies, build outputs, media, and generated files. Retention policy is the primary fix; runtime image slimming is secondary.
- Existing deployment uses repository-owned VPS wrappers, immutable commit-tagged app images, `rescue-*` tags, isolated verification images, health-based activation/rollback, and named Docker volumes.

## Requirements

- R1: Provide an explicit production-safe cleanup entry point that removes every unused `fluxpost-verification:*` image and unreferenced historical `fluxpost-app:<40-hex-commit>` tag while keeping `fluxpost-app:latest`, the current container image, and the two newest `fluxpost-app:rescue-*` tags. Any container-referenced historical app tag is a temporary safety exception until that reference is removed.
- R2: Determine image usage through Docker metadata and container references. Use Docker commands for image/cache removal; never remove files below `/var/lib/docker` or `/var/lib/containerd` directly.
- R3: Never run global image/system/volume prune. Do not remove FluxPost PostgreSQL, config, media, generated, data, node-home, or unrelated-service volumes, images, containers, or networks.
- R4: After a deployment completes all health checks successfully, automatically apply the verification-image and rescue-image retention policy. A failed build, activation, health check, or rollback must not invoke cleanup so diagnostic evidence remains available.
- R5: Candidate verification by itself must retain its image until a later successful deployment cleanup; cleanup may remove the just-deployed commit's verification image and all older unused verification images.
- R6: Install a weekly root-controlled BuildKit cache cleanup that runs `docker builder prune -af --filter until=168h` and does not include volumes or general Docker objects.
- R7: Cleanup operations must be serialized with the existing FluxPost deployment/verification lock, support a non-mutating check/dry-run mode, validate project/tag inputs, and report what would be or was retained/removed without exposing secrets.
- R8: Existing exact-SHA deploy, automatic rollback, manual rollback, release-directory retention, app image identity, and protected-service behavior must remain compatible.
- R9: Document immediate cleanup, automatic retention, weekly cache behavior, rollback trade-off, and the fact that cache cleanup only slows a future build.
- R10: Keep ffmpeg and global `@larksuite/cli` in the runtime image; dependency slimming remains out of scope until runtime usage is separately proven unnecessary.

## Acceptance Criteria

- [x] AC1: An isolated deterministic test proves unused `fluxpost-verification:*` images are selected while container-referenced verification images are not removed.
- [x] AC2: An isolated deterministic test proves `latest`, the running/current app image, and the two newest `rescue-*` images are retained; old unreferenced rescue and immutable commit tags are removed; and referenced historical app images are protected as an explicit temporary exception.
- [x] AC3: Tests prove cleanup uses Docker image/cache commands only and contains no direct Docker/containerd storage deletion, global system/image/volume prune, or Compose `-v` behavior.
- [x] AC4: Successful deployment invokes retention only after health checks and current-release switch; failure paths do not invoke retention.
- [x] AC5: Successful deploys and applied standalone cleanup install and enable a weekly BuildKit cleanup schedule whose command is exactly scoped to unused cache older than 168 hours.
- [x] AC6: Check/dry-run mode makes no Docker mutation and shows the intended selection.
- [x] AC7: Existing deployment verification, shell syntax checks, TypeScript, lint, production build, and full Trellis baseline pass without external provider calls or production mutation.
- [x] AC8: Deployment documentation gives the operator exact commands for previewing and applying the one-time cleanup and inspecting the weekly schedule.

## Out Of Scope

- Direct deletion of Docker/containerd storage files.
- PostgreSQL or named-volume cleanup, database compaction, media deletion, or release-source optimization beyond existing release-directory retention.
- Removing ffmpeg or `@larksuite/cli`, changing the runtime base image, or redesigning the Dockerfile solely for size.
- Global cleanup of Docker resources belonging to other applications.
- Contacting or mutating the production host as part of default repository verification.
