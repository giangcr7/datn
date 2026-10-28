import type { Prisma } from '../generated/prisma/client';

export interface ReplacementData {
  previousUuid: string;
  previousVersion: number;
  previousPayloadHash: string;
  reason: string;
  basis: string;
  mssv: string;
  decisionNo: string | null;
  decisionDate: string | null;
  signerName: string | null;
  fullName: string;
  dob: string | null;
  programId: string;
  major: string;
  gpa: number | null;
  gpaScale: number;
  grade: string | null;
  degreeType: string | null;
  className: string | null;
  namTotNghiep: number;
}

export function replacementData(
  value: Prisma.JsonValue | undefined,
): ReplacementData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as ReplacementData;
}

export function replacementReference(data: ReplacementData) {
  return {
    uuid: data.previousUuid,
    version: data.previousVersion,
    payloadHash: data.previousPayloadHash,
    reason: data.reason,
    basis: data.basis,
  };
}
