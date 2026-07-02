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

function Get-RelativeFileSize {
  param([string]$RelativePath)

  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Trellis context file is missing: $RelativePath"
  }
  return (Get-Item -LiteralPath $path).Length
}

function Assert-ContextBudget {
  param(
    [string]$Name,
    [string[]]$Files,
    [int]$LimitBytes
  )

  $total = 0
  foreach ($file in $Files) {
    $total += Get-RelativeFileSize $file
  }

  $totalKb = [Math]::Round($total / 1KB, 2)
  $limitKb = [Math]::Round($LimitBytes / 1KB, 2)
  Write-Host "== Trellis context budget: $Name = $totalKb KB / $limitKb KB"
  if ($total -gt $LimitBytes) {
    throw "$Name Trellis context is $total bytes, over budget $LimitBytes bytes. Archive or compress history before continuing."
  }
}

function Assert-LatestMarker {
  param([string]$RelativePath)

  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Trellis latest file is missing: $RelativePath"
  }

  $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $path
  $latestHeading = "## $([char]26368)$([char]36817)$([char]19968)$([char]26465)"
  if (-not $text.Contains($latestHeading)) {
    throw "$RelativePath must contain the required latest-entry heading."
  }

  $start = "<!-- TRELLIS-LATEST-START -->"
  $end = "<!-- TRELLIS-LATEST-END -->"
  $startIndex = $text.IndexOf($start)
  $endIndex = $text.IndexOf($end)
  if ($startIndex -lt 0 -or $endIndex -lt 0 -or $endIndex -le $startIndex) {
    throw "$RelativePath must contain a valid TRELLIS-LATEST marker block."
  }

  $contentStart = $startIndex + $start.Length
  $latest = $text.Substring($contentStart, $endIndex - $contentStart)
  $latestBytes = [System.Text.Encoding]::UTF8.GetByteCount($latest)
  Write-Host "== Trellis latest block: $RelativePath = $latestBytes bytes / 8192 bytes"
  if ($latestBytes -gt 8192) {
    throw "$RelativePath TRELLIS-LATEST block is $latestBytes bytes, over budget 8192 bytes."
  }
}

function Assert-TrellisContext {
  $defaultStartupFiles = @(
    "AGENTS.md",
    ".trellis/spec/fluxpost/status.md",
    ".trellis/spec/fluxpost/feature_list.json",
    ".trellis/spec/fluxpost/rules.md"
  )
  $typicalCodeTaskFiles = $defaultStartupFiles + @(
    ".trellis/spec/fluxpost/project_brief.md",
    ".trellis/spec/fluxpost/verification.md"
  )

  Assert-ContextBudget "Default startup" $defaultStartupFiles (45 * 1KB)
  Assert-ContextBudget "Typical code task" $typicalCodeTaskFiles (70 * 1KB)
  Assert-LatestMarker ".trellis/spec/fluxpost/handoff.md"
  Assert-LatestMarker ".trellis/spec/fluxpost/progress.md"

  $featureListPath = Join-Path $ProjectRoot ".trellis/spec/fluxpost/feature_list.json"
  $featureList = Get-Content -Raw -Encoding UTF8 -LiteralPath $featureListPath | ConvertFrom-Json
  foreach ($feature in @($featureList.features)) {
    $evidenceCount = @($feature.evidence).Count
    if ($evidenceCount -gt 3) {
      throw "Feature '$($feature.id)' has $evidenceCount evidence entries; keep 1-3 and archive details."
    }
    if ($feature.status -eq "done" -and $evidenceCount -eq 0) {
      throw "Feature '$($feature.id)' is done but has no evidence."
    }
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
  $outLog = Join-Path $tempRoot "fluxpost-trellis-next-$Port.out.log"
  $errLog = Join-Path $tempRoot "fluxpost-trellis-next-$Port.err.log"
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
    Invoke-NativeStep "HTTP smoke" $NodePath @(".trellis/verification/http_smoke.js", $baseUrl)
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

Write-Host "== Trellis init"
& powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot ".trellis/verification/init.ps1")

Assert-TrellisContext

Write-Host "== Trellis handoff"
& powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot ".trellis/verification/handoff.ps1")

