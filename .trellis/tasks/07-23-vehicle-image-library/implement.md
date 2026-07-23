# Implementation

## Planned Files

- `src/lib/library-tags.ts`: 增加共享的车型人工标签投影和角色感知标签读取。
- `src/lib/library-assets.ts`: 角色感知搜索/筛选/建议/标签变更、车型无任务导入、跨角色去重和参考角色入队。
- `src/lib/library-tagging.ts`: 只允许参考图入队，并在模型调用前后校验角色。
- `src/app/api/library/tags/route.ts`: 解析并验证标签操作的当前图库角色。
- `src/app/api/library/assets/[id]/route.ts`: 角色变化后唤醒可能新建的参考图任务。
- `src/app/library/page.tsx`: URL 角色状态、动态车型文案、纯人工标签渲染和隐藏 AI 控件/轮询。
- `src/app/page.tsx`: 增加车型图库直达入口。
- `src/lib/config.ts`: 将图库 AI 模型说明限定为参考图库。
- `.trellis/verification/library_assets_check.mjs`: 调整参考图库导入任务断言，保持原回归合同。
- `.trellis/verification/vehicle_library_check.mjs`: 新增纯人工车型图库的确定性静态/领域检查。
- `.trellis/verification/check.ps1`: 将车型专项检查接入 baseline。

## Execution Checklist

- [x] 增加人工 profile 与按角色统一标签投影 helper，并覆盖历史结构化人工 override 和自由标签。
- [x] 将车型列表搜索、AND 标签筛选和建议切换到人工 profile；参考图路径保持 effective profile。
- [x] 让车型新导入只保存资产、不保存任务；让跨角色重复导入补充目标角色且不重复对象。
- [x] 在纯车型新增参考角色时原子创建任务；限制手工入队与 worker 只处理参考角色，并处理调用期间移除角色的竞态。
- [x] 让标签 API 接收角色并以对应 profile 应用变更，保留 owner/admin 编辑和团队只读约束。
- [x] 将 `/library` 页签与 `?role=` 双向同步，动态切换标题和导入文案。
- [x] 在车型视图移除状态筛选、状态徽标、轮询、重试、重新打标、恢复 AI 和 AI 错误，同时保留参考视图原行为。
- [x] 在主工作台增加车型图库直达入口并检查紧凑导航换行。
- [x] 新增并接入车型专项检查，更新参考图库断言。
- [x] 运行聚焦检查、类型检查、lint、build 和完整 Trellis baseline。
- [x] 运行 `npm run local:restart`，在桌面与移动视口验证参考/车型直达、导入对话框、标签、批量栏、详情和预览。

## Validation

```powershell
node .trellis/verification/library_assets_check.mjs
node .trellis/verification/vehicle_library_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

## Review Gates

- 车型导入路径的测试必须证明没有任务记录或模型入口，不能只检查 UI 隐藏。
- 参考图库专项检查必须继续证明导入会创建任务、重打标保留人工覆盖和状态轮询仍存在。
- 双重归属资产必须在两个视图分别断言标签投影，防止 AI 标签泄漏到车型视图。
- 不运行真实 TOS、OpenAI 或其他生产外部服务；浏览器验证使用现有本地数据或安全隔离夹具。

## Rollback Points

- 标签投影与查询变更可独立回滚，不修改 canonical 数据。
- 车型无任务导入与参考角色入队作为一个提交面回滚，避免产生无法打标的参考资产。
- URL 与车型 UI 分支可独立回滚；无数据库 schema 回滚步骤。
