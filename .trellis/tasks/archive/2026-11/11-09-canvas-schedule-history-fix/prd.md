# Restore Canvas schedule history

## Requirements
- Existing schedules remain visible for their workflow regardless of newer unrelated records.
- All accessible history is reachable through pagination; summaries and selected details remain consistent.
- Direct links open accessible tasks outside the first page; errors must not appear as empty history.
- Preserve account isolation, V1/V2 editing, autosave, duplication, deletion and active-task refresh.
- Verify, commit, and activate the clean primary worktree on LAN port 3001 as explicitly requested.

## Acceptance
- Regression covers over 100 newer unrelated schedules, more than one page of matching history, account scope and old direct links.
- Browser verification covers page navigation, details, dirty saves, errors and responsive controls without real runtime writes.
- Full deterministic baseline passes; LAN runtime commit matches the verified commit.
