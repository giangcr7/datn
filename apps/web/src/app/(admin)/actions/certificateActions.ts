'use server'
import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';

export async function issueSingleCertificate(formData: FormData) {
  try {
    const session = await getServerSession(authOptions) as any;
    if (!session || session.user?.role !== 'university') {
      throw new Error('Unauthorized. Chỉ cán bộ ĐHTL mới có quyền cấp phát.');
    }

    const body = {
      mssv: formData.get('mssv') as string,
      fullName: formData.get('fullName') as string,
      major: formData.get('major') as string,
      gpa: Number(formData.get('gpa')),
      grade: formData.get('grade') as string,
      soHieu: formData.get('soHieu') as string,
      soVaoSo: formData.get('soVaoSo') as string,
      className: formData.get('className') as string,
      namTotNghiep: Number(formData.get('namTotNghiep')),
    };

    if (!body.mssv || !body.fullName) {
      throw new Error('Thiếu dữ liệu bắt buộc');
    }

    const result = await apiCall('/cert/issue', 'POST', body, session.accessToken);
    revalidatePath('/dashboard');
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
