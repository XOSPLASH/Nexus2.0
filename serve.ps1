$port = 8080
$root = (Get-Location).Path
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix"
while ($true) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $path = $req.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
    $full = Join-Path $root $path
    if (Test-Path $full -PathType Leaf) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
            $ctype = 'text/plain'
            switch ($ext) {
                '.html' { $ctype = 'text/html' }
                '.css' { $ctype = 'text/css' }
                '.js' { $ctype = 'application/javascript' }
                '.svg' { $ctype = 'image/svg+xml' }
                '.json' { $ctype = 'application/json' }
                '.ico' { $ctype = 'image/x-icon' }
                '.png' { $ctype = 'image/png' }
                '.jpg' { $ctype = 'image/jpeg' }
            }
            $res.ContentType = $ctype
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes,0,$bytes.Length)
        } catch {
            $res.StatusCode = 500
            $err = [System.Text.Encoding]::UTF8.GetBytes('Internal Server Error')
            $res.ContentLength64 = $err.Length
            $res.OutputStream.Write($err,0,$err.Length)
        }
    } else {
        $res.StatusCode = 404
        $err = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $res.ContentLength64 = $err.Length
        $res.OutputStream.Write($err,0,$err.Length)
    }
    $res.OutputStream.Close()
}
