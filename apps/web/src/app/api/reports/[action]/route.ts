import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const session = (await getServerSession(authOptions)) as {
    accessToken?: string;
    user?: WorkspaceUser;
  } | null;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!session?.accessToken)
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers },
    );
  if (!["admin", "approver"].includes(getWorkspaceKind(session.user)))
    return NextResponse.json(
      { error: "Không có quyền xem báo cáo nhà trường" },
      { status: 403, headers },
    );
  const { action } = await context.params;
  if (!["overview", "export"].includes(action))
    return NextResponse.json(
      { error: "Không tìm thấy báo cáo" },
      { status: 404, headers },
    );
  try {
    const apiUrl =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001/api";
    const upstream = await fetch(
      apiUrl + "/reports/" + action + new URL(request.url).search,
      {
        headers: { Authorization: "Bearer " + session.accessToken },
        cache: "no-store",
        signal: AbortSignal.timeout(120000),
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...headers,
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        ...(upstream.headers.get("content-disposition")
          ? {
              "Content-Disposition": upstream.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Chưa tải được báo cáo. Vui lòng thử lại." },
      { status: 502, headers },
    );
  }
}
