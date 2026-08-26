# 共享资料库排序与框选执行计划

## Implementation Checklist

- [x] 1. 在共享类型/辅助模块定义六种排序值、解析规则、文本比较和 localStorage 安全读写；添加矩形命中纯函数与共享 marquee Hook。
- [x] 2. 修改文案领域默认可见性和排序过滤合同，确保显式 `private`、owner/admin 权限及稳定 ID 决胜保持不变。
- [x] 3. 修改图片领域默认可见性、六种排序和版本化游标；让历史素材迁移显式保持 `private`，重复资产复用不改可见性。
- [x] 4. 在图片库页面接入排序偏好、服务端查询参数和共享框选；保留现有分页、预览、复选与批量操作。
- [x] 5. 在文案库页面接入排序偏好、复选/框选状态、批量可见性和带确认的批量删除；当前编辑草稿与批量选择保持独立。
- [x] 6. 更新两个 CSS module，提供紧凑排序控件、选择状态、固定选择框和桌面/移动断点样式。
- [x] 7. 扩展确定性检查，覆盖缺省/显式可见性、六种排序、中文/同值决胜、图片跨页游标、无效排序、框选矩形和页面合同。
- [x] 8. 运行聚焦检查、类型检查、lint、build、完整 Trellis 基线、`npm run local:restart` 和无外部服务的桌面/移动浏览器验证。
- [x] 9. 根据验证证据更新 FluxPost `status.md` 与相关 feature evidence；仅在形成稳定规则时更新 architecture/decisions/verification 文档。
- [x] 10. 根据操作反馈补齐文案库显式全选、修饰键范围选择、`Ctrl`/`Cmd+A`、`Esc`、`Delete` 与编辑目标保护，并扩展确定性检查和桌面/移动验证。
- [x] 11. 修正文案库文档级滚动，让页头、右侧工作区和左侧工具区固定，仅列表/编辑器内部滚动，并增加真实鼠标滚轮回归验证。

## Verification Commands

```powershell
node .trellis/verification/copy_library_check.mjs
node .trellis/verification/library_assets_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
node .trellis/verification/http_smoke.js http://127.0.0.1:3001
```

Browser verification uses mocked/local owner-scoped data only and must cover 1440x960 plus 390x844: sort switching and reload persistence, ordinary and Ctrl/Cmd marquee selection, checkbox fallback, copy batch confirmation/result messaging, and no overlap or horizontal overflow. It must not upload real images, mutate production data, or call TikHub/OpenAI/ComfyUI/Feishu/Lark.

## Risk And Review Gates

- Image cursor comparison and list comparison must be the same function; review this before UI work.
- Changing `queryString` must reset pagination without allowing stale polling/load-more responses to overwrite the new sort.
- Marquee pointer handling must start only on the container background and must release pointer capture on cancel.
- Copy batch operations must preserve server-side `403` permission enforcement and expose partial failures.
- Do not edit the user-modified `src/app/content/page.tsx` or unrelated dirty deployment/Trellis files.

## Rollback Points

- After steps 1-3: domain/check rollback is isolated from UI.
- After steps 4-6: remove UI controls/Hook integration while retaining verified server sort contracts if needed.
- No schema or runtime-data rollback command is permitted or required.
