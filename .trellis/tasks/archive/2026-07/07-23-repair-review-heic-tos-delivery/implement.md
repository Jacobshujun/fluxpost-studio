# Implementation

1. Add the pinned HEIC dependency, shared normalizer, and real fixture regression.
2. Integrate normalization into media cache and keep-mode generation; add failure-path coverage.
3. Add the shared preview URL helper and managed-TOS proxy redirect/HEIC rejection behavior.
4. Add exact-match historical repair domain logic, admin cursor API, config controls, and deterministic tests.
5. Run focused checks, lint, TypeScript, build, and the full Trellis baseline on an allowed smoke port.
6. Restart the local production server and perform authenticated/manual preview checks where credentials are available.
7. Update stable Trellis facts, commit only task-related changes, push the fixed commit, deploy production 38, back up affected rows, scan, apply, and verify the known nine-image post.

## Rollback

- Before data repair, roll back through the existing deployment wrapper.
- After data repair, the previous release can still display absolute TOS URLs; restore only the backed-up affected rows if the repair mapping itself is wrong.
- Never remove named volumes or TOS objects as part of rollback.
