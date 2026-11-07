import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";

export async function POST(
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
      `/students/${encodeURIComponent(id)}/resend-password`,
      "POST",
      undefined,
      session.accessToken,
    );
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Không gửi lại được mật khẩu" },
      { status: error.status || 500 },
    );
  }
}
