import type { CorrectionDiploma } from "./diploma-corrections";
import type { WorkflowDiploma } from "./diploma-workflow";

export type ReplacementStage = "DRAFT" | "REQUESTED" | "REJECTED" | "APPROVED";
export interface ReplacementDiploma extends Omit<
  CorrectionDiploma,
  "workflowStatus"
> {
  workflowStatus: ReplacementStage;
  status: string;
  previous: WorkflowDiploma | null;
  replaces: { id: string; certificateNo: string; registryNo: string } | null;
  replacementReference: {
    uuid: string;
    version: number;
    payloadHash: string;
    reason: string;
    basis: string;
  };
}

export const replacementStages = [
  { value: "DRAFT", label: "Đang soạn" },
  { value: "REQUESTED", label: "Chờ duyệt" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "APPROVED", label: "Đã duyệt / Phát hành" },
];

export const replacementEventLabels: Record<string, string> = {
  CREATE_REPLACEMENT: "Lập hồ sơ thay thế",
  EDIT_REPLACEMENT: "Sửa thông tin văn bằng thay thế",
  SUBMIT_REPLACEMENT: "Trình duyệt thay thế",
  REOPEN_REPLACEMENT: "Mở lại hồ sơ thay thế",
  REJECT_REPLACEMENT: "Từ chối hồ sơ thay thế",
  REPLACEMENT_REQUESTED: "Đã lập hồ sơ thay thế",
  SUPERSEDED: "Ngừng hiệu lực để thay thế",
};

export const replacementComparisonFields = [
  ["fullName", "Họ tên"],
  ["dob", "Ngày sinh"],
  ["major", "Ngành đào tạo"],
  ["degreeType", "Loại bằng"],
  ["namTotNghiep", "Năm tốt nghiệp"],
  ["grade", "Xếp loại"],
  ["gpa", "Điểm trung bình"],
  ["className", "Lớp"],
  ["soHieu", "Số hiệu"],
  ["soVaoSo", "Số vào sổ"],
  ["issueDate", "Ngày cấp"],
] as const;

export const replacementPrintComparisonFields = [
  ["fullNameLatin", "Họ tên trang tiếng Anh"],
  ["majorNameEn", "Ngành tiếng Anh"],
  ["issuePlace", "Nơi cấp"],
  ["diplomaSignerName", "Người ký"],
  ["diplomaSignerTitle", "Chức danh người ký"],
] as const;
