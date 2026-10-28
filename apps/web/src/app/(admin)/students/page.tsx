import { apiCall } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/workspace-session";
import StudentsClient from "./StudentsClient";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const { accessToken } = await requireWorkspaceAccess("/students");
  const studentsResult = await apiCall(
    "/students?page=1&limit=20",
    "GET",
    undefined,
    accessToken,
  );
  return <StudentsClient initialData={studentsResult.data} />;
}
