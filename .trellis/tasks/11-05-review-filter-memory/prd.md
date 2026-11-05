# 内容审查台按账号自动记忆筛选

## Goal

Implement the user-approved plan: automatically retain applied review filters per account in the current browser, without presets or server-side preference storage.

## Requirements

- Save search and valid applied advanced conditions; cancelling the dialog saves nothing.
- Restore before review queries: explicit URL filters, then saved filters, then current defaults. Preserve invalid URL errors.
- Clear persists explicit empty filters. Relative dates recalculate on entry/refresh, not pagination.
- Batch/post deep links neither restore nor overwrite ordinary preferences. Normal selection must not turn ordinary browsing into a dedicated session.
- Save no editor content, selected IDs, cursor, scope or asOf. Separate account keys.
- Show restored, corrupt/unavailable storage and empty-result feedback with clear action.

## Acceptance Criteria

- [x] Browser checks: reload/re-entry/new context, accounts, explicit/legacy/invalid URLs, deep links, cancel, clear, history, blocked/corrupt storage, initial query gating and three themes at desktop/mobile widths.
- [x] Pure checks: serialized validation, empty preservation, account keys and Beijing midnight dates.
- [x] TypeScript and full deterministic baseline pass; verified commit is required before port-3001 activation.

## Notes

- Only this browser origin; no backend API/schema changes, live providers, remote deployment, unrelated refactors or presets. User explicitly requested implementation on 2026-11-05.
