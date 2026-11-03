import type { WorkflowDiploma } from "./diploma-workflow";

export const issuanceStateLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  REJECTED: "Bị từ chối",
  ANCHOR_PENDING: "Chờ blockchain",
  ANCHOR_FAILED: "Lỗi blockchain",
  ON_CHAIN: "Đã phát hành",
  REVOKED: "Đã thu hồi",
  REPLACED: "Đã thay thế",
};
export const issuanceStateColors: Record<string, string> = {
  DRAFT: "default",
  PENDING: "blue",
  REJECTED: "red",
  ANCHOR_PENDING: "gold",
  ANCHOR_FAILED: "red",
  ON_CHAIN: "green",
  REVOKED: "red",
  REPLACED: "default",
};
export interface IssuanceBatch {
  id: string;
  code: string;
  name: string;
  graduationYear: number;
  decisionNo: string;
  decisionDate: string | null;
  programName: string | null;
  createdBy: string;
  createdAt: string;
  summary: Record<string, number>;
}
export interface IssuanceBatchRow extends WorkflowDiploma {
  status: string;
  batchState: string;
  updatedAt: string;
  reviewToken: string;
  ready: boolean;
  removable: boolean;
  checkErrors: string[];
}
export interface IssuanceBatchDetail {
  batch: IssuanceBatch;
  summary: Record<string, number>;
  checkedAt: string;
  data: IssuanceBatchRow[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
export interface IssuanceBatchOptions {
  decisions: {
    id: string;
    documentNumber: string;
    decisionYear: number;
    signedOn: string | null;
    graduationYears: number[];
  }[];
  programs: { id: string; code: string; name: string }[];
}
export function batchPublishEntries(rows: IssuanceBatchRow[]) {
  if (
    !rows.length ||
    rows.length > 100 ||
    new Set(rows.map((row) => row.uuid)).size !== rows.length
  )
    throw new Error("Chọn từ 1 đến 100 hồ sơ khác nhau mỗi lượt");
  if (
    rows.some(
      (row) =>
        !row.ready ||
        !Number.isFinite(Date.parse(row.updatedAt)) ||
        !/^[a-f0-9]{64}$/.test(row.reviewToken),
    )
  )
    throw new Error("Có hồ sơ chưa đủ điều kiện hoặc cần kiểm tra lại dữ liệu");
  return rows.map((row) => ({
    uuid: row.uuid,
    expectedUpdatedAt: row.updatedAt,
    expectedReviewToken: row.reviewToken,
  }));
}
export function issuanceRowHref(row: IssuanceBatchRow) {
  if (
    row.batchState === "REJECTED" ||
    (row.batchState === "DRAFT" &&
      row.checkErrors.some((error) => error.includes("sau từ chối")))
  )
    return (
      "/pending?view=rejected&stage=" +
      (row.batchState === "DRAFT" ? "DRAFT" : "REJECTED")
    );
  if (["ANCHOR_PENDING", "ANCHOR_FAILED"].includes(row.batchState))
    return "/explorer";
  if (["ON_CHAIN", "REVOKED", "REPLACED"].includes(row.batchState))
    return "/certificates";
  if (row.sourceBatchId)
    return (
      "/import?" +
      new URLSearchParams({
        batchId: row.sourceBatchId,
        ...(row.sourceRowId ? { rowId: row.sourceRowId } : {}),
        status: "IMPORTED",
      })
    );
  return "/pending";
}
