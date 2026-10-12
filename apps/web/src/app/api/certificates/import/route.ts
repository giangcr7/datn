import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Import ghi thẳng vào văn bằng đã ngừng. Dùng trang /import để staging, rà soát và commit sổ gốc.",
    },
    { status: 410 },
  );
}
