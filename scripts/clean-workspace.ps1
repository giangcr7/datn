[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Builds
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $projectRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$comparison = [StringComparison]::OrdinalIgnoreCase

function Get-CheckedCleanupPath {
    param([string]$RelativePath)

    $absolute = [IO.Path]::GetFullPath((Join-Path $projectRoot $RelativePath))
    if (-not $absolute.StartsWith($rootPrefix, $comparison)) {
        throw "Cleanup target is outside the workspace: $RelativePath"
    }
    $current = $absolute
    while ($current -ne $projectRoot) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Cleanup refuses links or junctions: $RelativePath"
            }
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
    return $absolute
}

function Get-CleanupFiles {
    param([string]$Path)

    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Cleanup refuses links or junctions: $Path"
    }
    if (-not $item.PSIsContainer) {
        $item
        return
    }
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force) {
        Get-CleanupFiles -Path $child.FullName
    }
}

$targets = @(
    'tmp',
    '.cache',
    '.turbo',
    '.docx_qa',
    'coverage',
    'apps/api/coverage',
    'apps/web/coverage',
    'chaincode/coverage',
    'apps/api/.turbo',
    'apps/web/.turbo',
    'chaincode/.turbo',
    'apps/api/logs',
    '.data/logs',
    'apps/web/.next/dev',
    'apps/web/.next/cache',
    'apps/web/.next/diagnostics',
    'apps/web/tsconfig.tsbuildinfo'
)
if ($Builds) {
    $targets = @($targets | Where-Object { -not $_.StartsWith('apps/web/.next/') })
    $targets += @('apps/api/dist', 'apps/web/.next', 'chaincode/dist')
}

$protectedPaths = @('.git', 'node_modules', 'wallet', 'blockchain-network', 'bin', 'config', 'reports', 'docs', 'apps/api/assets', 'apps/api/src/generated')
if (Test-Path -LiteralPath (Join-Path $projectRoot '.data')) {
    $protectedPaths += @(Get-ChildItem -LiteralPath (Join-Path $projectRoot '.data') -Force | Where-Object { $_.Name -ne 'logs' } | ForEach-Object { $_.FullName })
}
$environmentPath = Join-Path $projectRoot 'apps/api/.env'
if (Test-Path -LiteralPath $environmentPath) {
    foreach ($line in Get-Content -LiteralPath $environmentPath) {
        if ($line -match '^\s*(?:export\s+)?STORAGE_LOCAL_ROOT\s*=\s*(.+?)\s*$') {
            $storagePath = $Matches[1].Trim().Trim([char[]]@([char]34, [char]39))
            if (-not [IO.Path]::IsPathRooted($storagePath)) {
                $storagePath = Join-Path (Join-Path $projectRoot 'apps/api') $storagePath
            }
            $protectedPaths += [IO.Path]::GetFullPath($storagePath)
        }
    }
}
$trackedFiles = @(& git -C $projectRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked files; no cleanup performed.' }

$plan = @()
foreach ($relative in $targets) {
    $absolute = Get-CheckedCleanupPath -RelativePath $relative
    if (-not (Test-Path -LiteralPath $absolute)) { continue }
    foreach ($protected in $protectedPaths) {
        $protectedAbsolute = if ([IO.Path]::IsPathRooted($protected)) { [IO.Path]::GetFullPath($protected) } else { [IO.Path]::GetFullPath((Join-Path $projectRoot $protected)) }
        if ($absolute.Equals($protectedAbsolute, $comparison) -or
            $absolute.StartsWith($protectedAbsolute.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, $comparison) -or
            $protectedAbsolute.StartsWith($absolute.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, $comparison)) {
            throw "Cleanup target overlaps protected data: $relative"
        }
    }
    $normalized = $relative.Replace('\', '/').TrimEnd('/')
    foreach ($tracked in $trackedFiles) {
        if ($tracked.Equals($normalized, $comparison) -or $tracked.StartsWith($normalized + '/', $comparison)) {
            throw "Cleanup target contains a tracked project file: $relative"
        }
    }
    $files = @(Get-CleanupFiles -Path $absolute)
    $bytes = ($files | Measure-Object -Property Length -Sum).Sum
    $plan += [PSCustomObject]@{ RelativePath = $relative; AbsolutePath = $absolute; Files = $files.Count; Bytes = [long]$bytes }
}

if (-not $plan.Count) {
    Write-Output 'Standard cleanup targets are clean. Retained outputs and data are not scanned.'
    exit 0
}
$plan | Select-Object RelativePath, Files, @{ Name = 'MiB'; Expression = { [Math]::Round($_.Bytes / 1MB, 2) } } | Format-Table -AutoSize
if (-not $Apply) {
    Write-Output 'Preview only. Use npm run clean -- -Apply to remove these items.'
    exit 0
}

$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3000, 3001, 3100, 3318) })
if ($listeners.Count) { throw 'Stop the application and isolated test servers before applying cleanup.' }
$workers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $command = $_.CommandLine
    $command -and (($command.IndexOf($projectRoot, $comparison) -ge 0 -and $command -match '(?i)next|nest|turbo|tsc|dist') -or $command -match '(?i)(?:^|\s)dist[/\\]main\.js')
})
if ($workers.Count) { throw 'Stop project Node services, builds, and watchers before applying cleanup.' }
foreach ($entry in $plan) {
    $absolute = Get-CheckedCleanupPath -RelativePath $entry.RelativePath
    $null = @(Get-CleanupFiles -Path $absolute)
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
$totalFiles = ($plan | Measure-Object -Property Files -Sum).Sum
$totalBytes = ($plan | Measure-Object -Property Bytes -Sum).Sum
Write-Output ('Removed {0} files ({1:N2} MiB). Source, data, dependencies, and retained evidence are unchanged.' -f $totalFiles, ($totalBytes / 1MB))
