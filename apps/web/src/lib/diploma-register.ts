export interface RegisterFilters {
  search: string;
  year: string;
  major: string;
  decision: string;
  status: string;
  issuedFrom: string;
  issuedTo: string;
}

export interface RegisterEntry {
  uuid: string;
  fullName?: string | null;
  mssv?: string | null;
  dob?: string | null;
  major?: string | null;
  gpa?: number | null;
  grade?: string | null;
  className?: string | null;
  namTotNghiep?: number | null;
  soHieu?: string | null;
  soVaoSo?: string | null;
  issueDate?: string | null;
  decisionNo?: string | null;
  decisionDate?: string | null;
  status: string;
  revokedAt?: string | null;
  revokedReason?: string | null;
}

export const registerStatuses: Record<
  string,
  { label: string; color: string }
> = {
  ON_CHAIN: { label: "Đã cấp", color: "green" },
  REVOKED: { label: "Đã thu hồi", color: "red" },
  REPLACED: { label: "Đã thay thế", color: "default" },
};

export function emptyRegisterFilters(search = ""): RegisterFilters {
  return {
    search,
    year: "",
    major: "",
    decision: "",
    status: "",
    issuedFrom: "",
    issuedTo: "",
  };
}

export function registerParams(filters: RegisterFilters, page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  for (const [key, value] of Object.entries(filters)) {
    const normalized = value.trim();
    if (normalized) params.set(key, normalized);
  }
  return params;
}

export function registerDate(value?: string | null): string {
  if (!value) return "";
  const date = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : value;
}

export function describeRegisterFilters(filters: RegisterFilters) {
  const descriptions = [
    filters.search.trim() && `Tìm kiếm: ${filters.search.trim()}`,
    filters.year && `Năm tốt nghiệp: ${filters.year}`,
    filters.major.trim() && `Ngành: ${filters.major.trim()}`,
    filters.decision.trim() && `Quyết định: ${filters.decision.trim()}`,
    filters.status &&
      `Trạng thái: ${registerStatuses[filters.status]?.label || filters.status}`,
    filters.issuedFrom && `Ngày cấp từ: ${registerDate(filters.issuedFrom)}`,
    filters.issuedTo && `Ngày cấp đến: ${registerDate(filters.issuedTo)}`,
  ].filter(Boolean);
  return descriptions.join("; ") || "Tất cả văn bằng đã phát hành";
}

export const registerHeaders = [
  "STT",
  "Họ và tên",
  "MSSV",
  "Ngày sinh",
  "Ngành đào tạo",
  "Lớp",
  "GPA",
  "Xếp loại",
  "Năm tốt nghiệp",
  "Số hiệu văn bằng",
  "Số vào sổ",
  "Ngày cấp",
  "Số quyết định tốt nghiệp",
  "Ngày quyết định",
  "Trạng thái",
  "Ngày thu hồi",
  "Lý do thu hồi",
];

export function registerSheetRows(
  entries: RegisterEntry[],
  filters: RegisterFilters,
  exportedAt = new Date(),
): (string | number)[][] {
  return [
    ["SỔ VĂN BẰNG"],
    [
      "Thời điểm xuất",
      exportedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    ],
    ["Điều kiện tra cứu", describeRegisterFilters(filters)],
    ["Số văn bằng", entries.length],
    [],
    registerHeaders,
    ...entries.map((entry, index) => [
      index + 1,
      entry.fullName || "",
      entry.mssv == null ? "" : String(entry.mssv),
      registerDate(entry.dob),
      entry.major || "",
      entry.className || "",
      entry.gpa ?? "",
      entry.grade || "",
      entry.namTotNghiep ?? "",
      entry.soHieu || "",
      entry.soVaoSo || "",
      registerDate(entry.issueDate),
      entry.decisionNo || "",
      registerDate(entry.decisionDate),
      registerStatuses[entry.status]?.label || entry.status,
      entry.revokedAt
        ? new Date(entry.revokedAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })
        : "",
      entry.revokedReason || "",
    ]),
  ];
}
