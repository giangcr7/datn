import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { FabricService } from '../fabric/fabric.service';
import { NotifyService } from '../notify/notify.service';
import { Certificate, CertificateDocument } from '../mongo/schemas/certificate.schema';
import { IntegrityAlert, IntegrityAlertDocument } from '../mongo/schemas/integrity-alert.schema';

@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);

  constructor(
    private readonly fabric: FabricService,
    private readonly notify: NotifyService,
    @InjectModel(Certificate.name) private certModel: Model<CertificateDocument>,
    @InjectModel(IntegrityAlert.name) private alertModel: Model<IntegrityAlertDocument>,
  ) {}

  @Cron('0 2 * * *')
  async runDailyCheck() {
    this.logger.log('Bắt đầu kiểm tra tính toàn vẹn hàng ngày...');
    await this.checkIncremental(1, 50);
  }

  async debugCount() {
    const total = await this.certModel.countDocuments({});
    const onChain = await this.certModel.countDocuments({ status: 'ON_CHAIN' });
    const sample = await this.certModel.findOne({}).lean();
    return { total, onChain, sample };
  }

  async checkIncremental(days = 1, limit = 5): Promise<{
    checked: number; mismatches: number; alerts: any[];
  }> {
    let query: any = { status: { $in: ['ON_CHAIN', 'REVOKED'] } };
    if (days > 0 && days < 365) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      query.updatedAt = { $gte: since };
    }

    const certs = await this.certModel
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean() as any[];

    this.logger.log(`Tìm thấy ${certs.length} văn bằng để kiểm tra (days=${days}, limit=${limit})`);

    if (certs.length === 0) {
      return { checked: 0, mismatches: 0, alerts: [] };
    }

    const alerts: any[] = [];

    for (const cert of certs) {
      try {
        const onChainRaw = await this.fabric.execute('evaluate', 'QueryCertificate', cert.uuid);
        const onChain = typeof onChainRaw.result === 'string'
          ? JSON.parse(onChainRaw.result)
          : onChainRaw.result;

        if (!onChain) {
          const alert = await this.alertModel.create({
            uuid: cert.uuid, mssv: cert.mssv,
            fullName: cert.fullName, type: 'NOT_ON_CHAIN',
            mongoHash: cert.certHash, fabricHash: '',
          });
          alerts.push(alert);
          this.logger.warn(`NOT_ON_CHAIN: ${cert.uuid}`);
          continue;
        }

        if (cert.certHash && onChain.certHash && cert.certHash !== onChain.certHash) {
          const alert = await this.alertModel.create({
            uuid: cert.uuid, mssv: cert.mssv,
            fullName: cert.fullName, type: 'HASH_MISMATCH',
            mongoHash: cert.certHash, fabricHash: onChain.certHash,
          });
          alerts.push(alert);
          this.logger.warn(`HASH_MISMATCH: ${cert.uuid}`);
        }

        if (cert.status === 'REVOKED' && !onChain.isRevoked) {
          const alert = await this.alertModel.create({
            uuid: cert.uuid, mssv: cert.mssv,
            fullName: cert.fullName, type: 'REVOKED_MISMATCH',
            note: 'MongoDB REVOKED nhưng Fabric chưa revoke',
          });
          alerts.push(alert);
          this.logger.warn(`REVOKED_MISMATCH: ${cert.uuid}`);
        }

      } catch (e: any) {
        this.logger.error(`Lỗi check ${cert.uuid}: ${e.message}`);
      }
    }

    this.logger.log(`Hoàn thành: ${certs.length} kiểm tra, ${alerts.length} cảnh báo`);

    if (alerts.length > 0) {
      try { await this.notify.sendIntegrityAlert(alerts); } catch (e) {}
    }

    return { checked: certs.length, mismatches: alerts.length, alerts };
  }

  async getAlerts(resolved = false) {
    return this.alertModel.find({ resolved }).sort({ createdAt: -1 }).lean();
  }

  async resolveAlert(id: string, note: string) {
    await this.alertModel.updateOne(
      { _id: id },
      { resolved: true, resolvedAt: new Date(), note },
    );
    return { success: true };
  }
}
