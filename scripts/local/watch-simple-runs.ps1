param(
  [string]$BaseUrl = "http://127.0.0.1:3001",
  [int]$IntervalSeconds = 5,
  [int]$LogLimit = 12,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()

function Read-LocalJson {
  param([string]$Path)

  $url = "$BaseUrl$Path"
  $bytes = $client.GetByteArrayAsync($url).GetAwaiter().GetResult()
  $json = [System.Text.Encoding]::UTF8.GetString($bytes)
  return $json | ConvertFrom-Json
}

function Format-ShortTime {
  param([string]$Value)

  if (-not $Value) { return "-" }
  try {
    $date = [DateTimeOffset]::Parse($Value).ToLocalTime()
    return $date.ToString("HH:mm:ss")
  } catch {
    return $Value
  }
}

function Show-Dashboard {
  Clear-Host
  Write-Host "FluxPost Simple Run Watcher" -ForegroundColor Cyan
  Write-Host "Server: $BaseUrl    Refresh: ${IntervalSeconds}s    Time: $(Get-Date -Format 'HH:mm:ss')"
  Write-Host ""

  try {
    $runsResponse = Read-LocalJson "/api/simple/runs"
    $activityResponse = Read-LocalJson "/api/activity?limit=$LogLimit"
  } catch {
    Write-Host "Cannot read local backend: $($_.Exception.Message)" -ForegroundColor Red
    return
  }

  $runs = @($runsResponse.runs)
  if (-not $runs.Count) {
    Write-Host "No simple runs yet." -ForegroundColor Yellow
  } else {
    $run = $runs[0]
    Write-Host "Latest Run" -ForegroundColor Green
    Write-Host "  id:      $($run.id)"
    Write-Host "  keyword: $($run.input.keyword)"
    Write-Host "  status:  $($run.status)"
    Write-Host "  target:  $($run.input.targetCount)    platforms: $($run.input.platforms -join ', ')"
    Write-Host "  updated: $(Format-ShortTime $run.updatedAt)"
    Write-Host ""

    Write-Host "Stages" -ForegroundColor Green
    foreach ($stage in @($run.stages)) {
      $done = [int]$stage.completed + [int]$stage.failed + [int]$stage.skipped
      $total = [int]$stage.total
      $progress = if ($total -gt 0) { [Math]::Round(($done / $total) * 100) } elseif ($stage.status -eq "queued") { 0 } else { 100 }
      Write-Host ("  {0,-12} {1,-8} {2,3}%  done={3}/{4} fail={5} skip={6}" -f $stage.title, $stage.status, $progress, $done, $total, $stage.failed, $stage.skipped)
      if ($stage.message) { Write-Host "    $($stage.message)" -ForegroundColor DarkGray }
    }
    Write-Host ""

    Write-Host "Platform Results" -ForegroundColor Green
    foreach ($result in @($run.platformResults)) {
      Write-Host ("  {0,-18} requested={1} crawled={2} contentTags={3} visualTags={4}" -f $result.platform, $result.requested, $result.crawled, $result.taggedContent, $result.taggedVisual)
      if ($result.error) { Write-Host "    error: $($result.error)" -ForegroundColor Yellow }
    }
    Write-Host ""

    Write-Host "Generated Posts" -ForegroundColor Green
    if (@($run.posts).Count) {
      foreach ($post in @($run.posts)) {
        Write-Host ("  {0} | {1} | images={2} | tags={3}" -f $post.status, $post.platform, $post.imageCount, (@($post.contentTags) -join ","))
        Write-Host "    $($post.title)"
      }
    } else {
      Write-Host "  none yet"
    }
    Write-Host ""

    if ($run.publish) {
      Write-Host "Publish" -ForegroundColor Green
      Write-Host "  status: $($run.publish.status)    posts: $($run.publish.postCount)"
      if ($run.publish.message) { Write-Host "  message: $($run.publish.message)" }
      if ($run.publish.error) { Write-Host "  error: $($run.publish.error)" -ForegroundColor Red }
      Write-Host ""
    }
  }

  Write-Host "Recent Backend Activity" -ForegroundColor Green
  foreach ($entry in @($activityResponse.entries)) {
    $duration = if ($null -ne $entry.durationMs) { " $($entry.durationMs)ms" } else { "" }
    Write-Host ("  {0} [{1}] {2}/{3}{4}" -f (Format-ShortTime $entry.createdAt), $entry.status, $entry.scope, $entry.action, $duration)
    if ($entry.message) { Write-Host "    $($entry.message)" -ForegroundColor DarkGray }
  }
}

do {
  Show-Dashboard
  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSeconds
} while ($true)
