# Implementation

1. 提取共享调度输入/预设/辅助函数，类型检查保持旧页可编译。
2. 实现batch-create向导、记录、预览结果、串行保存及冲突/dirty guards。
3. 首页入口和画布scheduleId定位；三主题响应式样式。
4. 添加隔离fixture与浏览器回归，执行完整 .trellis/verification/check.ps1（TRELLIS_SMOKE_PORT=45678）。
5. 记录验证、更新status/feature，提交，再保持现有LAN方式运行npm run local:lan并验证版本。无远程发布。

回滚：撤销新页/导航与共享提取提交；无数据迁移。真实外部服务验收不在自动测试内。
