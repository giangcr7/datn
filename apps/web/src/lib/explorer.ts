export interface AnchorEntry {
  id: string;
  diplomaId: string;
  fullName: string | null;
  mssv: string | null;
  certificateNo: string | null;
  registryNo: string | null;
  documentStatus: string;
  version: number;
  eventType: string;
  status: string;
  transactionId: string | null;
  blockNumber: string | null;
  payloadHash: string;
  channel: string;
  chaincode: string;
  committedAt: string | null;
  createdAt: string;
  lastError: string | null;
  retryHistory: {
    id: string;
    reason: string | null;
    createdAt: string;
    actorEmail: string;
    previousAttempts: number;
    previousError: string | null;
  }[];
  outbox: {
    id: string;
    exhausted: boolean;
    retryToken: string;
    status: string;
    attempts: number;
    availableAt: string;
    lockedUntil: string | null;
    completedAt: string | null;
  } | null;
}

export interface ExplorerOverview {
  channel: string;
  chaincode: string;
  totalTransactions: number;
  pendingAnchors: number;
  failedAnchors: number;
  networkStatus: string;
  lastUpdated: string;
}

export interface AnchorFilters {
  search: string;
  eventType: string;
  status: string;
}
export interface AnchorPage {
  data: AnchorEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
export interface AnchorComparison {
  anchorId: string;
  status: string;
  checkedAt: string;
  message: string;
  computedHash: string;
  storedHash: string;
  chainHash: string | null;
  chainTransactionId: string | null;
  checks: { key: string; label: string; matched: boolean | null }[];
}

export const anchorStatuses: Record<string, { label: string; color: string }> =
  {
    QUEUED: { label: "Chờ đồng bộ", color: "orange" },
    SUBMITTED: { label: "Đang xử lý", color: "blue" },
    COMMITTED: { label: "Đã ghi nhận", color: "green" },
    FAILED: { label: "Lỗi đồng bộ", color: "red" },
    EXHAUSTED: { label: "Hết lượt thử lại", color: "red" },
  };
export const comparisonStatuses: Record<
  string,
  { label: string; color: string }
> = {
  MATCH: { label: "Đối chiếu khớp", color: "green" },
  MISMATCH: { label: "Có sai lệch", color: "red" },
  PENDING: { label: "Chưa đồng bộ đầy đủ", color: "orange" },
  INCOMPLETE: { label: "Chưa đủ bằng chứng", color: "orange" },
  UNAVAILABLE: { label: "Chưa thể đối chiếu", color: "default" },
};
export const networkStatuses: Record<string, { label: string; color: string }> =
  {
    CONNECTED: { label: "Kết nối Fabric sẵn sàng", color: "green" },
    DISABLED: { label: "Kết nối Fabric đang tắt", color: "default" },
    UNAVAILABLE: { label: "Không kết nối được Fabric", color: "red" },
  };
export function anchorParams(filters: AnchorFilters, page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  for (const [key, value] of Object.entries(filters))
    if (value.trim()) params.set(key, value.trim());
  return params;
}
export function eventLabel(eventType: string) {
  return eventType === "ISSUE"
    ? "Phát hành"
    : eventType === "REVOKE"
      ? "Thu hồi"
      : eventType;
}
