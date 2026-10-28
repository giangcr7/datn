import { requireWorkspaceAccess } from "@/lib/workspace-session";
import IssueClient from "./IssueClient";

export default async function IssuePage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string }>;
}) {
  const { user } = await requireWorkspaceAccess("/issue");
  const params = await searchParams;
  return <IssueClient user={user} initialBatchId={params.batchId || ""} />;
}
