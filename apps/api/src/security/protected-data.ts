import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const maximumBytes = 32 * 1024 * 1024;
const dpapiCommand = Buffer.from(
  String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $bytes = [Convert]::FromBase64String($request.data)
  $entropy = [Text.Encoding]::UTF8.GetBytes($request.purpose)
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($request.operation -eq 'protect') {
    $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
  } elseif ($request.operation -eq 'unprotect') {
    $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)
  } else { throw 'Invalid operation' }
  [Console]::Out.Write([Convert]::ToBase64String($result))
  [Array]::Clear($bytes, 0, $bytes.Length)
  [Array]::Clear($result, 0, $result.Length)
} catch {
  [Console]::Error.Write('DIPLOMACHAIN_PROTECTED_DATA_FAILED')
  exit 1
}
`,
  'utf16le',
).toString('base64');

export function decodeProtectedBase64(value: unknown): Buffer {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > maximumBytes * 2 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid protected data encoding');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value)
    throw new Error('Invalid protected data encoding');
  if (bytes.length > maximumBytes)
    throw new Error('Protected data is too large');
  return bytes;
}

function dpapi(
  operation: 'protect' | 'unprotect',
  data: Buffer,
  purpose: string,
) {
  if (process.platform !== 'win32')
    throw new Error('Windows CurrentUser protection requires Windows');
  if (
    !data.length ||
    data.length > maximumBytes ||
    !/^[a-z0-9._:-]{1,200}$/i.test(purpose)
  )
    throw new Error('Invalid protected data request');
  const executable = join(
    process.env.SystemRoot || 'C:/Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const result = spawnSync(
    executable,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      dpapiCommand,
    ],
    {
      input: JSON.stringify({
        operation,
        purpose,
        data: data.toString('base64'),
      }),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      maxBuffer: maximumBytes * 2,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      'Protected data unavailable; use the authorized Windows account and an intact backup',
    );
  try {
    return decodeProtectedBase64(result.stdout.trim());
  } catch {
    throw new Error('Protected data unavailable; invalid provider response');
  }
}

export const protectForCurrentUser = (data: Buffer, purpose: string) =>
  dpapi('protect', data, purpose);
export const unprotectForCurrentUser = (data: Buffer, purpose: string) =>
  dpapi('unprotect', data, purpose);

export interface PasswordBackup {
  format: 'diplomachain.portable-backup.v1';
  salt: string;
  nonce: string;
  tag: string;
  ciphertext: string;
}

function backupKey(password: Buffer, salt: Buffer) {
  if (password.length < 20 || password.length > 1024)
    throw new Error('Backup passphrase must contain 20 to 1024 UTF-8 bytes');
  return scryptSync(password, salt, 32, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
}

export function sealPasswordBackup(
  data: Buffer,
  password: Buffer,
): PasswordBackup {
  if (!data.length || data.length > maximumBytes)
    throw new Error('Invalid backup size');
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  const key = backupKey(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from('diplomachain.portable-backup.v1'));
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return {
      format: 'diplomachain.portable-backup.v1',
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };
  } finally {
    key.fill(0);
  }
}

export function openPasswordBackup(
  envelope: PasswordBackup,
  password: Buffer,
): Buffer {
  if (envelope?.format !== 'diplomachain.portable-backup.v1')
    throw new Error('Unsupported backup format');
  const salt = decodeProtectedBase64(envelope.salt);
  const nonce = decodeProtectedBase64(envelope.nonce);
  const tag = decodeProtectedBase64(envelope.tag);
  if (salt.length !== 32 || nonce.length !== 12 || tag.length !== 16)
    throw new Error('Invalid backup parameters');
  const key = backupKey(password, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(envelope.format));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(decodeProtectedBase64(envelope.ciphertext)),
      decipher.final(),
    ]);
  } catch {
    throw new Error('Backup authentication failed');
  } finally {
    key.fill(0);
  }
}
