import { NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await apiCall('/auth/send-otp', 'POST', body);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi gửi mã OTP' },
      { status: 400 },
    );
  }
}
