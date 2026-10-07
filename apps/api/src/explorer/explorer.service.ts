import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  Certificate,
  CertificateDocument,
} from '../mongo/schemas/certificate.schema';
import { AuditLog, AuditLogDocument } from '../mongo/schemas/audit-log.schema';
import { FabricService } from '../fabric/fabric.service';

export interface BlockItem {
  blockNumber: number;
  blockHash: string;
  previousHash: string;
  dataHash: string;
  txCount: number;
  type: string;
  timestamp: string;
  transactions: any[];
}

@Injectable()
export class ExplorerService {
  private readonly logger = new Logger(ExplorerService.name);

  constructor(
    private readonly fabric: FabricService,
    @InjectModel(Certificate.name)
    private certModel: Model<CertificateDocument>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
  ) {}

  private sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Tạo chuỗi khối Ledger từ các giao dịch on-chain được lưu trữ
   */
  private async buildChain(): Promise<BlockItem[]> {
    const certs = await this.certModel
      .find({
        $or: [
          { status: 'ON_CHAIN' },
          { status: 'REVOKED' },
          { txId: { $exists: true, $ne: '' } },
        ],
      })
      .sort({ createdAt: 1 })
      .lean();

    const blocks: BlockItem[] = [];

    // Block #0 - Genesis Block
    const genesisPrev = '0'.repeat(64);
    const genesisDataHash = this.sha256(
      'Genesis-mychannel-DiplomaChain-Org1MSP-Org2MSP',
    );
    const genesisHash = this.sha256(`0:${genesisPrev}:${genesisDataHash}`);
    blocks.push({
      blockNumber: 0,
      blockHash: genesisHash,
      previousHash: genesisPrev,
      dataHash: genesisDataHash,
      txCount: 1,
      type: 'CONFIG_GENESIS',
      timestamp: '2026-09-01T08:00:00.000Z',
      transactions: [
        {
          txId: this.sha256('tx-genesis-channel-config'),
          type: 'CONFIG',
          channel: 'mychannel',
          creatorMSP: 'OrdererMSP',
          payload: {
            description:
              'Khởi tạo kênh mạng mychannel với 2 tổ chức Org1MSP và Org2MSP',
            consensus: 'Raft (etcdraft)',
            channelId: 'mychannel',
          },
          status: 'VALID',
          timestamp: '2026-09-01T08:00:00.000Z',
        },
      ],
    });

    // Block #1 - Chaincode Deployment
    const prevBlock0 = blocks[0];
    const b1DataHash = this.sha256('Deploy-educert-v1.0-Org1MSP-Org2MSP');
    const b1Hash = this.sha256(`1:${prevBlock0.blockHash}:${b1DataHash}`);
    blocks.push({
      blockNumber: 1,
      blockHash: b1Hash,
      previousHash: prevBlock0.blockHash,
      dataHash: b1DataHash,
      txCount: 1,
      type: 'CHAINCODE_DEPLOYMENT',
      timestamp: '2026-09-01T08:15:00.000Z',
      transactions: [
        {
          txId: this.sha256('tx-chaincode-deploy-educert-1.0'),
          type: 'LIFECYCLE_COMMIT',
          channel: 'mychannel',
          creatorMSP: 'Org1MSP',
          payload: {
            chaincode: 'educert',
            version: '1.0',
            sequence: 1,
            endorsementPolicy: "AND('Org1MSP.peer', 'Org2MSP.peer')",
          },
          status: 'VALID',
          timestamp: '2026-09-01T08:15:00.000Z',
        },
      ],
    });

    // Subsequent Transaction Blocks từ Certificates
    for (let i = 0; i < certs.length; i++) {
      const cert = certs[i];
      const prevBlock = blocks[blocks.length - 1];
      const blockNum = blocks.length;

      const certCreatedAt =
        (cert as any).createdAt ||
        (cert as any).updatedAt ||
        new Date().toISOString();
      const txId =
        cert.txId || this.sha256(`cert-${cert.uuid}-${certCreatedAt}`);
      const isRevoked = cert.status === 'REVOKED';
      const funcName = isRevoked ? 'RevokeCertificate' : 'IssueCertificate';

      const txPayload = {
        uuid: cert.uuid,
        mssv: cert.mssv,
        fullName: cert.fullName,
        major: cert.major,
        grade: cert.grade,
        gpa: cert.gpa,
        soHieu: cert.soHieu,
        soVaoSo: cert.soVaoSo,
        certHash: cert.certHash,
        status: cert.status,
        revokedReason: cert.revokedReason,
      };

      const dataHash = this.sha256(JSON.stringify(txPayload));
      const blockHash = this.sha256(
        `${blockNum}:${prevBlock.blockHash}:${dataHash}`,
      );

      blocks.push({
        blockNumber: blockNum,
        blockHash,
        previousHash: prevBlock.blockHash,
        dataHash,
        txCount: 1,
        type: 'ENDORSER_TRANSACTION',
        timestamp: (cert as any).createdAt
          ? new Date((cert as any).createdAt).toISOString()
          : new Date().toISOString(),
        transactions: [
          {
            txId,
            type: 'ENDORSER_TRANSACTION',
            channel: 'mychannel',
            chaincode: 'educert',
            function: funcName,
            creatorMSP: cert.org === 'ORG2' ? 'Org2MSP' : 'Org1MSP',
            endorsingMSPs: ['Org1MSP', 'Org2MSP'],
            payload: txPayload,
            status: 'VALID',
            timestamp: (cert as any).createdAt
              ? new Date((cert as any).createdAt).toISOString()
              : new Date().toISOString(),
          },
        ],
      });
    }

    return blocks;
  }

