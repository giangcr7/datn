export interface RegistryDuplicateRecord {
  studentCode?: string | null;
  fullName?: string | null;
  dateOfBirth?: string | null;
  classCode?: string | null;
  programId?: string | null;
  programOriginal?: string | null;
  graduationYear?: number | null;
  classification?: string | null;
  certificateNo?: string | null;
  registryNo?: string | null;
}
export interface RegistryDuplicateMatch {
  key: string;
  kind: "row" | "diploma";
  id: string;
  sheetName?: string;
  rowNumber?: number;
  status: string;
  workflowStatus?: string;
  diplomaStatus?: string;
  values: RegistryDuplicateRecord;
  matchedFields: string[];
}
export interface RegistryDuplicateReport {
  current: {
    id: string;
    sheetName: string;
    rowNumber: number;
    status: string;
    fileName: string;
    values: RegistryDuplicateRecord;
  };
  matches: RegistryDuplicateMatch[];
  total: number;
  page: number;
  limit: number;
  restrictedCount: number;
  fields: {
    field: string;
    label: string;
    value: string;
    count: number;
    restricted: boolean;
  }[];
}
export const registryComparisonFields = [
  ["studentCode", "Mã sinh viên"],
  ["fullName", "Họ và tên"],
  ["dateOfBirth", "Ngày sinh"],
  ["classCode", "Lớp"],
  ["programOriginal", "Ngành đào tạo"],
  ["graduationYear", "Năm tốt nghiệp"],
  ["classification", "Xếp loại"],
  ["certificateNo", "Số hiệu văn bằng"],
  ["registryNo", "Số vào sổ"],
] as const;
const classifications: Record<string, string> = {
  EXCELLENT: "Xuất sắc",
  VERY_GOOD: "Giỏi",
  GOOD: "Khá",
  AVERAGE_GOOD: "Trung bình khá",
  AVERAGE: "Trung bình",
};
const statuses: Record<string, string> = {
  READY: "Đủ điều kiện lưu",
  NEEDS_REVIEW: "Cần rà soát",
  IMPORTED: "Đã lưu hồ sơ",
  SKIPPED: "Đã bỏ qua",
  DRAFT: "Bản nháp",
  REQUESTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  SIGNED: "Đã ký",
  PENDING: "Chờ blockchain",
  ACTIVE: "Đã phát hành",
  REVOKED: "Đã thu hồi",
  FAILED: "Cần xử lý giao dịch",
  REPLACED: "Đã thay thế",
  SUPERSEDED: "Đã thay thế",
  REJECTED: "Đã từ chối",
};
export function registryDuplicateStatus(value: string) {
  return statuses[value] || "Đang xử lý";
}
export function registryComparisonValue(
  values: RegistryDuplicateRecord,
  field: (typeof registryComparisonFields)[number][0],
) {
  const value = values[field];
  if (value === null || value === undefined || value === "") return "Chưa có";
  if (field === "dateOfBirth") {
    const date = String(value).slice(0, 10).split("-");
    return date.length === 3
      ? [date[2], date[1], date[0]].join("/")
      : String(value);
  }
  if (field === "classification")
    return classifications[String(value)] || String(value);
  return String(value);
}
