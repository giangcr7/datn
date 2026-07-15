import { NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const certId = searchParams.get('certId');
    const result = await apiCall(`/cert/${certId}`);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
