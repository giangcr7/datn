import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { apiCall } from "@/lib/api";

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(req: Request, context: Context) {
  const session = (await getServerSession(authOptions)) as any;
  if (!session?.accessToken)
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập" },
      { status: 401 },
    );
  const segments = (await context.params).path || [];
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment)))
    return NextResponse.json(
      { success: false, error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );
  try {
    let body = req.method === "POST" ? await req.json() : undefined;
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
      req.method as "GET" | "POST",
      body,
      session.accessToken,
    );
    return NextResponse.json(
      Array.isArray(result) ? { success: true, data: result } : result,
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
