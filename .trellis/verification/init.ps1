$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Assert-FileExists {
  param([string]$RelativePath)
  $path = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required file is missing: $RelativePath"
  }
}

$requiredFiles = @(
  "AGENTS.md",
  ".trellis/spec/fluxpost/project_brief.md",
  ".trellis/spec/fluxpost/feature_list.json",
  ".trellis/spec/fluxpost/progress.md",
  ".trellis/spec/fluxpost/handoff.md",
  ".trellis/spec/fluxpost/decisions.md",
  ".trellis/spec/fluxpost/verification.md",
  ".trellis/spec/fluxpost/pitfalls.md",
  ".trellis/spec/fluxpost/architecture_rules.md",
  ".trellis/verification/init.ps1",
  ".trellis/verification/handoff.ps1",
  ".trellis/verification/check.ps1",
  ".trellis/verification/json_check.mjs",
  ".trellis/verification/http_smoke.js"
)

foreach ($file in $requiredFiles) {
  Assert-FileExists $file
}

$featureListPath = Join-Path $ProjectRoot ".trellis/spec/fluxpost/feature_list.json"
$featureList = Get-Content -Raw -Encoding UTF8 -LiteralPath $featureListPath | ConvertFrom-Json

$expectedStatuses = @("not_started", "in_progress", "ready_for_review", "done", "blocked")
$actualStatuses = @($featureList.status_values)
if (($actualStatuses -join "|") -ne ($expectedStatuses -join "|")) {
  throw "feature_list.json status_values must be: $($expectedStatuses -join ', ')"
}

$features = @($featureList.features)
if ($features.Count -lt 1) {
  throw "feature_list.json must contain at least one feature."
}

foreach ($feature in $features) {
  if (-not $feature.id) {
    throw "Every feature must have an id."
  }
  if ($expectedStatuses -notcontains $feature.status) {
    throw "Feature '$($feature.id)' has invalid status '$($feature.status)'."
  }
}

Write-Host "Trellis init validation passed for $ProjectRoot"
