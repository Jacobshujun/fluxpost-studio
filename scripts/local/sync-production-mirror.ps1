param(
  [ValidatePattern("^$|^[0-9a-f]{40}$")]
  [string]$TargetSha = "",
  [string]$ProductionUrl = "https://flux.lightmoment.net",
  [string]$MirrorRoot = "",
  [string]$ConfigFile = ""
)

$ErrorActionPreference = "Stop"
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if (-not $MirrorRoot) {
  $MirrorRoot = Join-Path (Split-Path $sourceRoot -Parent) "social-content-studio-production-mirror"
}
$MirrorRoot = [IO.Path]::GetFullPath($MirrorRoot)
$sourcePrefix = $sourceRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if ($MirrorRoot -eq $sourceRoot -or $MirrorRoot.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "MirrorRoot must be outside the development repository"
}

function Invoke-Git {
  param([string]$Repository, [string[]]$Arguments)
  $output = @(& git.exe -C $Repository @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git -C <repository> $($Arguments -join ' ')"
  }
  return $output
}

function Read-ProductionIdentity {
  param([string]$BaseUrl)
  $uri = ([Uri]$BaseUrl).GetLeftPart([UriPartial]::Authority).TrimEnd('/') + "/api/version"
  $identity = Invoke-RestMethod -Uri $uri -TimeoutSec 10
  if ($identity.mode -ne "production" -or $identity.versioned -ne $true -or $identity.commit -notmatch '^[0-9a-f]{40}$') {
    throw "Remote production returned an invalid release identity"
  }
  return [string]$identity.commit
}

if (-not $TargetSha) {
  $TargetSha = Read-ProductionIdentity -BaseUrl $ProductionUrl
}
if ($TargetSha -notmatch '^[0-9a-f]{40}$') {
  throw "TargetSha must be a full lowercase Git commit"
}

Invoke-Git -Repository $sourceRoot -Arguments @("fetch", "origin", "main") | Out-Null
Invoke-Git -Repository $sourceRoot -Arguments @("cat-file", "-e", "$TargetSha`^{commit}") | Out-Null
& git.exe -C $sourceRoot merge-base --is-ancestor $TargetSha origin/main
if ($LASTEXITCODE -ne 0) {
  throw "Target release is not an ancestor of origin/main"
}

$releasesRoot = Join-Path $MirrorRoot "releases"
$releasePath = Join-Path $releasesRoot $TargetSha
$statePath = Join-Path $MirrorRoot "current.json"
New-Item -ItemType Directory -Path $releasesRoot -Force | Out-Null

$previousRelease = $null
if (Test-Path -LiteralPath $statePath -PathType Leaf) {
  $candidate = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  if ($candidate.commit -match '^[0-9a-f]{40}$' -and $candidate.releasePath) {
    $candidatePath = [IO.Path]::GetFullPath([string]$candidate.releasePath)
    $mirrorPrefix = $MirrorRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if ($candidatePath.StartsWith($mirrorPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $candidatePath -PathType Container)) {
      $previousRelease = [pscustomobject]@{ commit = [string]$candidate.commit; releasePath = $candidatePath }
    }
  }
}

if (-not (Test-Path -LiteralPath $releasePath)) {
  & git.exe -C $sourceRoot worktree add --detach $releasePath $TargetSha
  if ($LASTEXITCODE -ne 0) { throw "Could not create the mirror release worktree" }
} else {
  $head = (Invoke-Git -Repository $releasePath -Arguments @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
  if ($head -ne $TargetSha) { throw "Existing mirror release path has the wrong HEAD" }
  $dirty = @(Invoke-Git -Repository $releasePath -Arguments @("status", "--porcelain"))
  if ($dirty.Count) { throw "Existing mirror release worktree is dirty" }
}

if (-not (Test-Path -LiteralPath (Join-Path $releasePath "src\app\api\version\route.ts") -PathType Leaf)) {
  throw "Target release predates runtime identity and cannot be used as a version-proven mirror"
}

Push-Location $releasePath
try {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw "Mirror dependency installation failed" }
} finally {
  Pop-Location
}

$restartArguments = @{
  ReleaseSha = $TargetSha
  ProjectRoot = $releasePath
}
if ($ConfigFile) { $restartArguments.ConfigFile = $ConfigFile }

try {
  & (Join-Path $sourceRoot "scripts\local\restart.ps1") @restartArguments
} catch {
  $activationError = $_
  if ($previousRelease -and $previousRelease.commit -ne $TargetSha) {
    Write-Warning "Mirror activation failed; restoring $($previousRelease.commit)"
    $rollbackArguments = @{
      ReleaseSha = $previousRelease.commit
      ProjectRoot = $previousRelease.releasePath
      SkipBuild = $true
    }
    if ($ConfigFile) { $rollbackArguments.ConfigFile = $ConfigFile }
    & (Join-Path $sourceRoot "scripts\local\restart.ps1") @rollbackArguments
  }
  throw $activationError
}

$state = [ordered]@{
  commit = $TargetSha
  releasePath = $releasePath
  updatedAt = [DateTime]::UtcNow.ToString("o")
}
$temporaryState = "$statePath.tmp"
$state | ConvertTo-Json | Set-Content -LiteralPath $temporaryState -Encoding utf8
Move-Item -LiteralPath $temporaryState -Destination $statePath -Force

Write-Host "Local production mirror synchronized. SHA=$TargetSha URL=http://127.0.0.1:3001/"
