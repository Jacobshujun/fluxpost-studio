# Recover local startup after dirty-worktree rejection

## Goal

Restore the primary-worktree application on LAN port 3001 after the reported
unexpected exit and `Candidate worktree must be clean before restart` error.

## Requirements

- Preserve and review the existing Feishu audit report, isolated probe and status
  changes; commit them before activation. Do not discard or hide these changes.
- Keep the clean-worktree guard and existing application behavior intact.
- Use the existing LAN launcher from the primary worktree with normal workers.
- Distinguish the confirmed restart blocker from the unconfirmed process-exit
  cause. Inspect available local process and Windows event evidence.
- Do not retry publishing, change runtime records/configuration, or deploy remotely.

## Acceptance

- [x] The reviewed audit probe and full deterministic baseline pass.
- [x] The worktree is clean before the existing `npm run local:lan` activation.
- [x] Port 3001 listens on the LAN; version identity, state and build marker agree.
- [x] Loopback/LAN HTTP checks and the desktop launcher's existing-instance path pass.
- [x] The listener remains available after the activation command has returned.

## Initial Evidence

- HEAD: `0b0a11ce4e86776ab9718e7a6a623115d21ae1f2`.
- No port-3001 listener. Receipt identifies `.next-local-b` at the same HEAD.
- Dirty paths: `.trellis/spec/fluxpost/status.md` and the existing Feishu task's
  `code-review-2026-11-03.md` / `review-risk-check.mjs`; no application source diff.
- `restart.ps1` rejects every dirty tracked/untracked path before build or startup.
- Five Windows Application errors in the preceding 12 hours, none matching
  Node/npm/FluxPost/PowerShell. No matching Node crash dump was found.
- Existing server startup does not redirect stdout/stderr; the unexpected exit
  cause remains pending confirmation. The clean-tree rejection did not kill it.

## Verification

Use the existing audit probe, `.trellis/verification/check.ps1` with isolated
smoke port 45678, and the existing LAN launcher/HTTP/version checks. Recovery
evidence will stay in this task; runtime command output stays in ignored
`test-artifacts/`.
