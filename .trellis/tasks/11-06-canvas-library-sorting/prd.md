# 素材库排序与节点设置独立保存

用户批准完整计划及实现、测试、提交、本地 3001 更新；不部署远程。

## Requirements
- Canvas and V1/V2/shared batch pickers: updated newest/oldest, created newest/oldest, name ascending/descending, seeded random. Default updated newest.
- Explicit sorting/reshuffling reorders all selected IDs while preserving frozen names/URLs. Manual moves survive loading/paging.
- Persist search/tags/color/collection/smart folder/sort/seed per node; prevent stale request and state leakage across nodes/workflows/parameters.
- Random survives reopening/paging; explicit reshuffle changes seed.
- Legacy drafts and frozen runs are not silently reordered on open.
- Ordering failure/inaccessible assets preserves selection with visible error.

## Acceptance
- SQLite/PostgreSQL global paging, selected sorting, permissions and cursors pass isolated checks.
- Browser checks cover two-node isolation/restoration, sorting, random, async races, schedules, themes and narrow layouts.
- Full offline baseline passes; verified commit activates with existing 3001 binding and matching identity.
