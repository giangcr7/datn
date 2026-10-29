import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import AdminShell from "./AdminShell";
import { getWorkspaceKind } from "@/lib/workspace-access";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const kind = getWorkspaceKind(session.user as any);
  if (kind === "student") {
    redirect("/student/dashboard");
  }
  if (kind === "none") redirect("/login");

  return <AdminShell user={session.user as any}>{children}</AdminShell>;
}
