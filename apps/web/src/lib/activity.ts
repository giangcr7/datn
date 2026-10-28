export const activityLabels: Record<string, string> = {
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
  REGISTER: "Đăng ký tài khoản",
  CHANGE_PASSWORD: "Đổi mật khẩu",
  CREATE_STUDENT: "Thêm sinh viên",
  IMPORT_STUDENTS: "Nhập sinh viên",
  STAGE_REGISTRY: "Nhập lô dữ liệu văn bằng",
  REVIEW_IMPORT_ROW: "Rà soát dữ liệu nguồn",
  REVIEW_IMPORTED_PRINT_DATA: "Sửa dữ liệu in của hồ sơ đã nhập",
  RECHECK_REGISTRY_PRINT_DATA: "Kiểm tra lại dữ liệu",
  COMMIT_IMPORT_ROW: "Lưu hồ sơ đã rà soát",
  REQUEST_CERT: "Lập hồ sơ cấp văn bằng",
  SAVE_PENDING_DIPLOMA: "Lưu hồ sơ chờ xử lý",
  REVIEW_DIPLOMA_PRINT_DATA: "Cập nhật dữ liệu in văn bằng",
  APPROVE_CERT: "Duyệt và ký phát hành",
  ISSUE_CERT: "Phát hành văn bằng",
  REJECT_CERT: "Từ chối hồ sơ",
  REOPEN_REJECTED_DIPLOMA: "Mở lại hồ sơ bị từ chối",
  CORRECT_REJECTED_DIPLOMA: "Bổ sung hồ sơ sau từ chối",
  RESUBMIT_REJECTED_DIPLOMA: "Trình duyệt lại hồ sơ",
  REVOKE_CERT: "Thu hồi văn bằng",
  CREATE_REPLACEMENT: "Lập hồ sơ thay thế",
  EDIT_REPLACEMENT: "Sửa thông tin văn bằng thay thế",
  SUBMIT_REPLACEMENT: "Trình duyệt văn bằng thay thế",
  REOPEN_REPLACEMENT: "Mở lại hồ sơ thay thế",
  REJECT_REPLACEMENT: "Từ chối hồ sơ thay thế",
  APPROVE_REPLACEMENT: "Duyệt phát hành thay thế",
  CREATE_PROGRAM: "Thêm ngành đào tạo",
  UPDATE_PROGRAM: "Cập nhật ngành đào tạo",
  APPROVE_PROGRAM_ALIAS: "Bổ sung ánh xạ ngành",
  VERIFY_CERT: "Xác thực văn bằng",
  CHECK_BLOCKCHAIN: "Đối chiếu blockchain",
  RETRY_BLOCKCHAIN: "Khôi phục giao dịch hết lượt thử lại",
};

export interface ActivityEntry {
  id: string;
  actorEmail: string;
  action: string;
  target: string | null;
  result: string;
  createdAt: string;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ActivityFilters {
  search: string;
  action: string;
  result: string;
  from: string;
  to: string;
}

export function activitySearchParams(
  filters: ActivityFilters,
  page: number,
  limit: number,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.action) params.set("action", filters.action);
  if (filters.result) params.set("result", filters.result);
  if (filters.from)
    params.set(
      "from",
      new Date(filters.from + "T00:00:00+07:00").toISOString(),
    );
  if (filters.to)
    params.set(
      "to",
      new Date(filters.to + "T23:59:59.999+07:00").toISOString(),
    );
  return params;
}
