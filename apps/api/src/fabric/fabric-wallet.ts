import { createPrivateKey, X509Certificate, type KeyObject } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import {
  decodeProtectedBase64,
  protectForCurrentUser,
  unprotectForCurrentUser,
} from '../security/protected-data';

const walletFormat = 'diplomachain.fabric-wallet.v1';
const protection = 'windows-dpapi-current-user';
export interface FabricWalletIdentity {
  mspId: string;
  certificate: Buffer;
  privateKey: KeyObject;
  fingerprint: string;
  expiresAt: string;
}
export interface WalletOptions {
  expectedMspId: string;
  certificateSha256?: string;
  allowLegacy?: boolean;
}

export function validateFabricWallet(
  value: unknown,
  options: WalletOptions,
): FabricWalletIdentity {
  try {
    const wallet = value as {
      mspId?: string;
      type?: string;
      credentials?: { certificate?: string; privateKey?: string };
    };
    if (
      !['Org1MSP', 'Org2MSP'].includes(options.expectedMspId) ||
      wallet.mspId !== options.expectedMspId ||
      wallet.type !== 'X.509'
    )
      throw new Error();
    if (
      typeof wallet.credentials?.certificate !== 'string' ||
      typeof wallet.credentials.privateKey !== 'string'
    )
      throw new Error();
    const certificate = new X509Certificate(wallet.credentials.certificate);
    const privateKey = createPrivateKey(wallet.credentials.privateKey);
    if (!certificate.checkPrivateKey(privateKey)) throw new Error();
    if (
      Date.parse(certificate.validFrom) > Date.now() ||
      Date.parse(certificate.validTo) <= Date.now()
    )
      throw new Error();
    const fingerprint = certificate.fingerprint256
      .replaceAll(':', '')
      .toLowerCase();
    if (
      options.certificateSha256 &&
      fingerprint !== options.certificateSha256.toLowerCase()
    )
      throw new Error();
    return {
      mspId: wallet.mspId,
      certificate: Buffer.from(certificate.toString()),
      privateKey,
      fingerprint,
      expiresAt: new Date(certificate.validTo).toISOString(),
    };
  } catch {
    throw new Error(
      'Fabric identity rejected; check MSP, key pair, certificate validity and pinned fingerprint',
    );
  }
}

export function sealFabricWallet(bytes: Buffer, expectedMspId: string) {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Invalid Fabric wallet');
  }
  const identity = validateFabricWallet(value, { expectedMspId });
  return {
    format: walletFormat,
    protection,
    mspId: expectedMspId,
    certificateSha256: identity.fingerprint,
    certificate: identity.certificate.toString('utf8'),
    protectedData: protectForCurrentUser(
      bytes,
      walletFormat + ':' + expectedMspId + ':' + identity.fingerprint,
    ).toString('base64'),
  };
}

export function loadFabricWallet(
  path: string,
  options: WalletOptions,
): FabricWalletIdentity {
  let plaintext: Buffer | undefined;
  try {
    if (statSync(path).size > 2 * 1024 * 1024) throw new Error();
    const envelope = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    if (envelope.format === walletFormat) {
      if (
        envelope.protection !== protection ||
        envelope.mspId !== options.expectedMspId ||
        typeof envelope.certificateSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(envelope.certificateSha256)
      )
        throw new Error();
      if (
        !options.certificateSha256 ||
        options.certificateSha256.toLowerCase() !== envelope.certificateSha256
      )
        throw new Error();
      plaintext = unprotectForCurrentUser(
        decodeProtectedBase64(envelope.protectedData),
        walletFormat +
          ':' +
          options.expectedMspId +
          ':' +
          envelope.certificateSha256,
      );
      const identity = validateFabricWallet(
        JSON.parse(plaintext.toString('utf8')),
        options,
      );
      if (
        typeof envelope.certificate !== 'string' ||
        !identity.certificate.equals(Buffer.from(envelope.certificate))
      )
        throw new Error();
      return identity;
    }
    if (!options.allowLegacy) throw new Error();
    return validateFabricWallet(envelope, options);
  } catch {
    throw new Error(
      'Fabric wallet unavailable; check the authorized OS account, protection, certificate pin and configuration',
    );
  } finally {
    plaintext?.fill(0);
  }
}
