import { Prisma } from '../generated/prisma/client';
import { CLASSIFICATION_LABELS, dateOnly } from './data-utils';
import { replacementData, replacementReference } from './replacement-data';
import {
  diplomaPrintWarnings,
  latinName,
  type PrintedDiploma,
} from './diploma-print-data';

export const diplomaInclude = {
  institution: true,
  campus: true,
  issuingCampus: true,
  supersedes: { select: { id: true, certificateNo: true, registryNo: true } },
  replacement: {
    select: {
      id: true,
      certificateNo: true,
      registryNo: true,
      workflowStatus: true,
      status: true,
      versions: {
        orderBy: { version: 'desc' as const },
        take: 1,
        include: { anchors: true },
      },
    },
  },
  signedDocuments: {
    orderBy: { version: 'desc' as const },
    take: 1,
    include: { signatures: { orderBy: { signatureOrder: 'asc' as const } } },
  },
  graduation: {
    include: {
      student: true,
      program: true,
      decision: true,
      sourceRow: {
        select: {
          id: true,
          status: true,
          batchId: true,
          sheetName: true,
          rowNumber: true,
          normalizedData: true,
          overrides: true,
          batch: {
            select: { document: { select: { fileName: true, sha256: true } } },
          },
        },
      },
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

export function sourceIssueDateNotRecorded(
  diploma: DiplomaWithRelations,
): boolean {
  const source = diploma.graduation.sourceRow;
  if (
    !source ||
    source.status !== 'IMPORTED' ||
    diploma.issuedOn ||
    diploma.originType === 'ISSUANCE'
  )
    return false;
  const normalized = (source.normalizedData || {}) as Record<string, unknown>;
  const effective = { ...normalized, ...((source.overrides || {}) as object) };
  return (
    Object.hasOwn(normalized, 'issuedOn') &&
    (normalized.issuedOn === null || normalized.issuedOn === '') &&
    (effective.issuedOn === null || effective.issuedOn === '')
  );
}

export function diplomaProjection(
  diploma: DiplomaWithRelations,
  includeProof = false,
) {
  const graduation = diploma.graduation;
  const version = diploma.versions[0];
  const signedDocument = diploma.signedDocuments?.[0];
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
    degreeType: graduation.degreeType,
    printedDiploma: diploma.printTemplate
      ? ({
          template: diploma.printTemplate,
          originType:
            diploma.originType ||
            (graduation.sourceRow ? 'DIGITIZATION' : 'ISSUANCE'),
          institutionName: diploma.institution.name,
          institutionNameEn: diploma.institution.nameEn,
          fullNameLatin:
            diploma.fullNameLatin || latinName(graduation.student.fullName),
          majorNameEn: diploma.majorNameEn || graduation.program.nameEn || null,
          degreeType: graduation.degreeType,
          issuePlace: diploma.issuePlace,
          diplomaSignerName: diploma.diplomaSignerName,
          diplomaSignerTitle: diploma.diplomaSignerTitle,
        } as PrintedDiploma)
      : null,
    programId: graduation.programId,
    gpa: graduation.gpa === null ? null : Number(graduation.gpa),
    gpaScale: graduation.gpaScale,
    grade: graduation.classification
      ? CLASSIFICATION_LABELS[graduation.classification]
      : null,
    issueDate: dateOnly(diploma.issuedOn),
    issueDateStatus: diploma.issuedOn
      ? 'RECORDED'
      : sourceIssueDateNotRecorded(diploma)
        ? 'NOT_IN_SOURCE'
        : 'UNCONFIRMED',
    soHieu: diploma.certificateNo,
    soVaoSo: diploma.registryNo,
    className: graduation.enrollment?.academicClass?.code ?? null,
    namTotNghiep: graduation.graduationYear,
    decisionNo: graduation.decision?.documentNumber ?? null,
    decisionDate: dateOnly(graduation.decision?.signedOn),
    signerName: graduation.decision?.signerName ?? null,
    sourceBatchId: graduation.sourceRow?.batchId ?? null,
    sourceRowId: graduation.sourceRow?.id ?? null,
    sourceFileName: graduation.sourceRow?.batch.document.fileName ?? null,
    sourceSheet: graduation.sourceRow?.sheetName ?? null,
    sourceRowNumber: graduation.sourceRow?.rowNumber ?? null,
    requestType:
      diploma.originType ||
      (graduation.sourceRow ? 'DIGITIZATION' : 'ISSUANCE'),
    status,
    documentStatus: diploma.status,
    workflowStatus: diploma.workflowStatus,
    anchorStatus: anchor?.status ?? null,
    certHash: version?.payloadHash ?? null,
    txId: anchor?.transactionId ?? null,
    version: version?.version ?? null,
    hashVersion: version?.schemaVersion ?? null,
    pdfSignatureCount: signedDocument?.signatures.length ?? 0,
    pdfSigningMode: signedDocument?.signingMode ?? null,
    signedPdfHash: signedDocument?.signedPdfHash ?? null,
    signedPdfAvailable:
      !!signedDocument?.signedPdfHash && status === 'ON_CHAIN',
    pdfSignatures:
      signedDocument?.signatures.map((signature) => ({
        signatureOrder: signature.signatureOrder,
        signerName: signature.signerName,
        certificateSerial: signature.certificateSerial,
        certificateSha256: signature.certificateSha256,
        signedAt: signature.signedAt,
        validTo: signature.validTo,
      })) ?? [],
    org: diploma.campus.code,
    campusName: diploma.campus.name,
    issuingCampusId: diploma.issuingCampusId,
    issuingCampusName: diploma.issuingCampus?.name ?? null,
    issuerOrg: diploma.issuingCampus?.code ?? null,
    issuerMspId: anchor?.issuerMspId ?? null,
    requestedBy: diploma.requestedById,
    requestedAt: diploma.requestedAt,
    approvedBy: diploma.approvedById,
    approvedAt: diploma.approvedAt,
    revokedReason: diploma.revokedReason,
    revokedAt: diploma.revokedAt,
    createdAt: diploma.createdAt,
    updatedAt: diploma.updatedAt,
    supersedesId: diploma.supersedesId || null,
    replaces: diploma.supersedes
      ? {
          id: diploma.supersedes.id,
          certificateNo: diploma.supersedes.certificateNo,
          registryNo: diploma.supersedes.registryNo,
        }
      : null,
    replacement: diploma.replacement
      ? {
          uuid: diploma.replacement.id,
          soHieu: diploma.replacement.certificateNo,
          soVaoSo: diploma.replacement.registryNo,
          workflowStatus: diploma.replacement.workflowStatus,
          committed:
            diploma.replacement.workflowStatus === 'APPROVED' &&
            !!diploma.replacement.versions[0]?.anchors.some(
              (anchor) =>
                anchor.eventType === 'ISSUE' && anchor.status === 'COMMITTED',
            ),
        }
      : null,
    ...(includeProof && version ? { proof: version.payload } : {}),
  };
  const corrected = diploma.supersedesId
    ? replacementData(diploma.replacementData)
    : null;
  if (corrected) {
    Object.assign(projection, {
      mssv: corrected.mssv,
      decisionNo: corrected.decisionNo,
      decisionDate: corrected.decisionDate,
      signerName: corrected.signerName,
      fullName: corrected.fullName,
      dob: corrected.dob,
      major: corrected.major,
      programId: corrected.programId,
      gpa: corrected.gpa,
      gpaScale: corrected.gpaScale,
      grade: corrected.grade,
      degreeType: corrected.degreeType,
      className: corrected.className,
      namTotNghiep: corrected.namTotNghiep,
    });
    if (projection.printedDiploma) {
      projection.printedDiploma.degreeType = corrected.degreeType;
      if (!diploma.fullNameLatin)
        projection.printedDiploma.fullNameLatin = latinName(corrected.fullName);
    }
  }
  if (version) {
    const snapshot = version.payload as Record<string, any>;
    for (const field of [
      'mssv',
      'fullName',
      'dob',
      'major',
      'degreeType',
      'printedDiploma',
      'programId',
      'gpaScale',
      'grade',
      'issueDate',
      'issueDateStatus',
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
  return {
    ...projection,
    replacementReference: corrected ? replacementReference(corrected) : null,
    printWarnings: diplomaPrintWarnings(
      projection.printedDiploma,
      projection.issueDate,
    ),
  };
}

export function publicDiplomaProjection(diploma: DiplomaWithRelations) {
  const projection = diplomaProjection(diploma);
  return {
    uuid: projection.uuid,
    fullName: projection.fullName,
    mssv: projection.mssv,
    major: projection.major,
    degreeType: projection.degreeType,
    printedDiploma: projection.printedDiploma,
    grade: projection.grade,
    namTotNghiep: projection.namTotNghiep,
    soHieu: projection.soHieu,
    issueDate: projection.issueDate,
    issueDateStatus: projection.issueDateStatus,
    status: projection.status,
    isRevoked: projection.documentStatus === 'REVOKED',
    isVerifiable: projection.status === 'ON_CHAIN',
  };
}
