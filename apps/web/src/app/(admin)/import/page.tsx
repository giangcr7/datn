import { Metadata } from "next";
import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ImportClient from "./ImportClient";

export const metadata: Metadata = {
  title: "Kiểm tra dữ liệu | DiplomaChain",
  description: "Kiểm tra dữ liệu và chuẩn bị hồ sơ đề nghị cấp văn bằng.",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; status?: string; rowId?: string }>;
}) {
  await requireWorkspaceAccess("/import");
  const params = await searchParams;
  const status = ["NEEDS_REVIEW", "READY", "IMPORTED", "SKIPPED"].includes(
    params.status || "",
  )
    ? params.status
    : "NEEDS_REVIEW";
  return (
    <ImportClient
      initialBatchId={params.batchId || ""}
      initialStatus={status}
      initialRowId={params.rowId || ""}
    />
  );
}
