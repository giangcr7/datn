import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { authOptions } from "@/lib/auth-options";
import type { WorkspaceUser } from "@/lib/workspace-access";

export default async function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const error = (session as { error?: string } | null)?.error;
  const user = session?.user as WorkspaceUser | undefined;

  if (!error && user?.role === "student") {
    redirect(
      user.mustChangePassword ? "/change-password" : "/student/dashboard",
    );
  }
  if (!error && (user?.role === "university" || user?.role === "admin")) {
    redirect("/dashboard");
  }

  return children;
}
