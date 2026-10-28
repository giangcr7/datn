import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { apiCall } from "@/lib/api";

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(req: Request, context: Context) {
  const session = (await getServerSession(authOptions)) as any;
  if (!session?.accessToken)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const segments = (await context.params).path || [];
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment)))
    return NextResponse.json(
      { error: "Đường dẫn không hợp lệ" },
      { status: 400 },
    );
  try {
    let body: any;
    if (req.method !== "GET") {
      if (req.headers.get("content-type")?.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
          return NextResponse.json(
            { error: "Cần file .xlsx không quá 5 MB" },
            { status: 400 },
          );
        body = {
          fileName: file.name,
          fileData: Buffer.from(await file.arrayBuffer()).toString("base64"),
        };
      } else body = await req.json();
    }
    const result = await apiCall(
      "/imports" +
        (segments.length
          ? "/" + segments.map(encodeURIComponent).join("/")
          : "") +
        new URL(req.url).search,
      req.method as "GET" | "POST" | "PATCH",
      body,
      session.accessToken,
    );
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: Number.isInteger(error.status) ? error.status : 500 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
