import { requireWorkspaceAccess } from "@/lib/workspace-session";
import AnomaliesClient from "./AnomaliesClient";

export const dynamic = "force-dynamic";

export default async function AnomaliesPage() {
  await requireWorkspaceAccess("/anomalies");
  return <AnomaliesClient />;
}
