import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CertificateDocument = Certificate & Document;

@Schema({ timestamps: true })
export class Certificate {
  @Prop({ required: true, unique: true }) uuid: string;
  @Prop() certHash: string;
  @Prop() txId: string;
  @Prop({ required: true }) mssv: string;
  @Prop({ required: true }) fullName: string;
  @Prop() major: string;
  @Prop() gpa: number;
  @Prop() grade: string;
  @Prop() issueDate: string;
  @Prop() soHieu: string;
  @Prop() soVaoSo: string;
  @Prop() className: string;
  @Prop() namTotNghiep: number;
  @Prop({
    type: String,
    enum: ['PENDING', 'ON_CHAIN', 'REJECTED', 'REVOKED'],
    default: 'PENDING',
  })
  status: string;

  // Thông tin duyệt
  @Prop() requestedBy: string;     // userId Org1 tạo yêu cầu
  @Prop() requestedAt: Date;       // Thời điểm Org1 gửi
  @Prop() approvedBy: string;      // userId Org2 phê duyệt
  @Prop() approvedAt: Date;        // Thời điểm Org2 duyệt
  @Prop() rejectedBy: string;      // userId Org2 từ chối
  @Prop() rejectedAt: Date;        // Thời điểm từ chối
  @Prop() rejectReason: string;    // Lý do từ chối
  @Prop() revokedReason: string;
  @Prop() revokedAt: Date;
  @Prop() org: string;             // 'ORG1' hoặc 'ORG2' — SV thuộc cơ sở nào
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);
