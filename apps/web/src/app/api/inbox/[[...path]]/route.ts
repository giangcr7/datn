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
  if (
    !["admin", "approver", "student"].includes(getWorkspaceKind(session?.user))
  )
    return NextResponse.json(
      { error: "Không có quyền xem thông báo" },
      { status: 403 },
    );
  const parts = (await context.params).path || [];
  if (
    !(
      (request.method === "GET" && parts.length === 0) ||
      (request.method === "POST" && parts.length === 1 && parts[0] === "read")
    )
  )
    return NextResponse.json(
      { error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );
  try {
    const data = await apiCall(
      "/inbox" + (parts.length ? "/read" : ""),
      request.method as "GET" | "POST",
      request.method === "POST" ? await request.json() : undefined,
      token,
    );
    return NextResponse.json(data, {
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
