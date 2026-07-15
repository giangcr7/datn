import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
import DashboardClient from './DashboardClient';

export default async function UniversityDashboard() {
  const session = await getServerSession(authOptions) as any;
  const token = session?.accessToken;

  const [certStats, studentsResult] = await Promise.all([
    apiCall('/cert/statistics', 'GET', undefined, token),
    apiCall('/students?page=1&limit=1', 'GET', undefined, token),
  ]);

  return (
    <DashboardClient
      stats={{
        totalStudents: studentsResult.total,
        totalOffChain: certStats.totalAll,
        totalOnChain: certStats.total,
      }}
    />
  );
}
