Add-Type -AssemblyName System.Net.Http

function Get-LocalStartupLogTail {
    param([string[]]$LogPaths)
    $lines = foreach ($path in $LogPaths) {
        if (Test-Path -LiteralPath $path) {
            $tail = @(Get-Content -LiteralPath $path -Encoding UTF8 -Tail 15 -ErrorAction SilentlyContinue)
            if ($tail.Count) {
                "--- $path ---"
                $tail -replace '\x1B\[[0-?]*[ -/]*[@-~]', ''
            }
        }
    }
    return ($lines -join [Environment]::NewLine)
}

function Invoke-LocalHealthProbe {
    param([string]$Url, [int]$TimeoutSeconds)
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
    $client.MaxResponseContentBufferSize = 4 * 1024 * 1024
    $response = $null
    try {
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $detail = "HTTP $([int]$response.StatusCode) $body"
        if ($detail.Length -gt 1500) { $detail = $detail.Substring(0, 1500) }
        return @{ Ready = [int]$response.StatusCode -eq 200; Detail = $detail }
    }
    catch {
        $error = $_.Exception
        while ($error.InnerException) { $error = $error.InnerException }
        return @{ Ready = $false; Detail = $error.Message }
    }
    finally {
        if ($response) { $response.Dispose() }
        $client.Dispose()
    }
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [System.Diagnostics.Process]$Process,
        [ValidateRange(1, 1800)][int]$TimeoutSeconds = 300,
        [string[]]$LogPaths = @()
    )
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $lastFailure = 'Chua nhan duoc phan hoi HTTP'
    $nextReport = 15
    while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $Process.Refresh()
        if ($Process.HasExited) {
            $tail = Get-LocalStartupLogTail -LogPaths $LogPaths
            throw "Tien trinh da dung (exit $($Process.ExitCode)) truoc khi san sang: $Url. $tail"
        }
        $remaining = [Math]::Ceiling($TimeoutSeconds - $timer.Elapsed.TotalSeconds)
        $probe = Invoke-LocalHealthProbe -Url $Url -TimeoutSeconds ([Math]::Max(1, [Math]::Min(15, $remaining)))
        if ($probe.Ready) {
            Write-Host ("Da san sang sau {0:N1}s: {1}" -f $timer.Elapsed.TotalSeconds, $Url) -ForegroundColor Green
            return
        }
        $lastFailure = $probe.Detail
        if ($timer.Elapsed.TotalSeconds -ge $nextReport) {
            Write-Host ("Dang cho {0}: {1:N0}/{2}s. {3}" -f $Url, $timer.Elapsed.TotalSeconds, $TimeoutSeconds, $lastFailure) -ForegroundColor DarkYellow
            $nextReport = $timer.Elapsed.TotalSeconds + 15
        }
        Start-Sleep -Seconds 1
    }
    $tail = Get-LocalStartupLogTail -LogPaths $LogPaths
    throw "Het thoi gian cho $Url sau $TimeoutSeconds giay. Trang thai cuoi: $lastFailure. Log: $($LogPaths -join ', '). $tail"
}

function Get-LocalBuildStamp {
    param([string]$ArtifactPath, [string[]]$SourcePaths)
    $files = foreach ($path in $SourcePaths) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $item = Get-Item -LiteralPath $path
        if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $path -File -Recurse } else { $item }
    }
    $files = @($files | Where-Object { $_.Name -notmatch '\.(spec|test)\.[cm]?[jt]sx?$' } | Sort-Object FullName -Unique)
    $records = @($files | ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" })
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($records -join [char]10)))) }
    finally { $sha.Dispose() }
    $artifact = Get-Item -LiteralPath $ArtifactPath
    return @{
        Inputs = $hash
        ArtifactTicks = $artifact.LastWriteTimeUtc.Ticks
        NewestSourceTicks = ($files | ForEach-Object { $_.LastWriteTimeUtc.Ticks } | Measure-Object -Maximum).Maximum
    }
}

function Test-LocalBuildRequired {
    param([string]$ArtifactPath, [string[]]$SourcePaths, [string]$CachePath)
    if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) { return $true }
    $stamp = Get-LocalBuildStamp -ArtifactPath $ArtifactPath -SourcePaths $SourcePaths
    if ($CachePath -and (Test-Path -LiteralPath $CachePath)) {
        try {
            $cached = Get-Content -LiteralPath $CachePath -Raw | ConvertFrom-Json
            return $cached.Inputs -ne $stamp.Inputs -or $cached.ArtifactTicks -ne $stamp.ArtifactTicks
        }
        catch { return $true }
    }
    return $stamp.NewestSourceTicks -gt $stamp.ArtifactTicks
}

function Save-LocalBuildStamp {
    param([string]$ArtifactPath, [string[]]$SourcePaths, [string]$CachePath)
    $stamp = Get-LocalBuildStamp -ArtifactPath $ArtifactPath -SourcePaths $SourcePaths
    $parent = Split-Path -Parent $CachePath
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $stamp | ConvertTo-Json | Set-Content -LiteralPath $CachePath -Encoding UTF8
}
