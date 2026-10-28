import { requireWorkspaceAccess } from "@/lib/workspace-session";
import StudentShell from "./StudentShell";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWorkspaceAccess("/student/dashboard");
  return <StudentShell>{children}</StudentShell>;
}
