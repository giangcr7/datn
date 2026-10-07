import { NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function GET() {
  try {
    const result = await apiCall('/explorer/overview', 'GET');
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi lấy thông tin Explorer' },
      { status: 500 },
    );
  }
}
