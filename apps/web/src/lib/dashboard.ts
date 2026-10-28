export interface DashboardImportCounts {
  needsReview: number;
  ready: number;
  graduationOnly: number;
  prepare: number;
}

export interface DashboardBatch extends DashboardImportCounts {
  id: string;
  fileName: string;
  createdAt: string;
}

export interface DashboardIssued {
  id: string;
  fullName: string | null;
  mssv: string | null;
  certificateNo: string | null;
  status: string;
  committedAt: string | null;
}

export interface DashboardOverview {
  summary: {
    totalRecords: number;
    draftRecords: number;
    requestedRecords: number;
    rejectedRecords: number;
    reopenedDrafts: number;
    replacementDrafts?: number;
    replacementRejected?: number;
    replacementRequested?: number;
    pendingAnchoring: number;
    registered: number;
    active: number;
    revoked: number;
    replaced: number;
    registeredThisMonth: number;
    undatedRegistrations: number;
    students: number;
    failedTransactions: number;
  };
  imports: { counts: DashboardImportCounts; batches: DashboardBatch[] };
  byMajor: { name: string; value: number }[];
  byYear: { name: string; value: number }[];
  byMonth: { month: string; value: number }[];
  recentIssued: DashboardIssued[];
  generatedAt: string;
  timezone: string;
}

export function dashboardTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function dashboardBatchLink(batch: DashboardBatch) {
  if (batch.needsReview)
    return (
      "/import?" +
      new URLSearchParams({ batchId: batch.id, status: "NEEDS_REVIEW" })
    );
  if (batch.ready)
    return (
      "/import?" + new URLSearchParams({ batchId: batch.id, status: "READY" })
    );
  if (batch.graduationOnly)
    return (
      "/import?" +
      new URLSearchParams({ batchId: batch.id, status: "IMPORTED" })
    );
  return "/issue?" + new URLSearchParams({ batchId: batch.id });
}

export function dashboardTasks(
  data: DashboardOverview | null,
  approver: boolean,
) {
  const shared = [
    {
      label: "Hồ sơ chờ blockchain",
      value: data?.summary.pendingAnchoring,
      description:
        "Đã duyệt, chưa ghi nhận phát hành. Xem tiến trình tại Đối chiếu blockchain.",
      href: "/explorer",
    },
  ];
  if (!approver) return shared;
  return [
    {
      label: "Dòng dữ liệu cần rà soát",
      value: data?.imports.counts.needsReview,
      description:
        "Kiểm tra thông tin thiếu, tên ngành và các cảnh báo trong từng đợt.",
      href: "/import?status=NEEDS_REVIEW",
    },
    {
      label: "Dòng sẵn sàng nhập",
      value: data?.imports.counts.ready,
      description: "Dữ liệu đã kiểm tra, đang chờ nhập vào hồ sơ tốt nghiệp.",
      href: "/import?status=READY",
    },
    {
      label: "Hồ sơ cần tạo văn bằng",
      value: data?.imports.counts.graduationOnly,
      description: "Đã nhập hồ sơ tốt nghiệp nhưng chưa tạo bản nháp văn bằng.",
      href: "/import?status=IMPORTED",
    },
    {
      label: "Bản nháp cần hoàn thiện",
      value: data?.imports.counts.prepare,
      description:
        "Bản nháp từ dữ liệu đã nhập; hoàn thiện, kiểm tra trước khi trình duyệt.",
      href: "/issue",
    },
    {
      label: "Hồ sơ chờ duyệt",
      value: data?.summary.requestedRecords,
      description: "Kiểm tra PDF, duyệt và ký số ngay tại cơ sở chính.",
      href: "/pending",
    },
    ...shared,
  ];
}
