# Script khoi dong toan bo he thong DiplomaChain tren Windows
Write-Host "=== KHOI DONG HE THONG VAN BANG BLOCKCHAIN (DIPLOMACHAIN) ===" -ForegroundColor Cyan

# 1. Khoi dong MongoDB Local
Write-Host ">>> 1. Khoi dong MongoDB Database (Port 27017)..." -ForegroundColor Yellow
$mongoListening = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if ($null -eq $mongoListening) {
    $mongoProc = Start-Process -FilePath "node.exe" -ArgumentList "scripts/start-mongo.js" -PassThru -NoNewWindow
} else {
    Write-Host ">>> MongoDB da dang chay, bo qua khoi dong lai." -ForegroundColor DarkGray
    $mongoProc = $null
}

Start-Sleep -Seconds 3

# 2. Khoi dong NestJS Backend
Write-Host ">>> 2. Khoi dong NestJS API Backend (Port 3001)..." -ForegroundColor Yellow
$apiProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run start:dev --workspace=api" -PassThru -NoNewWindow

Start-Sleep -Seconds 4

# 3. Khoi dong Next.js Frontend
Write-Host ">>> 3. Khoi dong Next.js Frontend (Port 3000)..." -ForegroundColor Yellow
$webProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev --workspace=@diploma-chain/web" -PassThru -NoNewWindow

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   HE THONG DIPLOMACHAIN DA DUOC KHOI DONG THANH CONG!    " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Frontend (Giao dien web) : http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend API              : http://localhost:3001" -ForegroundColor Cyan
Write-Host "Swagger API Docs         : http://localhost:3001/docs" -ForegroundColor Cyan
Write-Host "MongoDB Server           : mongodb://127.0.0.1:27017/diplomachain" -ForegroundColor Cyan
Write-Host ""
Write-Host "--- TAI KHOAN MAU CO SAN DE DANG NHAP ---" -ForegroundColor Yellow
Write-Host "1. Quan tri vien (Admin)  : admin@example.com      / Admin@123"
Write-Host "2. Nha truong (University): university@example.com / Univ@123"
Write-Host "3. Sinh vien (Student)    : student@example.com    / Student@123 (MSSV: 2151060001)"
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Nhan Enter hoac dong cua so nay de dung cac service."

Read-Host

if ($null -ne $mongoProc) { Stop-Process -Id $mongoProc.Id -ErrorAction SilentlyContinue }
if ($null -ne $apiProc) { Stop-Process -Id $apiProc.Id -ErrorAction SilentlyContinue }
if ($null -ne $webProc) { Stop-Process -Id $webProc.Id -ErrorAction SilentlyContinue }
Write-Host "Da dung tat ca cac tien trinh." -ForegroundColor Yellow
