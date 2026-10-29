export interface RegistryReviewIssue {
  code: string;
  field?: string | null;
  message?: string | null;
  resolvedAt?: string | null;
}

export interface RegistryBatchSummary {
  readyRows: number;
  needsReviewRows: number;
  importedRows: number;
  graduationOnlyRows: number;
  draftRows: number;
}

export function registryBatchSummaryText(
  summary: RegistryBatchSummary,
): string {
  return (
    `Đã lưu ${summary.importedRows} hồ sơ: ${summary.graduationOnlyRows} hồ sơ ` +
    `chỉ có thông tin tốt nghiệp; ${summary.draftRows} hồ sơ có văn bằng nháp chưa gửi. ` +
    `Còn ${summary.needsReviewRows} dòng cần rà soát, ${summary.readyRows} dòng hợp lệ chờ lưu.`
  );
}

export function registryIssueText(issue: RegistryReviewIssue): string {
  if (issue.code === "ISSUE_DATE_NOT_IN_SOURCE")
    return "Thiếu ngày cấp trên bằng — bổ sung tại bước kiểm tra dữ liệu";
  if (issue.code === "NOT_YET_ISSUED")
    return "Thiếu số hiệu và số vào sổ — cần bổ sung trước khi lưu";
  const message = issue.message?.trim();
  const duplicateFields: Record<string, string> = {
    studentCode: "Mã sinh viên",
    certificateNo: "Số hiệu văn bằng",
    registryNo: "Số vào sổ",
  };
  if (
    message &&
    /^Trùng với /u.test(message) &&
    issue.field &&
    duplicateFields[issue.field]
  )
    return duplicateFields[issue.field] + ": " + message;
  return message || "Cần kiểm tra lại thông tin hồ sơ";
}

export function canEditRegistryRow(row: {
  status: string;
  graduation?: {
    diplomas?: {
      workflowStatus: string;
      status: string;
      pdfSignatureCount?: number;
    }[];
  } | null;
}): boolean {
  if (row.status === "SKIPPED") return false;
  if (row.status !== "IMPORTED") return true;
  const diplomas = row.graduation?.diplomas;
  return (
    !!diplomas?.length &&
    diplomas.every(
      (diploma) =>
        diploma.workflowStatus === "DRAFT" &&
        diploma.status === "DRAFT" &&
        !diploma.pdfSignatureCount,
    )
  );
}

export function openRegistryIssues<Issue extends RegistryReviewIssue>(
  issues?: Issue[] | null,
): Issue[] {
  return issues?.filter((issue) => !issue.resolvedAt) || [];
}
