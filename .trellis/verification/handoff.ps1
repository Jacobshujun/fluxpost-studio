$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$requiredFiles = @(
  "AGENTS.md",
  ".trellis/spec/fluxpost/handoff.md",
  ".trellis/spec/fluxpost/progress.md",
  ".trellis/spec/fluxpost/feature_list.json",
  ".trellis/spec/fluxpost/decisions.md",
  ".trellis/spec/fluxpost/verification.md"
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $ProjectRoot $file
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required handoff file is missing: $file"
  }
}

$featureListPath = Join-Path $ProjectRoot ".trellis/spec/fluxpost/feature_list.json"
$featureList = Get-Content -Raw -Encoding UTF8 -LiteralPath $featureListPath | ConvertFrom-Json
$features = @($featureList.features)

foreach ($feature in $features) {
  if ($feature.status -eq "done" -and @($feature.evidence).Count -eq 0) {
    throw "Feature '$($feature.id)' is done but has no evidence."
  }
}

Write-Host "Trellis handoff validation passed."
