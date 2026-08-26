# Deploy Local Latest To Production

## Goal

Promote the current local FluxPost product state at base commit
`7df08cc987779478fc133b3c81a303bb8bae1f2d`, plus only this release task's
Trellis metadata, to `https://flux.lightmoment.net` as one exact-SHA production
activation while preserving production data, configuration, media, networking,
and unrelated VPS services.

## Background

- The local `local` branch is clean at `7df08cc987779478fc133b3c81a303bb8bae1f2d`.
- GitHub `main` and production currently identify
  `e086872de90a2b2f29a35b5ade2ae9a50780155c`.
- The production commit is an ancestor of the local base; the update is a
  127-commit fast-forward with no history rewrite.
- Production is the existing host `38.76.210.136`, using host Nginx for
  `https://flux.lightmoment.net` and the app on loopback port `3101`.
- The operator approved one production activation. Completion-only Trellis
  metadata will not cause a second activation.

## Requirements

- The release candidate may add this task's Trellis planning metadata and the
  minimum `package-lock.json` repair required for npm 11.17 Linux `npm ci`. It
  may also make the Canvas video-loader verification fixture compatible with the
  production verifier's FFmpeg 5.1 while preserving the rotation assertions. It
  may install `python3-minimal` only in the isolated Docker verification stage
  and make the Canvas subtitle UTF-8 probe select an available Python command
  with explicit process-start diagnostics. It must not change `package.json`,
  dependency versions, the Docker runner stage, or application behavior.
- Verify the final clean candidate with the documented deterministic baseline,
  then activate it locally on port `3001` and require candidate SHA identity.
- Fast-forward both `origin/local` and `origin/main` to the unchanged candidate
  without force-pushing, and verify both remote full SHAs.
- Use only the installed production verifier and deploy wrapper with the exact
  40-character candidate SHA.
- Require an isolated commit-bound passing verifier manifest and a read-only
  production preflight before requesting the separate exact-SHA activation
  approval.
- Preflight must confirm release identity, app/PostgreSQL/Nginx/public health,
  loopback binding, protected services, disk headroom, current releases, volume
  mounts, background workers, and that no active job can be interrupted safely.
- Create a non-empty root-only PostgreSQL custom-format backup before activation
  because the candidate contains schema changes.
- Preserve all production environment files, named volumes, runtime data,
  generated/crawled media, networking, Nginx, and unrelated services.
- Do not read or print secrets, call paid providers, run Feishu/Lark writes,
  import local runtime state, bootstrap the server, globally prune Docker, or
  delete/replace volumes.
- On activation failure, rely on automatic wrapper restoration. On a required
  post-check failure, run manifest-aware rollback to the captured prior release.
- After successful parity verification, record and archive the completed task in
  a separate metadata-only commit pushed only to `origin/local`.

## Acceptance Criteria

- [ ] The final candidate contains the approved product base plus only this
      task's pre-release Trellis metadata and the reviewed lockfile repair, with
      no tracked secret/runtime files.
- [ ] npm 11.17 accepts the repaired lockfile for a clean Linux x64 install, and
      the VPS verifier no longer fails dependency synchronization.
- [ ] The Canvas video-loader check creates a 90-degree metadata fixture on both
      FFmpeg 5.1 and current FFmpeg, and still asserts rotation and display-size
      normalization rather than skipping the case.
- [ ] The Docker verification target provides Python 3 for the Canvas subtitle
      UTF-8 probe, which works with either `python` or `python3` and reports a
      missing executable without an unrelated `.trim()` failure.
- [ ] The complete offline baseline passes on the committed candidate, and port
      `3001` reports the same SHA in candidate mode.
- [ ] `origin/local` and `origin/main` resolve to the exact candidate SHA before
      VPS verification.
- [ ] The installed isolated verifier produces a passing manifest bound to the
      candidate SHA without reading production configuration or mounting runtime
      volumes.
- [ ] Read-only preflight is healthy, no unsafe active work exists, and a usable
      rollback release plus stable volume/service inventory are captured.
- [ ] The operator explicitly approves the evidenced full SHA before activation.
- [ ] A root-only non-empty PostgreSQL backup exists before activation.
- [ ] Production activates the exact candidate SHA through the installed wrapper.
- [ ] Production identity, routes/auth boundaries, app/PostgreSQL/Nginx/public
      health, schema, workers, volumes, protected services, retained rollback,
      rescue images, and weekly BuildKit timer pass post-deploy checks.
- [ ] `npm run local:parity` proves the clean candidate, GitHub `main`, and
      production use the same SHA before completion-only metadata is committed.
- [ ] No paid/provider action, Feishu/Lark write, runtime import, secret exposure,
      DNS/firewall/Nginx change, global Docker prune, or volume deletion occurs.

## Out Of Scope

- New product code or behavior beyond the already approved local base.
- Production configuration changes, local-to-production data/media migration,
  authenticated product workflows, or live provider-quality validation.
- A second production activation solely to publish completion documentation.
