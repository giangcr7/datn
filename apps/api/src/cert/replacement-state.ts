import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import {
  diplomaInclude,
  diplomaProjection,
  type DiplomaWithRelations,
} from '../database/diploma-projection';
import { classificationFrom, jsonData } from '../database/data-utils';
import { payloadHash } from '../database/diploma-hash';
import { replacementData } from '../database/replacement-data';
import type { Prisma } from '../generated/prisma/client';

export function replacementErrors(record: DiplomaWithRelations): string[] {
  const data = replacementData(record.replacementData);
  const view = diplomaProjection(record);
  const errors = [...view.printWarnings];
  const dob = view.dob ? new Date(view.dob) : null;
  if (!data?.reason?.trim() || !data.basis?.trim())
    errors.push('Thiếu lý do và căn cứ thay thế');
  if (
    !view.fullName?.trim() ||
    !dob ||
    !Number.isFinite(dob.getTime()) ||
    dob.getUTCFullYear() < 1900 ||
    dob > new Date() ||
    dob.getUTCFullYear() >= view.namTotNghiep
  )
    errors.push('Họ tên hoặc ngày sinh không hợp lệ');
  if (
    !Number.isInteger(view.namTotNghiep) ||
    view.namTotNghiep < 1900 ||
    view.namTotNghiep > new Date().getUTCFullYear()
  )
    errors.push('Năm tốt nghiệp không hợp lệ');
  if (!view.grade || !classificationFrom(view.grade))
    errors.push('Xếp loại chưa hợp lệ');
  if (
    view.gpa !== null &&
    (!Number.isFinite(view.gpa) || view.gpa < 0 || view.gpa > view.gpaScale)
  )
    errors.push('Điểm không phù hợp thang điểm');
  if (
    !record.issuedOn ||
    record.issuedOn > new Date() ||
    record.issuedOn.getUTCFullYear() < view.namTotNghiep ||
    (dob && record.issuedOn < dob)
  )
    errors.push('Ngày cấp văn bằng thay thế chưa hợp lệ');
  if (!view.soHieu?.trim() || !view.soVaoSo?.trim())
    errors.push('Thiếu số hiệu hoặc số vào sổ');
  return [...new Set(errors)];
}

export async function replacementSource(
  transaction: Prisma.TransactionClient,
  record: DiplomaWithRelations,
) {
  const data = replacementData(record.replacementData);
  const source = await transaction.diploma.findFirst({
    where: {
      id: record.supersedesId || '',
      institutionId: record.institutionId,
      campusId: record.campusId,
    },
    include: diplomaInclude,
  });
  const version = source?.versions[0];
  const anchor = version?.anchors.find((item) => item.eventType === 'ISSUE');
  if (
    !source ||
    source.status !== 'ACTIVE' ||
    source.workflowStatus !== 'APPROVED' ||
    anchor?.status !== 'COMMITTED' ||
    !anchor.issuerMspId ||
    !data ||
    data.previousUuid !== source.id ||
    data.previousVersion !== version?.version ||
    data.previousPayloadHash !== version.payloadHash ||
    version.anchors.some((item) => item.eventType === 'REVOKE') ||
    record.graduationId !== source.graduationId
  )
    throw new ConflictException(
      'Văn bằng gốc đã thay đổi, bị thu hồi hoặc chưa được blockchain xác nhận',
    );
  if (
    record.certificateNo === source.certificateNo ||
    record.registryNo === source.registryNo
  )
    throw new BadRequestException(
      'Văn bằng thay thế phải có số hiệu và số vào sổ mới',
    );
  if (record.issuedOn && source.issuedOn && record.issuedOn < source.issuedOn)
    throw new BadRequestException(
      'Ngày cấp thay thế không được trước ngày cấp văn bằng gốc',
    );
  return { source, version, anchor, data };
}

export async function queueReplacementRevocation(
  transaction: Prisma.TransactionClient,
  record: DiplomaWithRelations,
  actor: AuthActor,
) {
  const errors = replacementErrors(record);
  if (errors.length) throw new BadRequestException(errors.join('; '));
  const { source, version, anchor, data } = await replacementSource(
    transaction,
    record,
  );
  const reason = `Thay thế bằng ${record.certificateNo}. ${data.reason}. Căn cứ: ${data.basis}`;
  await transaction.diploma.update({
    where: { id: source.id },
    data: {
      status: 'SUPERSEDED',
      revokedReason: reason,
      revokedAt: new Date(),
    },
  });
  await transaction.blockchainAnchor.create({
    data: {
      versionId: version.id,
      eventType: 'REVOKE',
      channel: anchor.channel,
      chaincode: anchor.chaincode,
      payloadHash: version.payloadHash,
      issuerMspId: anchor.issuerMspId,
    },
  });
  await transaction.outboxEvent.create({
    data: {
      versionId: version.id,
      eventType: 'REVOKE',
      payload: jsonData({
        uuid: source.id,
        version: version.version,
        payloadHash: version.payloadHash,
        issuerMspId: anchor.issuerMspId,
        reasonHash: payloadHash({ reason }),
      }),
    },
  });
  await transaction.diplomaEvent.create({
    data: {
      diplomaId: source.id,
      actorId: actor.id,
      eventType: 'SUPERSEDED',
      reason,
      metadata: { replacementId: record.id, basis: data.basis },
      createdAt: new Date(),
    },
  });
}