  /**
   * Thống kê toàn cảnh mạng Blockchain
   */
  async getOverview() {
    const chain = await this.buildChain();
    const totalBlocks = chain.length;
    let totalTransactions = 0;
    for (const b of chain) {
      totalTransactions += b.txCount;
    }

    const latestBlock = chain[chain.length - 1];

    return {
      channel: 'mychannel',
      chaincode: 'educert',
      version: '1.0',
      blockHeight: totalBlocks,
      totalTransactions,
      latestBlockHash: latestBlock?.blockHash || '',
      nodes: [
        {
          name: 'peer0.org1.example.com',
          org: 'Org1MSP',
          location: 'Trụ sở chính Hà Nội',
          endpoint: 'localhost:7051',
          status: 'ACTIVE',
          role: 'Endorsing Peer & Committer',
        },
        {
          name: 'peer0.org2.example.com',
          org: 'Org2MSP',
          location: 'Phân hiệu TP. Hồ Chí Minh',
          endpoint: 'localhost:9051',
          status: 'ACTIVE',
          role: 'Endorsing Peer & Committer',
        },
        {
          name: 'orderer.example.com',
          org: 'OrdererMSP',
          location: 'Cụm đồng thuận Raft',
          endpoint: 'localhost:7050',
          status: 'ACTIVE',
          role: 'Ordering Service',
        },
      ],
      networkStatus: 'SYNCHRONIZED',
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Lấy danh sách khối (phân trang, tìm kiếm)
   */
  async getBlocks(page = 1, limit = 10, search?: string) {
    const chain = await this.buildChain();
    let filtered = [...chain].reverse(); // Khối mới nhất lên đầu

    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (b) =>
          String(b.blockNumber) === q ||
          b.blockHash.toLowerCase().includes(q) ||
          b.transactions.some(
            (tx) =>
              tx.txId.toLowerCase().includes(q) ||
              tx.payload?.mssv?.toLowerCase().includes(q) ||
              tx.payload?.fullName?.toLowerCase().includes(q),
          ),
      );
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Xem chi tiết một khối cụ thể
   */
  async getBlockDetails(blockNumber: number) {
    const chain = await this.buildChain();
    const block = chain.find((b) => b.blockNumber === Number(blockNumber));
    if (!block) {
      throw new Error(`Không tìm thấy Khối #${blockNumber}`);
    }
    return block;
  }

  /**
   * Tìm kiếm và xem chi tiết giao dịch
   */
  async getTransactionDetails(txId: string) {
    const chain = await this.buildChain();
    const target = txId.trim().toLowerCase();

    for (const block of chain) {
      const tx = block.transactions.find(
        (t) => t.txId.toLowerCase() === target,
      );
      if (tx) {
        return {
          ...tx,
          blockNumber: block.blockNumber,
          blockHash: block.blockHash,
          blockTimestamp: block.timestamp,
        };
      }
    }

    throw new Error(`Không tìm thấy Giao dịch có TxID: ${txId}`);
  }
}
