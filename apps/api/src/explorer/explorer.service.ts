import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { pagination, jsonData } from '../database/data-utils';
import { Prisma } from '../generated/prisma/client';
import type { AuthActor } from '../auth/auth-actor';
import { HASH_SCHEMA_VERSION } from '../database/diploma-hash';
import { AnchorQueryDto } from './anchor-query.dto';
import { anchorInclude, anchorProjection } from './anchor-data';
import { AnchorRetryDto } from './anchor-retry.dto';
import { retryExhaustedAnchor } from './anchor-retry';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox-policy';
import {
  compareAnchor,
  type ReconciliationStatus,
} from './anchor-reconciliation';

@Injectable()
export class ExplorerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fabric: FabricService,
  ) {}

  private scope(actor: AuthActor): Prisma.BlockchainAnchorWhereInput {
    if (
      !actor?.institutionId ||
      !(
        actor.role === 'admin' ||
        (actor.role === 'university' &&
          actor.isHeadquarters &&
          actor.canApproveDiplomas)
      )
    )
      throw new ForbiddenException('Không có quyền đối chiếu blockchain');
    return { version: { diploma: { institutionId: actor.institutionId } } };
  }

  async getOverview(actor: AuthActor) {
    const scope = this.scope(actor);
    const count = (
      statuses: ('COMMITTED' | 'QUEUED' | 'SUBMITTED' | 'FAILED')[],
    ) =>
      this.database.blockchainAnchor.count({
        where: {
          AND: [
            scope,
            {
              status: { in: statuses },
              eventType: { in: ['ISSUE', 'REVOKE'] },
            },
          ],
        },
      });
    const [committed, pending, failed, connection] = await Promise.all([
      count(['COMMITTED']),
      count(['QUEUED', 'SUBMITTED']),
      count(['FAILED']),
      this.fabric.checkConnection(),
    ]);
    return {
      source: 'DATABASE_ANCHOR_INDEX',
      channel: this.fabric.channel,
      chaincode: this.fabric.chaincode,
      blockHeight: null,
      totalTransactions: committed,
      pendingAnchors: pending,
      failedAnchors: failed,
      networkStatus: connection.disabled
        ? 'DISABLED'
        : connection.connected
          ? 'CONNECTED'
          : 'UNAVAILABLE',
      lastUpdated: new Date().toISOString(),
    };
  }

  retryAnchor(id: string, body: AnchorRetryDto, actor: AuthActor, ip?: string) {
    return retryExhaustedAnchor(
      this.database,
      this.fabric,
      this.scope(actor),
      id,
      body,
      actor,
      ip,
    );
  }

  async getAnchors(query: AnchorQueryDto, actor: AuthActor) {
    const conditions: Prisma.BlockchainAnchorWhereInput[] = [
      this.scope(actor),
      { eventType: { in: ['ISSUE', 'REVOKE'] } },
    ];
    if (query.status === 'EXHAUSTED')
      conditions.push({
        status: 'FAILED',
        OR: ['ISSUE', 'REVOKE'].map((eventType) => ({
          eventType,
          version: {
            outboxEvents: {
              some: {
                eventType,
                status: 'FAILED',
                attempts: { gte: OUTBOX_MAX_ATTEMPTS },
              },
            },
          },
        })),
      });
    else if (query.status) conditions.push({ status: query.status });
    if (query.eventType) conditions.push({ eventType: query.eventType });
    if (query.search) {
      const search = query.search;
      const snapshotFields: [string, Prisma.DiplomaWhereInput][] = [
        [
          'fullName',
          {
            graduation: {
              student: { fullName: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
        [
          'mssv',
          {
            graduation: {
              student: {
                studentCode: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ],
        [
          'soHieu',
          { certificateNo: { contains: search, mode: 'insensitive' } },
        ],
        ['soVaoSo', { registryNo: { contains: search, mode: 'insensitive' } }],
      ];
      conditions.push({
        OR: [
          { transactionId: { contains: search, mode: 'insensitive' } },
          ...snapshotFields.map(
            ([field, fallback]): Prisma.BlockchainAnchorWhereInput => ({
              version: {
                OR: [
                  {
                    payload: {
                      path: [field],
                      string_contains: search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    AND: [
                      { payload: { path: [field], equals: Prisma.DbNull } },
                      { diploma: fallback },
                    ],
                  },
                ],
              },
            }),
          ),
        ],
      });
    }
    const where: Prisma.BlockchainAnchorWhereInput = { AND: conditions };
    const [anchors, total] = await Promise.all([
      this.database.blockchainAnchor.findMany({
        where,
        include: anchorInclude,
        ...pagination(query.page, query.limit),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.database.blockchainAnchor.count({ where }),
    ]);
    return {
      source: 'DATABASE_ANCHOR_INDEX',
      data: anchors.map(anchorProjection),
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getBlocks(
    page: number,
    limit: number,
    search: string | undefined,
    actor: AuthActor,
  ) {
    const result = await this.getAnchors(
      Object.assign(new AnchorQueryDto(), {
        page,
        limit,
        search,
        status: 'COMMITTED' as const,
      }),
      actor,
    );
    return {
      ...result,
      data: result.data.map((entry) => ({
        id: entry.id,
        txId: entry.transactionId,
        blockNumber: entry.blockNumber,
        payloadHash: entry.payloadHash,
        eventType: entry.eventType,
        channel: entry.channel,
        chaincode: entry.chaincode,
        timestamp: entry.committedAt,
      })),
    };
  }

  getBlockDetails(_number: number, actor: AuthActor) {
    this.scope(actor);
    throw new ServiceUnavailableException(
      'Chưa tích hợp chỉ mục khối; không tạo số khối hoặc hash mô phỏng',
    );
  }

  async getTransactionDetails(txId: string, actor: AuthActor) {
    const anchor = await this.database.blockchainAnchor.findFirst({
      where: {
        AND: [this.scope(actor), { transactionId: txId, status: 'COMMITTED' }],
      },
      include: anchorInclude,
    });
    if (!anchor)
      throw new NotFoundException(
        'Không tìm thấy giao dịch trong phạm vi nhà trường',
      );
    return { ...anchorProjection(anchor), source: 'DATABASE_ANCHOR_INDEX' };
  }

  async checkAnchor(id: string, actor: AuthActor, ip?: string) {
    const anchor = await this.database.blockchainAnchor.findFirst({
      where: {
        AND: [
          this.scope(actor),
          { id, eventType: { in: ['ISSUE', 'REVOKE'] } },
        ],
      },
      include: anchorInclude,
    });
    if (!anchor)
      throw new NotFoundException(
        'Không tìm thấy giao dịch trong phạm vi nhà trường',
      );
    let comparison: ReturnType<typeof compareAnchor>;
    let unavailableMessage =
      'Không truy vấn được Fabric. Chưa thể kết luận dữ liệu có khớp blockchain.';
    if (
      anchor.channel !== this.fabric.channel ||
      anchor.chaincode !== this.fabric.chaincode
    ) {
      comparison = {
        status: 'UNAVAILABLE',
        checks: [],
        computedHash: '',
        storedHash: anchor.version.payloadHash,
        chainHash: null,
        chainTransactionId: null,
      };
      unavailableMessage =
        'Giao dịch thuộc kênh hoặc hợp đồng khác cấu hình hiện tại. Cần quản trị viên kiểm tra kết nối.';
    } else {
      try {
        if (!this.fabric.enabled) throw new Error('Fabric disabled');
        const modern = anchor.version.schemaVersion === HASH_SCHEMA_VERSION;
        const chain: unknown = (
          await this.fabric.execute(
            'evaluate',
            modern ? 'QueryDiplomaAnchor' : 'QueryCertificate',
            anchor.version.diplomaId,
            ...(modern ? [String(anchor.version.version)] : []),
          )
        ).result;
        if (
          !chain ||
          typeof chain !== 'object' ||
          Array.isArray(chain) ||
          typeof (
            (chain as Record<string, unknown>).payloadHash ||
            (chain as Record<string, unknown>).certHash
          ) !== 'string'
        )
          throw new Error('Invalid Fabric response');
        comparison = compareAnchor(anchor, chain as Record<string, unknown>);
      } catch {
        comparison = {
          status: 'UNAVAILABLE',
          checks: [],
          computedHash: '',
          storedHash: anchor.version.payloadHash,
          chainHash: null,
          chainTransactionId: null,
        };
      }
    }
    const messages: Record<ReconciliationStatus, string> = {
      MATCH: 'Dữ liệu và trạng thái ghi nhận của giao dịch khớp blockchain.',
      MISMATCH:
        'Có thông tin không khớp blockchain. Cần kiểm tra trước khi sử dụng kết quả.',
      PENDING:
        'Giao dịch hoặc yêu cầu thu hồi chưa đồng bộ đầy đủ. Chưa kết luận đối chiếu hoàn tất.',
      INCOMPLETE:
        'Blockchain có dữ liệu nhưng thiếu bằng chứng để đối chiếu đầy đủ giao dịch.',
      UNAVAILABLE: unavailableMessage,
    };
    const result = {
      ...comparison,
      anchorId: anchor.id,
      checkedAt: new Date().toISOString(),
      message: messages[comparison.status],
    };
    await this.database.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        institutionId: actor.institutionId,
        action: 'CHECK_BLOCKCHAIN',
        target: anchor.version.diplomaId,
        result: comparison.status === 'MATCH' ? 'SUCCESS' : 'FAILED',
        ip,
        metadata: jsonData({
          anchorId: id,
          eventType: anchor.eventType,
          version: anchor.version.version,
          status: result.status,
          checkedAt: result.checkedAt,
          checks: result.checks,
        }),
      },
    });
    return result;
  }
}
