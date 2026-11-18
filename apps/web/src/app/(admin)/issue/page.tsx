import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/workspace-session";
import IssuanceBatchesClient from "../diploma-records/batches/IssuanceBatchesClient";

export default async function IssuePage({
  searchParams,
}: {
  searchParams: Promise<{ issuanceBatchId?: string; batchId?: string }>;
}) {
  await requireWorkspaceAccess("/issue");
  const params = await searchParams;
  if (params.batchId) {
    redirect(
      "/import?" +
        new URLSearchParams({ batchId: params.batchId, status: "IMPORTED" }),
    );
  }
  return (
    <IssuanceBatchesClient
      key={params.issuanceBatchId || "list"}
      initialBatchId={params.issuanceBatchId || ""}
    />
  );
}
