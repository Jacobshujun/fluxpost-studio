$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$NodeCommand = Get-Command node.exe, node -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $NodeCommand) {
  throw "Required command not found: node.exe or node"
}

Set-Location $ProjectRoot
& $NodeCommand.Source ".trellis/verification/check.mjs"
if ($LASTEXITCODE -ne 0) {
  throw "Cross-platform baseline failed with exit code $LASTEXITCODE"
}
