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

@Injectable()
export class VerifyService {
  constructor(
    private readonly fabric: FabricService,
    private readonly database: DatabaseService,
  ) {}
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
        verificationStatus: diploma.status,
        message: 'Văn bằng đã bị thu hồi hoặc thay thế',
        details: {
          studentName: view.fullName,
          revokedReason: diploma.revokedReason,
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
    const databaseMatch =
      databaseHash === version.payloadHash &&
      databaseHash === anchor.payloadHash &&
      databaseHash === chainHash;
    const proofMatch = proofHash === chainHash;
    const isRevoked = !!chain.isRevoked;
    const isValid = databaseMatch && proofMatch && !isRevoked;
    return {
      success: true,
      isValid,
      isRevoked,
      verificationStatus: isValid
        ? 'VERIFIED'
        : isRevoked
          ? 'REVOKED'
          : 'HASH_MISMATCH',
      message: isValid
        ? 'Văn bằng khớp snapshot đã phê duyệt và blockchain'
        : isRevoked
          ? 'Văn bằng đã bị thu hồi trên blockchain'
          : 'Minh chứng hoặc snapshot không khớp blockchain',
      details: {
        studentName: storedPayload.fullName,
        mssv: storedPayload.mssv,
        major: storedPayload.major,
        grade: storedPayload.grade,
        gpa: storedPayload.gpa,
        issueDate: storedPayload.issueDate,
        soHieu: storedPayload.soHieu,
        namTotNghiep: storedPayload.namTotNghiep,
        txId: anchor.transactionId,
        onChainHash: chainHash,
        proofHash,
        dbHash: databaseHash,
        proofMatchChain: proofMatch,
        dbMatchChain: databaseMatch,
      },
    };
  }
}
