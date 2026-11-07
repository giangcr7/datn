import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as any;
    if (!session?.accessToken)
      return NextResponse.json(
        { success: false, error: "Chưa đăng nhập" },
        { status: 401 },
      );
    const data = await apiCall(
      "/shares",
      "POST",
      await req.json(),
      session.accessToken,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Không tạo được liên kết chia sẻ",
      },
      { status: error.status || 500 },
    );
  }
}
