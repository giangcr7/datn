$ErrorActionPreference = 'Stop'
$containers = @('orderer.example.com', 'peer0.org1.example.com', 'peer0.org2.example.com')
$states = @(docker inspect --format '{{.Name}}|{{.State.Running}}' @containers)
if ($LASTEXITCODE -ne 0 -or $states.Count -ne $containers.Count) {
    throw 'Thieu container Fabric. Khong tu tao/reset ledger; xem docs/database/luong-ha-noi-blockchain.md.'
}
$stopped = @($states | Where-Object { $_ -notmatch '\|true$' } | ForEach-Object { ($_ -split '\|')[0].TrimStart('/') })
if (-not $stopped.Count) {
    Write-Host 'Fabric da chay; khong can start lai. Khong deploy chaincode, khong xoa volume.' -ForegroundColor Green
    return
}
docker start @stopped
if ($LASTEXITCODE -ne 0) { throw 'Khong khoi dong duoc Fabric hien co.' }
$states = @(docker inspect --format '{{.Name}}|{{.State.Running}}' @containers)
if ($LASTEXITCODE -ne 0 -or $states.Count -ne $containers.Count -or ($states | Where-Object { $_ -notmatch '\|true$' })) {
    throw 'Fabric container chua chay.'
}
Write-Host 'Da khoi dong ledger hien co. Khong deploy chaincode, khong xoa volume.' -ForegroundColor Green
