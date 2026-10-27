# 迁移命令行工具

## 最简单的用法

打开 PowerShell，执行：

```powershell
cd D:\FluxPost\social-content-studio
npm run migrate
```

菜单提供：查看一次进度、持续查看、启动/继续、安全停止、退出。
启动和停止前会询问，输入 `y` 确认；默认不执行。

## 直接执行命令

```powershell
npm run migrate -- status
npm run migrate -- watch
npm run migrate -- start
npm run migrate -- stop
```

- `status`：只读取本机进度和进程状态，不调用云端接口。
- `watch`：每 2 秒更新一次，按 Ctrl+C 只关闭显示，不停止迁移。
- `start`：启动或继续已有清单，已有迁移正在运行时不重复启动。
- `stop`：请求处理完当前文件后退出，不强制杀进程，也不停工作台。
- 菜单退出或关闭窗口不停止已经启动的后台任务；电脑仍需开机联网、不休眠。
- 后台错误会显示为“出错停止”，不会自动无限重启。

非交互终端默认只显示状态。明确授权、无需确认时可用：

```powershell
npm run migrate -- start --yes
npm run migrate -- stop --yes
```

`start --yes` 会产生 OSS 上传、源端读取和网络费用；不要放入无限重试脚本。

## 怎么看进度

- 进度条和“本轮已确认”包含本次新校验，以及已确认两端未变化后复用的历史校验。
- “本轮新上传”是本次已上传数，其中部分可能正在等待读回校验。
- “复用历史校验”不是新上传，也不是仅凭大小跳过。
- “已载入历史记录”不代表全部已经重新确认；要看当前已确认进度。
- 新一轮数字从零开始不代表之前复制的文件丢失。
- 速度限制是数据请求的排队节奏，不是瞬时网速保证。
- 显示“本轮清单校验完成”不代表整个系统已经迁移：新增文件还需增量，历史地址和存储切换仍需另行安排。

## 配置与保护

本工具沿用项目 `.env.local` 和当前任务原始清单，不生成新迁移范围。
OSS 密钥默认为项目根目录 `aliyun_oss_key.txt`（已被 Git 忽略），也可在
本机设置环境变量 `FLUXPOST_OSS_KEY_FILE` 指向其他密钥文件。不要在命令参数、
聊天或代码中粘贴密钥。当前已有任务包含用户确认“无生命周期规则”的记录，
如果服务商之后改变规则，必须先重新核实，不能继续沿用旧确认。

程序检查后台进程身份和任务锁，确认旧进程已不存在后才处理遗留锁。
遇到进程身份未知、控制锁未释放或清单校验失败时会拒绝操作。不要盲目删除锁。
启动日志位于被忽略的 `data/oss-migration/console-*.log`；日志只在本机查看。
如果启动未完成，先用 `status`/`watch` 检查，不要开启多个迁移工具硬重试。

本工具不删除源对象、不改数据库、不切换 OSS、不重启 LAN 或生产。
本次开发没有停止或重新启动真实迁移进程。

## Implementation and checks

- scripts/storage/migrate.mjs: Chinese menu, confirmation, read-only watch and CLI.
- scripts/storage/migration-control.mjs: isolated controller lock, worker identity,
  immutable current manifest validation, background launch receipt, STOP handling.
- package.json: npm run migrate entry; no new dependency.
- migration_cli_check.mjs: isolated fake SDK-free workspace tests, plus a REAL
  detached temporary worker launch/duplicate prevention/graceful stop on Windows
  and Linux. No real migration credentials, cloud calls or workbench mutations.
- Live validation uses status/help only; baseline and quality results recorded in
  implement.md. Current migration task remains in progress.

## 2026-10-27 verification and actual worker state

Focused CLI tests (including real detached fake-process start/stop), source lint,
TypeScript and diff check pass. Full baseline pre-lint domains pass; same existing
17 ignored-runtime-script errors / 17 warnings stop full lint. No gate weakened.
Evidence: ignored .tmp-migration-cli-baseline.log.

Live status initially confirmed real PID 37572 running. Later, independently of
the fake-worker test, the real migration exited with EPERM at 03:15:58Z, 17,090
prior proofs reused / 54,372,567,901 bytes, 0 new
uploads, no recorded file failure. Last journal events are verified, consistent
with a runner/persistence failure rather than a recorded object-copy failure;
exact syscall/cause is unknown because the runner only logs the code. No STOP
marker was written to the real workspace and no real process was killed. CLI
correctly reports failed with EPERM, not running. No automatic live restart was
performed; operator start remains explicit and must not be run in a retry loop.
