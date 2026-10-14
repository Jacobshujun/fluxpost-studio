# Gallery UX: filters, viewer and management

## Goal

Implement the complete user-approved gallery UX plan and deliver a verified local candidate.

## Requirements

- Generic-image-first search/tags/dimensions/date/visibility, advanced size/status/automotive filters, atomic apply, removable chips and URL history.
- Single-click unified original viewer/editor, independent selection, zoom/pan, bounded cursor browsing, standalone asset links and unsaved-edit protection.
- Configured serial imports with full receipts/retry/queued cancellation, collection search/collapse/forms, batch tags/partial failures, typed smart-folder conditions.
- All permanent deletions confirm, including Delete shortcuts. Preserve organization versus metadata permissions.
- Existing APIs/storage; no migrations, automatic tagging, provider calls or unrelated cleanup.

## Acceptance Criteria

- [x] Focused runtime and mocked browser checks cover filtering/history/stale pages, viewer drafts/zoom, >20 imports/retry/cancel, permissions/partial failures and delete cancellation.
- [x] Three themes at 1440/390px, keyboard focus and no horizontal overflow.
- [x] Full baseline or documented unchanged blocker with remaining checks run separately.
- [x] Scoped commit then clean primary-worktree port-3001 activation and identity check.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
