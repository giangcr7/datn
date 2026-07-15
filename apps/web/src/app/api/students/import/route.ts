import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions) as any;
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ success: false, error: 'Chưa chọn file!' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const data = await apiCall('/students/import', 'POST', {
      fileName: file.name,
      fileData: base64,
    }, session?.accessToken);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
