import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { Signer } from '@libpdf/core';
import type { AuthActor } from '../auth/auth-actor';
import { Prisma } from '../generated/prisma/client';
import { diplomaPayload, payloadHash } from '../database/diploma-hash';
import type { DiplomaWithRelations } from '../database/diploma-projection';
import { DocumentStorageService } from '../storage/document-storage.service';
import {
  certificateInfo,
  createDiplomaPdf,
  demoSigner,
  fileHash,
  inspectPdfSignatures,
  PDF_SIGNATURE_FIELDS,
  PDF_SIGNATURE_POLICY,
  PDF_PKI_SIGNATURE_POLICY,
  SINGLE_APPROVER_SIGNATURE_POLICY,
  SINGLE_APPROVER_PKI_SIGNATURE_POLICY,
  signPdf,
} from './pdf-signature-engine';
import { PkiService, der, type PkiEvidence } from './pki.service';
import { Certificate } from 'pkijs';
import { jsonData } from '../database/data-utils';
import { PkiError } from './pki-transport';

type DocumentWithSignatures = Prisma.SignedDiplomaDocumentGetPayload<{
  include: { signatures: true };
}>;
type SignatureRecord = ReturnType<typeof certificateInfo> & {
  actorId: string;
  campusId: string;
  signerName: string;
  fieldName: string;
  signatureOrder: number;
  signedAt: Date;
  validationEvidence?: Prisma.InputJsonValue;
};
export type PreparedSignedPdf = {
  documentId: string;
  signedPdfKey: string;
  signedPdfHash: string;
  byteSize: number;
  signature: SignatureRecord;
  payload: Record<string, unknown>;
};

@Injectable()
export class PdfSignatureService {
  private readonly pki = new PkiService();
  constructor(private readonly storage: DocumentStorageService) {}

