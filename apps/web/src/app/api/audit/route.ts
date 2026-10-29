import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";
export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as any;
    const params = new URL(req.url).searchParams;
    const uuid = params.get("certUUID") || params.get("certId");
    if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid))
      return NextResponse.json(
        { success: false, error: "UUID không hợp lệ" },
        { status: 400 },
      );
    return NextResponse.json(
      await apiCall(
        "/cert/" + uuid + "/history",
        "GET",
        undefined,
        session?.accessToken,
      ),
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
}
