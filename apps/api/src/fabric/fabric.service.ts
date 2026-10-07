import {
  Injectable,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { connect, signers, Gateway } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Ưu tiên biến môi trường FABRIC_NETWORK_BASE
const BASE = process.env.FABRIC_NETWORK_BASE
  ? path.resolve(process.env.FABRIC_NETWORK_BASE)
  : path.resolve(__dirname, '../../../../../blockchain-multiorg');
const CHANNEL = 'mychannel';
const CHAINCODE = 'educert';

const ORG1 = {
  mspId: 'Org1MSP',
  peerEndpoint: 'localhost:7051',
  peerHostAlias: 'peer0.org1.example.com',
  tlsCertPath: `${BASE}/blockchain-network/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem`,
  walletPath: `${BASE}/wallet/admin.json`,
};
const ORG2 = {
  mspId: 'Org2MSP',
  peerEndpoint: 'localhost:9051',
  peerHostAlias: 'peer0.org2.example.com',
  tlsCertPath: `${BASE}/blockchain-network/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem`,
  walletPath: `${BASE}/wallet/admin-org2.json`,
};

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000]; // Tối ưu thời gian retry nhanh hơn

interface CacheEntry {
  data: any;
  expiresAt: number;
}

@Injectable()
export class FabricService implements OnModuleDestroy {
  private readonly logger = new Logger(FabricService.name);

  // Connection Pool & Persistent Gateway Cache
  private client: grpc.Client | null = null;
  private gateway: Gateway | null = null;
  private cachedWalletOrg1: any = null;
  private cachedTlsCredentials: grpc.ChannelCredentials | null = null;
  private cachedSigner: any = null;

  // L1 Query In-Memory Cache (TTL 30s)
  private readonly queryCache = new Map<string, CacheEntry>();

  /**
   * Khởi tạo hoặc tái sử dụng kết nối Gateway phân tán (Persistent Connection Pool)
   */
  private async getGateway(): Promise<Gateway> {
    if (this.gateway && this.client) {
      return this.gateway;
    }

    try {
      // 1. Tải và cache wallet + credentials chỉ 1 lần duy nhất trong RAM
      if (!this.cachedWalletOrg1) {
        if (!fs.existsSync(ORG1.walletPath)) {
          throw new Error(`Tệp ví điện tử không tồn tại: ${ORG1.walletPath}`);
        }
        this.cachedWalletOrg1 = JSON.parse(
          fs.readFileSync(ORG1.walletPath, 'utf8'),
        );
      }

      if (!this.cachedTlsCredentials) {
        if (!fs.existsSync(ORG1.tlsCertPath)) {
          throw new Error(
            `Chứng chỉ TLS peer không tồn tại: ${ORG1.tlsCertPath}`,
          );
        }
        const tlsCert = fs.readFileSync(ORG1.tlsCertPath);
        this.cachedTlsCredentials = grpc.credentials.createSsl(
          tlsCert,
          null,
          null,
          {
            checkServerIdentity: () => undefined,
          },
        );
      }

      if (!this.cachedSigner) {
        this.cachedSigner = signers.newPrivateKeySigner(
          crypto.createPrivateKey({
            key: Buffer.from(this.cachedWalletOrg1.credentials.privateKey),
            format: 'pem',
          }),
        );
      }

      // 2. Tạo kết nối gRPC Client với cấu hình Keep-Alive tối ưu
      this.client = new grpc.Client(
        ORG1.peerEndpoint,
        this.cachedTlsCredentials,
        {
          'grpc.ssl_target_name_override': ORG1.peerHostAlias,
          'grpc.keepalive_time_ms': 120000, // 2 phút gửi keepalive
          'grpc.keepalive_timeout_ms': 20000, // 20s timeout
          'grpc.keepalive_permit_without_calls': 1,
          'grpc.max_receive_message_length': 100 * 1024 * 1024,
        },
      );

      // Chờ kết nối sẵn sàng với timeout 3s
      await this.waitForReady(this.client, 3000);

      // 3. Khởi tạo Gateway
      this.gateway = connect({
        client: this.client,
        identity: {
          mspId: ORG1.mspId,
          credentials: Buffer.from(
            this.cachedWalletOrg1.credentials.certificate,
          ),
        },
        signer: this.cachedSigner,
        evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30000 }),
        submitOptions: () => ({ deadline: Date.now() + 30000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
      });

      this.logger.log(
        'Đã thiết lập kết nối Persistent Fabric Gateway thành công',
      );
      return this.gateway;
    } catch (err: any) {
      this.cleanupConnection();
      throw err;
    }
  }

