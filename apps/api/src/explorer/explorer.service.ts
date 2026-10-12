import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { pagination } from '../database/data-utils';

@Injectable()
export class ExplorerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fabric: FabricService,
  ) {}
  async getOverview() {
    const [committed, pending, connection] = await Promise.all([
      this.database.blockchainAnchor.count({ where: { status: 'COMMITTED' } }),
      this.database.blockchainAnchor.count({
        where: { status: { in: ['QUEUED', 'SUBMITTED', 'FAILED'] } },
      }),
      this.fabric.checkConnection(),
    ]);
    return {
      source: 'DATABASE_ANCHOR_INDEX',
      channel: this.fabric.channel,
      chaincode: this.fabric.chaincode,
      blockHeight: null,
      totalTransactions: committed,
      pendingAnchors: pending,
      latestBlockHash: null,
      nodes: [],
      networkStatus: connection.disabled
        ? 'DISABLED'
        : connection.connected
          ? 'CONNECTED'
          : 'UNAVAILABLE',
      lastUpdated: new Date().toISOString(),
      note: 'Không tạo block/hash giả từ dữ liệu database. Muốn xem block phải tích hợp Fabric block event indexer.',
    };
  }
  async getBlocks(page = 1, limit = 10, search?: string) {
    const where = {
      status: 'COMMITTED' as const,
      ...(search ? { transactionId: { contains: search } } : {}),
    };
    const [anchors, total] = await Promise.all([
      this.database.blockchainAnchor.findMany({
        where,
        ...pagination(page, limit),
        orderBy: { committedAt: 'desc' },
      }),
      this.database.blockchainAnchor.count({ where }),
    ]);
    return {
      source: 'DATABASE_ANCHOR_INDEX',
      data: anchors.map((anchor) => ({
        id: anchor.id,
        txId: anchor.transactionId,
        blockNumber: anchor.blockNumber?.toString() || null,
        payloadHash: anchor.payloadHash,
        eventType: anchor.eventType,
        channel: anchor.channel,
        chaincode: anchor.chaincode,
        timestamp: anchor.committedAt,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
  getBlockDetails(_number: number) {
    throw new ServiceUnavailableException(
      'Block indexer chưa được cấu hình; không trả dữ liệu mô phỏng như blockchain thật',
    );
  }
  async getTransactionDetails(txId: string) {
    const anchor = await this.database.blockchainAnchor.findUnique({
      where: { transactionId: txId },
    });
    if (!anchor)
      throw new NotFoundException('Không tìm thấy transaction đã xác nhận');
    return {
      ...anchor,
      blockNumber: anchor.blockNumber?.toString() || null,
      source: 'DATABASE_ANCHOR_INDEX',
    };
  }
}
