$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Step Up v4.7 Speed Up'

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$address = [System.Net.IPAddress]::Any
$preferredPort = 5500
$listener = $null
$port = $preferredPort
$statePath = Join-Path $root 'shared-data.json'

function Get-ContentType([string]$extension) {
    switch ($extension.ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8' }; '.htm' { 'text/html; charset=utf-8' }
        '.js' { 'text/javascript; charset=utf-8' }; '.css' { 'text/css; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }; '.txt' { 'text/plain; charset=utf-8' }
        '.svg' { 'image/svg+xml' }; '.png' { 'image/png' }; '.jpg' { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }; '.gif' { 'image/gif' }; '.webp' { 'image/webp' }
        '.ico' { 'image/x-icon' }; '.woff' { 'font/woff' }; '.woff2' { 'font/woff2' }
        default { 'application/octet-stream' }
    }
}

function Send-Response($stream,[int]$status,[string]$statusText,[string]$contentType,[byte[]]$body,[string]$cacheControl='no-store') {
    $header = "HTTP/1.1 $status $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: $cacheControl`r`nAccess-Control-Allow-Origin: *`r`nPermissions-Policy: microphone=(self)`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes,0,$headerBytes.Length)
    if ($body.Length -gt 0) { $stream.Write($body,0,$body.Length) }
    $stream.Flush()
}

function ConvertTo-Hashtable($value) {
    if ($null -eq $value) { return $null }
    if ($value -is [System.Collections.IDictionary]) {
        $result = @{}
        foreach ($key in $value.Keys) { $result[$key] = ConvertTo-Hashtable $value[$key] }
        return $result
    }
    if ($value -is [System.Management.Automation.PSCustomObject]) {
        $result = @{}
        foreach ($property in $value.PSObject.Properties) { $result[$property.Name] = ConvertTo-Hashtable $property.Value }
        return $result
    }
    if (($value -is [System.Collections.IEnumerable]) -and -not ($value -is [string])) {
        return @($value | ForEach-Object { ConvertTo-Hashtable $_ })
    }
    return $value
}

function Read-State {
    if (-not (Test-Path -LiteralPath $statePath)) { return @{ values = @{} } }
    try {
        $parsed = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $state = ConvertTo-Hashtable $parsed
        if (-not $state.ContainsKey('values')) { $state['values'] = @{} }
        return $state
    } catch { return @{ values = @{} } }
}

function Save-State($state) {
    $json = $state | ConvertTo-Json -Depth 8 -Compress
    [System.IO.File]::WriteAllText($statePath,$json,[System.Text.UTF8Encoding]::new($false))
}

function Read-HttpRequest($stream) {
    # Read the header as raw bytes. This avoids the old UTF-8 Content-Length
    # mismatch that could make Japanese sync data wait for 15 seconds.
    $headerBuffer = New-Object System.Collections.Generic.List[byte]
    $matched = 0
    $marker = [byte[]](13,10,13,10)
    while ($headerBuffer.Count -lt 32768) {
        $b = $stream.ReadByte()
        if ($b -lt 0) { break }
        $headerBuffer.Add([byte]$b)
        if ($b -eq $marker[$matched]) {
            $matched++
            if ($matched -eq 4) { break }
        } else {
            $matched = $(if ($b -eq 13) { 1 } else { 0 })
        }
    }
    if ($headerBuffer.Count -eq 0 -or $matched -ne 4) { return $null }

    $headerText = [System.Text.Encoding]::ASCII.GetString($headerBuffer.ToArray())
    $lines = $headerText -split "`r`n"
    $requestLine = $lines[0]
    $headers = @{}
    for ($i=1; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if ([string]::IsNullOrEmpty($line)) { continue }
        $idx = $line.IndexOf(':')
        if ($idx -gt 0) { $headers[$line.Substring(0,$idx).Trim().ToLowerInvariant()] = $line.Substring($idx+1).Trim() }
    }
    $length = 0
    if ($headers.ContainsKey('content-length')) { [void][int]::TryParse($headers['content-length'],[ref]$length) }
    $body = New-Object byte[] $length
    $read = 0
    while ($read -lt $length) {
        $n = $stream.Read($body,$read,$length-$read)
        if ($n -le 0) { break }
        $read += $n
    }
    return @{ RequestLine=$requestLine; Headers=$headers; Body=$body; BodyLength=$read }
}

function Get-LanIPv4 {
    try {
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
            Where-Object { $_.NextHop -ne '0.0.0.0' } |
            Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
        if ($route) {
            $ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction Stop |
                Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1
            if ($ip) { return $ip.IPAddress }
        }
    } catch { }
    try {
        $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' -and -not $_.IPAddressToString.StartsWith('169.254.') -and $_.IPAddressToString -ne '127.0.0.1' }
        return ($ips | Select-Object -First 1).IPAddressToString
    } catch { return $null }
}

function Start-StepUpBrowser([string]$url) {
    $chromeCandidates=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
    foreach($chrome in $chromeCandidates){if($chrome -and (Test-Path -LiteralPath $chrome)){Start-Process -FilePath $chrome -ArgumentList $url;return}}
    Start-Process $url
}

# Cache the small static application files in memory once at startup.
$staticCache = @{}
Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object {
    $_.Name -ne 'shared-data.json' -and $_.Extension.ToLowerInvariant() -in @('.html','.js','.css','.json','.txt','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.woff','.woff2')
} | ForEach-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart([char]'\',[char]'/').Replace('\','/')
    $staticCache[$relative] = @{ Body=[System.IO.File]::ReadAllBytes($_.FullName); Type=Get-ContentType $_.Extension }
}

try {
    foreach($candidate in $preferredPort..5510){
        try{$candidateListener=[System.Net.Sockets.TcpListener]::new($address,$candidate);$candidateListener.Start(50);$listener=$candidateListener;$port=$candidate;break}
        catch{if($candidateListener){$candidateListener.Stop()}}
    }
    if(-not $listener){throw 'Ports 5500 through 5510 are already in use.'}
    $localUrl="http://127.0.0.1:$port/"; $lanIp=Get-LanIPv4
    Write-Host "Step Up is running: $localUrl" -ForegroundColor Green
    if($lanIp){Write-Host "Smartphone / tablet: http://${lanIp}:$port/" -ForegroundColor Cyan}
    Write-Host 'Speed mode is ON. Keep this window open. Press Ctrl+C to stop.'
    Write-Host ''
    Start-StepUpBrowser $localUrl

    while($true){
        $client=$listener.AcceptTcpClient()
        $stream=$null
        $client.NoDelay=$true
        $client.ReceiveTimeout=2000
        $client.SendTimeout=5000
        try{
            $stream=$client.GetStream()
            $request=Read-HttpRequest $stream
            if($null -eq $request){continue}
            $parts=$request.RequestLine.Split(' ')
            if($parts.Length -lt 2){continue}
            $method=$parts[0]; $rawPath=$parts[1].Split('?')[0]

            if($rawPath -eq '/health'){
                Send-Response $stream 200 'OK' 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('Step Up LAN OK')) 'no-store'; continue
            }
            if($rawPath -eq '/api/state'){
                if($method -eq 'GET'){
                    $json=(Read-State)|ConvertTo-Json -Depth 8 -Compress
                    Send-Response $stream 200 'OK' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) 'no-store'; continue
                }
                if($method -eq 'POST'){
                    $jsonText=[Text.Encoding]::UTF8.GetString($request.Body,0,$request.BodyLength)
                    $payload=ConvertTo-Hashtable ($jsonText | ConvertFrom-Json)
                    $state=Read-State
                    if(-not $state.ContainsKey('values')){$state['values']=@{}}
                    if($payload -and $payload.ContainsKey('values')){
                        foreach($key in $payload['values'].Keys){
                            $incoming=$payload['values'][$key]; $existing=$state['values'][$key]
                            if(-not $existing -or [double]$incoming['updatedAt'] -ge [double]$existing['updatedAt']){$state['values'][$key]=$incoming}
                        }
                    }
                    Save-State $state
                    Send-Response $stream 200 'OK' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('{"ok":true}')) 'no-store'; continue
                }
                Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('Method Not Allowed')); continue
            }
            if($method -ne 'GET'){Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('Method Not Allowed'));continue}

            $decoded=[Uri]::UnescapeDataString($rawPath).TrimStart('/')
            if([string]::IsNullOrWhiteSpace($decoded)){$decoded='index.html'}
            $decoded=$decoded.Replace('\','/')
            if($decoded.Contains('..')){Send-Response $stream 403 'Forbidden' 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('Forbidden'));continue}
            if($staticCache.ContainsKey($decoded)){
                $item=$staticCache[$decoded]
                $cache=$(if($decoded -eq 'index.html'){'no-cache'}else{'public, max-age=3600'})
                Send-Response $stream 200 'OK' $item.Type $item.Body $cache
            } else {
                Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('404 Not Found'))
            }
        }catch{Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor Yellow}
        finally{if($stream){$stream.Dispose()};$client.Close()}
    }
}catch{Write-Host '';Write-Host "Startup error: $($_.Exception.Message)" -ForegroundColor Red;exit 1}
finally{if($listener){$listener.Stop()}}
