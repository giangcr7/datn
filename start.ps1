param(
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host '=== DIPLOMACHAIN - POSTGRESQL / API / WEB ===' -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Docker CLI.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Node.js/npm.' }
if (-not (Test-Path '.env.infrastructure')) { throw 'Thieu .env.infrastructure. Hay copy .env.infrastructure.example va dien secret.' }
if (-not (Test-Path 'apps/api/.env.database')) { throw 'Thieu apps/api/.env.database. Dien DIRECT_DATABASE_URL bang role migrator.' }
if (-not (Test-Path 'apps/api/.env')) { throw 'Thieu apps/api/.env. Hay copy apps/api/.env.example va dien DATABASE_URL/JWT_SECRET.' }

Write-Host '>>> Kiem tra Docker Engine...' -ForegroundColor Yellow
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Engine chua san sang.' }

Write-Host '>>> Khoi dong PostgreSQL...' -ForegroundColor Yellow
docker compose --env-file .env.infrastructure -f compose.database.yaml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Khong khoi dong duoc PostgreSQL.' }

Write-Host '>>> Generate Prisma, migrate va seed...' -ForegroundColor Yellow
npm run db:generate -w api
if ($LASTEXITCODE -ne 0) { throw 'Prisma generate that bai.' }
npm run db:migrate -w api
if ($LASTEXITCODE -ne 0) { throw 'Prisma migrate that bai.' }
npm run db:seed -w api
if ($LASTEXITCODE -ne 0) { throw 'Prisma seed that bai.' }

if ($CheckOnly) {
    Write-Host 'Kiem tra database hoan tat; khong khoi dong API/Web.' -ForegroundColor Green
    exit 0
}

$logDirectory = Join-Path $projectRoot '.data\logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$apiOut = Join-Path $logDirectory 'api.out.log'
$apiErr = Join-Path $logDirectory 'api.err.log'
$webOut = Join-Path $logDirectory 'web.out.log'
$webErr = Join-Path $logDirectory 'web.err.log'

Write-Host '>>> Khoi dong API (log trong .data\logs)...' -ForegroundColor Yellow
$apiProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'start:dev', '-w', 'api') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
Start-Sleep -Seconds 4

Write-Host '>>> Khoi dong Web (log trong .data\logs)...' -ForegroundColor Yellow
$webProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '-w', '@diploma-chain/web') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr -PassThru

Write-Host ''
Write-Host '==========================================================' -ForegroundColor Green
Write-Host ' PostgreSQL, API va Web da duoc khoi dong.' -ForegroundColor Green
Write-Host ' Frontend : http://localhost:3000' -ForegroundColor Cyan
Write-Host ' API      : http://localhost:3001' -ForegroundColor Cyan
Write-Host ' Swagger  : http://localhost:3001/docs' -ForegroundColor Cyan
Write-Host ' Fabric   : khong tu dong deploy; chi bat khi da review cutover.' -ForegroundColor Yellow
Write-Host '==========================================================' -ForegroundColor Green
Write-Host 'Nhan Enter de dung API/Web.' -ForegroundColor DarkGray

try {
    Read-Host | Out-Null
}
finally {
    foreach ($process in @($apiProc, $webProc)) {
        if ($null -ne $process -and -not $process.HasExited) {
            taskkill.exe /PID $process.Id /T /F *> $null
        }
    }
}
