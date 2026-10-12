import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { apiCall } from "@/lib/api";

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions)) as any;
  try {
    const q = new URL(req.url).searchParams.get("q") || "";
    const data = await apiCall(
      "/cert/search?q=" + encodeURIComponent(q),
      "GET",
      undefined,
      session?.accessToken,
    );
    return NextResponse.json({
      success: true,
      total: data.length,
      results: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
}
