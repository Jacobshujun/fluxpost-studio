# One-off cleanup authorized by the user's follow-up. Never executes archived helpers.
$ErrorActionPreference = 'Stop'
$workspace = 'D:\FluxPost\social-content-studio'
if ((Resolve-Path -LiteralPath '.').Path -ne $workspace) { throw 'Run from primary workspace' }
$selected = @(Get-ChildItem -LiteralPath $workspace -Force -File -Filter '.tmp-*' | Where-Object {
    $_.Name -match '^\.tmp-(oss-|schedule|simple-material-)'
})
if ($selected.Count -ne 82) { throw 'Selection changed; inspect before proceeding' }
$processes = @(Get-CimInstance Win32_Process)
$tracked = @(git ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked files' }
foreach ($item in $selected) {
    $resolved = (Resolve-Path -LiteralPath $item.FullName).Path
    if ((Split-Path -Parent $resolved) -ne $workspace -or $item.PSIsContainer -or
        $item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unsafe target' }
    if ($tracked -contains $item.Name) { throw 'Tracked temporary file refused' }
    if ($processes | Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -and
        $_.CommandLine.IndexOf($item.Name, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }) { throw 'Active temporary file refused' }
}
$versionBefore = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/version' -TimeoutSec 15
$listenerBefore = @(Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess)
$inventories = @(Get-ChildItem -LiteralPath $workspace -File -Filter '.tmp-storage-inventory*.json' | Get-FileHash -Algorithm SHA256)
$out = Join-Path $workspace 'test-artifacts/tmp-cleanup-20261103-oss-followup'
New-Item -ItemType Directory -Path $out -ErrorAction Stop | Out-Null
$zipPath = Join-Path $out 'recovery.zip'
$records = @($selected | ForEach-Object {
    [PSCustomObject]@{Name=$_.Name; Bytes=$_.Length; SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
})
Compress-Archive -LiteralPath @($selected.FullName) -DestinationPath $zipPath -CompressionLevel Optimal
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($zip.Entries.Count -ne $records.Count) { throw 'Archive file count mismatch' }
    foreach ($record in $records) {
        $entry = $zip.GetEntry($record.Name)
        if (-not $entry -or $entry.Length -ne $record.Bytes) { throw 'Archive member incomplete' }
        $stream = $entry.Open()
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $digest = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
        finally { $hasher.Dispose(); $stream.Dispose() }
        if ($digest -ne $record.SHA256 -or
            (Get-FileHash -LiteralPath (Join-Path $workspace $record.Name) -Algorithm SHA256).Hash -ne $record.SHA256) {
            throw 'Archive or source hash mismatch'
        }
    }
} finally { $zip.Dispose() }
[PSCustomObject]@{
    Files=$records; Inventories=$inventories; VersionBefore=$versionBefore.commit
    ServicePID=$listenerBefore; ArchiveSHA256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'manifest.json') -Encoding UTF8
foreach ($item in $selected) { Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop }
foreach ($record in $records) {
    if (Test-Path -LiteralPath (Join-Path $workspace $record.Name)) { throw 'Selected file remains' }
}
foreach ($inventory in $inventories) {
    if ((Get-FileHash -LiteralPath $inventory.Path -Algorithm SHA256).Hash -ne $inventory.Hash) { throw 'Inventory changed' }
}
$versionAfter = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/version' -TimeoutSec 15
$listenerAfter = @(Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess)
if ($versionAfter.commit -ne $versionBefore.commit -or (Compare-Object $listenerBefore $listenerAfter)) {
    throw 'Application identity or listener changed'
}
$bytes = ($records | Measure-Object Bytes -Sum).Sum
$result = [PSCustomObject]@{
    RemovedFiles=$records.Count; RemovedMiB=[math]::Round($bytes/1MB,2)
    ArchiveMiB=[math]::Round((Get-Item -LiteralPath $zipPath).Length/1MB,2)
    NetReclaimedMiB=[math]::Round(($bytes-(Get-Item -LiteralPath $zipPath).Length)/1MB,2)
    RemainingRootItems=@((Get-ChildItem -LiteralPath $workspace -Force -Filter '.tmp-*')).Count
    PreservedInventories=$inventories.Count; ServiceCommit=$versionAfter.commit; ServicePID=$listenerAfter
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding UTF8
$result | Format-List
