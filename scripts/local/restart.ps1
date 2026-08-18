param(
  [int]$Port = 3001,
  [string]$HostName = "127.0.0.1",
  [string]$ConfigFile = "",
  [string]$ProjectRoot = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$controllerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if (-not $ProjectRoot) {
  $ProjectRoot = $controllerRoot
}
$projectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $projectRoot -PathType Container)) {
  throw "Candidate project root does not exist"
}
Set-Location $projectRoot

$ReleaseSha = (& git.exe -C $projectRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $ReleaseSha -notmatch '^[0-9a-f]{40}$') {
  throw "Candidate HEAD is not a full lowercase Git commit"
}
$dirty = @(& git.exe -C $projectRoot status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect candidate worktree status"
}
if ($dirty.Count) {
  throw "Candidate worktree must be clean before restart"
}

if (-not $ConfigFile) {
  $ConfigFile = [Environment]::GetEnvironmentVariable("FLUXPOST_LOCAL_CONFIG_FILE", "User")
}
if ($ConfigFile) {
  $ConfigFile = [IO.Path]::GetFullPath($ConfigFile)
  if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
    throw "Local candidate config file does not exist"
  }
  $env:FLUXPOST_CONFIG_FILE = $ConfigFile
}
$env:FLUXPOST_RUNTIME_MODE = "candidate"
$env:FLUXPOST_RELEASE_SHA = $ReleaseSha

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
  $postBuildDirty = @(& git.exe -C $projectRoot status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect candidate worktree after build"
  }
  if ($postBuildDirty.Count) {
    throw "Candidate worktree became dirty during build"
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

$versionUrl = "http://127.0.0.1:$Port/api/version"
try {
  $version = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 5
} catch {
  throw "Local candidate did not expose release identity at $versionUrl"
}
if ($version.mode -ne "candidate" -or $version.commit -ne $ReleaseSha -or $version.versioned -ne $true) {
  throw "Local candidate runtime identity does not match release $ReleaseSha"
}

Write-Host "== Local HTTP smoke"
& node (Join-Path $controllerRoot ".trellis\verification\http_smoke.js") "http://127.0.0.1:$Port" "candidate" $ReleaseSha
if ($LASTEXITCODE -ne 0) {
  throw "HTTP smoke failed with exit code $LASTEXITCODE"
}

$listenerProcessIds = @(Get-ListeningProcessIds -Port $Port)
Write-Host "Local candidate restarted. SHA=$ReleaseSha PID=$($server.Id) ListenerPID=$($listenerProcessIds -join ',') URL=http://127.0.0.1:$Port/"
