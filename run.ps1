# Chay toan bo DiplomaChain bang mot lenh duy nhat.
# Su dung: powershell -ExecutionPolicy Bypass -File .\run.ps1

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host '=== DIPLOMACHAIN - KHOI DONG TOAN BO HE THONG ===' -ForegroundColor Cyan

try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Engine chua san sang.' }
}
catch {
    Write-Host 'Loi: hay mo Docker Desktop va cho Docker Engine san sang truoc.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path 'blockchain-network\network.sh')) {
    Write-Host 'Loi: khong tim thay blockchain-network\network.sh.' -ForegroundColor Red
    exit 1
}

$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($null -eq $bash) {
    Write-Host 'Loi: can Git Bash hoac WSL de chay Fabric network.sh.' -ForegroundColor Red
    exit 1
}

Write-Host '1/2 Kiem tra va khoi dong Fabric network...' -ForegroundColor Yellow
$fabricContainers = docker ps --filter 'name=peer0.org1.example.com' --format '{{.Names}}'
if ([string]::IsNullOrWhiteSpace(($fabricContainers -join ''))) {
    Push-Location 'blockchain-network'
    try {
        & $bash.Source './network.sh' up createChannel -ca
        if ($LASTEXITCODE -ne 0) { throw 'Fabric network khoi dong that bai.' }
        & $bash.Source './network.sh' deployCC -ccn educert -ccp ../chaincode -ccl typescript
        if ($LASTEXITCODE -ne 0) { throw 'Deploy chaincode that bai.' }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host 'Fabric network dang chay, bo qua buoc khoi dong.' -ForegroundColor DarkGray
}

Write-Host '2/2 Khoi dong MongoDB, API va frontend...' -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'start.ps1')
