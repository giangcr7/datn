import {
  createHash,
  randomBytes,
  webcrypto,
  X509Certificate,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as asn1js from 'asn1js';
import {
  AlgorithmIdentifier,
  BasicOCSPResponse,
  Certificate,
  CertificateChainValidationEngine,
  CertID,
  CertificateRevocationList,
  ContentInfo,
  CryptoEngine,
  Extension,
  getCrypto,
  IssuerAndSerialNumber,
  MessageImprint,
  OCSPRequest,
  OCSPResponse,
  Request,
  RelativeDistinguishedNames,
  setEngine,
  SignedData,
  TBSRequest,
  TimeStampReq,
  TimeStampResp,
  TSTInfo,
  RSASSAPSSParams,
} from 'pkijs';
import type { DigestAlgorithm, TimestampAuthority } from '@libpdf/core';
import { pkiEndpoint, PkiError, pkiRequest } from './pki-transport';

setEngine(
  'node-webcrypto',
  new CryptoEngine({
    name: 'node-webcrypto',
    crypto: webcrypto as unknown as Crypto,
  }),
);

export const TIMESTAMP_ATTRIBUTE = '1.2.840.113549.1.9.16.2.14';
const SHA256 = '2.16.840.1.101.3.4.2.1';
const TST_CONTENT = '1.2.840.113549.1.9.16.1.4';
const OCSP_NONCE = '1.3.6.1.5.5.7.48.1.2';
const SKEW_MS = 60000;

export type RevocationEvidence = {
  status: 'GOOD';
  method: 'OCSP' | 'CRL';
  certificateSha256: string;
  issuerSha256: string;
  checkedAt: string;
  thisUpdate: string;
  nextUpdate: string;
  responseSha256: string;
};
export type TimestampEvidence = {
  valid: true;
  time: string;
  serial: string;
  policy: string;
  tokenSha256: string;
  authority: string;
  certificateSha256: string;
  trustAnchorSha256: string;
  revocation: RevocationEvidence[];
};
export type PkiEvidence = {
  policy: 'pades-bt-pki-v2';
  trustAnchorSha256: string;
  timestamp: TimestampEvidence;
  revocation: RevocationEvidence[];
};

export function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function der(certificate: Certificate) {
  return Buffer.from(certificate.toSchema(true).toBER(false));
}
function arrayBuffer(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer;
}
function parse(bytes: Uint8Array) {
  const result = asn1js.fromBER(arrayBuffer(bytes));
  if (result.offset !== bytes.byteLength)
    throw new PkiError('INVALID', 'Dữ liệu ASN.1 PKI không hợp lệ');
  return result.result;
}
function same(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

export function pemCertificates(text: string) {
  const matches =
    text.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    ) || [];
  return matches.map((pem) =>
    Certificate.fromBER(new X509Certificate(pem).raw),
  );
}

function assertStrongSignature(identifier: AlgorithmIdentifier) {
  const oid = identifier.algorithmId;
  if (
    ![
      '1.2.840.113549.1.1.11',
      '1.2.840.113549.1.1.12',
      '1.2.840.113549.1.1.13',
      '1.2.840.113549.1.1.10',
      '1.2.840.10045.4.3.2',
      '1.2.840.10045.4.3.3',
      '1.2.840.10045.4.3.4',
    ].includes(oid)
  )
    throw new PkiError('INVALID', 'Thuật toán chữ ký PKI không được chấp nhận');
  if (oid === '1.2.840.113549.1.1.10') {
    const parameters = new RSASSAPSSParams({
      schema: identifier.algorithmParams,
    });
    const lengths: Record<string, number> = {
      [SHA256]: 32,
      '2.16.840.1.101.3.4.2.2': 48,
      '2.16.840.1.101.3.4.2.3': 64,
    };
    const mask = new AlgorithmIdentifier({
      schema: parameters.maskGenAlgorithm.algorithmParams,
    });
    if (
      !lengths[parameters.hashAlgorithm.algorithmId] ||
      parameters.maskGenAlgorithm.algorithmId !== '1.2.840.113549.1.1.8' ||
      mask.algorithmId !== parameters.hashAlgorithm.algorithmId ||
      parameters.saltLength < lengths[parameters.hashAlgorithm.algorithmId] ||
      parameters.trailerField !== 1
    )
      throw new PkiError(
        'INVALID',
        'Tham số RSA-PSS phải dùng SHA-256 trở lên và MGF1 tương ứng',
      );
  }
}

function fresh(
  thisUpdate: Date,
  nextUpdate: Date | undefined,
  maximumAgeSeconds: number,
) {
  const now = Date.now();
  if (
    !nextUpdate ||
    !Number.isFinite(thisUpdate.getTime()) ||
    !Number.isFinite(nextUpdate.getTime()) ||
    thisUpdate.getTime() > now + SKEW_MS ||
    nextUpdate <= thisUpdate ||
    nextUpdate.getTime() <= now ||
    now - thisUpdate.getTime() > maximumAgeSeconds * 1000
  )
    throw new PkiError(
      'STALE',
      'Bằng chứng thu hồi đã cũ, thiếu nextUpdate hoặc có thời gian không hợp lệ',
    );
}

export class PkiService {
  private readonly cache = new Map<
    string,
    { expires: number; evidence: RevocationEvidence }
  >();

  get enabled() {
    return process.env.PDF_PKI_ENABLED === 'true';
  }

  private async material() {
    if (!this.enabled || !process.env.PDF_PKI_TRUST_BUNDLE_PATH)
      throw new PkiError('NOT_CONFIGURED', 'Chưa cấu hình trust store PKI');
    const roots = pemCertificates(
      await readFile(process.env.PDF_PKI_TRUST_BUNDLE_PATH, 'utf8'),
    );
    const intermediates = process.env.PDF_PKI_ISSUERS_PATH
      ? pemCertificates(
          await readFile(process.env.PDF_PKI_ISSUERS_PATH, 'utf8'),
        )
      : [];
    if (!roots.length)
      throw new PkiError(
        'NOT_CONFIGURED',
        'Trust store PKI không có chứng thư',
      );
    return { roots, intermediates };
  }

  async certificatePath(
    certificate: Certificate,
    extra: Certificate[] = [],
    date = new Date(),
  ) {
    const { roots, intermediates } = await this.material();
    const leafHash = sha256(der(certificate));
    const candidates = [...intermediates, ...extra].filter(
      (item) => sha256(der(item)) !== leafHash,
    );
    const engine = new CertificateChainValidationEngine({
      trustedCerts: roots,
      certs: [...candidates, certificate],
      checkDate: date,
    });
    const result = await engine.verify({ passedWhenNotRevValues: true });
    const path = result.certificatePath;
    if (
      !result.result ||
      !path?.length ||
      sha256(der(path[0])) !== leafHash ||
      !roots.some(
        (root) => sha256(der(root)) === sha256(der(path[path.length - 1])),
      )
    )
      throw new PkiError(
        'INVALID',
        'Chuỗi chứng thư không dẫn đến CA được cấu hình tin cậy',
      );
    for (const item of path) {
      const key = new X509Certificate(der(item)).publicKey;
      const details = key.asymmetricKeyDetails;
      if (
        !['rsa', 'rsa-pss', 'ec'].includes(key.asymmetricKeyType || '') ||
        (details?.modulusLength !== undefined &&
          details.modulusLength < 2048) ||
        (key.asymmetricKeyType === 'ec' &&
          !['prime256v1', 'secp384r1', 'secp521r1'].includes(
            details?.namedCurve || '',
          ))
      )
        throw new PkiError(
          'INVALID',
          'Khóa chứng thư PKI yếu hoặc không được hỗ trợ',
        );
    }
    for (const item of path.slice(0, -1))
      assertStrongSignature(item.signatureAlgorithm);
    const usage = certificate.extensions?.find(
      (item) => item.extnID === '2.5.29.15',
    );
    const value = usage?.parsedValue as asn1js.BitString | undefined;
    if (!value || !(value.valueBlock.valueHexView[0] & 0x80))
      throw new PkiError('INVALID', 'Chứng thư không được phép ký số');
    return {
      path,
      roots,
      trustAnchorSha256: sha256(der(path[path.length - 1])),
    };
  }

  private async endpoints(
    issuer: Certificate,
  ): Promise<{ ocspUrl?: string; crlUrl?: string }> {
    const path = process.env.PDF_PKI_ENDPOINTS_PATH;
    if (!path)
      throw new PkiError('NOT_CONFIGURED', 'Thiếu cấu hình OCSP/CRL theo CA');
    const endpoints = JSON.parse(await readFile(path, 'utf8')) as Record<
      string,
      { ocspUrl?: string; crlUrl?: string }
    >;
    const result = endpoints[sha256(der(issuer))];
    if (!result || (!result.ocspUrl && !result.crlUrl))
      throw new PkiError(
        'NOT_CONFIGURED',
        'Chưa cấu hình dịch vụ thu hồi cho CA phát hành',
      );
    return result;
  }

  private evidence(
    certificate: Certificate,
    issuer: Certificate,
    method: 'OCSP' | 'CRL',
    bytes: Uint8Array,
    thisUpdate: Date,
    nextUpdate: Date,
  ): RevocationEvidence {
    return {
      status: 'GOOD',
      method,
      certificateSha256: sha256(der(certificate)),
      issuerSha256: sha256(der(issuer)),
      checkedAt: new Date().toISOString(),
      thisUpdate: thisUpdate.toISOString(),
      nextUpdate: nextUpdate.toISOString(),
      responseSha256: sha256(bytes),
    };
  }

  private async ocsp(
    certificate: Certificate,
    issuer: Certificate,
    roots: Certificate[],
    url: string,
  ) {
    const certID = await CertID.create(certificate, {
      issuerCertificate: issuer,
      hashAlgorithm: 'SHA-256',
    });
    const nonce = randomBytes(16);
    const request = new OCSPRequest({
      tbsRequest: new TBSRequest({
        requestList: [new Request({ reqCert: certID })],
        requestExtensions: [
          new Extension({
            extnID: OCSP_NONCE,
            extnValue: new asn1js.OctetString({
              valueHex: arrayBuffer(nonce),
            }).toBER(false),
          }),
        ],
      }),
    });
    const bytes = await pkiRequest(
      url,
      new Uint8Array(request.toSchema(true).toBER(false)),
      'application/ocsp-request',
    );
    const response = new OCSPResponse({ schema: parse(bytes) });
    if (
      response.responseStatus.valueBlock.valueDec !== 0 ||
      response.responseBytes?.responseType !== '1.3.6.1.5.5.7.48.1.1'
    )
      throw new PkiError(
        'UNAVAILABLE',
        'OCSP responder không trả trạng thái thành công',
      );
    const basic = new BasicOCSPResponse({
      schema: parse(response.responseBytes.response.valueBlock.valueHexView),
    });
    assertStrongSignature(basic.signatureAlgorithm);
    const candidates = [...(basic.certs || []), issuer];
    let responder: Certificate | undefined;
    for (const candidate of candidates) {
      const identifier = basic.tbsResponseData.responderID;
      const matches =
        identifier instanceof RelativeDistinguishedNames
          ? candidate.subject.isEqual(identifier)
          : identifier instanceof asn1js.OctetString &&
            same(
              createHash('sha1')
                .update(
                  candidate.subjectPublicKeyInfo.subjectPublicKey.valueBlock
                    .valueHexView,
                )
                .digest(),
              identifier.valueBlock.valueHexView,
            );
      if (!matches) continue;
      basic.certs = [candidate];
      try {
        if (
          await basic.verify({ trustedCerts: roots, issuerCerts: [issuer] })
        ) {
          if (sha256(der(candidate)) !== sha256(der(issuer)))
            await this.certificatePath(candidate, candidates);
          responder = candidate;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!responder)
      throw new PkiError('INVALID', 'Không tìm được chứng thư ký OCSP hợp lệ');
    if (
      sha256(der(responder)) !== sha256(der(issuer)) &&
      !responder.extensions?.some(
        (item) => item.extnID === '1.3.6.1.5.5.7.48.1.5',
      )
    ) {
      const endpoint = await this.endpoints(issuer);
      if (!endpoint.crlUrl)
        throw new PkiError(
          'NOT_CONFIGURED',
          'OCSP responder ủy quyền cần OCSP no-check hoặc CRL để kiểm tra thu hồi',
        );
      await this.crl(responder, issuer, endpoint.crlUrl);
    }
    if (
      basic.tbsResponseData.responseExtensions?.some(
        (item) => item.critical && item.extnID !== OCSP_NONCE,
      )
    )
      throw new PkiError('INVALID', 'OCSP có extension critical chưa hỗ trợ');
    if (
      basic.tbsResponseData.producedAt.getTime() > Date.now() + SKEW_MS ||
      Date.now() - basic.tbsResponseData.producedAt.getTime() >
        Number(process.env.PDF_PKI_MAX_AGE_SECONDS || 86400) * 1000
    )
      throw new PkiError('STALE', 'OCSP producedAt không hợp lệ');
    const returnedNonce = basic.tbsResponseData.responseExtensions?.find(
      (item) => item.extnID === OCSP_NONCE,
    );
    if (returnedNonce) {
      const decoded = parse(returnedNonce.extnValue.valueBlock.valueHexView);
      if (
        !(decoded instanceof asn1js.OctetString) ||
        !same(decoded.valueBlock.valueHexView, nonce)
      )
        throw new PkiError('INVALID', 'OCSP nonce không khớp');
    }
    const matches = basic.tbsResponseData.responses.filter((item) =>
      item.certID.isEqual(certID),
    );
    if (matches.length !== 1)
      throw new PkiError(
        'UNKNOWN',
        'OCSP không có kết quả duy nhất cho chứng thư cần kiểm tra',
      );
    const entry = matches[0];
    fresh(
      entry.thisUpdate,
      entry.nextUpdate,
      Number(process.env.PDF_PKI_MAX_AGE_SECONDS || 86400),
    );
    if (entry.singleExtensions?.some((item) => item.critical))
      throw new PkiError('INVALID', 'OCSP có extension critical chưa hỗ trợ');
    const status = entry.certStatus.idBlock;
    if (status.tagClass !== 3 || ![0, 1, 2].includes(status.tagNumber))
      throw new PkiError('INVALID', 'Trạng thái OCSP không hợp lệ');
    if (status.tagNumber === 1)
      throw new PkiError('REVOKED', 'Chứng thư đã bị thu hồi (OCSP)');
    if (status.tagNumber === 2)
      throw new PkiError(
        'UNKNOWN',
        'OCSP không xác định được trạng thái chứng thư',
      );
    return this.evidence(
      certificate,
      issuer,
      'OCSP',
      bytes,
      entry.thisUpdate,
      entry.nextUpdate!,
    );
  }

  private async crl(
    certificate: Certificate,
    issuer: Certificate,
    url: string,
  ) {
    const received = await pkiRequest(url);
    const pem = received.toString('ascii');
    const bytes = pem.startsWith('-----BEGIN X509 CRL-----')
      ? Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64')
      : received;
    const crl = new CertificateRevocationList({ schema: parse(bytes) });
    assertStrongSignature(crl.signatureAlgorithm);
    const usage = issuer.extensions?.find((item) => item.extnID === '2.5.29.15')
      ?.parsedValue as asn1js.BitString | undefined;
    if (
      !usage ||
      !(usage.valueBlock.valueHexView[0] & 0x02) ||
      !crl.issuer.isEqual(issuer.subject) ||
      !(await crl.verify({ issuerCertificate: issuer }))
    )
      throw new PkiError(
        'INVALID',
        'CRL không do đúng CA ký hoặc CA không có quyền ký CRL',
      );
    fresh(
      crl.thisUpdate.value,
      crl.nextUpdate?.value,
      Number(process.env.PDF_PKI_MAX_AGE_SECONDS || 86400),
    );
    if (
      crl.crlExtensions?.extensions.some(
        (item) =>
          ['2.5.29.27', '2.5.29.28'].includes(item.extnID) ||
          (item.critical && !['2.5.29.20', '2.5.29.35'].includes(item.extnID)),
      )
    )
      throw new PkiError(
        'INVALID',
        'Không hỗ trợ delta CRL, CRL giới hạn phạm vi hoặc extension critical chưa biết',
      );
    if (
      crl.revokedCertificates?.some((item) =>
        item.crlEntryExtensions?.extensions.some(
          (extension) => extension.extnID === '2.5.29.29' || extension.critical,
        ),
      )
    )
      throw new PkiError(
        'INVALID',
        'Không hỗ trợ indirect CRL hoặc entry critical chưa biết',
      );
    if (
      crl.revokedCertificates?.some((item) =>
        item.userCertificate.isEqual(certificate.serialNumber),
      )
    )
      throw new PkiError('REVOKED', 'Chứng thư đã bị thu hồi (CRL)');
    return this.evidence(
      certificate,
      issuer,
      'CRL',
      bytes,
      crl.thisUpdate.value,
      crl.nextUpdate!.value,
    );
  }

  private async revocation(
    certificate: Certificate,
    issuer: Certificate,
    roots: Certificate[],
  ) {
    const endpoints = await this.endpoints(issuer);
    const key =
      sha256(der(certificate)) +
      sha256(der(issuer)) +
      JSON.stringify(endpoints) +
      roots.map((item) => sha256(der(item))).join();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.evidence;
    let evidence: RevocationEvidence | undefined;
    const failures: unknown[] = [];
    if (endpoints.ocspUrl) {
      try {
        evidence = await this.ocsp(
          certificate,
          issuer,
          roots,
          endpoints.ocspUrl,
        );
      } catch (error) {
        if (
          error instanceof PkiError &&
          ['REVOKED', 'UNKNOWN'].includes(error.code)
        )
          throw error;
        failures.push(
          error instanceof PkiError
            ? error
            : new PkiError(
                'INVALID',
                'Cấu trúc, chữ ký hoặc chứng thư OCSP không hợp lệ',
              ),
        );
      }
    }
    if (!evidence && endpoints.crlUrl) {
      try {
        evidence = await this.crl(certificate, issuer, endpoints.crlUrl);
      } catch (error) {
        failures.push(
          error instanceof PkiError
            ? error
            : new PkiError('INVALID', 'Cấu trúc hoặc chữ ký CRL không hợp lệ'),
        );
      }
    }
    if (!evidence) {
      const failure =
        failures.find(
          (error) =>
            error instanceof PkiError &&
            !['UNAVAILABLE', 'NOT_CONFIGURED'].includes(error.code),
        ) || failures.at(-1);
      if (failure instanceof PkiError) throw failure;
      throw new PkiError('INVALID', 'Không có bằng chứng OCSP/CRL hợp lệ');
    }
    const expires = Math.min(
      Date.parse(evidence.nextUpdate),
      Date.now() + Number(process.env.PDF_PKI_CACHE_SECONDS || 0) * 1000,
    );
    if (this.cache.size > 1000) this.cache.clear();
    this.cache.set(key, { expires, evidence });
    return evidence;
  }

  async checkCertificate(
    certificate: Certificate,
    extra: Certificate[] = [],
    date = new Date(),
  ) {
    const result = await this.certificatePath(certificate, extra, date);
    const constraints = certificate.extensions?.find(
      (item) => item.extnID === '2.5.29.19',
    )?.parsedValue as { cA?: boolean } | undefined;
    if (result.path.length < 2 || constraints?.cA)
      throw new PkiError(
        'INVALID',
        'Phải dùng chứng thư người ký do CA cấp, không dùng chứng thư CA để ký PDF/TSA',
      );
    const revocation: RevocationEvidence[] = [];
    for (let index = 0; index < result.path.length - 1; index++)
      revocation.push(
        await this.revocation(
          result.path[index],
          result.path[index + 1],
          result.roots,
        ),
      );
    return { trustAnchorSha256: result.trustAnchorSha256, revocation };
  }

  async validateTimestamp(
    token: Uint8Array,
    digest: Uint8Array,
    nonce?: asn1js.Integer,
    requestedAt?: Date,
  ): Promise<TimestampEvidence> {
    const content = new ContentInfo({ schema: parse(token) });
    if (content.contentType !== '1.2.840.113549.1.7.2')
      throw new PkiError('INVALID', 'Timestamp không phải CMS SignedData');
    const signed = new SignedData({ schema: content.content });
    const signer = signed.signerInfos[0];
    if (
      signed.signerInfos.length !== 1 ||
      signed.encapContentInfo.eContentType !== TST_CONTENT ||
      !signed.encapContentInfo.eContent ||
      !signer.signedAttrs
    )
      throw new PkiError(
        'INVALID',
        'Timestamp CMS thiếu nội dung hoặc có số người ký không hợp lệ',
      );
    const infoBytes = new Uint8Array(
      signed.encapContentInfo.eContent.getValue(),
    );
    const info = new TSTInfo({ schema: parse(infoBytes) });
    if (info.extensions?.some((extension) => extension.critical))
      throw new PkiError(
        'INVALID',
        'Timestamp có extension critical chưa hỗ trợ',
      );
    if (
      info.version !== 1 ||
      info.messageImprint.hashAlgorithm.algorithmId !== SHA256 ||
      !same(info.messageImprint.hashedMessage.valueBlock.valueHexView, digest)
    )
      throw new PkiError(
        'INVALID',
        'Dấu thời gian không khớp SHA-256 của chữ ký',
      );
    if (
      (nonce && (!info.nonce || !info.nonce.isEqual(nonce))) ||
      info.genTime.getTime() > Date.now() + SKEW_MS ||
      (requestedAt && info.genTime.getTime() < requestedAt.getTime() - SKEW_MS)
    )
      throw new PkiError(
        'INVALID',
        'Timestamp nonce hoặc thời điểm cấp không hợp lệ',
      );
    const certificates = (signed.certificates || []).filter(
      (item): item is Certificate => item instanceof Certificate,
    );
    if (!(signer.sid instanceof IssuerAndSerialNumber))
      throw new PkiError(
        'INVALID',
        'Timestamp phải xác định chứng thư bằng issuer và serial',
      );
    const sid = signer.sid;
    const certificate = certificates.find(
      (item) =>
        item.issuer.isEqual(sid.issuer) &&
        item.serialNumber.isEqual(sid.serialNumber),
    );
    if (!certificate)
      throw new PkiError('INVALID', 'Timestamp không có chứng thư người ký');
    const eku = certificate.extensions?.find(
      (item) => item.extnID === '2.5.29.37',
    );
    const purposes = (
      eku?.parsedValue as { keyPurposes?: string[] } | undefined
    )?.keyPurposes;
    if (
      !eku?.critical ||
      purposes?.length !== 1 ||
      purposes[0] !== '1.3.6.1.5.5.7.3.8'
    )
      throw new PkiError(
        'INVALID',
        'Chứng thư TSA phải có critical EKU chỉ dành cho timeStamping',
      );
    const attrs = signer.signedAttrs.attributes;
    const contentTypes = attrs.filter(
      (item) => item.type === '1.2.840.113549.1.9.3',
    );
    const messageDigests = attrs.filter(
      (item) => item.type === '1.2.840.113549.1.9.4',
    );
    const algorithm = {
      [SHA256]: 'sha256',
      '2.16.840.1.101.3.4.2.2': 'sha384',
      '2.16.840.1.101.3.4.2.3': 'sha512',
    }[signer.digestAlgorithm.algorithmId];
    const contentType = contentTypes[0]?.values[0];
    const messageDigest = messageDigests[0]?.values[0];
    if (
      !algorithm ||
      contentTypes.length !== 1 ||
      messageDigests.length !== 1 ||
      contentTypes[0].values.length !== 1 ||
      messageDigests[0].values.length !== 1 ||
      !(contentType instanceof asn1js.ObjectIdentifier) ||
      contentType.valueBlock.toString() !== TST_CONTENT ||
      !(messageDigest instanceof asn1js.OctetString) ||
      !same(
        createHash(algorithm).update(infoBytes).digest(),
        messageDigest.valueBlock.valueHexView,
      )
    )
      throw new PkiError('INVALID', 'Timestamp signed attributes không hợp lệ');
    const signingCertificate = attrs.filter((item) =>
      ['1.2.840.113549.1.9.16.2.12', '1.2.840.113549.1.9.16.2.47'].includes(
        item.type,
      ),
    );
    if (
      signingCertificate.length !== 1 ||
      signingCertificate[0].values.length !== 1
    )
      throw new PkiError(
        'INVALID',
        'Timestamp thiếu liên kết ESSCertID với chứng thư TSA',
      );
    const attribute = signingCertificate[0];
    const structure = attribute.values[0] as asn1js.Sequence;
    const identifier = (
      (structure?.valueBlock.value[0] as asn1js.Sequence)?.valueBlock
        .value[0] as asn1js.Sequence
    )?.valueBlock.value;
    if (!Array.isArray(identifier))
      throw new PkiError('INVALID', 'ESSCertID không hợp lệ');
    let hashAlgorithm: string | undefined = attribute.type.endsWith('.12')
      ? 'sha1'
      : 'sha256';
    let hashIndex = 0;
    if (identifier[0] instanceof asn1js.Sequence) {
      const oid = identifier[0].valueBlock.value[0] as asn1js.ObjectIdentifier;
      hashAlgorithm = {
        [SHA256]: 'sha256',
        '2.16.840.1.101.3.4.2.2': 'sha384',
        '2.16.840.1.101.3.4.2.3': 'sha512',
      }[oid.valueBlock.toString()];
      hashIndex = 1;
    }
    const certHash = identifier[hashIndex];
    if (
      !hashAlgorithm ||
      !(certHash instanceof asn1js.OctetString) ||
      !same(
        createHash(hashAlgorithm).update(der(certificate)).digest(),
        certHash.valueBlock.valueHexView,
      )
    )
      throw new PkiError('INVALID', 'ESSCertID không khớp chứng thư TSA');
    assertStrongSignature(
      signer.signatureAlgorithm.algorithmId === '1.2.840.113549.1.1.1'
        ? new AlgorithmIdentifier({ algorithmId: '1.2.840.113549.1.1.11' })
        : signer.signatureAlgorithm,
    );
    if (
      !(await getCrypto(true).verifyWithPublicKey(
        signer.signedAttrs.encodedValue,
        signer.signature,
        certificate.subjectPublicKeyInfo,
        signer.signatureAlgorithm,
        algorithm.toUpperCase().replace('SHA', 'SHA-'),
      ))
    )
      throw new PkiError('INVALID', 'Chữ ký mật mã TSA không hợp lệ');
    const validation = await this.checkCertificate(
      certificate,
      certificates,
      info.genTime,
    );
    return {
      valid: true,
      time: info.genTime.toISOString(),
      serial: Buffer.from(info.serialNumber.valueBlock.valueHexView).toString(
        'hex',
      ),
      policy: info.policy,
      tokenSha256: sha256(token),
      authority: new X509Certificate(der(certificate)).subject,
      certificateSha256: sha256(der(certificate)),
      ...validation,
    };
  }

  timestampAuthority(): TimestampAuthority {
    const service = this;
    return {
      async timestamp(digest: Uint8Array, algorithm: DigestAlgorithm) {
        if (algorithm !== 'SHA-256')
          throw new PkiError('INVALID', 'Timestamp chỉ hỗ trợ SHA-256');
        const url = process.env.PDF_TSA_URL;
        if (!url) throw new PkiError('NOT_CONFIGURED', 'Chưa cấu hình TSA');
        pkiEndpoint(url);
        const nonce = new asn1js.Integer({
          valueHex: arrayBuffer(Buffer.concat([Buffer.of(1), randomBytes(16)])),
        });
        const request = new TimeStampReq({
          version: 1,
          messageImprint: new MessageImprint({
            hashAlgorithm: new AlgorithmIdentifier({ algorithmId: SHA256 }),
            hashedMessage: new asn1js.OctetString({
              valueHex: arrayBuffer(digest),
            }),
          }),
          nonce,
          certReq: true,
        });
        const requestedAt = new Date();
        const responseBytes = await pkiRequest(
          url,
          new Uint8Array(request.toSchema().toBER(false)),
          'application/timestamp-query',
        );
        const response = new TimeStampResp({ schema: parse(responseBytes) });
        if (
          ![0, 1].includes(response.status.status) ||
          !response.timeStampToken
        )
          throw new PkiError('UNAVAILABLE', 'TSA từ chối hoặc không trả token');
        const token = new Uint8Array(
          response.timeStampToken.toSchema().toBER(false),
        );
        await service.validateTimestamp(token, digest, nonce, requestedAt);
        return token;
      },
    };
  }

  async validateSignature(
    signedData: SignedData,
    certificate: Certificate,
  ): Promise<PkiEvidence> {
    const attributes =
      signedData.signerInfos[0].unsignedAttrs?.attributes.filter(
        (item) => item.type === TIMESTAMP_ATTRIBUTE,
      ) || [];
    if (attributes.length !== 1 || attributes[0].values.length !== 1)
      throw new PkiError(
        'INVALID',
        'PDF thiếu timestamp TSA duy nhất cho chữ ký',
      );
    const token = new Uint8Array(attributes[0].values[0].toBER(false));
    const digest = createHash('sha256')
      .update(signedData.signerInfos[0].signature.valueBlock.valueHexView)
      .digest();
    const timestamp = await this.validateTimestamp(token, digest);
    const extra = (signedData.certificates || []).filter(
      (item): item is Certificate => item instanceof Certificate,
    );
    const validation = await this.checkCertificate(
      certificate,
      extra,
      new Date(timestamp.time),
    );
    return { policy: 'pades-bt-pki-v2', timestamp, ...validation };
  }
}
