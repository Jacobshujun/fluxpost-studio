param(
  [int]$Port = 3001,
  [string]$HostName = "0.0.0.0",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $projectRoot

function Get-ListeningProcessIds {
  param([int]$Port)

  $ids = @()
  try {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop | Where-Object { $_.State -eq "Listen" })
    $ids += @($connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ })
  } catch {
    # Some Windows shells cannot read Get-NetTCPConnection reliably; netstat is the fallback.
  }

  if (-not $ids.Count) {
    $lines = @(netstat.exe -ano -p tcp)
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $lines) {
        if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
          $ids += [int]$Matches[1]
        }
      }
    }
  }

  return @($ids | Select-Object -Unique)
}

if (-not $SkipBuild) {
  Write-Host "== Build latest app bundle"
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }
}

Write-Host "== Stop existing server on port $Port"
$processIds = @(Get-ListeningProcessIds -Port $Port)

foreach ($processId in $processIds) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    Write-Host "Stopping PID $processId ($($process.ProcessName))"
    Stop-Process -Id $processId -Force
  } catch {
    Write-Host "PID $processId is already stopped"
  }
}

Start-Sleep -Seconds 2

$remainingProcessIds = @(Get-ListeningProcessIds -Port $Port)
if ($remainingProcessIds.Count) {
  throw "Port $Port is still occupied by PID(s): $($remainingProcessIds -join ', ')"
}

Write-Host "== Start Next production server on ${HostName}:$Port"
$server = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "start", "--", "-H", $HostName, "-p", "$Port") `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -PassThru

$healthUrl = "http://127.0.0.1:$Port/api/config"
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  throw "Server did not become ready at $healthUrl"
}

Write-Host "== Local HTTP smoke"
& node scripts\harness\http_smoke.js "http://127.0.0.1:$Port"
if ($LASTEXITCODE -ne 0) {
  throw "HTTP smoke failed with exit code $LASTEXITCODE"
}

$listenerProcessIds = @(Get-ListeningProcessIds -Port $Port)
Write-Host "Local server restarted. PID=$($server.Id) ListenerPID=$($listenerProcessIds -join ',') URL=http://127.0.0.1:$Port/"
