# 执行计划

1. 增加 URL 状态解析/序列化与 replace 同步工具及其确定性检查。
2. 按页面接入 hydration、状态写回和浏览器后退/前进恢复：内容台、图库、审查台、画布、原创、文案库、分发审核、高级配置。
3. 为关键实体选择增加 URL 参数驱动的初始选择，并确保无效 ID 回退不阻塞页面加载。
4. 增加页面路由 HTTP/浏览器刷新检查，确认路径不回 `/`、筛选和关键实体可恢复。
5. 运行 `npm run lint`、`npx --no-install tsc --noEmit`、`npm run build` 和 `.trellis/verification/check.ps1`。
6. 更新 Trellis 状态/验证记录并提交变更。
