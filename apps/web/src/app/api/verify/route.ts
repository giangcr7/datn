import { NextResponse } from "next/server";
import { apiCall } from "@/lib/api";

const headers = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await apiCall("/verify", "POST", body);
    return NextResponse.json(result, { headers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers },
    );
  }
}
