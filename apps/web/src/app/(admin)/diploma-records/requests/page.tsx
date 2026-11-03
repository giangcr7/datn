import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ChangeRequestsWorkspace from "@/components/ChangeRequestsWorkspace";

export default async function ChangeRequestsPage() {
  await requireWorkspaceAccess("/diploma-records/requests");
  return <ChangeRequestsWorkspace student={false} />;
}
