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
      { success: false, error: "Không có quyền xem sổ văn bằng" },
      { status: 403 },
    );
  try {
    const url = new URL(req.url);
    url.searchParams.delete("issuedOnly");
    const result = await apiCall(
      "/cert/register" + url.search,
      "GET",
      undefined,
      token,
    );
    return NextResponse.json(
      { ...result, success: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      {
        success: false,
        error: failure.message || "Không tải được sổ văn bằng",
      },
      { status: failure.status || 500 },
    );
  }
}
