import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FabricService } from '../fabric/fabric.service';
import { DatabaseService } from '../database/database.service';
import {
  diplomaInclude,
  diplomaProjection,
} from '../database/diploma-projection';
import {
  HASH_SCHEMA_VERSION,
  legacyHash,
  payloadHash,
} from '../database/diploma-hash';
import { PdfSignatureService } from '../signatures/pdf-signature.service';
import { fileHash } from '../signatures/pdf-signature-engine';

@Injectable()
export class VerifyService {
  constructor(
    private readonly fabric: FabricService,
    private readonly database: DatabaseService,
    private readonly pdfSignatures?: PdfSignatureService,
  ) {}
  async verifyPdf(buffer: Buffer) {
    if (
      !buffer?.length ||
      buffer.length > 10 * 1024 * 1024 ||
      buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    )
      throw new BadRequestException('Cần file PDF hợp lệ, không quá 10 MB');
    const hash = fileHash(buffer);
    const document = await this.database.signedDiplomaDocument.findUnique({
      where: { signedPdfHash: hash },
    });
    if (!document?.versionId)
      return {
        success: true,
        isValid: false,
        verificationStatus: 'PDF_NOT_REGISTERED',
        message:
          'File không phải bản PDF đã ký được lưu trong hệ thống, hoặc đã bị thay đổi. QR/metadata giống nhau không chứng minh file hợp lệ.',
      };
    const result = await this.verify({ uuid: document.diplomaId });
    if (!result.isValid) return result;
    if (result.details?.signedPdfHash !== hash)
      return {
        success: true,
        isValid: false,
        verificationStatus: 'PDF_VERSION_MISMATCH',
        message: 'PDF không trùng phiên bản văn bằng đang có hiệu lực',
      };
    return { ...result, fileVerification: 'EXACT_SIGNED_FILE_MATCH' };
  }
  async verify(input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Minh chứng phải là object');
    let proof: Record<string, any>;
    try {
      proof = input.proofString
        ? JSON.parse(input.proofString)
        : input.proof || input;
    } catch {
      throw new BadRequestException('Minh chứng JSON không hợp lệ');
    }
    if (!proof || typeof proof !== 'object' || Array.isArray(proof))
      throw new BadRequestException('Minh chứng phải là object');
    let uuid = proof.uuid || proof.certUUID;
    if (!uuid && /^[0-9a-f]{64}$/i.test(proof.certHash || ''))
      uuid = (
        await this.database.diplomaVersion.findFirst({
          where: { payloadHash: proof.certHash.toLowerCase() },
          orderBy: { version: 'desc' },
        })
      )?.diplomaId;
    if (
      typeof uuid !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      )
    )
      throw new BadRequestException('UUID không hợp lệ');
    const diploma = await this.database.diploma.findUnique({
      where: { id: uuid },
      include: diplomaInclude,
    });
    if (!diploma) throw new NotFoundException('Không tìm thấy văn bằng');
    const version = diploma.versions[0];
    const view = diplomaProjection(diploma);
    if (diploma.status === 'REVOKED' || diploma.status === 'SUPERSEDED')
      return {
        success: true,
        isValid: false,
        isRevoked: diploma.status === 'REVOKED',
        verificationStatus:
          diploma.status === 'SUPERSEDED' && !view.replacement?.committed
            ? 'REPLACEMENT_PENDING'
            : diploma.status,
        message:
          diploma.status === 'SUPERSEDED'
            ? view.replacement?.committed
              ? 'Văn bằng này đã được thay thế và không còn hiệu lực. Vui lòng sử dụng văn bằng thay thế.'
              : 'Văn bằng cũ đã ngừng hiệu lực để thay thế. Văn bằng mới chưa được blockchain xác nhận; chưa thể sử dụng.'
            : 'Văn bằng đã bị thu hồi',
        details: {
          studentName: view.fullName,
          revokedReason: diploma.revokedReason,
          ...(view.replacement?.committed
            ? {
                replacementUuid: view.replacement.uuid,
                replacementCertificateNo: view.replacement.soHieu,
              }
            : {}),
        },
      };
    if (
      !version ||
      diploma.status !== 'ACTIVE' ||
      diploma.workflowStatus !== 'APPROVED'
    )
      return {
        success: true,
        isValid: false,
        verificationStatus: 'NOT_APPROVED',
        message: 'Văn bằng chưa được phê duyệt',
      };
    const anchor = version.anchors.find((item) => item.eventType === 'ISSUE');
    if (anchor?.status !== 'COMMITTED')
      return {
        success: true,
        isValid: false,
        verificationStatus: 'ANCHOR_PENDING',
        message: 'Chưa có xác nhận commit từ blockchain',
      };
    const onlyId = Object.keys(proof).every((key) =>
      ['uuid', 'certUUID', 'certHash'].includes(key),
    );
    const storedPayload = version.payload as Record<string, any>;
    const databaseHash =
      version.schemaVersion === HASH_SCHEMA_VERSION
        ? payloadHash(storedPayload)
        : legacyHash(storedPayload);
    const proofHash = onlyId
      ? proof.certHash || databaseHash
      : version.schemaVersion === HASH_SCHEMA_VERSION
        ? payloadHash(proof)
        : legacyHash({ ...proof, uuid });
    let chain: any;
    try {
      const response = await this.fabric.execute(
        'evaluate',
        version.schemaVersion === HASH_SCHEMA_VERSION
          ? 'QueryDiplomaAnchor'
          : 'QueryCertificate',
        uuid,
        ...(version.schemaVersion === HASH_SCHEMA_VERSION
          ? [String(version.version)]
          : []),
      );
      chain = response.result;
      if (
        !chain ||
        typeof chain !== 'object' ||
        typeof (chain.payloadHash || chain.certHash) !== 'string'
      )
        throw new Error('Invalid blockchain response');
    } catch {
      return {
        success: true,
        isValid: false,
        verificationStatus: 'UNAVAILABLE',
        message:
          'Không thể kiểm tra blockchain. Không kết luận văn bằng hợp lệ.',
      };
    }
    const chainHash = chain.payloadHash || chain.certHash;
    if (storedPayload.replacement) {
      const previous = storedPayload.replacement as {
        uuid: string;
        version: number;
        payloadHash: string;
      };
      try {
        const prior = (
          await this.fabric.execute(
            'evaluate',
            'QueryDiplomaAnchor',
            previous.uuid,
            String(previous.version),
          )
        ).result as { isRevoked?: boolean; payloadHash?: string };
        if (
          !prior ||
          prior.isRevoked !== true ||
          prior.payloadHash !== previous.payloadHash
        )
          return {
            success: true,
            isValid: false,
            verificationStatus: 'REPLACEMENT_PENDING',
            message:
              'Chưa xác nhận được văn bằng gốc đã ngừng hiệu lực; chưa thể xác thực văn bằng thay thế.',
          };
      } catch {
        return {
          success: true,
          isValid: false,
          verificationStatus: 'UNAVAILABLE',
          message:
            'Chưa đối chiếu được trạng thái văn bằng gốc trên blockchain. Vui lòng thử lại sau.',
        };
      }
    }
    const databaseMatch =
      databaseHash === version.payloadHash &&
      databaseHash === anchor.payloadHash &&
      databaseHash === chainHash;
    const issuerMatch =
      version.schemaVersion !== HASH_SCHEMA_VERSION ||
      chain.issuerMspId === anchor.issuerMspId;
    const proofMatch = proofHash === chainHash;
    const isRevoked = !!chain.isRevoked;
    let pdfVerification: Awaited<
      ReturnType<PdfSignatureService['verifyStored']>
    > | null = null;
    let pdfValid = !storedPayload.signedPdfHash;
    if (storedPayload.signedPdfHash && this.pdfSignatures) {
      try {
        const document = diploma.signedDocuments.find(
          (item) => item.versionId === version.id,
        );
        if (document) {
          pdfVerification = await this.pdfSignatures.verifyStored(
            document,
            storedPayload,
          );
          pdfValid = pdfVerification.valid;
        }
      } catch {
        pdfValid = false;
      }
    }
    const isValid =
      databaseMatch && proofMatch && issuerMatch && !isRevoked && pdfValid;
    return {
      success: true,
      isValid,
      isRevoked,
      verificationStatus: isValid
        ? pdfVerification?.signingMode === 'demo'
          ? 'VERIFIED_DEMO'
          : 'VERIFIED'
        : isRevoked
          ? 'REVOKED'
          : !issuerMatch
            ? 'ISSUER_MISMATCH'
            : !pdfValid
              ? pdfVerification?.pkiStatus === 'UNAVAILABLE'
                ? 'PKI_UNAVAILABLE'
                : pdfVerification?.pkiStatus === 'REVOKED'
                  ? 'CERTIFICATE_REVOKED'
                  : pdfVerification?.pkiStatus === 'STALE'
                    ? 'PKI_EVIDENCE_STALE'
                    : 'PDF_SIGNATURE_INVALID'
              : 'HASH_MISMATCH',
      message: isValid
        ? pdfVerification
          ? 'Chữ ký số và hash PDF khớp blockchain. ' +
            (pdfVerification.pkiStatus === 'VALID'
              ? 'Đã xác minh chuỗi CA, dấu thời gian TSA và trạng thái OCSP/CRL.'
              : 'Hồ sơ cũ chưa có TSA và kiểm tra thu hồi chứng thư.')
          : 'Dữ liệu văn bằng khớp snapshot và blockchain; hồ sơ cũ chưa có PDF ký số'
        : isRevoked
          ? 'Văn bằng đã bị thu hồi trên blockchain'
          : !pdfValid
            ? pdfVerification?.pkiStatus === 'UNAVAILABLE'
              ? 'Không kết nối được dịch vụ PKI; chưa đủ bằng chứng để kết luận chữ ký hợp lệ. Vui lòng kiểm tra lại sau.'
              : pdfVerification?.pkiStatus === 'REVOKED'
                ? 'Chứng thư ký PDF hoặc TSA đã bị thu hồi; không xác nhận chữ ký hợp lệ.'
                : pdfVerification?.pkiStatus === 'STALE'
                  ? 'Bằng chứng thu hồi đã cũ hoặc thiếu hạn cập nhật; không xác nhận chữ ký hợp lệ.'
                  : 'Không xác minh được đầy đủ chữ ký, dấu thời gian, trạng thái chứng thư hoặc file PDF đã thay đổi'
            : 'Minh chứng hoặc snapshot không khớp blockchain',
      details: {
        studentName: storedPayload.fullName,
        mssv: storedPayload.mssv,
        major: storedPayload.major,
        grade: storedPayload.grade,
        gpa: storedPayload.gpa,
        issueDate: storedPayload.issueDate,
        issueDateStatus:
          storedPayload.issueDateStatus ||
          (storedPayload.issueDate ? 'RECORDED' : 'UNCONFIRMED'),
        degreeType: storedPayload.degreeType,
        printedDiploma: storedPayload.printedDiploma || null,
        soVaoSo: storedPayload.soVaoSo,
        soHieu: storedPayload.soHieu,
        namTotNghiep: storedPayload.namTotNghiep,
        txId: anchor.transactionId,
        onChainHash: chainHash,
        proofHash,
        dbHash: databaseHash,
        proofMatchChain: proofMatch,
        dbMatchChain: databaseMatch,
        issuerMatchChain: issuerMatch,
        issuerMspId: chain.issuerMspId ?? null,
        signedPdfHash: storedPayload.signedPdfHash || null,
        pdfSignatureStatus: storedPayload.signedPdfHash
          ? pdfValid
            ? 'VALID'
            : 'INVALID'
          : 'NOT_SIGNED',
        pdfVerification,
      },
    };
  }
}
