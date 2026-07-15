import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../[...nextauth]/route';
import { apiCall } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions) as any;
    if (!session) return NextResponse.json({ success: false, error: 'Chưa đăng nhập!' }, { status: 401 });
    const { currentPassword, newPassword } = await req.json();
    const result = await apiCall(`/auth/change-password/${session.user.id}`, 'POST', {
      oldPassword: currentPassword,
      newPassword,
    }, session.accessToken);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
