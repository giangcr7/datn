import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
import StudentsClient from './StudentsClient';

// Đảm bảo Next.js không cache trang này để luôn thấy sinh viên mới thêm
export const dynamic = 'force-dynamic';

export default async function StudentsPage() {
  const session = await getServerSession(authOptions) as any;
  const token = session?.accessToken;

  const studentsResult = await apiCall('/students?page=1&limit=10000', 'GET', undefined, token);
  const students = studentsResult.data;

  // Backend đã trả đúng field: id, name, email, studentId — không cần format lại
  return <StudentsClient initialData={students} />;
}
