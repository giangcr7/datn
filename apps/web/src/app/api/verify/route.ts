import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";

const headers = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const session = (await getServerSession(authOptions)) as any;
    if (!session?.accessToken)
      return NextResponse.json(
        { success: false, error: "Chưa đăng nhập" },
        { status: 401, headers },
      );
    const result = await apiCall("/verify", "POST", body, session.accessToken);
    return NextResponse.json(result, { headers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500, headers },
    );
  }
}
