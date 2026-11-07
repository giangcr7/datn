import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  const token = (session as typeof session & { accessToken?: string })
    ?.accessToken;
  if (!token)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (
    !["admin", "approver"].includes(
      getWorkspaceKind(session?.user as WorkspaceUser),
    )
  )
    return NextResponse.json(
      { error: "Không có quyền xem phiên" },
      { status: 403 },
    );
  try {
    return NextResponse.json(
      await apiCall("/auth/sessions", "GET", undefined, token),
    );
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { error: failure.message || "Không tải được phiên đăng nhập" },
      { status: failure.status || 500 },
    );
  }
}
