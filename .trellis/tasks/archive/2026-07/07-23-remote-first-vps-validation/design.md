# Design

## Cross-platform baseline

Move baseline orchestration into `.trellis/verification/check.mjs`. It owns Trellis structural checks, the ordered deterministic check list, lint, TypeScript, build, production HTTP smoke, and SQLite validation. `check.ps1` only locates Node and forwards to the shared runner so Windows and Linux cannot drift.

## Candidate verifier

Add a versioned `scripts/deploy/vps-verify-candidate.sh` installed as `/opt/fluxpost-studio/bin/verify-candidate.sh`. It accepts `--check` and `--ref`, validates the ref, fetches it through the existing repository, resolves a full SHA, archives it into an isolated candidate directory, and builds Docker target `verification`.

The verifier does not source or link `shared/env.production`, invoke Compose, mount named volumes, or touch `current`. Success writes a mode-0644 non-secret manifest under `/opt/fluxpost-studio/verifications/<sha>.manifest`; failure removes the incomplete candidate and leaves services unchanged.

## Promotion boundary

After verifier success, deploy the resolved SHA to 104 with the existing wrapper and validate staging health plus the bug-specific scenario. Only that unchanged SHA can enter `main` and production. Production uses `deploy.sh --check --ref <sha>` followed by the real deployment. Existing automatic and manual rollback contracts remain unchanged.

## Compatibility and safety

The Docker application image remains unchanged because the new verification target is separate from `runner`. Existing default branch deployment remains supported. Versioned wrapper installation prevents an older target commit from downgrading the verifier. No API, schema, environment variable, or runtime-volume migration is introduced.
