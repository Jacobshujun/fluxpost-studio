# Gallery collection hierarchy repair

## Requirements

- New subsets appear immediately below their actual parent, including nested subsets and out-of-order navigation responses.
- Preserve sibling order, collection IDs, existing memberships, permissions and original media.
- Keep root creation distinct from explicit child creation and show the intended parent in the creation dialog.
- Creating a child under a collapsed parent reveals the new child.
- Renaming a team collection preserves its visibility and parent.
- Review related gallery operations using isolated fixtures and existing browser regressions; repair confirmed issues only.

## Acceptance

- Regression tests reproduce chronological roots-before-children ordering, multiple levels, collapse/search and inaccessible ancestors.
- Browser tests verify root/child POST parent IDs, visible hierarchy after refresh, rename PATCH without visibility changes and failure retention at desktop/mobile sizes.
- Existing gallery runtime/browser checks and the documented deterministic baseline pass.
- Existing unrelated worktree changes remain intact. Local activation requires a clean committed tree; do not include unrelated work just to satisfy that guard.
