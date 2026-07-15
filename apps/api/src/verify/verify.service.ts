import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { FabricService } from '../fabric/fabric.service';
import { Certificate, CertificateDocument } from '../mongo/schemas/certificate.schema';

const GRADE_MAP: Record<string, string> = {
  xuatsac: 'Xuất sắc', gioi: 'Giỏi', kha: 'Khá',
  trungbinhkha: 'Trung bình khá', trungbinh: 'Trung bình',
};

function normalizeGrade(raw: string): string {
  const norm = String(raw || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, '');
  return GRADE_MAP[norm] || raw;
}

function normalizeGpa(raw: any): string {
  const n = Number(String(raw ?? '').trim());
  return !isNaN(n) && n >= 0 && n <= 4 ? n.toFixed(2) : '2.00';
}

function computeHash(data: any): string {
  const raw = [
    data.uuid, data.mssv || 'KĐ', data.fullName || 'Ẩn danh',
    data.major || 'Không xác định', normalizeGpa(data.gpa),
    normalizeGrade(data.grade || ''), data.issueDate || '',
    data.soHieu || '', data.soVaoSo || '',
    data.className || '', String(data.namTotNghiep || ''),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class VerifyService {
  constructor(
    private readonly fabric: FabricService,
    @InjectModel(Certificate.name) private certModel: Model<CertificateDocument>,
  ) {}

  async verify(input: any) {
    const proof = input.proofString ? JSON.parse(input.proofString) : input;
    const certUUID = proof.certUUID || proof.uuid;
    if (!certUUID) throw new Error('Thiếu certUUID');

    const isUUIDOnly = !proof.fullName && !proof.certHash;

    // 1. Query Blockchain
    const onChainRaw = await this.fabric.execute('evaluate', 'QueryCertificate', certUUID);
    const onChain = typeof onChainRaw.result === 'string'
      ? JSON.parse(onChainRaw.result) : onChainRaw.result;

    if (!onChain?.certHash) throw new Error('Blockchain data không hợp lệ');

    if (onChain.isRevoked) {
      return {
        success: true, isValid: false, isRevoked: true,
        message: `Văn bằng đã bị thu hồi: ${onChain.revokedReason || ''}`,
        details: { studentName: onChain.studentName, revokedReason: onChain.revokedReason },
      };
    }

    // 2. Query MongoDB
    const certDB = await this.certModel.findOne({ uuid: certUUID }).lean() as any;
    if (!certDB) throw new Error('Không tìm thấy trong cơ sở dữ liệu');

    // 3. Tính hash 3 chiều
    const proofHash = computeHash({ uuid: certUUID, ...proof });
    const dbHash = computeHash(certDB);
    const onChainHash = onChain.certHash;

    const proofMatchChain = proofHash === onChainHash;
    const dbMatchChain = dbHash === onChainHash;
    const isValid = isUUIDOnly ? dbMatchChain : (proofMatchChain && dbMatchChain);

    let message = 'Văn bằng hợp lệ!';
    if (!proofMatchChain && !dbMatchChain) message = 'Cả minh chứng và DB đều bị thay đổi!';
    else if (!proofMatchChain) message = 'Minh chứng đã bị giả mạo!';
    else if (!dbMatchChain) message = 'Dữ liệu DB bị thay đổi so với Blockchain!';

    return {
      success: true, isValid, message,
      details: {
        studentName: certDB.fullName, mssv: certDB.mssv,
        major: certDB.major, gpa: certDB.gpa, grade: certDB.grade,
        issueDate: certDB.issueDate, soHieu: certDB.soHieu,
        namTotNghiep: certDB.namTotNghiep, txId: certDB.txId,
        onChainHash, proofHash, dbHash, proofMatchChain, dbMatchChain,
      },
    };
  }
}
