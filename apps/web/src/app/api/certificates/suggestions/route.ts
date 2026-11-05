import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const token = (session as typeof session & { accessToken?: string })
    ?.accessToken;
  if (!token)
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập" },
      { status: 401, headers },
    );
  if (
    !["admin", "approver"].includes(
      getWorkspaceKind(session?.user as WorkspaceUser),
    )
  )
    return NextResponse.json(
      { success: false, error: "Không có quyền tra cứu sổ văn bằng" },
      { status: 403, headers },
    );
  try {
    const query = new URL(request.url).searchParams;
    query.set("page", "1");
    query.set("limit", "6");
    const result = await apiCall(
      "/cert/register/suggestions?" + query,
      "GET",
      undefined,
      token,
    );
    return NextResponse.json({ ...result, success: true }, { headers });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { success: false, error: failure.message || "Không tải được gợi ý" },
      { status: failure.status || 500, headers },
    );
  }
}
