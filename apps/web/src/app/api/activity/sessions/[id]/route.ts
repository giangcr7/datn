import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      { error: "Không có quyền thu hồi phiên" },
      { status: 403 },
    );
  try {
    const { id } = await params;
    return NextResponse.json(
      await apiCall(
        `/auth/sessions/${encodeURIComponent(id)}`,
        "DELETE",
        undefined,
        token,
      ),
    );
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { error: failure.message || "Không thu hồi được phiên" },
      { status: failure.status || 500 },
    );
  }
}
