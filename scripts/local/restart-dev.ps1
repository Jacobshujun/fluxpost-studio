param(
  [int]$Port = 3001,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
Set-Location $projectRoot

function Get-ListeningProcessIds {
  param([int]$Port)

  $ids = @()
  try {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop | Where-Object { $_.State -eq "Listen" })
    $ids += @($connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ })
  } catch {
    # Some Windows shells cannot read Get-NetTCPConnection reliably; netstat is the fallback.
  }

  if (-not $ids.Count) {
    $lines = @(netstat.exe -ano -p tcp)
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $lines) {
        if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
          $ids += [int]$Matches[1]
        }
      }
    }
  }

  return @($ids | Select-Object -Unique)
}

Write-Host "== Stop existing server on port $Port"
foreach ($processId in @(Get-ListeningProcessIds -Port $Port)) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    Write-Host "Stopping PID $processId ($($process.ProcessName))"
    Stop-Process -Id $processId -Force
  } catch {
    Write-Host "PID $processId is already stopped"
  }
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if (-not @(Get-ListeningProcessIds -Port $Port).Count) {
    break
  }
  Start-Sleep -Milliseconds 250
}

$remainingProcessIds = @(Get-ListeningProcessIds -Port $Port)
if ($remainingProcessIds.Count) {
  throw "Port $Port is still occupied by PID(s): $($remainingProcessIds -join ', ')"
}

Write-Host "== Start development server on ${HostName}:$Port"
& node.exe (Join-Path $projectRoot "scripts\local\start-dev.mjs") --host $HostName --port "$Port"
if ($LASTEXITCODE -ne 0) {
  throw "Development server exited with code $LASTEXITCODE"
}
