# Implementation Plan

1. 新增 compact-only 聚焦静态检查，覆盖首页唯一模式、素材管理归属和孤儿 API/类型删除，并先确认现状失败。
2. 收敛 `src/app/page.tsx`：删除模式和高级状态/组件/请求，将 SimpleWorkspace 改为单一精简工作区。
3. 在 `src/app/content/page.tsx` 增加内容池/素材库切换，迁移素材管理状态、处理函数、组件和预览。
4. 删除孤儿 API、批量生产服务和类型；收敛生成草稿列表 API，清理数据库活动适配但保留表定义和数据。
5. 按源码引用审计清理 `globals.css`，更新受影响验证脚本和 Trellis 产品事实。
6. 依次运行聚焦检查、lint、TypeScript、build、完整基线、`npm run local:restart` 和无外部写入的响应式浏览器检查。

## Risk And Rollback Points

- 素材管理迁移后必须保持 owner scope、忙碌状态和预览路径校验。
- 删除首页状态时不得移除精简版素材路径、工作区设置和 simple-run 发布状态依赖。
- 删除数据库批量适配时不得删除或改写 `batch_jobs` 表及已有运行时记录。
- CSS 仅删除确认无 JSX 使用的选择器，避免影响 `/content` 和 `/review` 共用样式。

## Validation Commands

```powershell
node .trellis/verification/compact_only_workspace_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```
