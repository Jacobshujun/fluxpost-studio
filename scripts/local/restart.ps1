param(
  [int]$Port = 3001,
  [string]$HostName = "127.0.0.1",
  [string]$ConfigFile = "",
  [string]$ProjectRoot = ""
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

$gitCommonDir = (& git.exe -C $projectRoot rev-parse --path-format=absolute --git-common-dir).Trim()
if ($LASTEXITCODE -ne 0 -or -not $gitCommonDir) {
  throw "Could not resolve the primary Git worktree"
}
$primaryProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $gitCommonDir))
if (-not [StringComparer]::OrdinalIgnoreCase.Equals($projectRoot.TrimEnd("\", "/"), $primaryProjectRoot.TrimEnd("\", "/"))) {
  throw "Local candidate must run from the primary Git worktree: $primaryProjectRoot"
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

$statePath = Join-Path $projectRoot ".fluxpost-local-candidate.json"
$slotNames = @(".next-local-a", ".next-local-b")
$previousState = $null
if (Test-Path -LiteralPath $statePath -PathType Leaf) {
  try {
    $candidateState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $candidateSlot = [string]$candidateState.slot
    $candidateSha = [string]$candidateState.commit
    $candidateSlotPath = Join-Path $projectRoot $candidateSlot
    $candidateManifestPath = Join-Path $candidateSlotPath ".fluxpost-commit"
    $candidateBuildSha = if (Test-Path -LiteralPath $candidateManifestPath -PathType Leaf) {
      (Get-Content -LiteralPath $candidateManifestPath -Raw).Trim()
    } else {
      ""
    }
    if ($slotNames -contains $candidateSlot -and
        $candidateSha -match '^[0-9a-f]{40}$' -and
        $candidateBuildSha -eq $candidateSha -and
        (Test-Path -LiteralPath (Join-Path $candidateSlotPath "BUILD_ID") -PathType Leaf)) {
      $previousState = [pscustomobject]@{ slot = $candidateSlot; commit = $candidateSha }
    }
  } catch {
    Write-Warning "Ignoring invalid local candidate state"
  }
}

if (-not $previousState -and (Test-Path -LiteralPath (Join-Path $projectRoot ".next\BUILD_ID") -PathType Leaf)) {
  try {
    $legacyVersion = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/version" -TimeoutSec 5
    if ($legacyVersion.mode -eq "candidate" -and
        $legacyVersion.commit -match '^[0-9a-f]{40}$' -and
        $legacyVersion.versioned -eq $true) {
      $previousState = [pscustomobject]@{ slot = ".next"; commit = [string]$legacyVersion.commit }
      Write-Host "Using the current primary-worktree .next candidate as first-activation rollback"
    }
  } catch {
    # The first activation can proceed when no candidate is currently listening.
  }
}

$targetSlot = if ($previousState -and $previousState.slot -eq $slotNames[0]) { $slotNames[1] } else { $slotNames[0] }
$env:FLUXPOST_NEXT_DIST_DIR = $targetSlot

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

function Stop-PortListener {
  param([int]$Port)

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

  if ($processIds.Count) {
    Start-Sleep -Seconds 2
  }

  $remainingProcessIds = @(Get-ListeningProcessIds -Port $Port)
  if ($remainingProcessIds.Count) {
    throw "Port $Port is still occupied by PID(s): $($remainingProcessIds -join ', ')"
  }
}

function Start-CandidateServer {
  param([string]$Slot, [string]$Commit)

  if ($Slot -eq ".next") {
    Remove-Item Env:FLUXPOST_NEXT_DIST_DIR -ErrorAction SilentlyContinue
  } elseif ($slotNames -contains $Slot) {
    $env:FLUXPOST_NEXT_DIST_DIR = $Slot
  } else {
    throw "Local candidate slot is invalid"
  }
  $env:FLUXPOST_RELEASE_SHA = $Commit
  Write-Host "== Start Next production server from $Slot on ${HostName}:$Port"
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
  if ($version.mode -ne "candidate" -or $version.commit -ne $Commit -or $version.versioned -ne $true) {
    throw "Local candidate runtime identity does not match release $Commit"
  }

  Write-Host "== Local HTTP smoke"
  & node (Join-Path $controllerRoot ".trellis\verification\http_smoke.js") "http://127.0.0.1:$Port" "candidate" $Commit | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "HTTP smoke failed with exit code $LASTEXITCODE"
  }

  return $server
}

Write-Host "== Build committed candidate into inactive slot $targetSlot"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
  throw "Build failed with exit code $LASTEXITCODE; the current local app is still running"
}
$postBuildDirty = @(& git.exe -C $projectRoot status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect candidate worktree after build"
}
if ($postBuildDirty.Count) {
  throw "Candidate worktree became dirty during build; the current local app is still running"
}
$targetSlotPath = Join-Path $projectRoot $targetSlot
$targetManifestPath = Join-Path $targetSlotPath ".fluxpost-commit"
Set-Content -LiteralPath $targetManifestPath -Value $ReleaseSha -Encoding ascii
$stateTempPath = "$statePath.tmp"
@{ slot = $targetSlot; commit = $ReleaseSha } | ConvertTo-Json | Set-Content -LiteralPath $stateTempPath -Encoding utf8

$listenerStopped = $false
try {
  Write-Host "== Replace existing server on port $Port"
  Stop-PortListener -Port $Port
  $listenerStopped = $true
  $server = Start-CandidateServer -Slot $targetSlot -Commit $ReleaseSha
  Move-Item -LiteralPath $stateTempPath -Destination $statePath -Force
} catch {
  $activationError = $_
  Write-Warning "New local candidate failed activation: $($activationError.Exception.Message)"
  Remove-Item -LiteralPath $stateTempPath -Force -ErrorAction SilentlyContinue
  if (-not $listenerStopped) {
    throw "Local update failed before the existing application was stopped"
  }
  Stop-PortListener -Port $Port
  if ($previousState) {
    Write-Host "== Restore previous local candidate $($previousState.commit) from $($previousState.slot)"
    Start-CandidateServer -Slot $previousState.slot -Commit $previousState.commit | Out-Null
    throw "Local update failed; the previous application was restored"
  }
  throw "Local update failed and no previous managed build slot was available to restore"
}

$listenerProcessIds = @(Get-ListeningProcessIds -Port $Port)
Write-Host "Local candidate updated. SHA=$ReleaseSha Slot=$targetSlot PID=$($server.Id) ListenerPID=$($listenerProcessIds -join ',') URL=http://127.0.0.1:$Port/"
