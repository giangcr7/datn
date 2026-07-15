import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { FabricService } from '../fabric/fabric.service';
import { NotifyService } from '../notify/notify.service';
import { AuditService, AuditAction } from '../audit/audit.service';
import { Certificate, CertificateDocument } from '../mongo/schemas/certificate.schema';
import { User, UserDocument } from '../mongo/schemas/user.schema';

@Injectable()
export class CertService {
  constructor(
    private readonly fabric: FabricService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    @InjectModel(Certificate.name) private certModel: Model<CertificateDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async issue(body: any, userId = 'system', userEmail = 'system', ip?: string) {
    const certUuid = randomUUID();
    const safeGpa = Number(body.gpa).toFixed(2);
    const issueDate = new Date().toISOString().split('T')[0];
    try {
      const response = await this.fabric.execute('submit', 'IssueCertificate', certUuid, body.mssv, body.fullName, body.major, safeGpa, body.grade, issueDate, body.soHieu, body.soVaoSo, body.className || '', String(body.namTotNghiep || ''));
      const chainResult = JSON.parse(response.payload || '{}');
      await this.certModel.create({ uuid: certUuid, certHash: chainResult.hash, txId: response.txId, mssv: body.mssv, fullName: body.fullName, major: body.major, gpa: Number(safeGpa), grade: body.grade, issueDate, soHieu: body.soHieu, soVaoSo: body.soVaoSo, className: body.className, namTotNghiep: body.namTotNghiep, status: 'ON_CHAIN' });
      await this.audit.log({ userId, userEmail, action: AuditAction.ISSUE_CERT, target: certUuid, result: 'SUCCESS', ip, metadata: { mssv: body.mssv, txId: response.txId } });
      try { const student = await this.userModel.findOne({ $or: [{ mssv: body.mssv }, { fabricEnrollmentId: body.mssv }] }).lean() as any; if (student?.email) await this.notify.sendCertIssued(student.email, { studentName: body.fullName, mssv: body.mssv, major: body.major, grade: body.grade, issueDate, soHieu: body.soHieu, verifyUrl: `${process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/verify` }); } catch (e) {}
      return { success: true, txId: response.txId, uuid: certUuid, hash: chainResult.hash };
    } catch (error: any) {
      await this.audit.log({ userId, userEmail, action: AuditAction.ISSUE_CERT, target: certUuid, result: 'FAILED', errorMessage: error.message, ip });
      throw error;
    }
  }

  async revoke(certUUID: string, reason: string, userId = 'system', userEmail = 'system', ip?: string) {
    if (!certUUID || !reason) throw new Error('Thiếu certUUID hoặc lý do thu hồi');
    try {
      await this.fabric.execute('submit', 'RevokeCertificate', certUUID, reason);
      await this.certModel.updateOne({ uuid: certUUID }, { status: 'REVOKED', revokedReason: reason, revokedAt: new Date() });
      await this.audit.log({ userId, userEmail, action: AuditAction.REVOKE_CERT, target: certUUID, result: 'SUCCESS', ip, metadata: { reason } });
      try { const cert = await this.certModel.findOne({ uuid: certUUID }).lean() as any; if (cert?.mssv) { const student = await this.userModel.findOne({ $or: [{ mssv: cert.mssv }, { fabricEnrollmentId: cert.mssv }] }).lean() as any; if (student?.email) await this.notify.sendCertRevoked(student.email, { studentName: student.name, mssv: cert.mssv, fullName: cert.fullName, major: cert.major, reason }); } } catch (e) {}
      return { success: true, message: `Đã thu hồi văn bằng ${certUUID}` };
    } catch (error: any) {
      await this.audit.log({ userId, userEmail, action: AuditAction.REVOKE_CERT, target: certUUID, result: 'FAILED', errorMessage: error.message, ip });
      throw error;
    }
  }

  async requestCert(body: any, userId: string, userEmail: string, ip?: string) {
    const certUuid = randomUUID();
    const issueDate = new Date().toISOString().split('T')[0];
    await this.certModel.create({ uuid: certUuid, mssv: body.mssv, fullName: body.fullName, major: body.major, gpa: Number(body.gpa), grade: body.grade, issueDate, soHieu: body.soHieu, soVaoSo: body.soVaoSo, className: body.className, namTotNghiep: body.namTotNghiep, org: body.org, status: 'PENDING', requestedBy: userId, requestedAt: new Date() });
    await this.audit.log({ userId, userEmail, action: 'REQUEST_CERT', target: certUuid, result: 'SUCCESS', ip, metadata: { mssv: body.mssv, fullName: body.fullName, org: body.org } });
    return { success: true, uuid: certUuid, message: 'Yêu cầu đã gửi — chờ Phân hiệu TP.HCM xác nhận' };
  }

  async approveCert(uuid: string, userId: string, userEmail: string, ip?: string) {
    const cert = await this.certModel.findOne({ uuid, status: 'PENDING' }) as any;
    if (!cert) throw new Error('Không tìm thấy yêu cầu hoặc đã được xử lý');
    const safeGpa = Number(cert.gpa).toFixed(2);
    try {
      const response = await this.fabric.execute('submit', 'IssueCertificate', uuid, cert.mssv, cert.fullName, cert.major, safeGpa, cert.grade, cert.issueDate, cert.soHieu || '', cert.soVaoSo || '', cert.className || '', String(cert.namTotNghiep || ''));
      const chainResult = JSON.parse(response.payload || '{}');
      await this.certModel.updateOne({ uuid }, { status: 'ON_CHAIN', certHash: chainResult.hash, txId: response.txId, approvedBy: userId, approvedAt: new Date() });
      await this.audit.log({ userId, userEmail, action: 'APPROVE_CERT', target: uuid, result: 'SUCCESS', ip, metadata: { mssv: cert.mssv, txId: response.txId } });
      try { const student = await this.userModel.findOne({ $or: [{ mssv: cert.mssv }, { fabricEnrollmentId: cert.mssv }] }).lean() as any; if (student?.email) await this.notify.sendCertIssued(student.email, { studentName: cert.fullName, mssv: cert.mssv, major: cert.major, grade: cert.grade, issueDate: cert.issueDate, soHieu: cert.soHieu, verifyUrl: `${process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}/verify` }); } catch (e) {}
      return { success: true, txId: response.txId, message: 'Văn bằng đã được phê duyệt và ghi lên Blockchain' };
    } catch (error: any) {
      await this.audit.log({ userId, userEmail, action: 'APPROVE_CERT', target: uuid, result: 'FAILED', errorMessage: error.message, ip });
      throw error;
    }
  }

  async rejectCert(uuid: string, reason: string, userId: string, userEmail: string, ip?: string) {
    const cert = await this.certModel.findOne({ uuid, status: 'PENDING' });
    if (!cert) throw new Error('Không tìm thấy yêu cầu hoặc đã được xử lý');
    await this.certModel.updateOne({ uuid }, { status: 'REJECTED', rejectReason: reason, rejectedBy: userId, rejectedAt: new Date() });
    await this.audit.log({ userId, userEmail, action: 'REJECT_CERT', target: uuid, result: 'SUCCESS', ip, metadata: { reason } });
    return { success: true, message: `Đã từ chối yêu cầu ${uuid}` };
  }

  async findPending() {
    return this.certModel.find({ status: 'PENDING' }).sort({ requestedAt: -1 }).lean();
  }

  async search(query: string) {
    if (!query || query.length < 2) throw new Error('Nhập ít nhất 2 ký tự');
    return this.certModel.find({ status: 'ON_CHAIN', $or: [{ fullName: { $regex: query, $options: 'i' } }, { mssv: { $regex: query, $options: 'i' } }] }).select('uuid fullName mssv major grade gpa issueDate namTotNghiep soHieu status').limit(20).lean();
  }

  async statistics() {
    const [byMajor, byYear, byGrade, byMonth, total, thisMonth, totalRevoked, totalAll] = await Promise.all([
      this.certModel.aggregate([{ $match: { status: 'ON_CHAIN' } }, { $group: { _id: '$major', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      this.certModel.aggregate([{ $match: { status: 'ON_CHAIN' } }, { $group: { _id: '$namTotNghiep', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      this.certModel.aggregate([{ $match: { status: { $in: ['ON_CHAIN', 'REVOKED'] } } }, { $group: { _id: '$grade', count: { $sum: 1 } } }]),
      this.certModel.aggregate([{ $match: { status: { $in: ['ON_CHAIN', 'REVOKED'] }, createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) } } }, { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }]),
      this.certModel.countDocuments({ status: 'ON_CHAIN' }),
      this.certModel.countDocuments({ status: 'ON_CHAIN', createdAt: { $gte: new Date(new Date().setDate(1)) } }),
      this.certModel.countDocuments({ status: 'REVOKED' }),
      this.certModel.countDocuments(),
    ]);
    const monthNames = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
    return { total, thisMonth, totalRevoked, totalAll, byMajor: byMajor.map(x => ({ name: x._id || 'Không xác định', value: x.count })), byYear: byYear.map(x => ({ year: String(x._id || ''), count: x.count })), byGrade: byGrade.map(x => ({ name: x._id || 'Không xác định', value: x.count })), byMonth: byMonth.map(x => ({ month: `${monthNames[x._id.month - 1]}/${x._id.year}`, count: x.count })) };
  }

  async findAllPaginated(page: number, limit: number, search: string) {
    const query: any = {};
    if (search) { query.$or = [{ fullName: { $regex: search, $options: 'i' } }, { mssv: { $regex: search, $options: 'i' } }, { soHieu: { $regex: search, $options: 'i' } }]; }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([this.certModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), this.certModel.countDocuments(query)]);
    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findByMssv(mssv: string) { return this.certModel.find({ mssv }).lean(); }
  async findAll() { return this.certModel.find().lean(); }
  async findOne(uuid: string) { return this.certModel.findOne({ uuid }).lean(); }
}
