$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $ProjectRoot

function Get-RequiredCommandPath {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }
  throw "Required command not found: $($Names -join ' or ')"
}

function Invoke-NativeStep {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host "== $Name"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [System.Diagnostics.Process]$Process,
    [string]$ErrorLog
  )

  for ($attempt = 1; $attempt -le 35; $attempt += 1) {
    if ($Process.HasExited) {
      $errorText = if (Test-Path -LiteralPath $ErrorLog) { Get-Content -Raw -LiteralPath $ErrorLog } else { "" }
      throw "Next smoke server exited before becoming ready. Error log: $errorText"
    }

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  $errorText = if (Test-Path -LiteralPath $ErrorLog) { Get-Content -Raw -LiteralPath $ErrorLog } else { "" }
  throw "Next smoke server did not become ready at $Url. Error log: $errorText"
}

function Invoke-HttpSmoke {
  param(
    [string]$NodePath,
    [int]$Port
  )

  $nextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
  if (-not (Test-Path -LiteralPath $nextBin -PathType Leaf)) {
    throw "Local Next CLI not found at $nextBin. Run npm install before baseline verification."
  }

  $baseUrl = "http://127.0.0.1:$Port"
  $tempRoot = [System.IO.Path]::GetTempPath()
  $outLog = Join-Path $tempRoot "fluxpost-harness-next-$Port.out.log"
  $errLog = Join-Path $tempRoot "fluxpost-harness-next-$Port.err.log"
  Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue

  Write-Host "== Start local Next production smoke server on $baseUrl"
  $process = Start-Process `
    -FilePath $NodePath `
    -ArgumentList @($nextBin, "start", "-H", "127.0.0.1", "-p", [string]$Port) `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  try {
    Wait-ForHttp -Url "$baseUrl/api/config" -Process $process -ErrorLog $errLog
    Invoke-NativeStep "HTTP smoke" $NodePath @("scripts/harness/http_smoke.js", $baseUrl)
  } finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
      Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
  }
}

$nodePath = Get-RequiredCommandPath @("node.exe", "node")
$npmPath = Get-RequiredCommandPath @("npm.cmd", "npm")
$npxPath = Get-RequiredCommandPath @("npx.cmd", "npx")

Write-Host "== Harness init"
& powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts/harness/init.ps1")

Write-Host "== Harness handoff"
& powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts/harness/handoff.ps1")

Invoke-NativeStep "Parse project JSON" $nodePath @(
  "scripts/harness/json_check.mjs",
  "package.json",
  "tsconfig.json",
  "docs/harness/feature_list.json",
  "data/content-pool.json",
  "data/execution-log.json",
  "data/batch-production.json"
)

Invoke-NativeStep "PostgreSQL schema check" $nodePath @("scripts/harness/postgres_schema_check.mjs")
Invoke-NativeStep "Workspace accounts check" $nodePath @("scripts/harness/workspace_accounts_check.mjs")
Invoke-NativeStep "Keyword relevance check" $nodePath @("scripts/harness/keyword_relevance_check.mjs")
Invoke-NativeStep "Xiaohongshu note type check" $nodePath @("scripts/harness/xiaohongshu_note_type_check.mjs")
Invoke-NativeStep "Weibo search mapping check" $nodePath @("scripts/harness/weibo_search_mapping_check.mjs")
Invoke-NativeStep "Douyin search mapping check" $nodePath @("scripts/harness/douyin_search_mapping_check.mjs")
Invoke-NativeStep "Douyin carousel image check" $nodePath @("scripts/harness/douyin_carousel_image_check.mjs")
Invoke-NativeStep "Media request headers check" $nodePath @("scripts/harness/media_request_headers_check.mjs")
Invoke-NativeStep "Media URL filter check" $nodePath @("scripts/harness/media_url_filter_check.mjs")
Invoke-NativeStep "Media cache image format check" $nodePath @("scripts/harness/media_cache_image_format_check.mjs")
Invoke-NativeStep "Video frame policy check" $nodePath @("scripts/harness/video_frame_policy_check.mjs")
Invoke-NativeStep "Concurrency integration check" $nodePath @("scripts/harness/concurrency_check.mjs")
Invoke-NativeStep "Feishu publish resume check" $nodePath @("scripts/harness/feishu_publish_resume_check.mjs")
Invoke-NativeStep "Feishu publish queue check" $nodePath @("scripts/harness/feishu_publish_queue_check.mjs")
Invoke-NativeStep "Simple crawl top-up and media policy check" $nodePath @("scripts/harness/simple_crawl_media_policy_check.mjs")
Invoke-NativeStep "Source safety filter check" $nodePath @("scripts/harness/source_safety_filter_check.mjs")
Invoke-NativeStep "Source import Feishu check" $nodePath @("scripts/harness/source_import_feishu_check.mjs")
Invoke-NativeStep "Simple config sync check" $nodePath @("scripts/harness/simple_config_sync_check.mjs")
Invoke-NativeStep "Crawl strategy save check" $nodePath @("scripts/harness/crawl_strategy_save_check.mjs")
Invoke-NativeStep "Link import check" $nodePath @("scripts/harness/link_import_check.mjs")
Invoke-NativeStep "Simple link run check" $nodePath @("scripts/harness/simple_link_run_check.mjs")
Invoke-NativeStep "Simple queue and Feishu chunking check" $nodePath @("scripts/harness/simple_queue_check.mjs")
Invoke-NativeStep "Simple run persistence check" $nodePath @("scripts/harness/simple_run_persistence_check.mjs")
Invoke-NativeStep "Title prompt guard check" $nodePath @("scripts/harness/title_prompt_guard_check.mjs")
Invoke-NativeStep "Image prompt guard check" $nodePath @("scripts/harness/image_prompt_guard_check.mjs")
Invoke-NativeStep "Image task fallback check" $nodePath @("scripts/harness/image_task_fallback_check.mjs")
Invoke-NativeStep "Source tagging image check" $nodePath @("scripts/harness/source_tagging_image_check.mjs")
Invoke-NativeStep "Content projects row-level mutation check" $nodePath @("scripts/harness/content_projects_upsert_check.mjs")
Invoke-NativeStep "Generated posts row-level mutation check" $nodePath @("scripts/harness/generated_posts_upsert_check.mjs")
Invoke-NativeStep "Lint" $npmPath @("run", "lint")
Invoke-NativeStep "TypeScript noEmit" $npxPath @("--no-install", "tsc", "--noEmit")
Invoke-NativeStep "Next build" $npmPath @("run", "build")

$port = 3310
if ($env:HARNESS_SMOKE_PORT) {
  $port = [int]$env:HARNESS_SMOKE_PORT
}
Invoke-HttpSmoke -NodePath $nodePath -Port $port
Invoke-NativeStep "SQLite store check" $nodePath @("scripts/harness/db_check.mjs")

Write-Host "Baseline verification passed."
