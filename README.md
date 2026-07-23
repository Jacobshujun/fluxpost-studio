# FluxPost Studio

## Trellis

New AI sessions should recover context from `AGENTS.md` and `.trellis/`.
The cross-platform offline baseline entry is:

```bash
npm run trellis:check
```

Code fixes use 104-first promotion: edit and commit in a clean worktree, run the complete candidate verifier and bug scenario on staging `104.243.21.233`, then deploy the unchanged full SHA to production `38.76.210.136`. Local application/build/test/browser runs are not promotion evidence.

`.trellis/` is the active persistent project context and task/spec system. The old `docs/harness.disabled/` and `scripts/harness.disabled/` directories are disabled migration archives; do not use them for normal work.

社媒图文内容制作工作台，本地 MVP 覆盖：

- TikHub 批量采集：微信视频号、小红书、抖音、微博
- 本地图片素材目录扫描
- GPT 文案仿写与审查修改
- GPT 图片生成接口边界
- 飞书 CLI 写入多维表格的 payload wrapper

## Latest Updates (2026-07-02)

- Migrated AI collaboration context from the old Harness files to `.trellis/`, with `npm run trellis:check` as the cross-platform offline baseline entry. The old `docs/harness.disabled/` and `scripts/harness.disabled/` paths are migration archives only.
- Improved the review desk with theme sync, desktop internal scrolling, per-image Prompt generation, single-image regeneration, paste/upload replacement and append flows, plus approve-and-advance review behavior.
- Expanded simple mode with original creation and viral imitation flows. ComfyUI Klein, direct original references, video transcription, and automatic Feishu publishing now default off so generated drafts land in review first.
- Strengthened video and image handling: video quality selection, download fallback candidates, highlight-frame selection/review, opt-in Ark transcription, GPT-Image-2 sizing, and reference-image edit request checks.
- Updated Feishu flows with the `车型` single-select field, vehicle-aware task-number imports, review-desk vehicle options, and a durable distribution-audit queue with progress polling.
- Added deterministic local verification coverage for review workflows, simple/original/viral modes, video/image behavior, Feishu vehicle options, material preview, Trellis migration, and default-off creation switches.

## Local Setup

```bash
npm install
# Create .env.local from the Environment section below, then fill local values.
npm run dev
```

## Ubuntu VPS Deployment

For a fresh Ubuntu 24.04 VPS, use the one-command Docker bootstrap and private SSH-tunnel flow documented in [docs/deployment/ubuntu-docker.md](docs/deployment/ubuntu-docker.md). The installer keeps the app on `127.0.0.1:3101` until you explicitly enable a DNS hostname and HTTPS.

Windows PowerShell:

```powershell
# Create .env.local from the Environment section below, then fill local values.
npm run dev
```

打开 `http://localhost:3000`。

### Local production server on LAN

For development, prefer hot reload:

```powershell
npm run dev:lan
```

For the local production server used at `http://127.0.0.1:3001/`, always rebuild and restart after frontend or API changes:

```powershell
npm run local:restart
```

`next start` does not hot reload. Running only `npm run build` updates the bundle on disk, but an already-running `next start` process can still serve the old frontend until it is restarted.

## PostgreSQL Runtime Storage

The app still uses local SQLite at `data/fluxpost.db` by default. To switch the runtime store to PostgreSQL, set `DATABASE_URL` in the process environment or local env file before starting the app:

```env
DATABASE_URL=postgres://fluxpost:password@127.0.0.1:5432/fluxpost_studio
DATABASE_POOL_MAX=10
```

Create the PostgreSQL schema and copy current SQLite rows with:

```powershell
$env:DATABASE_URL = "postgres://fluxpost:password@127.0.0.1:5432/fluxpost_studio"
npm run db:migrate:postgres
```

Preview row counts without writing:

```powershell
npm run db:migrate:postgres -- --dry-run
```

The database stores metadata, state, logs, paths, and JSON payloads. Crawled media and generated images remain on disk under `public/media/` and `public/generated/`.

## Environment