  /**
   * Dọn dẹp kết nối bị lỗi hoặc khi module bị hủy
   */
  private cleanupConnection() {
    try {
      this.gateway?.close();
    } catch {}
    try {
      this.client?.close();
    } catch {}
    this.gateway = null;
    this.client = null;
  }

  async execute(
    action: 'submit' | 'evaluate',
    txName: string,
    ...args: string[]
  ): Promise<any> {
    const cacheKey = `${txName}:${args.join(':')}`;

    // Kiểm tra cache L1 cho các truy vấn evaluate (QueryCertificate)
    if (action === 'evaluate') {
      const cached = this.queryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    } else {
      // Khi có hành động ghi (Issue / Revoke) -> Xóa toàn bộ cache cũ để dữ liệu luôn mới nhất
      this.queryCache.clear();
    }

    let lastError: Error;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.executeOnce(action, txName, ...args);

        // Lưu cache 30s cho các truy vấn evaluate thành công
        if (action === 'evaluate') {
          this.queryCache.set(cacheKey, {
            data: result,
            expiresAt: Date.now() + 30000,
          });
        }

        return result;
      } catch (err: any) {
        lastError = err;

        // Nếu là lỗi nghiệp vụ (như "đã tồn tại", "không tìm thấy", "đã bị thu hồi") -> Không retry
        if (this.isBusinessError(err)) throw err;

        // Nếu lỗi do rớt kết nối gRPC / mạng -> Hủy kết nối cũ để lần retry sau thiết lập lại
        this.cleanupConnection();

        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt];
          this.logger.warn(
            `Fabric ${txName} thất bại (lần ${attempt + 1}/${MAX_RETRIES}), thử lại sau ${delay}ms: ${err.message}`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `Fabric ${txName} thất bại sau ${MAX_RETRIES} lần thử: ${lastError!.message}`,
    );
    throw new ServiceUnavailableException(
      `Không thể kết nối Blockchain sau ${MAX_RETRIES} lần thử: ${lastError!.message}`,
    );
  }

  private async executeOnce(
    action: 'submit' | 'evaluate',
    txName: string,
    ...args: string[]
  ): Promise<any> {
    const gateway = await this.getGateway();
    const contract = gateway.getNetwork(CHANNEL).getContract(CHAINCODE);

    if (action === 'submit') {
      const proposal = contract.newProposal(txName, {
        arguments: args,
        endorsingOrganizations: [ORG1.mspId, ORG2.mspId],
      });
      const tx = await proposal.endorse();
      const commit = await tx.submit();
      const status = await commit.getStatus();
      if (!status.successful) {
        throw new Error(`Transaction thất bại: ${status.code}`);
      }
      return {
        txId: tx.getTransactionId(),
        payload: new TextDecoder().decode(tx.getResult()),
      };
    } else {
      const bytes = await contract.evaluateTransaction(txName, ...args);
      return { result: JSON.parse(new TextDecoder().decode(bytes)) };
    }
  }

  private isBusinessError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('đã tồn tại') ||
      msg.includes('không tìm thấy') ||
      msg.includes('already exists') ||
      msg.includes('not found') ||
      msg.includes('already revoked') ||
      msg.includes('đã bị thu hồi') ||
      msg.includes('mvcc_read_conflict')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async newGrpcConnection(org: typeof ORG1): Promise<grpc.Client> {
    if (!fs.existsSync(org.tlsCertPath)) {
      throw new Error(`Tệp TLS cert không tồn tại: ${org.tlsCertPath}`);
    }
    const tlsCert = fs.readFileSync(org.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsCert, null, null, {
      checkServerIdentity: () => undefined,
    });
    return new grpc.Client(org.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': org.peerHostAlias,
      'grpc.keepalive_time_ms': 120000,
      'grpc.keepalive_timeout_ms': 20000,
    });
  }

  async checkConnection(): Promise<{
    connected: boolean;
    latencyMs?: number;
    error?: string;
  }> {
    const start = Date.now();
    let client: grpc.Client | null = null;
    try {
      client = await this.newGrpcConnection(ORG1);
      await this.waitForReady(client, 3000);
      return { connected: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { connected: false, error: err.message };
    } finally {
      client?.close();
    }
  }

  private waitForReady(client: grpc.Client, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      client.waitForReady(deadline, (err) => (err ? reject(err) : resolve()));
    });
  }

  onModuleDestroy() {
    this.cleanupConnection();
    this.queryCache.clear();
    this.logger.log('FabricService destroyed - Connections closed cleanly');
  }
}
