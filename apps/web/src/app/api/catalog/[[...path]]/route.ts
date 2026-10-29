import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(req: Request, context: Context) {
  const session = await getServerSession(authOptions);
  const token = (session as typeof session & { accessToken?: string })
    ?.accessToken;
  if (!token)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (getWorkspaceKind(session?.user as WorkspaceUser) !== "approver")
    return NextResponse.json(
      { error: "Không có quyền quản lý danh mục" },
      { status: 403 },
    );
  const segments = (await context.params).path || [];
  if (
    !segments.length ||
    segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment))
  )
    return NextResponse.json(
      { error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );
  try {
    const body: unknown = req.method === "GET" ? undefined : await req.json();
    const result = await apiCall(
      "/catalog/" + segments.map(encodeURIComponent).join("/"),
      req.method as "GET" | "POST" | "PATCH",
      body,
      token,
    );
    return NextResponse.json(result);
  } catch (error) {
    const failure = error as Error & { status?: number };
    return NextResponse.json(
      { error: failure.message || "Không xử lý được danh mục" },
      { status: failure.status || 500 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
