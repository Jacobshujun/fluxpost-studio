$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $projectRoot
if (Get-NetTCPConnection -LocalPort 45678 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 45678 is occupied; stop the isolated fixture before running browser checks.'
}
$env:FLUXPOST_DISABLE_BACKGROUND_WORKERS = '1'
$env:FLUXPOST_RUNTIME_MODE = 'development'
$env:DATABASE_URL = ''
$env:BROWSER_BASE_URL = 'http://127.0.0.1:45678'
$env:FLUXPOST_BROWSER_BASE_URL = $env:BROWSER_BASE_URL
$server = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '45678') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput '.tmp-pool-browser-server.out.log' -RedirectStandardError '.tmp-pool-browser-server.err.log'
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($server.HasExited) { throw 'Isolated browser server exited before becoming ready.' }
    try {
      $response = Invoke-WebRequest -Uri "$($env:BROWSER_BASE_URL)/canvas" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch [System.Net.WebException] {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $ready) { throw 'Isolated browser server did not become ready.' }
  python .trellis/verification/content_pool_responsiveness_browser_check.py
  if ($LASTEXITCODE -ne 0) { throw 'Content-pool responsiveness browser checks failed.' }
  python .trellis/verification/content_pool_editor_browser_check.py
  if ($LASTEXITCODE -ne 0) { throw 'Content-pool editor browser checks failed.' }
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id }
}
