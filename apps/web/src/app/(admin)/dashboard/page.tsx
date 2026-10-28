import { apiCall } from "@/lib/api";
import type { DashboardOverview } from "@/lib/dashboard";
import { requireWorkspaceAccess } from "@/lib/workspace-session";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function UniversityDashboard() {
  const { user, accessToken } = await requireWorkspaceAccess("/dashboard");
  let initialOverview: DashboardOverview | null = null;
  let loadError = false;
  try {
    initialOverview = await apiCall(
      "/dashboard/overview",
      "GET",
      undefined,
      accessToken,
    );
  } catch {
    loadError = true;
  }
  return (
    <DashboardClient
      user={user}
      initialOverview={initialOverview}
      loadError={loadError}
    />
  );
}