```env
TIKHUB_BASE_URL=https://api.tikhub.io
TIKHUB_API_KEY=

DATABASE_URL=
DATABASE_POOL_MAX=10

WORKSPACE_AUTH_MODE=whitelist
WORKSPACE_ALLOWED_USERS=alice:Alice,bob:Bob
WORKSPACE_ADMIN_USERS=alice
WORKSPACE_ACCESS_PASSWORD=

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_BASE_URL=
OPENAI_IMAGE_BASE_URL=https://www.packyapi.com/v1
OPENAI_IMAGE_API_KEY=
OPENAI_IMAGE_API_PROFILE=
OPENAI_IMAGE_BACKUP_BASE_URL=
OPENAI_IMAGE_BACKUP_API_KEY=
OPENAI_IMAGE_BACKUP_API_PROFILE=
OPENAI_IMAGE_BACKUP_MODEL=
OPENAI_TEXT_ENDPOINT=responses
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_LIBRARY_TAGGING_MODEL=
OPENAI_IMAGE_ENDPOINT=images
OPENAI_IMAGE_API_DIALECT=auto
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_REQUEST_TIMEOUT_MS=180000
VIRAL_IMAGE_IMITATION_PROMPT=参考图2的场景风格和美学，构图和角度可以变，同时使用图2的汽车漆面质感，为图1的车生成一张汽车美图，保持图1的汽车细节不要变，车牌黑底无字。

COMFYUI_KLEIN_ENABLED=false
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_KLEIN_WORKFLOW_API_JSON=
COMFYUI_KLEIN_WORKFLOW_PATH=
COMFYUI_KLEIN_CLIENT_ID=fluxpost-studio
COMFYUI_KLEIN_PROMPT_NODE_ID=39
COMFYUI_KLEIN_IMAGE_NODE_ID=44
COMFYUI_KLEIN_STYLE_IMAGE_NODE_ID=
COMFYUI_KLEIN_KSAMPLER_NODE_ID=28
COMFYUI_KLEIN_SAVE_NODE_ID=43
COMFYUI_KLEIN_UPLOAD_SUBFOLDER=fluxpost
COMFYUI_KLEIN_TIMEOUT_MS=240000
COMFYUI_KLEIN_POLL_INTERVAL_MS=1000
COMFYUI_KLEIN_RANDOMIZE_SEED=true
COMFYUI_KLEIN_SEED=
COMFYUI_KLEIN_KSAMPLER_STEPS=
COMFYUI_KLEIN_KSAMPLER_CFG=
COMFYUI_KLEIN_KSAMPLER_SAMPLER_NAME=
COMFYUI_KLEIN_KSAMPLER_SCHEDULER=
COMFYUI_KLEIN_KSAMPLER_DENOISE=
COMFYUI_KLEIN_FAILURE_POLICY=fallback_source

FEISHU_CLI_BIN=
FEISHU_CLI_BITABLE_ARGS=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_BITABLE_TABLE_ID=
FEISHU_BITABLE_FIELD_MAP=
FEISHU_CONTENT_IMPORT_BASE_TOKEN=
FEISHU_CONTENT_IMPORT_TABLE_ID=
FEISHU_CONTENT_IMPORT_FIELD_MAP=
LARK_TASK_CHAT_IDS=
LARK_TASK_USER_MAP=
LARK_TASK_API_TOKEN=
LARK_TASK_DEFAULT_PLATFORMS=douyin,xiaohongshu
LARK_TASK_DEFAULT_COUNT=3
LARK_TASK_CONFIRM_ABOVE=20
```

For a small local team, keep `WORKSPACE_AUTH_MODE=whitelist`. `WORKSPACE_ALLOWED_USERS` is the allow-list for account usernames, and `WORKSPACE_ADMIN_USERS` marks usernames that may bootstrap or always receive admin access. Use `WORKSPACE_ACCESS_PASSWORD` only as the setup key when creating the first admin from the login screen. After that, admins create, reset, enable, disable, or promote accounts from the account menu, and every member signs in with their own password. Normal members see only their own content, generated posts, material library entries, activity logs, simple runs, crawl jobs, and publish jobs; admins can see and manage all workspace records. Set `WORKSPACE_AUTH_MODE=accounts` only if you want to use the older local account-table mode.

