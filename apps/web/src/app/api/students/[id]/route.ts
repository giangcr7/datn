import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = (await getServerSession(authOptions)) as any;
    if (!session?.accessToken)
      return NextResponse.json(
        { success: false, error: "Chưa đăng nhập" },
        { status: 401 },
      );
    const { id } = await context.params;
    const data = await apiCall(
      `/students/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      session.accessToken,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Không tải được hồ sơ sinh viên",
      },
      { status: error.status || 500 },
    );
  }
}
