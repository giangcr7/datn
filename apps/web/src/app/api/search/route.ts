import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  let query: unknown;
  try {
    query = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Thông tin tra cứu không hợp lệ" },
      { status: 400, headers },
    );
  }
  try {
    const results = await apiCall("/cert/lookup", "POST", query);
    return NextResponse.json(
      { success: true, total: results.length, results },
      { headers },
    );
  } catch (error: unknown) {
    const backendStatus =
      error instanceof Error && "status" in error ? error.status : undefined;
    const status =
      typeof backendStatus === "number" &&
      backendStatus >= 400 &&
      backendStatus < 500
        ? backendStatus
        : 502;
    const message =
      status === 429
        ? "Bạn đã tra cứu nhiều lần. Vui lòng chờ một phút rồi thử lại."
        : status === 502
          ? "Chưa thể kết nối kho văn bằng. Vui lòng thử lại sau."
          : error instanceof Error
            ? error.message
            : "Thông tin tra cứu không hợp lệ";
    return NextResponse.json(
      { success: false, error: message },
      { status, headers },
    );
  }
}

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions)) as {
    accessToken?: string;
  } | null;
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
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể tra cứu",
      },
      { status: 400 },
    );
  }
}
