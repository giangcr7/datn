import { registerParams, type RegisterFilters } from "./diploma-register";

export interface ReportFilters extends RegisterFilters {
  grade: string;
}
export interface ReportGroup {
  name: string;
  total: number;
  active: number;
  revoked: number;
  replaced: number;
}
export interface ReportOverview {
  institutionName: string;
  generatedAt: string;
  filters: string;
  summary: Omit<ReportGroup, "name">;
  byYear: ReportGroup[];
  byMajor: ReportGroup[];
  byGrade: ReportGroup[];
  byStatus: ReportGroup[];
}
export const reportStatuses: Record<string, string> = {
  ON_CHAIN: "Đang hiệu lực",
  REVOKED: "Đã thu hồi",
  REPLACED: "Đã thay thế",
};
export const reportGrades = [
  "Xuất sắc",
  "Giỏi",
  "Khá",
  "Trung bình khá",
  "Trung bình",
];

export async function reportError(response: Response) {
  const data = await response.json().catch(() => null);
  const message = data?.error || data?.message;
  return Array.isArray(message)
    ? message.join("; ")
    : message || "Không tải được báo cáo";
}

export async function downloadReport(
  kind: "statistics" | "register",
  format: "xlsx" | "pdf",
  filters: RegisterFilters,
) {
  const params = registerParams(filters);
  params.set("kind", kind);
  params.set("format", format);
  const response = await fetch("/api/reports/export?" + params, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await reportError(response));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download =
      response.headers
        .get("content-disposition")
        ?.match(/filename="([a-zA-Z0-9_.-]+)"/)?.[1] ||
      (kind === "register" ? "SoPhatHanh." : "BaoCaoVanBang.") + format;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
