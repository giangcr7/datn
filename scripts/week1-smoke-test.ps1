param(
    [string]$WebUrl = "http://localhost:3000",
    [string]$ApiUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Continue"
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            Write-Host "[PASS] $Name - HTTP $($response.StatusCode)" -ForegroundColor Green
            return
        }

        Write-Host "[FAIL] $Name - HTTP $($response.StatusCode)" -ForegroundColor Red
        $script:failed++
    }
    catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "DiplomaChain - Week 1 smoke test" -ForegroundColor Cyan

try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[PASS] Docker daemon" -ForegroundColor Green
    }
    else {
        throw "docker info returned exit code $LASTEXITCODE"
    }
}
catch {
    Write-Host "[FAIL] Docker daemon - not available" -ForegroundColor Red
    $failed++
}

Test-Endpoint -Name "Frontend" -Url $WebUrl
Test-Endpoint -Name "API root" -Url "$ApiUrl/api"
Test-Endpoint -Name "Health endpoint" -Url "$ApiUrl/api/health"
Test-Endpoint -Name "Swagger" -Url "$ApiUrl/docs"

if ($failed -gt 0) {
    Write-Host "Smoke test failed: $failed check(s)." -ForegroundColor Red
    exit 1
}

Write-Host "All smoke checks passed." -ForegroundColor Green
exit 0
