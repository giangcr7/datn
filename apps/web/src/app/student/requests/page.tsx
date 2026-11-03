import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ChangeRequestsWorkspace from "@/components/ChangeRequestsWorkspace";
import { requestStatusLabels } from "@/lib/change-requests";

export default async function StudentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireWorkspaceAccess("/student/requests");
  const params = await searchParams;
  const status =
    typeof params.status === "string" &&
    Object.hasOwn(requestStatusLabels, params.status)
      ? params.status
      : undefined;
  return (
    <ChangeRequestsWorkspace
      key={status || "all"}
      student
      initialStatus={status}
    />
  );
}
