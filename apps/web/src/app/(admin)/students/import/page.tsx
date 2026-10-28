import { requireWorkspaceAccess } from "@/lib/workspace-session";
import ImportStudentsClient from "./ImportStudentsClient";

export default async function ImportStudentsPage() {
  await requireWorkspaceAccess("/students/import");
  return <ImportStudentsClient />;
}
