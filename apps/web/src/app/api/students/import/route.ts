import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { apiCall } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions) as any;
    if (!session?.accessToken)
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Chưa chọn file!' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5 * 1024 * 1024)
      return NextResponse.json({ success: false, error: 'Chỉ nhận file .xlsx không quá 5 MB' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const data = await apiCall('/students/import', 'POST', {
      fileName: file.name,
      fileData: base64,
    }, session?.accessToken);
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.message === 'fetch failed')
      return NextResponse.json({
        success: false,
        error: 'Không nhận được phản hồi từ API. Kiểm tra danh sách sinh viên trước khi nhập lại vì dữ liệu có thể đã được lưu.',
      }, { status: 502 });
    return NextResponse.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
}
