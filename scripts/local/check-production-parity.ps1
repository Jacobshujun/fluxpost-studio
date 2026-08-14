param(
  [string]$LocalUrl = "http://127.0.0.1:3001",
  [string]$ProductionUrl = "https://flux.lightmoment.net",
  [string]$MirrorRoot = ""
)

$ErrorActionPreference = "Stop"
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if (-not $MirrorRoot) {
  $MirrorRoot = Join-Path (Split-Path $sourceRoot -Parent) "social-content-studio-production-mirror"
}
$MirrorRoot = [IO.Path]::GetFullPath($MirrorRoot)
$statePath = Join-Path $MirrorRoot "current.json"

function Read-Identity {
  param([string]$BaseUrl, [string]$ExpectedMode)
  $uri = ([Uri]$BaseUrl).GetLeftPart([UriPartial]::Authority).TrimEnd('/') + "/api/version"
  try {
    $identity = Invoke-RestMethod -Uri $uri -TimeoutSec 10
  } catch {
    throw "$ExpectedMode identity endpoint is unreachable"
  }
  if ($identity.mode -ne $ExpectedMode -or $identity.versioned -ne $true -or $identity.commit -notmatch '^[0-9a-f]{40}$') {
    throw "$ExpectedMode identity is invalid"
  }
  return $identity
}

if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
  throw "Local mirror state is missing: $statePath"
}
$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
if ($state.commit -notmatch '^[0-9a-f]{40}$' -or -not $state.releasePath) {
  throw "Local mirror state is invalid"
}
$releasePath = [IO.Path]::GetFullPath([string]$state.releasePath)
$mirrorPrefix = $MirrorRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $releasePath.StartsWith($mirrorPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Local mirror state points outside MirrorRoot"
}
if (-not (Test-Path -LiteralPath $releasePath -PathType Container)) {
  throw "Local mirror release worktree is missing"
}

$localIdentity = Read-Identity -BaseUrl $LocalUrl -ExpectedMode "local-production"
$productionIdentity = Read-Identity -BaseUrl $ProductionUrl -ExpectedMode "production"
if ($localIdentity.commit -ne $productionIdentity.commit) {
  throw "Local mirror SHA differs from remote production"
}
if ($state.commit -ne $localIdentity.commit) {
  throw "Local mirror state SHA differs from its runtime"
}

$head = (& git.exe -C $releasePath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $localIdentity.commit) {
  throw "Local mirror worktree HEAD differs from its runtime"
}
$dirty = @(& git.exe -C $releasePath status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect local mirror worktree" }
if ($dirty.Count) { throw "Local mirror worktree is dirty" }

& git.exe -C $sourceRoot fetch origin main | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not refresh origin/main" }
& git.exe -C $sourceRoot merge-base --is-ancestor $productionIdentity.commit origin/main
if ($LASTEXITCODE -ne 0) { throw "Remote production commit is not an ancestor of origin/main" }

Write-Host "Production parity verified."
Write-Host "SHA=$($productionIdentity.commit)"
Write-Host "Local=$LocalUrl Remote=$ProductionUrl Mirror=$releasePath"
