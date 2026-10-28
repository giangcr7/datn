import {
  createHash,
  createPrivateKey,
  X509Certificate,
  webcrypto,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as asn1js from 'asn1js';
import { ContentInfo, CryptoEngine, setEngine, SignedData } from 'pkijs';
import type { Signer } from '@libpdf/core';
import { PkiService, type PkiEvidence } from './pki.service';
import { PkiError } from './pki-transport';
import {
  renderBilingualDiploma,
  showDigitalSignature,
} from './diploma-pdf-template';

setEngine(
  'node-webcrypto',
  new CryptoEngine({
    name: 'node-webcrypto',
    crypto: webcrypto as unknown as Crypto,
  }),
);

export const PDF_SIGNATURE_FIELDS = [
  'CampusApproval',
  'HeadquartersIssue',
] as const;
export const PDF_SIGNATURE_POLICY = 'two-organizations-pades-bb-v1';
export const PDF_PKI_SIGNATURE_POLICY = 'two-organizations-pades-bt-pki-v2';
export const SINGLE_APPROVER_SIGNATURE_POLICY =
  'single-campus-one-approver-pades-bb-v1';
export const SINGLE_APPROVER_PKI_SIGNATURE_POLICY =
  'single-campus-one-approver-pades-bt-pki-v1';

export function fileHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function certificateInfo(bytes: Uint8Array) {
  const certificate = new X509Certificate(bytes);
  return {
    certificateSha256: fileHash(certificate.raw),
    certificateSerial: certificate.serialNumber,
    certificateSubject: certificate.subject,
    certificateIssuer: certificate.issuer,
    validFrom: new Date(certificate.validFrom),
    validTo: new Date(certificate.validTo),
  };
}

export async function demoSigner(
  certificatePath: string,
  keyPath: string,
  passphrase: string,
): Promise<Signer> {
  const { CryptoKeySigner } = await import('@libpdf/core');
  const certificate = new X509Certificate(await readFile(certificatePath));
  const key = createPrivateKey({ key: await readFile(keyPath), passphrase });
  if (!certificate.checkPrivateKey(key))
    throw new Error('Certificate and private key mismatch');
  const imported = await webcrypto.subtle.importKey(
    'pkcs8',
    key.export({ format: 'der', type: 'pkcs8' }),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new CryptoKeySigner(
    imported as unknown as CryptoKey,
    certificate.raw,
    'RSA',
    'RSASSA-PKCS1-v1_5',
  );
}

export async function createDiplomaPdf(
  payload: Record<string, unknown>,
  verifyUrl: string,
  demo: boolean,
  _maker: string,
  _timestamped = false,
  preview = false,
  singleApprover = false,
) {
  return renderBilingualDiploma(
    payload,
    verifyUrl,
    demo,
    preview,
    singleApprover,
  );
}

export async function signPdf(
  bytes: Uint8Array,
  signer: Signer,
  order: number,
  actorName: string,
  pki?: PkiService,
) {
  const { PDF } = await import('@libpdf/core');
  const pdf = await PDF.load(bytes);
  const signedAt = new Date();
  const singleApprover = pdf
    .getMetadata()
    .keywords?.includes('single-campus-one-approver-v1');
  const field = pdf
    .getForm()
    ?.getSignatureFields()
    .find((candidate) => candidate.name === PDF_SIGNATURE_FIELDS[order - 1]);
  if (field) await showDigitalSignature(pdf, field, order, actorName, signedAt);
  const result = await pdf.sign({
    signer,
    fieldName: PDF_SIGNATURE_FIELDS[order - 1],
    level: pki ? 'B-T' : 'B-B',
    timestampAuthority: pki?.timestampAuthority(),
    estimatedSize: pki ? 32768 : 12288,
    digestAlgorithm: 'SHA-256',
    reason:
      (singleApprover
        ? 'Diploma issuance by '
        : order === 1
          ? 'Campus confirmation by '
          : 'Headquarters issuance by ') + actorName,
    location: singleApprover || order === 1 ? 'Ho Chi Minh City' : 'Ha Noi',
    signingTime: signedAt,
  });
  return {
    bytes: Buffer.from(result.bytes),
    signedAt,
    ...certificateInfo(signer.certificate),
  };
}

export async function inspectPdfSignatures(
  bytes: Uint8Array,
  pki?: PkiService,
) {
  const { PDF } = await import('@libpdf/core');
  const pdf = await PDF.load(bytes);
  const fields =
    pdf
      .getForm()
      ?.getSignatureFields()
      .filter((field) => field.isSigned()) || [];
  if (!fields.length || fields.length > 2)
    throw new Error('PDF must contain one or two signatures');
  const signatures = [] as Array<
    ReturnType<typeof certificateInfo> & {
      fieldName: string;
      cryptographicallyValid: boolean;
      certificateCurrent: boolean;
      coveredBytes: number;
      pkiEvidence?: PkiEvidence;
      pkiStatus?: string;
      pkiError?: string;
    }
  >;
  for (const field of fields) {
    const dictionary = field.getSignatureDict();
    const range = dictionary?.getArray('ByteRange');
    const contents = dictionary?.getString('Contents');
    if (
      !range ||
      range.length !== 4 ||
      !contents ||
      dictionary?.getName('SubFilter')?.value !== 'ETSI.CAdES.detached'
    )
      throw new Error('Invalid PDF signature dictionary');
    const numbers = Array.from({ length: 4 }, (_, index) => {
      const value = range.at(index);
      return value?.type === 'number'
        ? (value as { value: number }).value
        : NaN;
    });
    const [start, length, nextStart, nextLength] = numbers;
    const end = nextStart + nextLength;
    if (
      numbers.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      start !== 0 ||
      length >= nextStart ||
      end > bytes.length
    )
      throw new Error('Invalid signature ByteRange');
    const gap = Buffer.from(bytes.subarray(length, nextStart)).toString(
      'ascii',
    );
    if (
      !/^<[0-9a-fA-F\s]+>$/.test(gap) ||
      !Buffer.from(gap.slice(1, -1).replace(/\s/g, ''), 'hex').equals(
        Buffer.from(contents.bytes),
      )
    )
      throw new Error('PDF signature does not cover the expected content');
    const parsed = asn1js.fromBER(contents.bytes.slice().buffer);
    if (parsed.offset < 0) throw new Error('Invalid signature CMS');
    const contentInfo = new ContentInfo({ schema: parsed.result });
    const signedData = new SignedData({ schema: contentInfo.content });
    if (signedData.signerInfos.length !== 1)
      throw new Error('Unexpected CMS signer count');
    const data = Buffer.concat([
      bytes.subarray(0, length),
      bytes.subarray(nextStart, end),
    ]);
    const result = await signedData.verify({
      signer: 0,
      data: Uint8Array.from(data).buffer,
      checkChain: false,
      extendedMode: true,
    });
    if (!result.signerCertificate)
      throw new Error('Missing signing certificate');
    const certificate = certificateInfo(
      new Uint8Array(result.signerCertificate.toSchema().toBER(false)),
    );
    let validation: {
      pkiEvidence?: PkiEvidence;
      pkiStatus?: string;
      pkiError?: string;
    } = {};
    if (pki) {
      try {
        validation = {
          pkiEvidence: await pki.validateSignature(
            signedData,
            result.signerCertificate,
          ),
          pkiStatus: 'VALID',
        };
      } catch (error) {
        validation = {
          pkiStatus: error instanceof PkiError ? error.code : 'INVALID',
          pkiError:
            error instanceof PkiError
              ? error.message
              : 'Không xác minh được bằng chứng PKI',
        };
      }
    }
    signatures.push({
      ...validation,
      ...certificate,
      fieldName: field.name,
      cryptographicallyValid: result.signatureVerified === true,
      certificateCurrent:
        certificate.validFrom <= new Date() && certificate.validTo > new Date(),
      coveredBytes: end,
    });
  }
  return signatures.sort(
    (left, right) => left.coveredBytes - right.coveredBytes,
  );
}
