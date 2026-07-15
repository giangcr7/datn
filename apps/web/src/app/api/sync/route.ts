import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions) as any;
    const result = await apiCall('/cert', 'GET', undefined, session?.accessToken);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
