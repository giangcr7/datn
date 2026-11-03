import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind } from "@/lib/workspace-access";

async function proxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const session = await getServerSession(authOptions);
  const token = (session as typeof session & { accessToken?: string })
    ?.accessToken;
  if (!token)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const kind = getWorkspaceKind(session?.user);
  if (!["student", "approver"].includes(kind))
    return NextResponse.json(
      { error: "Không có quyền xử lý yêu cầu" },
      { status: 403 },
    );
  const parts = (await context.params).path || [];
  const valid =
    request.method === "GET"
      ? parts.length === 0 ||
        (parts.length === 1 && parts[0] === "eligible" && kind === "student")
      : (parts.length === 0 && kind === "student") ||
        (parts.length === 2 &&
          /^[0-9a-f-]{36}$/i.test(parts[0]) &&
          parts[1] === "action");
  if (!valid)
    return NextResponse.json(
      { error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );
  try {
    const result = await apiCall(
      "/change-requests" +
        (parts.length ? "/" + parts.join("/") : "") +
        new URL(request.url).search,
      request.method as "GET" | "POST",
      request.method === "POST" ? await request.json() : undefined,
      token,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status || 500 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
