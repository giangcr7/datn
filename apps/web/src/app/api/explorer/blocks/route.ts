import { NextRequest, NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '10';
    const search = searchParams.get('search') || '';

    const query = new URLSearchParams({ page, limit });
    if (search) query.append('search', search);

    const result = await apiCall(`/explorer/blocks?${query.toString()}`, 'GET');
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi lấy danh sách khối' },
      { status: 500 },
    );
  }
}
