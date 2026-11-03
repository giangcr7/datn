import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ChangeRequestsWorkspace from "@/components/ChangeRequestsWorkspace";
import { requestStatusLabels } from "@/lib/change-requests";

export default async function ChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireWorkspaceAccess("/diploma-records/requests");
  const params = await searchParams;
  const status =
    typeof params.status === "string" &&
    Object.hasOwn(requestStatusLabels, params.status)
      ? params.status
      : undefined;
  return (
    <ChangeRequestsWorkspace
      key={status || "all"}
      student={false}
      initialStatus={status}
    />
  );
}
