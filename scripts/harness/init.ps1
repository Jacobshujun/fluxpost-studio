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
  "docs/harness/project_brief.md",
  "docs/harness/feature_list.json",
  "docs/harness/progress.md",
  "docs/harness/handoff.md",
  "docs/harness/decisions.md",
  "docs/harness/verification.md",
  "docs/harness/pitfalls.md",
  "docs/harness/architecture_rules.md",
  "scripts/harness/init.ps1",
  "scripts/harness/handoff.ps1",
  "scripts/harness/check.ps1",
  "scripts/harness/json_check.mjs",
  "scripts/harness/http_smoke.js"
)

foreach ($file in $requiredFiles) {
  Assert-FileExists $file
}

$featureListPath = Join-Path $ProjectRoot "docs/harness/feature_list.json"
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

Write-Host "Harness init validation passed for $ProjectRoot"
