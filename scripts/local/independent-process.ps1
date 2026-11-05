if (-not ('FluxPost.Local.IndependentProcess' -as [type])) {
  Add-Type -Path (Join-Path $PSScriptRoot 'IndependentProcess.cs')
}

function Start-IndependentNode {
  param(
    [string[]]$NodeArguments,
    [string]$WorkingDirectory,
    [string]$RedirectStandardError
  )
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  return [FluxPost.Local.IndependentProcess]::Start(
    $nodePath, $NodeArguments, $WorkingDirectory, $RedirectStandardError
  )
}

function Test-IndependentNode {
  param([string]$WorkingDirectory, [string]$DiagnosticsRoot)
  $probeLog = Join-Path $DiagnosticsRoot ('launch-probe-' + [guid]::NewGuid().ToString('N') + '.log')
  $probe = $null
  try {
    $probe = Start-IndependentNode -NodeArguments @('-e', 'process.exit(0)') `
      -WorkingDirectory $WorkingDirectory -RedirectStandardError $probeLog
    if (-not $probe.WaitForExit(10000)) {
      $probe.Kill()
      $probe.WaitForExit()
      throw 'Independent local startup preflight timed out'
    }
    if ($probe.ExitCode -ne 0) { throw 'Independent local startup preflight failed' }
  } finally {
    if ($probe) { $probe.Dispose() }
    if (Test-Path -LiteralPath $probeLog) { Remove-Item -LiteralPath $probeLog -Force }
  }
}
