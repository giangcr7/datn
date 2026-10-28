export interface RegistryReviewIssue {
  code: string;
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
  return issue.message?.trim() || "Cần kiểm tra lại thông tin hồ sơ";
}

export function openRegistryIssues<Issue extends RegistryReviewIssue>(
  issues?: Issue[] | null,
): Issue[] {
  return issues?.filter((issue) => !issue.resolvedAt) || [];
}
