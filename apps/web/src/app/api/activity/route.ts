import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

export async function GET(req: Request) {
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
      { error: "Không có quyền xem nhật ký" },
      { status: 403 },
    );
  try {
    return NextResponse.json(
      await apiCall(
        "/audit" + new URL(req.url).search,
        "GET",
        undefined,
        token,
      ),
    );
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { error: failure.message || "Không tải được nhật ký" },
      { status: failure.status || 500 },
    );
  }
}
