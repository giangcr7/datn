import { NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const data = await apiCall(`/cert/search?q=${q}`);
    return NextResponse.json({ success: true, total: data.length, results: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
