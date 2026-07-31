# Slim local Next build output

## Goal

Reduce local Next.js build output from roughly 21 GB to a normal application-build size without changing local runtime behavior or the existing Docker/VPS deployment contract.

## Background

- `next.config.ts` currently enables `output: "standalone"` for every build.
- Local production starts through `next start`; it does not run `.next/standalone/server.js`.
- Local output tracing currently includes about 20.4 GB from `public/generated` and `public/media`, duplicating runtime media under `.next/standalone/public`.
- Docker requires standalone output, while `.dockerignore` excludes local runtime media and Compose mounts persistent `data`, `public/media`, and `public/generated` volumes.

## Requirements

- Local `npm run build` must not generate standalone output by default.
- Docker image builds must continue to generate standalone output for the existing runner stage.
- Standalone output tracing must explicitly exclude runtime data, generated media, crawled media, and test artifacts.
- Local `npm run start` and `npm run local:restart` behavior must remain unchanged.
- Existing runtime data and media must not be deleted or modified by implementation or verification.
- The configuration must not expose or copy local `.env.local` into a local standalone bundle by default.

## Acceptance Criteria

- [x] A default clean `npm run build` succeeds and does not create `.next/standalone`.
- [x] Default build output no longer duplicates `public/generated`, `public/media`, or `data`.
- [x] A Docker-mode configuration evaluation enables `output: "standalone"`.
- [x] Dockerfile builder wiring explicitly enables Docker-mode standalone output.
- [x] Output-file tracing exclusions cover `public/generated`, `public/media`, `data`, and `test-artifacts`.
- [x] Existing deployment contract checks, lint, TypeScript, build, and local HTTP smoke pass.
- [x] Runtime media, runtime databases, and `.env.local` remain untouched.

## Out Of Scope

- Deleting or pruning user-generated media.
- Moving the project or media directories to another drive.
- Changing the VPS Compose volume layout or server startup command.
