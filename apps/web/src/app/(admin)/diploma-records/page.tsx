import { requireWorkspaceAccess } from "@/lib/workspace-session";
import { getWorkspace } from "@/lib/workspace-access";
import DiplomaRecordsClient from "./DiplomaRecordsClient";

export default async function DiplomaRecordsPage() {
  const { user } = await requireWorkspaceAccess("/diploma-records");
  const links =
    getWorkspace(user).links.find((link) => link.path === "/diploma-records")
      ?.children || [];
  return <DiplomaRecordsClient links={links} />;
}
