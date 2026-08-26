# Production Release Design

## Candidate Boundary

The functional candidate starts from the existing clean base
`7df08cc987779478fc133b3c81a303bb8bae1f2d`. Pre-release changes are limited to
this task's Trellis metadata and a deterministic `package-lock.json` repair after
the first isolated verifier exposed missing npm 11.17 Linux optional dependency
entries for `@emnapi/core` and `@emnapi/runtime`. `package.json`, resolved direct
dependency versions, and application behavior remain unchanged. The repaired
metadata is accompanied by a verification-only compatibility fix: current FFmpeg
uses `-display_rotation`, while Debian 12 FFmpeg 5.1 falls back only when that
option is explicitly unsupported to the older stream `rotate=90` metadata syntax.
The existing probe assertions must still observe 90-degree rotation and swapped
display dimensions, so the fallback cannot hide a broken fixture. These changes
are accompanied by one isolated-verifier dependency correction discovered at
the next gate: the Canvas subtitle UTF-8 probe invokes Python, while the Debian
verification image did not provide it. The verification stage installs
`python3-minimal`; the runner remains unchanged. The probe accepts either the
Windows `python` command or Debian's `python3` command and reports spawn failures
directly. All changes are committed before restarting every candidate
verification gate so the local candidate, GitHub refs, VPS verifier, and
production deploy operate on one new immutable full SHA.

## Promotion Contract

- Local validation: the deterministic baseline, followed by `npm run local` on
  the clean committed candidate.
- Remote refs: fast-forward `origin/local` and `origin/main` to the same SHA; no
  force push or branch-name deployment.
- Isolated verification:
  `/opt/fluxpost-studio/bin/verify-candidate.sh --ref <full-sha>`.
- Activation: `/opt/fluxpost-studio/bin/deploy.sh --ref <approved-full-sha>`.
- Rollback: `/opt/fluxpost-studio/bin/deploy.sh --rollback <prior-release-id>`.
- Access: `root@38.76.210.136` through the existing authorized local SSH key and
  strict known-host verification.

## Safety And Data Boundaries

The verifier builds a clean Git archive and must not load production environment
files, mount runtime volumes, or activate services. Preflight is read-only and
captures non-secret identity, health, queue, volume, release, disk, worker, and
protected-service evidence. Any ambiguity or active work blocks activation.

Before activation, create a timestamped root-only custom-format PostgreSQL backup
on the VPS and validate only that it is non-empty. The deploy wrapper owns image
build, service activation, health checks, release switching, rollback, retention,
and timer installation. No ad hoc source, proxy, environment, volume, firewall,
DNS, or Docker-daemon changes are allowed.

## Failure Handling

- Local baseline, identity, push, verifier, preflight, active-work, approval, or
  backup failure: stop before production activation.
- Activation health failure: allow the wrapper to restore the previous release,
  then verify recovery.
- Post-deploy identity, health, auth, schema, worker, volume, protected-service,
  retention, or timer failure: invoke manifest-aware rollback and verify the prior
  release.
- If production is rolled back after `origin/main` was advanced, do not rewrite
  Git history. Record the undeployed candidate and prepare a new corrective
  candidate in a separate task.

## Completion Metadata

After production parity passes, update the lightweight FluxPost status and
deployment feature evidence, archive this task, rerun the required Trellis check,
and create a metadata-only completion commit. Per operator choice, push that final
record only to `origin/local`; production and `origin/main` remain on the verified
release candidate.
