param(
    [switch]$CheckOnly,
    [switch]$Dev,
    [switch]$Setup,
    [switch]$Rebuild,
    [ValidateRange(30, 1800)][int]$StartupTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$startupTimer = [System.Diagnostics.Stopwatch]::StartNew()

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot
. (Join-Path $projectRoot 'scripts\lib\local-startup.ps1')

Write-Host '=== DIPLOMACHAIN - POSTGRESQL / API / WEB ===' -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Docker CLI.' }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Node.js.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Node.js/npm.' }
if (-not (Test-Path '.env.infrastructure')) { throw 'Thieu .env.infrastructure. Hay copy .env.infrastructure.example va dien secret.' }
if (-not (Test-Path 'apps/api/.env.database')) { throw 'Thieu apps/api/.env.database. Dien DIRECT_DATABASE_URL bang role migrator.' }
if (-not (Test-Path 'apps/api/.env')) { throw 'Thieu apps/api/.env. Hay copy apps/api/.env.example va dien DATABASE_URL/JWT_SECRET.' }

if (-not $CheckOnly) {
    foreach ($port in @(3000, 3001)) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            throw "Cong $port dang duoc su dung. Hay dung dung phien project cu truoc khi chay lai."
        }
    }
}

Write-Host '>>> Kiem tra Docker Engine...' -ForegroundColor Yellow
docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Engine chua san sang.' }

if (Select-String -LiteralPath 'apps/api/.env' -Pattern '^\s*FABRIC_ENABLED\s*=\s*true\s*$' -Quiet) {
    Write-Host '>>> Khoi dong Fabric hien co (khong reset ledger)...' -ForegroundColor Yellow
    & (Join-Path $projectRoot 'scripts\start-fabric-local.ps1')
}

Write-Host '>>> Khoi dong PostgreSQL...' -ForegroundColor Yellow
docker compose --env-file .env.infrastructure -f compose.database.yaml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Khong khoi dong duoc PostgreSQL.' }

if ($Setup -or $CheckOnly) {
    Write-Host '>>> Chuan bi database theo yeu cau: generate, migrate va seed...' -ForegroundColor Yellow
    npm run db:generate -w api
    if ($LASTEXITCODE -ne 0) { throw 'Prisma generate that bai.' }
    npm run db:migrate -w api
    if ($LASTEXITCODE -ne 0) { throw 'Prisma migrate that bai.' }
    npm run db:seed -w api
    if ($LASTEXITCODE -ne 0) { throw 'Prisma seed that bai.' }
}
else {
    node scripts/check-local-setup.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Database can kiem tra/chuan bi. Xem thong bao phia tren.' }
}

if ($CheckOnly) {
    Write-Host 'Kiem tra database hoan tat; khong khoi dong API/Web.' -ForegroundColor Green
    exit 0
}
if (-not (Test-Path 'apps/api/src/generated/prisma/client.ts')) {
    throw 'Thieu Prisma Client. Chay .\start.ps1 -Setup truoc.'
}
if ((Get-Item 'apps/api/prisma/schema.prisma').LastWriteTimeUtc -gt (Get-Item 'apps/api/src/generated/prisma/client.ts').LastWriteTimeUtc) {
    throw 'Prisma Client chua cap nhat theo schema. Chay .\start.ps1 -Setup truoc.'
}

if (-not $Dev) {
    $commonSources = @('package.json', 'package-lock.json', 'packages/shared')
    $apiSources = @('apps/api/src', 'apps/api/assets', 'apps/api/prisma/schema.prisma', 'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/tsconfig.build.json', 'apps/api/nest-cli.json') + $commonSources
    if ($Rebuild -or (Test-LocalBuildRequired -ArtifactPath 'apps/api/dist/main.js' -SourcePaths $apiSources -CachePath '.data/startup/api-build.json')) {
        Write-Host '>>> API co thay doi/chua build; dang build mot lan...' -ForegroundColor Yellow
        npm exec -w api -- nest build
        if ($LASTEXITCODE -ne 0) { throw 'Build API that bai. Xem loi bien dich phia tren; API chua duoc khoi dong.' }
    }
    else { Write-Host '>>> API khong doi; dung ban build hien co.' -ForegroundColor DarkGray }
    Save-LocalBuildStamp -ArtifactPath 'apps/api/dist/main.js' -SourcePaths $apiSources -CachePath '.data/startup/api-build.json'
    $webSources = @('apps/web/src', 'apps/web/public', 'apps/web/.env', 'apps/web/.env.local', 'apps/web/.env.production', 'apps/web/.env.production.local', 'apps/web/next.config.js', 'apps/web/tsconfig.json', 'apps/web/package.json', 'apps/web/postcss.config.mjs') + $commonSources
    if ($Rebuild -or (Test-LocalBuildRequired -ArtifactPath 'apps/web/.next/BUILD_ID' -SourcePaths $webSources -CachePath '.data/startup/web-build.json')) {
        Write-Host '>>> Web co thay doi/chua build; dang build mot lan...' -ForegroundColor Yellow
        npm run build -w @diploma-chain/web
        if ($LASTEXITCODE -ne 0) { throw 'Build Web that bai. Xem loi bien dich phia tren; Web chua duoc khoi dong.' }
    }
    else { Write-Host '>>> Web khong doi; dung ban build hien co.' -ForegroundColor DarkGray }
    Save-LocalBuildStamp -ArtifactPath 'apps/web/.next/BUILD_ID' -SourcePaths $webSources -CachePath '.data/startup/web-build.json'
}

