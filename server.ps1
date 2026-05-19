$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 8000)
$listener.Start()

Write-Output "Serving $root at http://0.0.0.0:8000/"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
}

function Get-ResponseBytes([string]$requestPath) {
  if ([string]::IsNullOrWhiteSpace($requestPath) -or $requestPath -eq "/") {
    $requestPath = "/index.html"
  }

  $cleanPath = [System.Uri]::UnescapeDataString($requestPath.TrimStart('/')) -replace '/', '\'
  $fullPath = Join-Path $root $cleanPath

  if ((Test-Path $fullPath) -and -not (Get-Item $fullPath).PSIsContainer) {
    $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    $body = [System.IO.File]::ReadAllBytes($fullPath)
    $type = $contentTypes[$extension]
    if (-not $type) {
      $type = "application/octet-stream"
    }
    $headers = @(
      "HTTP/1.1 200 OK",
      "Content-Type: $type",
      "Content-Length: $($body.Length)",
      "Connection: close",
      "",
      ""
    ) -join "`r`n"
    return ,([System.Text.Encoding]::ASCII.GetBytes($headers) + $body)
  }

  $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
  $headers = @(
    "HTTP/1.1 404 Not Found",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Length: $($notFound.Length)",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"
  return ,([System.Text.Encoding]::ASCII.GetBytes($headers) + $notFound)
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      while ($reader.Peek() -ge 0) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
          break
        }
      }

      if ($requestLine) {
        $parts = $requestLine.Split(" ")
        $path = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
        $responseBytes = Get-ResponseBytes $path
        $stream.Write($responseBytes, 0, $responseBytes.Length)
      }

      $stream.Flush()
      $reader.Dispose()
      $stream.Dispose()
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
