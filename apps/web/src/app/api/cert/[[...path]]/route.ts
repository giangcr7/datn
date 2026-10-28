import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { apiCall } from "@/lib/api";
import { getWorkspaceKind } from "@/lib/workspace-access";

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(req: Request, context: Context) {
  const session = (await getServerSession(authOptions)) as any;
  if (!session?.accessToken)
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập" },
      { status: 401 },
    );
  const segments = (await context.params).path || [];
  if (
    ["corrections", "replacements"].includes(segments[0]) &&
    getWorkspaceKind(session.user) !== "approver"
  )
    return NextResponse.json(
      { success: false, error: "Không có quyền xử lý hồ sơ bị từ chối" },
      { status: 403 },
    );
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment)))
    return NextResponse.json(
      { success: false, error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );
  try {
    if (
      req.method === "GET" &&
      segments.length === 2 &&
      ["pdf", "preview"].includes(segments[1])
    ) {
      const apiUrl =
        process.env.API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:3001/api";
      const upstream = await fetch(
        apiUrl +
          "/cert/" +
          segments.map(encodeURIComponent).join("/") +
          new URL(req.url).search,
        {
          headers: { Authorization: "Bearer " + session.accessToken },
          cache: "no-store",
          signal: AbortSignal.timeout(60000),
        },
      );
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type":
            upstream.headers.get("content-type") || "application/json",
          "Content-Disposition":
            upstream.headers.get("content-disposition") || "inline",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    let body = ["POST", "PATCH"].includes(req.method)
      ? await req.json()
      : undefined;
    if (req.method === "POST" && ["approve", "reject"].includes(segments[0])) {
      if (!/^[0-9a-f-]{36}$/i.test(body.uuid))
        return NextResponse.json(
          { success: false, error: "UUID không hợp lệ" },
          { status: 400 },
        );
      segments.push(body.uuid);
      body = segments[0] === "approve" ? {} : { reason: body.reason };
    }
    const result = await apiCall(
      "/cert/" +
        segments.map(encodeURIComponent).join("/") +
        new URL(req.url).search,
      req.method as "GET" | "POST" | "PATCH",
      body,
      session.accessToken,
    );
    return NextResponse.json(
      Array.isArray(result) ? { success: true, data: result } : result,
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: Number.isInteger(error.status) ? error.status : 500 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
