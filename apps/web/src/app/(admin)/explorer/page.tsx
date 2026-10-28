import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ExplorerClient from "./ExplorerClient";

export const dynamic = "force-dynamic";

export default async function ExplorerPage() {
  const { user } = await requireWorkspaceAccess("/explorer");
  return <ExplorerClient user={user} />;
}