  private async storePdf(
    transaction: Prisma.TransactionClient,
    institutionId: string,
    hash: string,
    bytes: Buffer,
  ) {
    const storageKey = institutionId + '/' + hash + '.pdf';
    await transaction.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      storageKey,
    );
    return this.storage.put(institutionId, hash, bytes, 'pdf');
  }

  get enabled() {
    return (
      !!process.env.PDF_SIGNING_MODE &&
      process.env.PDF_SIGNING_MODE !== 'disabled'
    );
  }

  private async signer(prefix: 'ORG1' | 'ORG2'): Promise<Signer> {
    const mode = process.env.PDF_SIGNING_MODE;
    if (
      !['demo', 'certificate'].includes(mode || '') ||
      (mode === 'demo' && process.env.NODE_ENV === 'production')
    )
      throw new ServiceUnavailableException(
        'Chế độ ký số chưa cấu hình hoặc chứng thư demo bị cấm trên production',
      );
    let signer: Signer;
    try {
      const password = process.env['PDF_' + prefix + '_PASSWORD'];
      if (!password) throw new Error('Missing signing password');
      if (mode === 'demo') {
        signer = await demoSigner(
          process.env['PDF_' + prefix + '_CERT_PATH']!,
          process.env['PDF_' + prefix + '_KEY_PATH']!,
          password,
        );
      } else {
        const { P12Signer } = await import('@libpdf/core');
        signer = await P12Signer.create(
          await readFile(process.env['PDF_' + prefix + '_P12_PATH']!),
          password,
        );
      }
      const certificate = certificateInfo(signer.certificate);
      if (
        certificate.validFrom > new Date() ||
        certificate.validTo <= new Date()
      )
        throw new Error('Signing certificate expired');
      const expected = process.env['PDF_' + prefix + '_CERT_SHA256'];
      if (!expected || expected.toLowerCase() !== certificate.certificateSha256)
        throw new Error('Certificate fingerprint mismatch');
    } catch {
      throw new ServiceUnavailableException(
        'Không thể dùng chứng thư ký ' +
          prefix +
          '; kiểm tra cấu hình, mật khẩu, fingerprint và hạn chứng thư',
      );
    }
    if (this.pki.enabled) {
      try {
        const certificate = Certificate.fromBER(
          Uint8Array.from(signer.certificate).buffer,
        );
        const extra = (signer.certificateChain || []).map((bytes) =>
          Certificate.fromBER(Uint8Array.from(bytes).buffer),
        );
        const validation = await this.pki.certificatePath(certificate, extra);
        await this.pki.checkCertificate(certificate, extra);
        return {
          certificate: signer.certificate,
          certificateChain: validation.path.slice(1).map(der),
          keyType: signer.keyType,
          signatureAlgorithm: signer.signatureAlgorithm,
          sign: signer.sign.bind(signer),
        };
      } catch (error) {
        throw new ServiceUnavailableException(
          error instanceof PkiError
            ? error.message
            : 'Không kiểm tra được chuỗi CA và trạng thái thu hồi chứng thư',
        );
      }
    }
    return signer;
  }

  private record(
    signed: Awaited<ReturnType<typeof signPdf>>,
    actor: AuthActor,
    order: number,
    evidence?: PkiEvidence,
  ): SignatureRecord {
    return {
      actorId: actor.id,
      campusId: actor.campusId,
      signerName: actor.name || actor.email,
      fieldName: PDF_SIGNATURE_FIELDS[order - 1],
      signatureOrder: order,
      signedAt: signed.signedAt,
      certificateSha256: signed.certificateSha256,
      certificateSerial: signed.certificateSerial,
      certificateSubject: signed.certificateSubject,
      certificateIssuer: signed.certificateIssuer,
      validFrom: signed.validFrom,
      validTo: signed.validTo,
      ...(evidence ? { validationEvidence: jsonData(evidence) } : {}),
    };
  }

  private async sign(...parameters: Parameters<typeof signPdf>) {
    try {
      return await signPdf(...parameters);
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof PkiError
          ? 'Không thể ký PDF: ' + error.message
          : 'Không thể hoàn tất ký PDF hoặc lấy dấu thời gian TSA; chưa phát hành văn bằng',
      );
    }
  }

  async prepareFinal(
    transaction: Prisma.TransactionClient,
    diploma: DiplomaWithRelations,
    actor: AuthActor,
  ): Promise<PreparedSignedPdf> {
    if (
      actor.role !== 'university' ||
      !actor.isHeadquarters ||
      !actor.canApproveDiplomas ||
      diploma.campusId !== actor.campusId ||
      diploma.institutionId !== actor.institutionId
    )
      throw new ForbiddenException(
        'Chỉ cán bộ có quyền tại cơ sở chính được ký phát hành',
      );
    const existing = await transaction.signedDiplomaDocument.findUnique({
      where: {
        diplomaId_version: {
          diplomaId: diploma.id,
          version: diploma.currentVersion,
        },
      },
    });
    if (existing)
      throw new ConflictException(
        'Hồ sơ đã có PDF ký số; không được ghi đè lịch sử chữ ký',
      );
    const basePayload = diplomaPayload(diploma);
    const signer = await this.signer('ORG2');
    const signingMode =
      process.env.PDF_SIGNING_MODE === 'demo' ? 'demo' : 'certificate';
    const url = new URL(
      '/verify',
      process.env.WEB_URL || 'http://localhost:3000',
    );
    url.searchParams.set('proof', JSON.stringify({ uuid: diploma.id }));
    const unsigned = await createDiplomaPdf(
      basePayload,
      url.toString(),
      signingMode === 'demo',
      actor.name || actor.email,
      this.pki.enabled,
      false,
      true,
    );
    const signed = await this.sign(
      unsigned,
      signer,
      1,
      actor.name || actor.email,
      this.pki.enabled ? this.pki : undefined,
    );
    const signatures = await inspectPdfSignatures(
      signed.bytes,
      this.pki.enabled ? this.pki : undefined,
    );
    if (
      signatures.length !== 1 ||
      !signatures[0].cryptographicallyValid ||
      !signatures[0].certificateCurrent ||
      signatures[0].fieldName !== PDF_SIGNATURE_FIELDS[0] ||
      signatures[0].certificateSha256 !== signed.certificateSha256 ||
      signatures[0].coveredBytes !== signed.bytes.length ||
      (this.pki.enabled && signatures[0].pkiStatus !== 'VALID')
    )
      throw new ServiceUnavailableException(
        'Không xác minh được chữ ký PDF; chưa phát hành văn bằng',
      );
    const signedPdfHash = fileHash(signed.bytes);
    const signedPdfKey = await this.storePdf(
      transaction,
      actor.institutionId,
      signedPdfHash,
      signed.bytes,
    );
    const signature = this.record(signed, actor, 1, signatures[0].pkiEvidence);
    const document = await transaction.signedDiplomaDocument.create({
      data: {
        diplomaId: diploma.id,
        version: diploma.currentVersion,
        payloadHash: payloadHash(basePayload),
        signingMode,
        originPdfKey: signedPdfKey,
        originPdfHash: signedPdfHash,
        byteSize: signed.bytes.length,
      },
    });
    return {
      documentId: document.id,
      signedPdfHash,
      signedPdfKey,
      byteSize: signed.bytes.length,
      signature,
      payload: {
        ...basePayload,
        signedPdfHash,
        pdfSigningMode: signingMode,
        pdfSignaturePolicy: this.pki.enabled
          ? SINGLE_APPROVER_PKI_SIGNATURE_POLICY
          : SINGLE_APPROVER_SIGNATURE_POLICY,
        pdfSignatures: [
          {
            fieldName: signature.fieldName,
            certificateSha256: signature.certificateSha256,
            campusId: signature.campusId,
            actorId: signature.actorId,
            signatureOrder: 1,
            ...(signature.validationEvidence
              ? {
                  validationEvidenceHash: payloadHash(
                    signature.validationEvidence,
                  ),
                }
              : {}),
          },
        ],
      },
    };
  }

  async attachVersion(
    transaction: Prisma.TransactionClient,
    prepared: PreparedSignedPdf,
    versionId: string,
  ) {
    await transaction.diplomaPdfSignature.create({
      data: { documentId: prepared.documentId, ...prepared.signature },
    });
    await transaction.signedDiplomaDocument.update({
      where: { id: prepared.documentId },
      data: {
        versionId,
        signedPdfKey: prepared.signedPdfKey,
        signedPdfHash: prepared.signedPdfHash,
        byteSize: prepared.byteSize,
        completedAt: new Date(),
      },
    });
  }

  async verifyStored(
    document: DocumentWithSignatures,
    snapshot: Record<string, unknown>,
  ) {
    if (!document.signedPdfKey || !document.signedPdfHash)
      throw new Error('PDF is not fully signed');
    const bytes = await this.storage.getPdf(
      document.signedPdfKey,
      document.signedPdfHash,
    );
    const singleApprover = [
      SINGLE_APPROVER_SIGNATURE_POLICY,
      SINGLE_APPROVER_PKI_SIGNATURE_POLICY,
    ].includes(String(snapshot.pdfSignaturePolicy));
    const expectedCount = singleApprover ? 1 : 2;
    const hardened = [
      PDF_PKI_SIGNATURE_POLICY,
      SINGLE_APPROVER_PKI_SIGNATURE_POLICY,
    ].includes(String(snapshot.pdfSignaturePolicy));
    const actual = await inspectPdfSignatures(
      bytes,
      hardened ? this.pki : undefined,
    );
    const pinned = snapshot.pdfSignatures as
      | Array<{
          fieldName: string;
          certificateSha256: string;
          campusId: string;
          actorId?: string;
          signatureOrder: number;
          validationEvidenceHash?: string;
        }>
      | undefined;
    const records = [...document.signatures].sort(
      (left, right) => left.signatureOrder - right.signatureOrder,
    );
    const valid =
      [
        PDF_SIGNATURE_POLICY,
        PDF_PKI_SIGNATURE_POLICY,
        SINGLE_APPROVER_SIGNATURE_POLICY,
        SINGLE_APPROVER_PKI_SIGNATURE_POLICY,
      ].includes(String(snapshot.pdfSignaturePolicy)) &&
      snapshot.signedPdfHash === document.signedPdfHash &&
      snapshot.pdfSigningMode === document.signingMode &&
      actual.length === expectedCount &&
      Array.isArray(pinned) &&
      pinned.length === expectedCount &&
      records.length === expectedCount &&
      (singleApprover
        ? records[0].campusId === snapshot.campusId &&
          pinned[0].actorId === records[0].actorId
        : records[0].actorId !== records[1].actorId &&
          records[0].campusId !== records[1].campusId) &&
      actual.every(
        (signature, index) =>
          signature.cryptographicallyValid &&
          (hardened
            ? signature.pkiStatus === 'VALID'
            : signature.certificateCurrent) &&
          signature.fieldName === PDF_SIGNATURE_FIELDS[index] &&
          signature.fieldName === pinned[index]?.fieldName &&
          signature.fieldName === records[index].fieldName &&
          records[index].signatureOrder === index + 1 &&
          pinned[index].signatureOrder === index + 1 &&
          pinned[index].campusId === records[index].campusId &&
          signature.certificateSha256 === pinned[index].certificateSha256 &&
          signature.certificateSha256 === records[index].certificateSha256,
      ) &&
      (singleApprover ||
        actual[0].certificateSha256 !== actual[1].certificateSha256) &&
      fileHash(bytes.subarray(0, actual[0].coveredBytes)) ===
        document.originPdfHash &&
      actual[expectedCount - 1].coveredBytes === bytes.length;
    const pkiValid =
      !hardened ||
      (actual.length === expectedCount &&
        actual.every(
          (item, index) =>
            item.pkiStatus === 'VALID' &&
            !!records[index]?.validationEvidence &&
            payloadHash(records[index].validationEvidence) ===
              pinned?.[index].validationEvidenceHash &&
            (records[index].validationEvidence as unknown as PkiEvidence)
              .timestamp?.tokenSha256 ===
              item.pkiEvidence?.timestamp.tokenSha256,
        ));
    const unavailable =
      hardened &&
      actual.some((item) =>
        ['UNAVAILABLE', 'NOT_CONFIGURED'].includes(item.pkiStatus || ''),
      );
    const failure = ['REVOKED', 'INVALID', 'UNKNOWN', 'STALE'].find((status) =>
      actual.some((item) => item.pkiStatus === status),
    );
    return {
      valid: !!valid && pkiValid,
      signingMode: document.signingMode,
      signedPdfHash: document.signedPdfHash,
      policy: snapshot.pdfSignaturePolicy,
      pkiStatus: hardened
        ? failure ||
          (unavailable ? 'UNAVAILABLE' : pkiValid ? 'VALID' : 'INVALID')
        : 'NOT_CHECKED',
      revocationCheck: hardened
        ? failure ||
          (unavailable ? 'UNAVAILABLE' : pkiValid ? 'GOOD' : 'FAILED')
        : 'NOT_CHECKED',
      trustedTimestamp:
        hardened &&
        actual.length === expectedCount &&
        pkiValid &&
        actual.every((item) => !!item.pkiEvidence?.timestamp.valid),
      signatures: actual.map((item, index) => ({
        ...item,
        pkiEvidence: item.pkiEvidence,
        signatureOrder: index + 1,
        signerName: document.signatures.find(
          (record) => record.signatureOrder === index + 1,
        )?.signerName,
        signedAt: document.signatures.find(
          (record) => record.signatureOrder === index + 1,
        )?.signedAt,
        organization: singleApprover
          ? 'Cơ sở chính TP. Hồ Chí Minh'
          : index === 0
            ? 'Phân hiệu TP.HCM'
            : 'Trụ sở Hà Nội',
        trustSource: 'BLOCKCHAIN_PINNED_CERTIFICATE',
      })),
    };
  }

  getPdf(document: {
    signedPdfKey: string | null;
    signedPdfHash: string | null;
  }) {
    if (!document.signedPdfKey || !document.signedPdfHash)
      throw new ConflictException('Chưa có PDF ký số hoàn chỉnh');
    return this.storage.getPdf(document.signedPdfKey, document.signedPdfHash);
  }

  getCampusPdf(document: { originPdfKey: string; originPdfHash: string }) {
    return this.storage.getPdf(document.originPdfKey, document.originPdfHash);
  }
}
