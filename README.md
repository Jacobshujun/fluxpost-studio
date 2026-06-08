# FluxPost Studio

## Harness

New AI sessions should recover context from `AGENTS.md` and `docs/harness/`.
Run the baseline check from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1
```

`docs/harness/` is the only persistent project context. Do not add parallel memory, TODO, planning, or handoff files elsewhere.

社媒图文内容制作工作台，本地 MVP 覆盖：

- TikHub 批量采集：微信视频号、小红书、抖音、微博
- 本地图片素材目录扫描
- GPT 文案仿写与审查修改
- GPT 图片生成接口边界
- 飞书 CLI 写入多维表格的 payload wrapper

## Local Setup

```bash
npm install
# Create .env.local from the Environment section below, then fill local values.
npm run dev
```

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

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_BASE_URL=
OPENAI_IMAGE_BASE_URL=
OPENAI_TEXT_ENDPOINT=responses
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_ENDPOINT=responses
OPENAI_IMAGE_MODEL=nano-banana-pro
RUNNINGHUB_BASE_URL=https://www.runninghub.cn
RUNNINGHUB_API_KEY=

FEISHU_CLI_BIN=
FEISHU_CLI_BITABLE_ARGS=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_BITABLE_TABLE_ID=
FEISHU_BITABLE_FIELD_MAP=
```

TikHub API Key 未配置时，采集接口会返回本地演示数据，方便继续调审查台。

OpenAI API Key 未配置时，文案和图片接口会返回 mock/fallback 状态。

如果你使用第三方 OpenAI 兼容中转站，改成类似：

```env
OPENAI_BASE_URL=https://your-relay.example.com/v1
OPENAI_TEXT_BASE_URL=https://your-relay.example.com/v1
OPENAI_IMAGE_BASE_URL=https://your-image-relay.example.com/v1
OPENAI_API_KEY=sk-xxx
OPENAI_TEXT_ENDPOINT=chat
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_ENDPOINT=images
OPENAI_IMAGE_MODEL=nano-banana-pro
```

`OPENAI_TEXT_ENDPOINT` 可选 `responses` 或 `chat`。`OPENAI_IMAGE_ENDPOINT` 可选 `responses` 或 `images`。

飞书 CLI 未配置时，发布接口会把待写入内容保存到 `data/feishu-outbox/*.json`。

RunningHub G-2 image provider example:

```env
OPENAI_IMAGE_ENDPOINT=runninghub
OPENAI_IMAGE_MODEL=nano-banana-pro
RUNNINGHUB_BASE_URL=https://www.runninghub.cn
RUNNINGHUB_API_KEY=rh-xxx
RUNNINGHUB_IMAGE_TO_IMAGE_PATH=/openapi/v2/rhart-image-g-2/image-to-image
RUNNINGHUB_TEXT_TO_IMAGE_PATH=/openapi/v2/rhart-image-g-2/text-to-image
RUNNINGHUB_QUERY_PATH=/openapi/v2/query
RUNNINGHUB_UPLOAD_PATH=/openapi/v2/media/upload/binary
```

RunningHub image-to-image requires accessible URLs. The backend uploads local `/media/...` or `/generated/...` reference images to RunningHub before submitting the generation task.

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

`FEISHU_BITABLE_FIELD_MAP` can override target field names as a JSON object. Default fields are: `标题`, `正文`, `平台`, `状态`, `图片链接`, `图片提示词`, `AI备注`, `素材路径`, `来源内容ID`, `草稿ID`, `版本`, `创建时间`, `更新时间`.

如果实际 CLI 子命令不同，只需要替换 `FEISHU_CLI_BITABLE_ARGS`，业务代码不用改。