Invoke-NativeStep "Parse project JSON" $nodePath @(
  ".trellis/verification/json_check.mjs",
  "package.json",
  "tsconfig.json",
  ".trellis/spec/fluxpost/feature_list.json",
  "data/content-pool.json",
  "data/execution-log.json",
  "data/batch-production.json"
)

Invoke-NativeStep "PostgreSQL schema check" $nodePath @(".trellis/verification/postgres_schema_check.mjs")
Invoke-NativeStep "Workspace accounts check" $nodePath @(".trellis/verification/workspace_accounts_check.mjs")
Invoke-NativeStep "Execution log append check" $nodePath @(".trellis/verification/execution_log_append_check.mjs")
Invoke-NativeStep "Keyword relevance check" $nodePath @(".trellis/verification/keyword_relevance_check.mjs")
Invoke-NativeStep "Xiaohongshu note type check" $nodePath @(".trellis/verification/xiaohongshu_note_type_check.mjs")
Invoke-NativeStep "Weibo search mapping check" $nodePath @(".trellis/verification/weibo_search_mapping_check.mjs")
Invoke-NativeStep "Weibo image cleanup check" $nodePath @(".trellis/verification/weibo_image_cleanup_check.mjs")
Invoke-NativeStep "Douyin search mapping check" $nodePath @(".trellis/verification/douyin_search_mapping_check.mjs")
Invoke-NativeStep "Douyin carousel image check" $nodePath @(".trellis/verification/douyin_carousel_image_check.mjs")
Invoke-NativeStep "Media request headers check" $nodePath @(".trellis/verification/media_request_headers_check.mjs")
Invoke-NativeStep "Media URL filter check" $nodePath @(".trellis/verification/media_url_filter_check.mjs")
Invoke-NativeStep "Media cache image format check" $nodePath @(".trellis/verification/media_cache_image_format_check.mjs")
Invoke-NativeStep "Video download fallback check" $nodePath @(".trellis/verification/video_download_fallback_check.mjs")
Invoke-NativeStep "Video frame policy check" $nodePath @(".trellis/verification/video_frame_policy_check.mjs")
Invoke-NativeStep "Video quality selection check" $nodePath @(".trellis/verification/video_quality_selection_check.mjs")
Invoke-NativeStep "Video frame original-reference check" $nodePath @(".trellis/verification/video_frame_original_reference_check.mjs")
Invoke-NativeStep "Video transcription check" $nodePath @(".trellis/verification/video_transcription_check.mjs")
Invoke-NativeStep "Concurrency integration check" $nodePath @(".trellis/verification/concurrency_check.mjs")
Invoke-NativeStep "Feishu publish resume check" $nodePath @(".trellis/verification/feishu_publish_resume_check.mjs")
Invoke-NativeStep "Feishu publish queue check" $nodePath @(".trellis/verification/feishu_publish_queue_check.mjs")
Invoke-NativeStep "Feishu vehicle options check" $nodePath @(".trellis/verification/feishu_vehicle_options_check.mjs")
Invoke-NativeStep "Simple crawl top-up and media policy check" $nodePath @(".trellis/verification/simple_crawl_media_policy_check.mjs")
Invoke-NativeStep "Source safety filter check" $nodePath @(".trellis/verification/source_safety_filter_check.mjs")
Invoke-NativeStep "Source import retirement check" $nodePath @(".trellis/verification/source_import_feishu_check.mjs")
Invoke-NativeStep "Feishu content import check" $nodePath @(".trellis/verification/feishu_content_import_check.mjs")
Invoke-NativeStep "Distribution check" $nodePath @(".trellis/verification/distribution_check.mjs")
Invoke-NativeStep "Lark task launcher check" $nodePath @(".trellis/verification/lark_task_launcher_check.mjs")
Invoke-NativeStep "Simple config sync check" $nodePath @(".trellis/verification/simple_config_sync_check.mjs")
Invoke-NativeStep "User text instruction priority check" $nodePath @(".trellis/verification/user_text_instruction_priority_check.mjs")
Invoke-NativeStep "Crawl strategy save check" $nodePath @(".trellis/verification/crawl_strategy_save_check.mjs")
Invoke-NativeStep "Xiaopeng BBS import check" $nodePath @(".trellis/verification/xiaopeng_bbs_import_check.mjs")
Invoke-NativeStep "Dongchedi import check" $nodePath @(".trellis/verification/dongchedi_import_check.mjs")
Invoke-NativeStep "Link import check" $nodePath @(".trellis/verification/link_import_check.mjs")
Invoke-NativeStep "Simple link run check" $nodePath @(".trellis/verification/simple_link_run_check.mjs")
Invoke-NativeStep "Simple viral run check" $nodePath @(".trellis/verification/simple_viral_run_check.mjs")
Invoke-NativeStep "Simple original run check" $nodePath @(".trellis/verification/simple_original_run_check.mjs")
Invoke-NativeStep "Viral replication regression check" $nodePath @(".trellis/verification/viral_replication_regression_check.mjs")
Invoke-NativeStep "Simple queue and Feishu chunking check" $nodePath @(".trellis/verification/simple_queue_check.mjs")
Invoke-NativeStep "Simple run persistence check" $nodePath @(".trellis/verification/simple_run_persistence_check.mjs")
Invoke-NativeStep "Title prompt guard check" $nodePath @(".trellis/verification/title_prompt_guard_check.mjs")
Invoke-NativeStep "Image prompt guard check" $nodePath @(".trellis/verification/image_prompt_guard_check.mjs")
Invoke-NativeStep "Material library preview check" $nodePath @(".trellis/verification/material_library_preview_check.mjs")
Invoke-NativeStep "Review preview layout check" $nodePath @(".trellis/verification/review_preview_layout_check.mjs")
Invoke-NativeStep "Review desk workflow check" $nodePath @(".trellis/verification/review_desk_workflow_check.mjs")
Invoke-NativeStep "Review desk scroll layout check" $nodePath @(".trellis/verification/review_desk_scroll_layout_check.mjs")
Invoke-NativeStep "Image task fallback check" $nodePath @(".trellis/verification/image_task_fallback_check.mjs")
Invoke-NativeStep "GPT image size request check" $nodePath @(".trellis/verification/gpt_image_size_request_check.mjs")
Invoke-NativeStep "ComfyUI Klein integration check" $nodePath @(".trellis/verification/comfyui_klein_check.mjs")
Invoke-NativeStep "Source tagging image check" $nodePath @(".trellis/verification/source_tagging_image_check.mjs")
Invoke-NativeStep "Content projects row-level mutation check" $nodePath @(".trellis/verification/content_projects_upsert_check.mjs")
Invoke-NativeStep "Generated posts row-level mutation check" $nodePath @(".trellis/verification/generated_posts_upsert_check.mjs")
Invoke-NativeStep "Lint" $npmPath @("run", "lint")
Invoke-NativeStep "TypeScript noEmit" $npxPath @("--no-install", "tsc", "--noEmit")
Invoke-NativeStep "Next build" $npmPath @("run", "build")

$port = 3310
if ($env:TRELLIS_SMOKE_PORT) {
  $port = [int]$env:TRELLIS_SMOKE_PORT
}
Invoke-HttpSmoke -NodePath $nodePath -Port $port
Invoke-NativeStep "SQLite store check" $nodePath @(".trellis/verification/db_check.mjs")

Write-Host "Baseline verification passed."