TikHub API Key 未配置时，采集接口会返回本地演示数据，方便继续调审查台。

OpenAI API Key 未配置时，文案和图片接口会返回 mock/fallback 状态。

如果你使用第三方 OpenAI 兼容中转站，改成类似：

```env
OPENAI_BASE_URL=https://your-relay.example.com/v1
OPENAI_TEXT_BASE_URL=https://your-relay.example.com/v1
OPENAI_IMAGE_BASE_URL=https://www.packyapi.com/v1
OPENAI_IMAGE_API_PROFILE=openai_sse
OPENAI_IMAGE_BACKUP_BASE_URL=https://backup-image-relay.example.com/v1
OPENAI_IMAGE_BACKUP_API_PROFILE=openai_json
OPENAI_API_KEY=sk-xxx
OPENAI_IMAGE_API_KEY=sk-image-xxx
OPENAI_IMAGE_BACKUP_API_KEY=sk-backup-image-xxx
OPENAI_TEXT_ENDPOINT=chat
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_ENDPOINT=images
OPENAI_IMAGE_API_DIALECT=auto
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_BACKUP_MODEL=gpt-image-2
```

`OPENAI_TEXT_ENDPOINT` 可选 `responses` 或 `chat`。`OPENAI_IMAGE_ENDPOINT` 可选 `responses` 或 `images`。图片主备通道可分别通过 `OPENAI_IMAGE_API_PROFILE` 和 `OPENAI_IMAGE_BACKUP_API_PROFILE` 选择 `openai_json`、`openai_sse` 或 `toapis_async`。旧 `OPENAI_IMAGE_API_DIALECT=auto|openai|toapis` 继续兼容；未设置新档案时，`openai` 保留原 SSE 行为，`toapis` 使用异步任务协议，`auto` 按通道域名识别 ToAPIs。

飞书 CLI 未配置时，发布接口会把待写入内容保存到 `data/feishu-outbox/*.json`。

`OPENAI_IMAGE_API_KEY` can be configured separately for the image provider; when it is empty the app uses `OPENAI_API_KEY`. Primary and backup routes resolve their profile and model independently. `openai_json` uses non-stream JSON `/images/generations` plus multipart `/images/edits` and the minimal official GPT Image fields. `openai_sse` preserves relay streaming with final-image SSE events. `toapis_async` submits asynchronous JSON tasks, uploads local references through `/uploads/images`, polls the accepted task id, and downloads temporary results into FluxPost storage. Failover is allowed only before asynchronous task acceptance and never for content-safety or invalid-image failures.

`VIRAL_IMAGE_IMITATION_PROMPT` controls the full prompt used when simple-mode viral replication imitates source images, including any image 1/image 2 role constraints you want the model to follow. The code keeps the ordered local vehicle material as reference image 1 and the viral source image as reference image 2. The OpenAI profiles send them through `/images/edits`; `toapis_async` sends their public/uploaded URLs through `reference_images` on `/images/generations`. Restart the local app after changing this environment variable.

Local ComfyUI Klein processing is disabled by default. Keep `COMFYUI_KLEIN_ENABLED=false` to use the OpenAI-compatible `gpt-image-2` Images API path for car-exterior and people-with-car selected source-image tasks. Set `COMFYUI_KLEIN_ENABLED=true` plus either `COMFYUI_KLEIN_WORKFLOW_API_JSON` or `COMFYUI_KLEIN_WORKFLOW_PATH` to route those tasks to the local ComfyUI workflow. Inline API JSON takes precedence over the file path; the file path is read for each task, so edits in that workflow file do not require code changes. The `COMFYUI_KLEIN_KSAMPLER_*` values optionally override seed, steps, cfg, sampler, scheduler, and denoise from environment configuration; changing those env values requires restarting the app. The local workflow is serialized through `WORKER_LOCAL_IMAGE_CONCURRENCY=1`; `COMFYUI_KLEIN_FAILURE_POLICY=fallback_source` keeps a failed Klein image from failing the whole generated post.

## TikHub Endpoints

