import type { WorkflowDiploma } from "./diploma-workflow";

export interface CorrectionDiploma extends WorkflowDiploma {
  programId: string;
  gpaScale: number;
  updatedAt: string;
  workflowStatus: "DRAFT" | "REJECTED";
  correctionErrors: string[];
  blockedReason: string | null;
  rejection: {
    id: string;
    reason: string | null;
    rejectedAt: string;
    rejectedBy: string | null;
  } | null;
}

export const correctionEventLabels: Record<string, string> = {
  REJECTED: "Từ chối hồ sơ",
  REOPENED: "Mở lại để bổ sung",
  CORRECTED: "Lưu thông tin bổ sung",
  RESUBMITTED: "Trình duyệt lại",
  REQUESTED: "Lưu hồ sơ chờ xử lý",
  IMPORTED_DRAFT: "Lưu hồ sơ sau rà soát",
  APPROVED: "Duyệt phát hành",
  REVIEW_DIPLOMA_PRINT_DATA: "Cập nhật thông tin in bằng",
};

export function correctionParams(
  stage: string,
  search: string,
  page: number,
  limit: number,
) {
  const params = new URLSearchParams({
    stage,
    page: String(page),
    limit: String(limit),
  });
  if (search.trim()) params.set("search", search.trim());
  return params;
}

export function correctionValues(record: CorrectionDiploma) {
  return {
    ...record.printedDiploma,
    fullName: record.fullName,
    dob: record.dob,
    programId: record.programId,
    namTotNghiep: record.namTotNghiep,
    grade: record.grade,
    gpa: record.gpa,
    degreeType: record.degreeType,
    className: record.className,
    soHieu: record.soHieu,
    soVaoSo: record.soVaoSo,
    issueDate: record.issueDate,
    note: "",
    expectedUpdatedAt: record.updatedAt,
  };
}
