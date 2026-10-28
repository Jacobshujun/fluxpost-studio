param(
  [Parameter(Mandatory=$true)][ValidateSet('freeze','prepare-backup')][string]$Action
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $root
if ($Action -eq 'prepare-backup') {
  $config = Get-Content -LiteralPath (Join-Path $root 'data/oss-cutover/config.json') -Raw | ConvertFrom-Json
  $relative = [string]$config.frozenBackupDir
  if ($relative -notmatch '^data/backups/[a-zA-Z0-9_-]+$') { throw 'UnsafeBackupPath' }
  $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
  $boundary = [IO.Path]::GetFullPath((Join-Path $root 'data/backups')) + [IO.Path]::DirectorySeparatorChar
  if (-not $target.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'UnsafeBackupPath' }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $acl = Get-Acl -LiteralPath $target
  $acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @([System.Security.Principal.WindowsIdentity]::GetCurrent().User,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  }
  Set-Acl -LiteralPath $target -AclObject $acl
  Write-Output '{"backupDirectoryPrivate":true}'
  exit
}
$version = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/version' -TimeoutSec 5
$state = Get-Content -LiteralPath (Join-Path $root '.fluxpost-local-candidate.json') -Raw | ConvertFrom-Json
if ($version.mode -ne 'candidate' -or -not $version.versioned -or $version.commit -ne $state.commit) { throw 'CandidateIdentityMismatch' }
$listeners = @(Get-NetTCPConnection -LocalPort 3001 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
if ($listeners.Count -ne 1) { throw 'SingleListenerRequired' }
$idToStop = [int]$listeners[0]
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$idToStop"
$parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)"
$commands = [string]$process.CommandLine + ' ' + [string]$parent.CommandLine
if ($process.Name -ne 'node.exe' -or -not $commands.Contains($root) -or $commands -notmatch 'next') { throw 'ListenerIdentityUnknown' }
$receipt = @{ commit=$version.commit; pid=$idToStop; at=[DateTime]::UtcNow.ToString('o') }
$receipt | ConvertTo-Json | Set-Content -LiteralPath 'data/oss-cutover/freeze.json' -Encoding ascii
Stop-Process -Id $idToStop -ErrorAction Stop
Start-Sleep -Seconds 2
if (@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue).Count) { throw 'ListenerStillRunning' }
Write-Output '{"localListenerStopped":true}'
