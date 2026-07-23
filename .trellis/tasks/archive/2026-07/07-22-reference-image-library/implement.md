# Implementation

- [x] 扩展共享类型和双数据库 schema，增加图库行级数据库操作与确定性 schema 检查。
- [x] 实现图库领域服务、TOS 导入/删除、结构化标签规范化、队列 claim/worker 和旧素材迁移。
- [x] 增加资产、集合、打标和迁移 API，覆盖鉴权、所有权、共享只读与错误状态。
- [x] 实现 `/library` 页面、导入流程、组合筛选、批量操作、详情编辑和完整预览交互。
- [x] 将内容台素材入口指向 `/library`，保持旧素材 API 与生成调用不变。
- [x] 增加本地静态/领域检查，运行类型检查、lint、build、完整 baseline 与 `local:restart`。
- [x] 使用 Playwright 在桌面和移动视口检查布局、预览键盘、缩放、删除确认和非空渲染。
- [x] 增加统一标签投影、建议、AND 筛选、单图/批量即时增删与权限回归。
- [x] 将详情、预览、网格和筛选改为 Eagle 式标签块，并补齐键盘自动补全交互。
- [x] 将图库固定色替换为全局主题变量，增加三主题切换与桌面/移动截图验证。
- [x] 在 104 staging 使用专用凭据验证真实 TOS、GPT 打标和对象删除；此项不进入默认基线。用户已确认隔离功能测试通过后才进入生产推广。

## Risk And Rollback

- TOS 成功但数据库写失败时必须记录并尝试删除新对象，不能留下成功响应。
- 外部 GPT 调用不得进入默认测试；worker 错误必须保留任务状态和可读错误。
- schema 使用 `CREATE TABLE/INDEX IF NOT EXISTS`，回滚时旧路径仍完整可用；新表不影响现有生成。

## Validation

```powershell
node .trellis/verification/library_assets_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT=45678; npm run trellis:check
npm run local:restart
```
