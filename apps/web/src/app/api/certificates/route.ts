import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { apiCall } from "@/lib/api";
export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as any;
    const url = new URL(req.url);
    const result = await apiCall(
      "/cert" + url.search,
      "GET",
      undefined,
      session?.accessToken,
    );
    return NextResponse.json({
      success: true,
      ...(result.pagination
        ? result
        : {
            data: result,
            pagination: {
              total: result.length,
              page: 1,
              limit: result.length,
              totalPages: 1,
            },
          }),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
}
