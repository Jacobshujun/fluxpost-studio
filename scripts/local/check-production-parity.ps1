param(
  [string]$LocalUrl = "http://127.0.0.1:3001",
  [string]$ProductionUrl = "https://flux.lightmoment.net",
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
$controllerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if (-not $ProjectRoot) {
  $ProjectRoot = $controllerRoot
}
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
  throw "Candidate project root does not exist"
}

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

$head = (& git.exe -C $ProjectRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') {
  throw "Candidate worktree HEAD is invalid"
}
$dirty = @(& git.exe -C $ProjectRoot status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect candidate worktree" }
if ($dirty.Count) { throw "Candidate worktree is dirty" }

$localIdentity = Read-Identity -BaseUrl $LocalUrl -ExpectedMode "candidate"
$productionIdentity = Read-Identity -BaseUrl $ProductionUrl -ExpectedMode "production"
if ($head -ne $localIdentity.commit) {
  throw "Candidate worktree HEAD differs from its runtime"
}
if ($localIdentity.commit -ne $productionIdentity.commit) {
  throw "Local candidate SHA differs from remote production"
}

& git.exe -C $ProjectRoot fetch origin main | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not refresh origin/main" }
$remoteMain = (& git.exe -C $ProjectRoot rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0 -or $remoteMain -notmatch '^[0-9a-f]{40}$') {
  throw "GitHub main SHA is invalid"
}
if ($remoteMain -ne $productionIdentity.commit) {
  throw "GitHub main SHA differs from remote production"
}
if ($head -ne $remoteMain) {
  throw "Local candidate HEAD differs from GitHub main"
}

Write-Host "Local, GitHub, and production parity verified."
Write-Host "SHA=$($productionIdentity.commit)"
Write-Host "Local=$LocalUrl Remote=$ProductionUrl Worktree=$ProjectRoot"
