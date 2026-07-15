import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
import IssueClient from './IssueClient';

export const dynamic = 'force-dynamic';

export default async function IssuePage() {
  const session = await getServerSession(authOptions) as any;
  const token = session?.accessToken;

  // 1. Lấy toàn bộ chứng chỉ đã cấp, lấy danh sách mssv đã có
  const allCerts = await apiCall('/cert', 'GET', undefined, token);
  const issuedMssvList = allCerts.map((cert: any) => cert.mssv);

  // 2. Lấy toàn bộ sinh viên (role: student đã được lọc sẵn ở backend)
  const studentsResult = await apiCall('/students?page=1&limit=10000', 'GET', undefined, token);
  const allStudents = studentsResult.data;

  // 3. Lọc ra sinh viên CHƯA được cấp bằng
  const unissuedStudents = allStudents.filter((student: any) => {
    return !issuedMssvList.includes(student.studentId);
  });

  // 4. Định dạng cho Select Ant Design
  const formattedStudents = unissuedStudents.map((s: any) => ({
    value: s.id,
    label: `${s.name} - MSSV: ${s.studentId}`,
  }));

  return <IssueClient students={formattedStudents} />;
}
