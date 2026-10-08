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
$env:MSYS_NO_PATHCONV = '1'
$env:MSYS2_ARG_CONV_EXCL = '*'
$fabricBin = Join-Path $projectRoot 'bin\peer.exe'
if (-not (Test-Path $fabricBin)) {
    Write-Host 'Chua co Fabric binaries. Dang tu dong tai Fabric binaries...' -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
        $installCommand = 'curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh && bash install-fabric.sh binary'
        & $bashPath -lc $installCommand
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'bin\peer.exe')) {
            throw 'Khong tai duoc Fabric binaries.'
        }
    }
    finally {
        Pop-Location
    }
}

$fabricSupportFiles = @(
    @('blockchain-network\organizations\fabric-ca\registerEnroll.sh', 'https://raw.githubusercontent.com/hyperledger/fabric-samples/main/test-network/organizations/fabric-ca/registerEnroll.sh'),
    @('blockchain-network\organizations\ccp-generate.sh', 'https://raw.githubusercontent.com/hyperledger/fabric-samples/main/test-network/organizations/ccp-generate.sh'),
    @('blockchain-network\organizations\ccp-template.json', 'https://raw.githubusercontent.com/hyperledger/fabric-samples/main/test-network/organizations/ccp-template.json'),
    @('blockchain-network\organizations\ccp-template.yaml', 'https://raw.githubusercontent.com/hyperledger/fabric-samples/main/test-network/organizations/ccp-template.yaml')
)
foreach ($supportFile in $fabricSupportFiles) {
    $target = Join-Path $projectRoot $supportFile[0]
    if (-not (Test-Path $target)) {
        Write-Host "Dang bo sung file Fabric: $($supportFile[0])" -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
        Invoke-WebRequest -Uri $supportFile[1] -OutFile $target
        if (-not (Test-Path $target)) {
            throw "Khong tai duoc file Fabric ho tro: $($supportFile[0])"
        }
    }
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
