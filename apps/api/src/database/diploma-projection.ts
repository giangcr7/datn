import { Prisma } from '../generated/prisma/client';
import { CLASSIFICATION_LABELS, dateOnly } from './data-utils';

export const diplomaInclude = {
  campus: true,
  graduation: {
    include: {
      student: true,
      program: true,
      decision: true,
      enrollment: { include: { academicClass: true } },
    },
  },
  versions: {
    orderBy: { version: 'desc' as const },
    take: 1,
    include: { anchors: true },
  },
} satisfies Prisma.DiplomaInclude;

export type DiplomaWithRelations = Prisma.DiplomaGetPayload<{
  include: typeof diplomaInclude;
}>;

export function diplomaProjection(
  diploma: DiplomaWithRelations,
  includeProof = false,
) {
  const graduation = diploma.graduation;
  const version = diploma.versions[0];
  const anchor = version?.anchors.find((item) => item.eventType === 'ISSUE');
  const status =
    diploma.status === 'REVOKED'
      ? 'REVOKED'
      : diploma.status === 'SUPERSEDED'
        ? 'REPLACED'
        : diploma.workflowStatus === 'REJECTED'
          ? 'REJECTED'
          : diploma.workflowStatus === 'DRAFT'
            ? 'DRAFT'
            : anchor?.status === 'COMMITTED'
              ? 'ON_CHAIN'
              : diploma.workflowStatus === 'APPROVED'
                ? 'ANCHOR_PENDING'
                : 'PENDING';
  const projection = {
    id: diploma.id,
    uuid: diploma.id,
    mssv: graduation.student.studentCode,
    fullName: graduation.student.fullName,
    dob: dateOnly(graduation.student.dateOfBirth),
    major: graduation.program.name,
    programId: graduation.programId,
    gpa: graduation.gpa === null ? null : Number(graduation.gpa),
    gpaScale: graduation.gpaScale,
    grade: graduation.classification
      ? CLASSIFICATION_LABELS[graduation.classification]
      : null,
    issueDate: dateOnly(diploma.issuedOn),
    soHieu: diploma.certificateNo,
    soVaoSo: diploma.registryNo,
    className: graduation.enrollment?.academicClass?.code ?? null,
    namTotNghiep: graduation.graduationYear,
    decisionNo: graduation.decision?.documentNumber ?? null,
    decisionDate: dateOnly(graduation.decision?.signedOn),
    signerName: graduation.decision?.signerName ?? null,
    status,
    documentStatus: diploma.status,
    workflowStatus: diploma.workflowStatus,
    anchorStatus: anchor?.status ?? null,
    certHash: version?.payloadHash ?? null,
    txId: anchor?.transactionId ?? null,
    version: version?.version ?? null,
    hashVersion: version?.schemaVersion ?? null,
    org: diploma.campus.code,
    requestedBy: diploma.requestedById,
    requestedAt: diploma.requestedAt,
    approvedBy: diploma.approvedById,
    approvedAt: diploma.approvedAt,
    revokedReason: diploma.revokedReason,
    revokedAt: diploma.revokedAt,
    createdAt: diploma.createdAt,
    updatedAt: diploma.updatedAt,
    ...(includeProof && version ? { proof: version.payload } : {}),
  };
  if (version) {
    const snapshot = version.payload as Record<string, any>;
    for (const field of [
      'mssv',
      'fullName',
      'dob',
      'major',
      'programId',
      'gpaScale',
      'grade',
      'issueDate',
      'soHieu',
      'soVaoSo',
      'className',
      'namTotNghiep',
      'decisionNo',
      'decisionDate',
      'signerName',
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(snapshot, field))
        (projection as any)[field] = snapshot[field];
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'gpa'))
      projection.gpa = snapshot.gpa === null ? null : Number(snapshot.gpa);
  }
  return projection;
}

export function publicDiplomaProjection(diploma: DiplomaWithRelations) {
  const projection = diplomaProjection(diploma);
  return {
    uuid: projection.uuid,
    fullName: projection.fullName,
    mssv: projection.mssv,
    major: projection.major,
    grade: projection.grade,
    namTotNghiep: projection.namTotNghiep,
    soHieu: projection.soHieu,
    issueDate: projection.issueDate,
    status: projection.status,
    isRevoked: projection.documentStatus === 'REVOKED',
    isVerifiable: projection.status === 'ON_CHAIN',
  };
}
