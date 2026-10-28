import { createHash } from 'node:crypto';
import { canonicalize } from 'json-canonicalize';
import { diplomaProjection, DiplomaWithRelations } from './diploma-projection';

export const HASH_SCHEMA_VERSION = 'diploma-v1';
export function payloadHash(payload: unknown) {
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}
export function diplomaPayload(diploma: DiplomaWithRelations) {
  const view = diplomaProjection(diploma);
  return {
    schemaVersion: HASH_SCHEMA_VERSION,
    uuid: diploma.id,
    version: diploma.currentVersion,
    institutionId: diploma.institutionId,
    campusId: diploma.campusId,
    mssv: view.mssv,
    fullName: view.fullName,
    dob: view.dob,
    major: view.major,
    programId: view.programId,
    gpa: view.gpa === null ? null : view.gpa.toFixed(2),
    gpaScale: view.gpaScale,
    grade: view.grade,
    degreeType: view.degreeType,
    ...(view.replacementReference
      ? { replacement: view.replacementReference }
      : {}),
    ...(view.printedDiploma ? { printedDiploma: view.printedDiploma } : {}),
    specialization: diploma.graduation.specialization,
    issueDate: view.issueDate,
    ...(view.issueDateStatus === 'NOT_IN_SOURCE'
      ? {
          issueDateStatus: view.issueDateStatus,
          sourceRegistry: {
            batchId: view.sourceBatchId,
            fileName: view.sourceFileName,
            sha256: diploma.graduation.sourceRow?.batch.document.sha256 || null,
            sheet: view.sourceSheet,
            row: view.sourceRowNumber,
          },
        }
      : {}),
    soHieu: view.soHieu,
    soVaoSo: view.soVaoSo,
    className: view.className,
    namTotNghiep: view.namTotNghiep,
    decisionNo: view.decisionNo,
    decisionDate: view.decisionDate,
    signerName: view.signerName,
  };
}
export function legacyHash(data: Record<string, any>) {
  const raw = [
    data.uuid,
    data.mssv,
    data.fullName,
    data.major,
    Number(data.gpa).toFixed(2),
    data.grade,
    data.issueDate || '',
    data.soHieu || '',
    data.soVaoSo || '',
    data.className || '',
    String(data.namTotNghiep || ''),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}