$nodePath = (Get-Command node.exe).Source
$nextCli = & node -p "require.resolve('next/dist/bin/next')"
if ($LASTEXITCODE -ne 0) { throw 'Thieu Next.js; chay npm ci tai thu muc project.' }
if ($Dev) {
    $nestCli = & node -p "require.resolve('@nestjs/cli/bin/nest.js', {paths:['./apps/api']})"
    if ($LASTEXITCODE -ne 0) { throw 'Thieu Nest CLI; chay npm ci tai thu muc project.' }
}

$logDirectory = Join-Path $projectRoot '.data\logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$apiOut = Join-Path $logDirectory 'api.out.log'
$apiErr = Join-Path $logDirectory 'api.err.log'
$webOut = Join-Path $logDirectory 'web.out.log'
$webErr = Join-Path $logDirectory 'web.err.log'

$apiProc = $null
$webProc = $null
$pkiProc = $null
try {
    $apiEnvironment = Get-Content -LiteralPath 'apps/api/.env' -Raw
    if ($apiEnvironment -match '(?m)^PDF_SIGNING_MODE=demo\r?$' -and
        $apiEnvironment -match '(?m)^PDF_PKI_ENABLED=true\r?$' -and
        $apiEnvironment -match '(?m)^PDF_TSA_URL=http://127\.0\.0\.1:3318/tsa\r?$') {
        Write-Host '>>> Khoi dong TSA/OCSP/CRL DEMO (khong phai CA cong cong)...' -ForegroundColor Yellow
        if (Get-NetTCPConnection -LocalPort 3318 -State Listen -ErrorAction SilentlyContinue) {
            $pkiHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:3318/health' -TimeoutSec 3
            if ($pkiHealth.mode -ne 'DEMO_ONLY') { throw 'Cong 3318 khong phai dich vu PKI DEMO.' }
        }
        else {
            $pkiProc = Start-Process -FilePath $nodePath -ArgumentList @('scripts/setup-pdf-pki.mjs', '--serve') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'pki.out.log') -RedirectStandardError (Join-Path $logDirectory 'pki.err.log') -PassThru
            Wait-HttpReady -Url 'http://127.0.0.1:3318/health' -Process $pkiProc -TimeoutSeconds $StartupTimeoutSeconds -LogPaths @((Join-Path $logDirectory 'pki.err.log'), (Join-Path $logDirectory 'pki.out.log'))
        }
    }
    Write-Host '>>> Khoi dong API (log trong .data\logs)...' -ForegroundColor Yellow
    $apiArguments = @('dist/main.js')
    if ($Dev) { $apiArguments = @(('"' + $nestCli + '"'), 'start', '--watch') }
    $apiProc = Start-Process -FilePath $nodePath -ArgumentList $apiArguments -WorkingDirectory (Join-Path $projectRoot 'apps\api') -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
    Write-Host '>>> Khoi dong Web (log trong .data\logs)...' -ForegroundColor Yellow
    $webMode = if ($Dev) { 'dev' } else { 'start' }
    $webProc = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $nextCli + '"'), $webMode, '--port', '3000') -WorkingDirectory (Join-Path $projectRoot 'apps\web') -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr -PassThru
    Wait-HttpReady -Url 'http://127.0.0.1:3001/api/health' -Process $apiProc -TimeoutSeconds $StartupTimeoutSeconds -LogPaths @($apiErr, $apiOut)
    Wait-HttpReady -Url 'http://127.0.0.1:3000/login' -Process $webProc -TimeoutSeconds $StartupTimeoutSeconds -LogPaths @($webErr, $webOut)

    Write-Host ''
    Write-Host '==========================================================' -ForegroundColor Green
    Write-Host (' PostgreSQL, API va Web da san sang sau {0:N1} giay.' -f $startupTimer.Elapsed.TotalSeconds) -ForegroundColor Green
    Write-Host ' Frontend : http://localhost:3000' -ForegroundColor Cyan
    Write-Host ' API      : http://localhost:3001' -ForegroundColor Cyan
    Write-Host ' Swagger  : http://localhost:3001/docs' -ForegroundColor Cyan
    Write-Host ' Fabric   : theo apps/api/.env; chi start ledger hien co, khong tu deploy.' -ForegroundColor Yellow
    Write-Host '==========================================================' -ForegroundColor Green
    Write-Host 'Nhan Enter de dung API/Web.' -ForegroundColor DarkGray

    Read-Host | Out-Null
}
finally {
    foreach ($process in @($apiProc, $webProc, $pkiProc)) {
        if ($null -ne $process -and -not $process.HasExited) {
            taskkill.exe /PID $process.Id /T /F *> $null
        }
    }
}
