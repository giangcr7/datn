import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../mongo/schemas/audit-log.schema';

export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REGISTER = 'REGISTER',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  ISSUE_CERT = 'ISSUE_CERT',
  REVOKE_CERT = 'REVOKE_CERT',
  IMPORT_STUDENTS = 'IMPORT_STUDENTS',
  CREATE_STUDENT = 'CREATE_STUDENT',
  VERIFY_CERT = 'VERIFY_CERT',
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
  ) {}

  async log(data: {
    userId: string;
    userEmail: string;
    action: AuditAction | string;
    target?: string;
    ip?: string;
    userAgent?: string;
    result?: 'SUCCESS' | 'FAILED';
    errorMessage?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      await this.auditModel.create({
        userId: data.userId,
        userEmail: data.userEmail,
        action: data.action,
        target: data.target || '',
        ip: data.ip || '',
        userAgent: data.userAgent || '',
        result: data.result || 'SUCCESS',
        errorMessage: data.errorMessage || '',
        metadata: data.metadata || {},
      });
    } catch (e) {
      // Không để lỗi audit ảnh hưởng tới luồng chính
    }
  }

  async findAll(page = 1, limit = 20, action?: string) {
    const query: any = {};
    if (action) query.action = action;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.auditModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(query),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByUser(userId: string) {
    return this.auditModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }
}
