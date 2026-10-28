export type DiplomaVerification = {
  isValid: boolean;
  message: string;
  verificationStatus?: string;
  details?: {
    studentName?: string;
    mssv?: string;
    major?: string;
    grade?: string;
    gpa?: string | number | null;
    issueDate?: string | null;
    degreeType?: string | null;
    soVaoSo?: string;
    soHieu?: string;
    namTotNghiep?: string | number;
    printedDiploma?: { issuePlace?: string | null } | null;
    replacementUuid?: string;
    replacementCertificateNo?: string;
  };
};

export function parseDiplomaQr(raw: string): Record<string, unknown> | null {
  let value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = url.searchParams.get("proof") || "";
    } catch {
      return null;
    }
  }
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hashPattern = /^[0-9a-f]{64}$/i;
  if (uuidPattern.test(value)) return { uuid: value };
  if (hashPattern.test(value)) return { certHash: value };
  try {
    const proof: unknown = JSON.parse(value);
    if (!proof || typeof proof !== "object" || Array.isArray(proof))
      return null;
    const record = proof as Record<string, unknown>;
    const uuid = record.uuid || record.certUUID;
    if (typeof uuid === "string" && uuidPattern.test(uuid))
      return { ...record, uuid };
    if (
      !uuid &&
      typeof record.certHash === "string" &&
      hashPattern.test(record.certHash)
    )
      return record;
  } catch {
    return null;
  }
  return null;
}
