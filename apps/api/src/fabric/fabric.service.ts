import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import { connect, signers, Gateway } from '@hyperledger/fabric-gateway';
import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

@Injectable()
export class FabricService implements OnModuleDestroy {
  private readonly gateways = new Map<
    string,
    { gateway: Gateway; client: grpc.Client }
  >();
  constructor(private readonly config: ConfigService) {}
  get enabled() {
    return String(this.config.get('FABRIC_ENABLED', 'false')) === 'true';
  }
  get channel() {
    return this.config.get<string>('FABRIC_CHANNEL', 'mychannel');
  }
  get chaincode() {
    return this.config.get<string>('FABRIC_CHAINCODE', 'educert');
  }

  private async getGateway(mspId: string) {
    if (!this.enabled)
      throw new ServiceUnavailableException(
        'Fabric đang tắt; không được xác nhận văn bằng đã lên blockchain',
      );
    const cached = this.gateways.get(mspId);
    if (cached) return cached.gateway;
    if (!['Org1MSP', 'Org2MSP'].includes(mspId))
      throw new ServiceUnavailableException('MSP chưa được cấu hình');
    const org2 = mspId === 'Org2MSP';
    const prefix = org2 ? 'ORG2' : 'ORG1';
    const domain = org2 ? 'org2.example.com' : 'org1.example.com';
    const base = resolve(this.config.getOrThrow<string>('FABRIC_NETWORK_BASE'));
    const walletPath =
      this.config.get<string>(prefix + '_WALLET_PATH') ||
      join(base, 'wallet', org2 ? 'admin-org2.json' : 'issuer-org1.json');
    const tlsPath =
      this.config.get<string>(prefix + '_TLS_CERT_PATH') ||
      join(
        base,
        'blockchain-network',
        'organizations',
        'peerOrganizations',
        domain,
        'tlsca',
        'tlsca.' + domain + '-cert.pem',
      );
    const wallet = JSON.parse(readFileSync(walletPath, 'utf8'));
    const credentials = grpc.credentials.createSsl(readFileSync(tlsPath));
    const client = new grpc.Client(
      this.config.get<string>(prefix + '_PEER_ENDPOINT') ||
        (org2 ? 'localhost:9051' : 'localhost:7051'),
      credentials,
      {
        'grpc.ssl_target_name_override':
          this.config.get<string>(prefix + '_PEER_HOST_ALIAS') ||
          'peer0.' + domain,
        'grpc.keepalive_time_ms': 120000,
        'grpc.keepalive_timeout_ms': 20000,
        'grpc.keepalive_permit_without_calls': 1,
      },
    );
    try {
      await new Promise<void>((resolveReady, reject) =>
        client.waitForReady(Date.now() + 3000, (error) =>
          error ? reject(error) : resolveReady(),
        ),
      );
      const gateway = connect({
        client,
        identity: {
          mspId,
          credentials: Buffer.from(wallet.credentials.certificate),
        },
        signer: signers.newPrivateKeySigner(
          createPrivateKey(wallet.credentials.privateKey),
        ),
        evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30000 }),
        submitOptions: () => ({ deadline: Date.now() + 30000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
      });
      this.gateways.set(mspId, { gateway, client });
      return gateway;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  execute(
    action: 'submit' | 'evaluate',
    transaction: string,
    ...args: string[]
  ) {
    return this.executeForMsp('Org1MSP', action, transaction, ...args);
  }

  async executeForMsp(
    mspId: string,
    action: 'submit' | 'evaluate',
    transaction: string,
    ...args: string[]
  ) {
    const gateway = await this.getGateway(mspId);
    const contract = gateway
      .getNetwork(this.channel)
      .getContract(this.chaincode);
    if (action === 'evaluate')
      return {
        result: JSON.parse(
          new TextDecoder().decode(
            await contract.evaluateTransaction(transaction, ...args),
          ),
        ),
      };
    const endorsed = await contract
      .newProposal(transaction, {
        arguments: args,
        endorsingOrganizations: ['Org1MSP', 'Org2MSP'],
      })
      .endorse();
    const commit = await endorsed.submit();
    const status = await commit.getStatus();
    if (!status.successful)
      throw new ServiceUnavailableException(
        'Fabric transaction invalid: ' + status.code,
      );
    return {
      txId: endorsed.getTransactionId(),
      blockNumber: String(status.blockNumber),
      payload: new TextDecoder().decode(endorsed.getResult()),
    };
  }

  async checkConnection() {
    if (!this.enabled) return { connected: false, disabled: true };
    const started = Date.now();
    try {
      await this.execute('evaluate', 'QueryAllCertificates');
      return { connected: true, latencyMs: Date.now() - started };
    } catch {
      return { connected: false, error: 'Fabric gateway không sẵn sàng' };
    }
  }

  onModuleDestroy() {
    for (const { gateway, client } of this.gateways.values()) {
      gateway.close();
      client.close();
    }
    this.gateways.clear();
  }
}
