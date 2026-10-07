import { NextRequest, NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  try {
    const { txId } = await params;
    const result = await apiCall(`/explorer/tx/${txId}`, 'GET');
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi tra cứu giao dịch' },
      { status: 500 },
    );
  }
}
