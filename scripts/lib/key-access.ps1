param([ValidateSet('Audit', 'Apply', 'Restore', 'Probe')][string]$Action = 'Audit')
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $workspace = [IO.Path]::GetFullPath($request.workspace).TrimEnd('\')
    $vault = [IO.Path]::GetFullPath($request.vault).TrimEnd('\')
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $allowed = @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')
    function Assert-SafePath([string]$Path) {
        $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
        if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) { throw 'Volume root not allowed' }
        if (-not ($full -eq $workspace -or $full.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase) -or $full -eq $vault -or $full.StartsWith($vault + '\', [StringComparison]::OrdinalIgnoreCase))) { throw 'Path outside permitted roots' }
        $current = $full
        while ($current) {
            if (Test-Path -LiteralPath $current) {
                if ((Get-Item -Force -LiteralPath $current).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point not allowed' }
            }
            $parent = Split-Path -Parent $current
            if ($parent -eq $current) { break }
            $current = $parent
        }
        return $full
    }
    function Get-Targets {
        $seen = @{}
        $result = [Collections.Generic.List[string]]::new()
        foreach ($path in $request.paths) {
            $full = Assert-SafePath $path
            if (-not (Test-Path -LiteralPath $full)) { continue }
            $pending = [Collections.Generic.Stack[string]]::new()
            $pending.Push($full)
            while ($pending.Count) {
                $itemPath = Assert-SafePath ($pending.Pop())
                if ($seen.ContainsKey($itemPath)) { continue }
                $seen[$itemPath] = $true
                $result.Add($itemPath)
                if ((Get-Item -Force -LiteralPath $itemPath).PSIsContainer -and $itemPath -ne $workspace) {
                    foreach ($entry in Get-ChildItem -Force -LiteralPath $itemPath) { $pending.Push($entry.FullName) }
                }
            }
        }
        return $result.ToArray()
    }
    function Set-PrivateAcl([string]$Path) {
        $item = Get-Item -Force -LiteralPath $Path
        $acl = if ($item.PSIsContainer) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
        $inheritance = if ($item.PSIsContainer) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
        foreach ($identity in $allowed) {
            $principal = [Security.Principal.SecurityIdentifier]::new($identity)
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($principal, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
            $acl.AddAccessRule($rule)
        }
        if ($item.PSIsContainer) { [IO.Directory]::SetAccessControl($Path, $acl) }
        else { [IO.File]::SetAccessControl($Path, $acl) }
    }
    function Restore-AccessAcl([string]$Path, [string]$Sddl) {
        if ((Get-Item -Force -LiteralPath $Path).PSIsContainer) {
            $acl = [Security.AccessControl.DirectorySecurity]::new()
            $acl.SetSecurityDescriptorSddlForm($Sddl, [Security.AccessControl.AccessControlSections]::Access)
            [IO.Directory]::SetAccessControl($Path, $acl)
        } else {
            $acl = [Security.AccessControl.FileSecurity]::new()
            $acl.SetSecurityDescriptorSddlForm($Sddl, [Security.AccessControl.AccessControlSections]::Access)
            [IO.File]::SetAccessControl($Path, $acl)
        }
    }
    $targets = @(Get-Targets)
    $manifestPath = if ($request.manifest) { Assert-SafePath $request.manifest } else { $null }
    $changed = 0
    if ($Action -eq 'Apply') {
        if (-not $manifestPath -or (Test-Path -LiteralPath $manifestPath)) { throw 'Unique ACL backup required' }
        $entries = @($targets | ForEach-Object { @{ path = $_; sddl = (Get-Acl -LiteralPath $_).Sddl } })
        $manifest = @{ version = 1; workspace = $workspace; sid = $sid.Value; entries = $entries }
        $plain = [Text.Encoding]::UTF8.GetBytes(($manifest | ConvertTo-Json -Compress -Depth 6))
        $sealed = [Security.Cryptography.ProtectedData]::Protect($plain, [Text.Encoding]::UTF8.GetBytes('diplomachain.acl.v1'), [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllText($manifestPath, [Convert]::ToBase64String($sealed))
        [Array]::Clear($plain, 0, $plain.Length)
        try {
            foreach ($target in $targets) { Set-PrivateAcl $target; $changed++ }
            Set-PrivateAcl $manifestPath
        } catch {
            foreach ($entry in $entries) {
                Restore-AccessAcl $entry.path $entry.sddl
            }
            throw 'ACL apply failed and rollback was attempted'
        }
    } elseif ($Action -eq 'Restore') {
        if (-not $manifestPath) { throw 'ACL backup required' }
        $sealed = [Convert]::FromBase64String([IO.File]::ReadAllText($manifestPath))
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($sealed, [Text.Encoding]::UTF8.GetBytes('diplomachain.acl.v1'), [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $manifest = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
        [Array]::Clear($plain, 0, $plain.Length)
        if ($manifest.version -ne 1 -or $manifest.workspace -ne $workspace -or $manifest.sid -ne $sid.Value) { throw 'ACL backup context mismatch' }
        foreach ($entry in $manifest.entries) {
            $target = Assert-SafePath $entry.path
            if (Test-Path -LiteralPath $target) {
                Restore-AccessAcl $target $entry.sddl
                $changed++
            }
        }
    } elseif ($Action -eq 'Probe') {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DiplomaChainAccessProbe {
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentThread();
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool ImpersonateAnonymousToken(IntPtr thread);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool RevertToSelf();
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr attributes, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static int AccessAsAnonymous(string path, uint access) {
    if (!ImpersonateAnonymousToken(GetCurrentThread())) return -1;
    try {
      IntPtr handle = CreateFile(path, access, 7, IntPtr.Zero, 3, 0, IntPtr.Zero);
      if (handle == new IntPtr(-1)) return Marshal.GetLastWin32Error();
      CloseHandle(handle);
      return 0;
    } finally { RevertToSelf(); }
  }
}
'@
        $probes = @($targets | Where-Object { -not (Get-Item -Force -LiteralPath $_).PSIsContainer } | ForEach-Object {
            @{ path = $_; anonymousReadDenied = ([DiplomaChainAccessProbe]::AccessAsAnonymous($_, 2147483648) -eq 5); anonymousWriteDenied = ([DiplomaChainAccessProbe]::AccessAsAnonymous($_, 1073741824) -eq 5) }
        })
        [Console]::Out.Write((@{ probes = $probes } | ConvertTo-Json -Compress -Depth 6))
        exit 0
    }
    $issues = @()
    $unprotected = @()
    foreach ($target in $targets) {
        $acl = Get-Acl -LiteralPath $target
        if (-not $acl.AreAccessRulesProtected) { $unprotected += $target }
        foreach ($rule in $acl.Access) {
            $identity = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($rule.AccessControlType -eq 'Allow' -and $identity -notin $allowed) { $issues += @{ path = $target; sid = $identity } }
        }
    }
    [Console]::Out.Write((@{ accountSid = $sid.Value; inspected = $targets.Count; changed = $changed; unexpectedGrants = $issues; unprotectedPaths = $unprotected } | ConvertTo-Json -Compress -Depth 6))
} catch {
    [Console]::Error.Write(('DIPLOMACHAIN_KEY_ACCESS_FAILED:{0}:{1}:{2}' -f $Action, $_.InvocationInfo.ScriptLineNumber, $_.Exception.GetType().Name))
    exit 1
}
