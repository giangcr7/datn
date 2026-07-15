import { NextResponse } from 'next/server';
import { apiCall } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await apiCall('/auth/register', 'POST', body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
