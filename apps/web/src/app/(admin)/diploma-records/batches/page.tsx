import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/workspace-session";

export default async function IssuanceBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string }>;
}) {
  await requireWorkspaceAccess("/issue");
  const params = await searchParams;
  redirect(
    params.batchId
      ? "/issue?" + new URLSearchParams({ issuanceBatchId: params.batchId })
      : "/issue",
  );
}
