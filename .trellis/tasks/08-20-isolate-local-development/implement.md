# Implementation Plan

1. Add an allow-listed local build-slot selector to `next.config.ts` and ignore its fixed output/state paths.
2. Refactor `scripts/local/restart.ps1` to select the inactive slot, build before listener replacement, activate and verify it, record state atomically, and restore the prior managed slot on activation failure.
3. Extend `.trellis/verification/runtime_parity_check.mjs` to enforce slot isolation, primary-worktree safety, build ordering, state persistence, and rollback contracts.
4. Update active README and stable Trellis rules/decisions/status only with the confirmed local lifecycle.
5. Run the focused runtime check, TypeScript, lint, normal production build, and complete offline baseline.
6. Commit the verified task after user confirmation, then activate port 3001 from the primary worktree and verify its exact identity.

## Verification Commands

```powershell
node .trellis/verification/runtime_parity_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

## Rollback Points

- Before activation: the running listener is unchanged.
- During activation: the launcher restarts the previously recorded slot on failure.
- Source rollback: revert only this task's committed launcher/config/docs/check changes; do not alter runtime data or unrelated dirty files.
