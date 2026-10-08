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

$bashPath = $null
$gitBashCandidates = @(
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files (x86)\Git\bin\bash.exe'
)
foreach ($candidate in $gitBashCandidates) {
    if (Test-Path $candidate) {
        $bashPath = $candidate
        break
    }
}

if ($null -eq $bashPath) {
    $bashCommand = Get-Command bash -ErrorAction SilentlyContinue
    if ($null -ne $bashCommand) {
        try {
            & $bashCommand.Source -lc 'command -v bash >/dev/null 2>&1'
            if ($LASTEXITCODE -eq 0) { $bashPath = $bashCommand.Source }
        }
        catch { $bashPath = $null }
    }
}

if ($null -eq $bashPath) {
    Write-Host 'Loi: can cai Git for Windows (Git Bash) de chay Fabric network.' -ForegroundColor Red
    Write-Host 'Tai tai: https://git-scm.com/download/win' -ForegroundColor Yellow
    exit 1
}

Write-Host '1/2 Kiem tra va khoi dong Fabric network...' -ForegroundColor Yellow
$fabricBin = Join-Path $projectRoot 'blockchain-network\bin\peer'
if (-not (Test-Path $fabricBin)) {
    Write-Host 'Loi: chua co Fabric binaries tai blockchain-network\bin.' -ForegroundColor Red
    Write-Host 'Hay cai Fabric binaries theo huong dan Hyperledger Fabric truoc khi chay lai.' -ForegroundColor Yellow
    Write-Host 'https://hyperledger-fabric.readthedocs.io/en/latest/install.html' -ForegroundColor Yellow
    exit 1
}

$fabricContainers = docker ps --filter 'name=peer0.org1.example.com' --format '{{.Names}}'
if ([string]::IsNullOrWhiteSpace(($fabricContainers -join ''))) {
    Push-Location 'blockchain-network'
    try {
        & $bashPath './network.sh' up createChannel -ca
        if ($LASTEXITCODE -ne 0) { throw 'Fabric network khoi dong that bai.' }
        & $bashPath './network.sh' deployCC -ccn educert -ccp ../chaincode -ccl typescript
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
