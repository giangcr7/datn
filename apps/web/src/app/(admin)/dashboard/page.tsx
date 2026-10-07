import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
import DashboardClient from './DashboardClient';

export default async function UniversityDashboard() {
  const session = await getServerSession(authOptions) as any;
  const token = session?.accessToken;

  let stats = { totalStudents: 0, totalOffChain: 0, totalOnChain: 0 };
  let initialChartData: any = null;

  try {
    const [certStats, studentsResult] = await Promise.all([
      apiCall('/cert/statistics', 'GET', undefined, token),
      apiCall('/students?page=1&limit=1', 'GET', undefined, token),
    ]);
    initialChartData = certStats;
    stats = {
      totalStudents: studentsResult?.total || 0,
      totalOffChain: certStats?.totalAll || 0,
      totalOnChain: certStats?.total || 0,
    };
  } catch {
    // Fallback nếu chưa có dữ liệu ban đầu
  }

  return <DashboardClient stats={stats} initialChartData={initialChartData} />;
}

