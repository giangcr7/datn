import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

export async function POST(
  request: Request,
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
      { error: "Không có quyền cập nhật cảnh báo" },
      { status: 403 },
    );
  try {
    const { id } = await params;
    return NextResponse.json(
      await apiCall(
        `/audit/security-alerts/${encodeURIComponent(id)}/status`,
        "POST",
        await request.json(),
        token,
      ),
    );
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { error: failure.message || "Không cập nhật được cảnh báo" },
      { status: failure.status || 500 },
    );
  }
}
