param([int]$Port = 8080)

$ErrorActionPreference = 'SilentlyContinue'

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Server started at $prefix"

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $reqPath = $context.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrEmpty($reqPath)) { $reqPath = 'index.html' }

    $fullPath = Join-Path -Path (Get-Location) -ChildPath $reqPath

    if (Test-Path $fullPath) {
      try {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $ext = [IO.Path]::GetExtension($fullPath)
        switch ($ext) {
          '.html' { $ctype = 'text/html' }
          '.js'   { $ctype = 'text/javascript' }
          '.css'  { $ctype = 'text/css' }
          '.svg'  { $ctype = 'image/svg+xml' }
          default { $ctype = 'application/octet-stream' }
        }
        $context.Response.ContentType = $ctype
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } catch {
        $context.Response.StatusCode = 500
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Internal Server Error')
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } else {
      $context.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    }

    $context.Response.Close()
  } catch {
    Start-Sleep -Milliseconds 10
  }
}