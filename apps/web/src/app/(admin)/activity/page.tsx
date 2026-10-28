import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ActivityClient from "./ActivityClient";

export default async function ActivityPage() {
  await requireWorkspaceAccess("/activity");
  return <ActivityClient />;
}
