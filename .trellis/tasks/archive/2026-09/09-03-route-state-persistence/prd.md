# 页面路径与刷新状态恢复

## Goal

让工作区页面在硬刷新、书签打开和浏览器后退/前进后保持当前页面及关键导航位置，不把未提交或敏感输入写入 URL。

## Requirements

- 保留现有顶层 App Router 路径，不新增动态页面路径。
- 将各工作区可复现的筛选、选中实体和面板状态编码到 URL 查询参数。
- URL 状态恢复必须在首次数据加载前完成；无效参数回退到安全默认值。
- 批量选择、弹窗、未提交表单、Cookie、密码和大段正文不进入 URL。
- 现有 API、数据库、登录和 owner 权限边界保持不变。

## Acceptance Criteria

- [x] `/content`、`/library`、`/review`、`/canvas` 刷新后保留关键位置。
- [x] `/original`、`/copy-library`、`/distribution-check`、`/config` 的可复现导航状态可通过 URL 恢复。
- [x] URL 更新使用 replace，不污染浏览器历史；后退/前进可恢复状态。
- [x] 直接请求所有页面路径返回 200 且不重定向到 `/`。
- [x] URL 状态工具和路由契约有确定性检查；Playwright 刷新覆盖因依赖未安装而待补。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
