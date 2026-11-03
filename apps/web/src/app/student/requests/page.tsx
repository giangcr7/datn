import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ChangeRequestsWorkspace from "@/components/ChangeRequestsWorkspace";

export default async function StudentRequestsPage() {
  await requireWorkspaceAccess("/student/requests");
  return <ChangeRequestsWorkspace student />;
}
