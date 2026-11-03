import { requireWorkspaceAccess } from "@/lib/workspace-session";
import IssuanceBatchesClient from "./IssuanceBatchesClient";

export default async function IssuanceBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string }>;
}) {
  await requireWorkspaceAccess("/diploma-records/batches");
  const params = await searchParams;
  return (
    <IssuanceBatchesClient
      key={params.batchId || "list"}
      initialBatchId={params.batchId || ""}
    />
  );
}
