$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$requiredFiles = @(
  "AGENTS.md",
  "docs/harness/handoff.md",
  "docs/harness/progress.md",
  "docs/harness/feature_list.json",
  "docs/harness/decisions.md",
  "docs/harness/verification.md"
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $ProjectRoot $file
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required handoff file is missing: $file"
  }
}

$featureListPath = Join-Path $ProjectRoot "docs/harness/feature_list.json"
$featureList = Get-Content -Raw -Encoding UTF8 -LiteralPath $featureListPath | ConvertFrom-Json
$features = @($featureList.features)

foreach ($feature in $features) {
  if ($feature.status -eq "done" -and @($feature.evidence).Count -eq 0) {
    throw "Feature '$($feature.id)' is done but has no evidence."
  }
}

Write-Host "Harness handoff validation passed."
