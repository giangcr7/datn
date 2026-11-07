import { NextResponse } from "next/server";
import { apiCall } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const data = await apiCall("/shares/verify", "POST", await req.json());
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Liên kết chia sẻ không hợp lệ",
      },
      {
        status: error.status || 410,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
