export const changeFieldLabels: Record<string, string> = {
  fullName: "Họ và tên",
  dob: "Ngày sinh",
  major: "Ngành đào tạo",
  grade: "Xếp loại tốt nghiệp",
};
export const requestStatusLabels: Record<string, string> = {
  PENDING: "Chờ tiếp nhận",
  IN_REVIEW: "Đang xử lý",
  NEEDS_INFORMATION: "Cần bổ sung",
  RESOLVED: "Đã hoàn tất",
  REJECTED: "Không chấp nhận",
  CANCELLED: "Đã rút yêu cầu",
};
export interface DiplomaChangeRequest {
  id: string;
  diplomaId: string;
  certificateNo: string;
  registryNo: string;
  studentName: string;
  studentCode: string;
  status: string;
  revision: number;
  changes: { field: string; before: string | null; after: string }[];
  reason: string;
  createdAt: string;
  updatedAt: string;
  resolvedDiplomaId: string | null;
  replacement: {
    id: string;
    certificateNo: string;
    status: string;
    workflowStatus: string;
  } | null;
  events: {
    id: string;
    actorLabel: string;
    note: string;
    status: string;
    createdAt: string;
    revision: number;
  }[];
}
export async function workdeskFetch<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || data.message || "Không thực hiện được thao tác",
    );
  return data as T;
}
