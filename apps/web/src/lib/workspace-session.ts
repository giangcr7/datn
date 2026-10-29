import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import {
  canAccessWorkspacePath,
  getWorkspaceKind,
  type WorkspaceUser,
} from "./workspace-access";

export async function requireWorkspaceAccess(pathname: string) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as WorkspaceUser;
  const kind = getWorkspaceKind(user);
  if (kind === "none") redirect("/login");
  if (kind === "student" && user.mustChangePassword)
    redirect("/change-password");
  if (!canAccessWorkspacePath(user, pathname)) {
    redirect(kind === "student" ? "/student/dashboard" : "/dashboard");
  }
  return {
    user,
    accessToken: (session as typeof session & { accessToken?: string })
      .accessToken,
  };
}
