import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { apiCall } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as any;
    const token = session?.accessToken;
    const body = await req.json();
    const result = await apiCall("/cert/request", "POST", body, token);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: Number.isInteger(error.status) ? error.status : 500 },
    );
  }
}
