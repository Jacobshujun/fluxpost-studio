$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$manifestPath = Join-Path $workspace 'test-artifacts/tmp-cleanup-20261103/manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.root -ne $workspace) { throw 'Manifest workspace mismatch' }
$archivePath = (Resolve-Path -LiteralPath $manifest.archive).Path
if (-not $archivePath.StartsWith((Join-Path $workspace 'test-artifacts') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Archive outside local artifact directory'
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $manifest.archiveSHA256) {
    throw 'Recovery archive changed'
}
$tracked = @(git -C $workspace ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked files' }
$processes = @(Get-CimInstance Win32_Process)
$targets = @()
foreach ($entry in $manifest.selected) {
    $target = (Resolve-Path -LiteralPath (Join-Path $workspace $entry.name)).Path
    if ((Split-Path -Parent $target) -ne $workspace -or $entry.name -notlike '.tmp-*') {
        throw 'Target is not a root temporary entry'
    }
    if ($tracked | Where-Object { $_ -eq $entry.name -or $_.StartsWith($entry.name + '/') }) {
        throw "Tracked files found in $($entry.name)"
    }
    $item = Get-Item -LiteralPath $target -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked target refused' }
    if ($item.PSIsContainer) {
        $links = @(Get-ChildItem -LiteralPath $target -Recurse -Force -Attributes ReparsePoint)
        if ($links.Count) { throw 'Nested links refused' }
    }
    $uses = @($processes | Where-Object {
        $_.CommandLine -and $_.ProcessId -ne $PID -and
        $_.CommandLine.IndexOf($entry.name, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    if ($uses.Count) { throw "Running process references $($entry.name)" }
    $targets += $target
}
foreach ($property in $manifest.digests.PSObject.Properties) {
    $sourcePath = Join-Path $workspace $property.Name
    if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $property.Value) {
        throw 'Archived source changed; prepare a new recovery archive'
    }
}
$listenerBefore = @(Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess)
foreach ($target in $targets) {
    Remove-Item -LiteralPath $target -Recurse -Force
}
foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) { throw 'Selected entry still exists' }
}
foreach ($name in $manifest.retained) {
    if (-not (Test-Path -LiteralPath (Join-Path $workspace $name))) { throw 'Retained entry is missing' }
}
$listenerAfter = @(Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess)
if (Compare-Object $listenerBefore $listenerAfter) { throw 'Port 3001 listener changed' }
$version = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/version' -TimeoutSec 15
if ($version.commit -ne $manifest.versionBefore.commit) { throw 'Application commit changed' }
$review = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/review' -UseBasicParsing -TimeoutSec 30
$remaining = @(Get-ChildItem -LiteralPath $workspace -Force -Filter '.tmp-*')
$result = [PSCustomObject]@{
    RemovedRootItems = $targets.Count
    RemainingRootItems = $remaining.Count
    RemovedFiles = ($manifest.selected | Measure-Object fileCount -Sum).Sum
    RemovedMiB = [math]::Round(($manifest.selected | Measure-Object bytes -Sum).Sum / 1MB, 2)
    ArchiveMiB = [math]::Round($manifest.archiveBytes / 1MB, 2)
    NetReclaimedMiB = [math]::Round((($manifest.selected | Measure-Object bytes -Sum).Sum - $manifest.archiveBytes) / 1MB, 2)
    ServicePID = $listenerAfter
    ServiceCommit = $version.commit
    ReviewHTTP = $review.StatusCode
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $manifestPath) 'result.json') -Encoding UTF8
$result | Format-List
