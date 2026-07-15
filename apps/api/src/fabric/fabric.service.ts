import {
  Injectable,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { connect, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Ưu tiên biến môi trường FABRIC_NETWORK_BASE (bền vững, không phụ thuộc
// __dirname khác nhau giữa ts-node dev và bản build dist).
// Fallback giữ nguyên hành vi cũ để không phá vỡ nếu ai đó chưa set env.
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
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

@Injectable()
export class FabricService implements OnModuleDestroy {
  private readonly logger = new Logger(FabricService.name);

  async execute(
    action: 'submit' | 'evaluate',
    txName: string,
    ...args: string[]
  ): Promise<any> {
    let lastError: Error;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.executeOnce(action, txName, ...args);
      } catch (err: any) {
        lastError = err;

        // Không retry lỗi nghiệp vụ — chỉ retry lỗi kết nối
        if (this.isBusinessError(err)) throw err;

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
      `Không thể kết nối Blockchain sau ${MAX_RETRIES} lần thử`,
    );
  }

  private async executeOnce(
    action: 'submit' | 'evaluate',
    txName: string,
    ...args: string[]
  ): Promise<any> {
    const walletOrg1 = JSON.parse(fs.readFileSync(ORG1.walletPath, 'utf8'));
    const clientOrg1 = await this.newGrpcConnection(ORG1);

    const gateway = connect({
      client: clientOrg1,
      identity: {
        mspId: ORG1.mspId,
        credentials: Buffer.from(walletOrg1.credentials.certificate),
      },
      signer: signers.newPrivateKeySigner(
        crypto.createPrivateKey({
          key: Buffer.from(walletOrg1.credentials.privateKey),
          format: 'pem',
        }),
      ),
      evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30000 }),
      submitOptions: () => ({ deadline: Date.now() + 30000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });

    let clientOrg2: grpc.Client | null = null;

    try {
      const contract = gateway.getNetwork(CHANNEL).getContract(CHAINCODE);

      if (action === 'submit') {
        clientOrg2 = await this.newGrpcConnection(ORG2);
        const proposal = contract.newProposal(txName, {
          arguments: args,
          endorsingOrganizations: [ORG1.mspId, ORG2.mspId],
        });
        const tx = await proposal.endorse();
        const commit = await tx.submit();
        const status = await commit.getStatus();
        if (!status.successful)
          throw new Error(`Transaction thất bại: ${status.code}`);
        return {
          txId: tx.getTransactionId(),
          payload: new TextDecoder().decode(tx.getResult()),
        };
      } else {
        const bytes = await contract.evaluateTransaction(txName, ...args);
        return { result: JSON.parse(new TextDecoder().decode(bytes)) };
      }
    } finally {
      gateway.close();
      clientOrg1.close();
      clientOrg2?.close();
    }
  }

  private isBusinessError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    // Lỗi nghiệp vụ — không retry
    return (
      msg.includes('đã tồn tại') ||
      msg.includes('không tìm thấy') ||
      msg.includes('already exists') ||
      msg.includes('not found') ||
      msg.includes('mvcc_read_conflict')
    ); // conflict do duplicate submit
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async newGrpcConnection(org: typeof ORG1): Promise<grpc.Client> {
    const tlsCert = fs.readFileSync(org.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsCert, null, null, {
      checkServerIdentity: () => undefined,
    });
    return new grpc.Client(org.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': org.peerHostAlias,
      'grpc.keepalive_time_ms': 600000,
      'grpc.keepalive_timeout_ms': 60000,
    });
  }

  /**
   * Health check nhẹ — chỉ kiểm tra gRPC connectivity tới peer0.org1,
   * không load wallet/identity, không evaluate chaincode. Dùng cho GET /health.
   */
  async checkConnection(): Promise<{
    connected: boolean;
    latencyMs?: number;
    error?: string;
  }> {
    const start = Date.now();
    let client: grpc.Client | null = null;
    try {
      client = await this.newGrpcConnection(ORG1);
      await this.waitForReady(client, 3000); // timeout 3s
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
    this.logger.log('FabricService destroyed');
  }
}
