param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Wait-WinRtOperation {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Operation,
    [Parameter(Mandatory = $true)]
    [Type]$ResultType
  )

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq "AsTask" -and
      $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
    } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  return $task.GetAwaiter().GetResult()
}

function Wait-WinRtAction {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Operation
  )

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq "AsTask" -and
      -not $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq "IAsyncAction"
    } |
    Select-Object -First 1
  $task = $method.Invoke($null, @($Operation))
  $task.GetAwaiter().GetResult() | Out-Null
}

$streamType = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$encoderType = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$pixelFormatType = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$alphaModeType = [Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$dataReaderType = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$stream = New-Object $streamType
$encoder = Wait-WinRtOperation ($encoderType::CreateAsync($encoderType::HeifEncoderId, $stream)) $encoderType
$pixels = [byte[]]@(
  0, 0, 255, 255, 0, 255, 0, 255,
  255, 0, 0, 255, 255, 255, 255, 255
)
$encoder.SetPixelData($pixelFormatType::Bgra8, $alphaModeType::Straight, 2, 2, 96, 96, $pixels)
Wait-WinRtAction ($encoder.FlushAsync())

$stream.Seek(0)
$reader = New-Object $dataReaderType -ArgumentList $stream.GetInputStreamAt(0)
$byteCount = Wait-WinRtOperation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
$bytes = New-Object byte[] $byteCount
$reader.ReadBytes($bytes)

$directory = Split-Path -Parent $OutputPath
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
[System.IO.File]::WriteAllBytes($OutputPath, $bytes)
Write-Output "Wrote $byteCount HEIC bytes to $OutputPath"
