# Implementation Plan

## 1. Clean Base

- [x] Preserve the historical dirty inventory.
- [x] Create an isolated branch/worktree from current `origin/main`.
- [x] Confirm the production SHA is an ancestor of the base.

## 2. Runtime Identity

- [x] Add the shared parser and public no-store route.
- [x] Test development, production, mirror, invalid SHA/mode, and response secrecy.

## 3. Production Identity Injection

- [x] Forward identity through Compose.
- [x] Derive activation identity from the target manifest for deploy and rollback.
- [x] Extend deterministic deployment contracts without calling the VPS.

## 4. Runtime Separation

- [x] Add the port-3000 development wrapper with workers disabled by default.
- [x] Reserve port `3001` for the mirror and update package/startup contracts.

## 5. Mirror Synchronization

- [x] Implement explicit-SHA/bootstrap and production-endpoint resolution.
- [x] Enforce ancestry, dedicated worktree, cleanliness, build-before-stop, identity injection, HTTP smoke, equality, and bounded rollback reporting.
- [x] Cover command structure and runtime identity behavior with deterministic offline contracts.

## 6. Drift Verification

- [x] Compare local/remote endpoints, mirror worktree, and `origin/main` ancestry.
- [x] Cover each validation boundary with deterministic offline contracts.
- [x] Add the deterministic contract check to the full baseline.

## 7. Historical Root Convergence

- [x] Reconfirm the inventory after implementation lands.
- [ ] Route local-only work to separate tasks/branches and avoid duplicate commits.
- [x] Preserve all artifacts until explicit retain/discard decisions.

## 8. Verification And Documentation

- [x] Run focused identity, deployment, mirror, parity, and startup checks.
- [x] Run lint, TypeScript, build, and the documented full baseline.
- [x] Update status, verification, deployment/architecture rules, startup guidance, and feature state with confirmed evidence.

## 9. Controlled Rollout

- [x] Commit and verify the exact candidate SHA.
- [ ] Push/candidate-verify/preflight only with authorization.
- [ ] Request separate production deployment approval.
- [ ] After deployment, synchronize the mirror and require final parity.

No paid providers, Feishu/Lark writes, production-data mutation, volume change, or unrelated service change is included.
