# Runtime Seedance Skill Loading

## Goal

让无限画布的 Seedance Prompt assistant 使用服务端运行时 Skill 文件。运营者更新 `SKILL.md` 后，下一次优化请求自动使用新内容，不需要修改或重新发布应用代码。

## Background

- 当前 assistant 将创意规则直接复制在 `src/lib/canvas/seedance-prompt-assistant.ts`，外部 Skill 更新不会生效。
- 浏览器不能直接读取本机文件；Skill 必须由 Node.js 服务端读取并注入文本模型请求。
- Skill 是可变参考资料，不可信任其覆盖 FluxPost 的结构化输出、引用、长度、参数和安全硬约束。

## Requirements

1. 增加 `SEEDANCE_PROMPT_SKILL_PATH` 环境配置，支持本地开发和部署机器挂载路径；不在生产代码中硬编码开发者机器路径。
2. 服务端 Skill loader 每次 assistant 请求检查文件的 `mtime`、大小和内容 hash，缓存未变化内容，检测变化后自动加载新版本。
3. Skill 读取成功时将内容作为“可变参考规则”注入模型 Prompt，并返回来源、版本 hash、更新时间等非敏感元数据。
4. Skill 文件缺失、不可读或超出安全大小时必须返回明确错误；禁止静默吞错。未配置路径时允许使用内置 assistant 规则作为可观测 fallback。
5. 解析候选后的现有 FluxPost 硬校验必须继续执行，Skill 文本不能放宽：Prompt 2000 字符、时长/比例、结构化图片引用、引用数量/URL、时间轴、运镜冲突和高风险禁止应用。
6. 画布 assistant 显示当前 Skill 来源和短版本 hash，便于确认更新已生效；不暴露完整 Skill 文本。
7. 默认离线检查覆盖 Skill 版本变化、缓存刷新、读取失败、硬校验不可覆盖和 API/UI metadata wiring；不调用真实模型或 Seedance。

## Acceptance Criteria

- [x] 配置 `SEEDANCE_PROMPT_SKILL_PATH` 指向临时 Skill 文件时，首次请求将其内容注入模型 Prompt，并在响应中返回 `configured-file`、hash 和更新时间。
- [x] 修改该文件后再次请求得到新的 hash 和新内容；未修改时不会重复读取文件内容。
- [x] 未配置路径时响应明确标识 `builtin`；配置文件不存在/不可读时 API 返回可操作错误，不隐藏原因。
- [x] Skill 文本包含要求绕过 2000 字符、手写 `@图片N` 或降低风险的指令时，候选仍由现有硬校验拒绝或标记，且高风险候选不可应用。
- [x] 画布 UI 展示来源/hash，不出现横向溢出；现有 Seedance assistant 交互保持兼容。
- [x] 通过 focused check、lint、TypeScript、build 和完整 Trellis baseline。

## Out Of Scope

- 不支持浏览器直接编辑或上传 Skill 文件。
- 不支持从远程 URL 自动下载 Skill，也不支持动态执行 Skill 代码。
- 不改变 Seedance 付费任务提交、恢复和媒体引用协议。
