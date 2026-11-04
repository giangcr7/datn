param([ValidateSet('Create', 'Verify', 'RecoverWallet')][string]$Action = 'Create', [string]$Backup, [string]$Wallet = 'wallet/issuer-org1.json')
$ErrorActionPreference = 'Stop'
$password = Read-Host 'Backup passphrase (at least 20 UTF-8 bytes; store separately)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([Text.Encoding]::UTF8.GetByteCount($plain) -lt 20) { throw 'Passphrase too short' }
    $request = @{ password = $plain } | ConvertTo-Json -Compress
    $OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    $script = Join-Path $PSScriptRoot 'manage-keys.mjs'
    if ($Action -eq 'Create') { $request | & node $script backup-portable --apply }
    elseif ($Action -eq 'Verify') {
        if (-not $Backup) { throw '-Backup is required' }
        $request | & node $script verify-backup --backup $Backup --password-stdin
    } else {
        if (-not $Backup) { throw '-Backup is required' }
        $request | & node $script recover-wallet --backup $Backup --wallet $Wallet --password-stdin --apply
    }
    if ($LASTEXITCODE -ne 0) { throw 'Backup operation failed' }
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plain = $null
    $request = $null
    $password.Dispose()
}