- 微信视频号：`GET /api/v1/wechat_channels/fetch_search_ordinary?keywords=`
- 小红书：`GET /api/v1/xiaohongshu/web_v3/fetch_search_notes?keyword=&page=&sort=&note_type=`
- 抖音：`POST /api/v1/douyin/web/fetch_challenge_posts`
- 微博：`GET /api/v1/weibo/web/fetch_search?keyword=&page=&search_type=&time_scope=`

## Feishu CLI

飞书 CLI 页面：https://www.feishu.cn/feishu-cli

当前 wrapper 不假设具体命令形态。配置示例：

```env
FEISHU_CLI_BIN=feishu
FEISHU_CLI_BITABLE_ARGS=bitable import --app-token {appToken} --table-id {tableId} --file {payload}
```

### Current lark-cli Base mode

The local CLI command found in this workspace is `lark-cli`. Configure app credentials with:

```powershell
lark-cli config init --app-id <app-id> --app-secret-stdin --brand feishu
```

The default publish mode writes approved posts through:

```powershell
lark-cli base +record-batch-create --as bot --base-token <base-token> --table-id <table-id> --json @<generated-record-payload>
```

Minimum web app config:

```env
FEISHU_CLI_BIN=lark-cli
FEISHU_BITABLE_APP_TOKEN=<base-token>
FEISHU_BITABLE_TABLE_ID=<table-id>
```

Optional custom args still work through `FEISHU_CLI_BITABLE_ARGS`. Supported placeholders are `{payload}`, `{recordPayload}`, `{appToken}`, and `{tableId}`.

`FEISHU_BITABLE_FIELD_MAP` can override target field names as a JSON object. Default fields are: `动态标题`, `动态正文`, `动态素材`, `内容标签`, `内容创作来源`, and single-select `车型`. The `内容创作来源` value is the workspace user's display name, falling back to the owner id when a historical post has no display name. The `车型` value comes from the simple task keyword, with Feishu-imported source records using their imported vehicle value when present.

Simple mode can import source content from the same Feishu Base by task number. By default `FEISHU_CONTENT_IMPORT_BASE_TOKEN` and `FEISHU_CONTENT_IMPORT_TABLE_ID` fall back to `FEISHU_BITABLE_APP_TOKEN` and `FEISHU_BITABLE_TABLE_ID`. `FEISHU_CONTENT_IMPORT_FIELD_MAP` can override the read fields; defaults are `任务编号`, `动态标题`, `动态正文`, `动态素材`, and `车型`. Imported `车型` values become the target content-pool keyword/project.

### Feishu IM task launcher

V1 Feishu conversation launch is a local polling CLI that reads allow-listed chats through `lark-cli`, then submits explicit commands to the running local app:

```powershell
npm run lark:tasks -- --once --dry-run
npm run lark:tasks -- --once --reply
npm run lark:tasks -- --reply
npm run lark:events -- --dry-run --timeout 30s
npm run lark:events -- --reply
```

Required config:

- `LARK_TASK_CHAT_IDS`: comma-separated `oc_...` chat ids the runner may read.
- `LARK_TASK_USER_MAP`: comma-separated `open_id=workspaceAccountId` mappings, for example `ou_xxx=whitelist:alice`.
- `LARK_TASK_API_TOKEN`: shared local bearer token used by the runner when posting to `/api/lark/tasks`.

Supported commands:

```text
/flux keyword 小鹏G6 count=5 platforms=douyin,xiaohongshu
/flux links auto
https://v.douyin.com/...

/flux feishu
FP-20260612-001
```

`npm run lark:events -- --reply` is the real-time event consumer for `im.message.receive_v1`; it avoids polling old chat history and only reacts to new received-message events while the process is running. `npm run lark:tasks -- --reply` remains the polling fallback. Counts above `LARK_TASK_CONFIRM_ABOVE` require `confirm=yes`. Replies are opt-in with `--reply`; `--dry-run` only prints matched messages and never starts a FluxPost task.

如果实际 CLI 子命令不同，只需要替换 `FEISHU_CLI_BITABLE_ARGS`，业务代码不用改。
