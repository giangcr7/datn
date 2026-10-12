# Diem vao duy nhat de chay local DiplomaChain.
# Fabric khong duoc tu dong khoi tao/deploy de tranh ghi de ledger hoac sai channel.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'start.ps1') @args
exit $LASTEXITCODE
