import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind } from "@/lib/workspace-access";

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: Context) {
  const session = await getServerSession(authOptions);
  const token = (session as typeof session & { accessToken?: string })
    ?.accessToken;
  if (!token)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!["admin", "approver"].includes(getWorkspaceKind(session?.user)))
    return NextResponse.json(
      { error: "Không có quyền xem cảnh báo bất thường" },
      { status: 403 },
    );

  const parts = (await context.params).path || [];
  const validPath =
    (request.method === "GET" &&
      parts.length === 1 &&
      parts[0] === "anomalies") ||
    (request.method === "POST" &&
      parts.length === 1 &&
      parts[0] === "anomaly-scan") ||
    (request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "anomalies" &&
      /^[0-9a-f-]{36}$/i.test(parts[1]) &&
      ["resolve", "reopen"].includes(parts[2]));
  if (!validPath)
    return NextResponse.json(
      { error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );

  try {
    const result = await apiCall(
      "/integrity/" +
        parts.map(encodeURIComponent).join("/") +
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
      { error: failure.message || "Không tải được cảnh báo" },
      { status: failure.status || 500 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
