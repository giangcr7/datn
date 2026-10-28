export type DiplomaWorkflowAction = "submit" | "approve" | "reject";

export interface WorkflowDiploma {
  uuid: string;
  mssv: string;
  fullName: string;
  dob: string | null;
  major: string;
  degreeType?: string | null;
  printedDiploma?: {
    template: string;
    institutionName: string;
    institutionNameEn: string | null;
    fullNameLatin: string;
    majorNameEn: string | null;
    degreeType: string | null;
    issuePlace: string | null;
    diplomaSignerName: string | null;
    diplomaSignerTitle: string | null;
  } | null;
  printWarnings?: string[];
  gpa: number | null;
  grade: string | null;
  issueDate: string | null;
  issueDateStatus?: "RECORDED" | "NOT_IN_SOURCE" | "UNCONFIRMED";
  soHieu: string;
  soVaoSo: string;
  className: string | null;
  namTotNghiep: number;
  decisionNo: string | null;
  decisionDate: string | null;
  campusName: string;
  requestedBy: string | null;
  requestedAt: string | null;
  sourceBatchId: string | null;
  sourceRowId?: string | null;
  sourceFileName: string | null;
  sourceSheet: string | null;
  sourceRowNumber: number | null;
  requestType: "DIGITIZATION" | "ISSUANCE";
  requestErrors?: string[];
  pdfSignatureCount?: number;
  pdfSigningMode?: string | null;
  pdfSignatures?: {
    signatureOrder: number;
    signerName: string;
    signedAt: string;
    certificateSerial: string;
  }[];
}

export interface WorkflowPage {
  data: WorkflowDiploma[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface WorkflowResult {
  uuid: string;
  success: boolean;
  status?: string;
  error?: string;
}

export async function workflowJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok || result.success === false)
    throw new Error(
      result.error || result.message || "Không xử lý được yêu cầu",
    );
  return result as T;
}

export function canEditWorkflowDiploma(record: WorkflowDiploma) {
  return !!record.sourceBatchId && !record.pdfSignatureCount;
}

export function canSelectWorkflowDiploma(
  record: WorkflowDiploma,
  mode: "prepare" | "pending",
  userId?: string,
) {
  return mode === "prepare"
    ? canEditWorkflowDiploma(record) &&
        Array.isArray(record.requestErrors) &&
        record.requestErrors.length === 0 &&
        !record.printWarnings?.length
    : !!userId;
}

export async function processWorkflowSelection(
  action: DiplomaWorkflowAction,
  diplomaIds: string[],
  reason: string,
  onProgress: (completed: number, total: number) => void,
  send = workflowJson<{ results: WorkflowResult[] }>,
): Promise<WorkflowResult[]> {
  const uniqueIds = [...new Set(diplomaIds)];
  if (!uniqueIds.length) throw new Error("Chưa chọn hồ sơ");
  const results: WorkflowResult[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const chunk = uniqueIds.slice(offset, offset + 100);
    try {
      const response = await send("/api/cert/bulk/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diplomaIds: chunk,
          ...(action === "reject" ? { reason: reason.trim() } : {}),
        }),
      });
      results.push(...response.results);
      onProgress(results.length, uniqueIds.length);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Lỗi kết nối";
      results.push(
        ...chunk.map((uuid) => ({
          uuid,
          success: false,
          error:
            detail + ". Cần tải lại để kiểm tra trạng thái trước khi thử lại.",
        })),
      );
      results.push(
        ...uniqueIds.slice(offset + chunk.length).map((uuid) => ({
          uuid,
          success: false,
          error: "Chưa thực hiện vì lượt xử lý trước bị gián đoạn",
        })),
      );
      onProgress(results.length, uniqueIds.length);
      break;
    }
  }
  return results;
}
