import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "./api";
import { getWorkspaceKind, type WorkspaceUser } from "./workspace-access";

export async function explorerProxy(
  path: string,
  method: "GET" | "POST" = "GET",
  paginated = false,
  request?: Request,
) {
  const session = await getServerSession(authOptions);
  const token = (session as typeof session & { accessToken?: string })
    ?.accessToken;
  if (!token)
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập" },
      { status: 401 },
    );
  if (
    !["admin", "approver"].includes(
      getWorkspaceKind(session?.user as WorkspaceUser),
    )
  )
    return NextResponse.json(
      { success: false, error: "Không có quyền đối chiếu blockchain" },
      { status: 403 },
    );
  try {
    let body: unknown;
    if (request) {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Dữ liệu gửi lên không hợp lệ" },
          { status: 400 },
        );
      }
    }
    const result = await apiCall("/explorer" + path, method, body, token);
    return NextResponse.json(
      paginated
        ? { ...result, success: true }
        : { success: true, data: result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      {
        success: false,
        error: failure.message || "Không tải được dữ liệu đối chiếu",
      },
      { status: failure.status || 500 },
    );
  }
}
