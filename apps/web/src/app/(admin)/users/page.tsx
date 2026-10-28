// src/app/(admin)/users/page.tsx
import React from "react";
import { requireWorkspaceAccess } from "@/lib/workspace-session";
import { apiCall } from "@/lib/api";
import UserTable from "./UserTable";

export default async function ListUserPage() {
  const { accessToken: token } = await requireWorkspaceAccess("/users");

  const rawUsers = await apiCall("/auth/users", "GET", undefined, token);

  const users = rawUsers.map((user: any, index: number) => ({
    key: user.id,
    stt: index + 1,
    fullName: user.displayName,
    email: user.email,
    role: user.memberships
      .map((membership: any) => membership.role)
      .join(" / "),
    active: user.active,
  }));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <UserTable data={users} />
    </div>
  );
}
