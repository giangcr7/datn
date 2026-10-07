import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
import ExplorerClient from './ExplorerClient';

export default async function ExplorerPage() {
  const session = (await getServerSession(authOptions)) as any;
  const token = session?.accessToken;

  let initialOverview: any = {
    channel: 'mychannel',
    chaincode: 'educert',
    version: '1.0',
    blockHeight: 0,
    totalTransactions: 0,
    nodes: [],
  };

  let initialBlocks: any[] = [];
  let initialPagination: any = { total: 0, page: 1, limit: 10, totalPages: 0 };

  try {
    const [overviewData, blocksData] = await Promise.all([
      apiCall('/explorer/overview', 'GET', undefined, token),
      apiCall('/explorer/blocks?page=1&limit=10', 'GET', undefined, token),
    ]);

    if (overviewData) initialOverview = overviewData;
    if (blocksData) {
      initialBlocks = blocksData.data || [];
      initialPagination = blocksData.pagination || initialPagination;
    }
  } catch (error) {
    // Graceful fallback
  }

  return (
    <ExplorerClient
      initialOverview={initialOverview}
      initialBlocks={initialBlocks}
      initialPagination={initialPagination}
    />
  );
}
