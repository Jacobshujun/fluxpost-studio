param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NodeArgs
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$diagUrl = $env:FLUXPOST_DIAG_DATABASE_URL
if (-not $diagUrl) {
  $diagUrl = [Environment]::GetEnvironmentVariable("FLUXPOST_DIAG_DATABASE_URL", "User")
}

if (-not $diagUrl) {
  Write-Error "Missing FLUXPOST_DIAG_DATABASE_URL in process or user environment."
}

$env:FLUXPOST_DIAG_DATABASE_URL = $diagUrl

& node scripts/local/postgres-diagnose.mjs @NodeArgs
exit $LASTEXITCODE
