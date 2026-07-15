import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';

export async function GET() {
  try {
    const session = await getServerSession(authOptions) as any;
    const token = session?.accessToken;
    const result = await apiCall('/cert/statistics', 'GET', undefined, token);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
