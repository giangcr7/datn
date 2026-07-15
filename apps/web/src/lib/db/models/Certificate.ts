import mongoose from 'mongoose';

const certificateSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  certHash: { type: String, required: true },
  txId: { type: String },
  mssv: { type: String, required: true },
  fullName: { type: String, required: true },
  major: { type: String },
  gpa: { type: Number },
  grade: { type: String },
  issueDate: { type: String },
  // 4 trường mới đồng bộ
  soHieu: { type: String },
  soVaoSo: { type: String },
  className: { type: String },
  namTotNghiep: { type: Number },
  status: { type: String, default: 'ON_CHAIN' }
}, { timestamps: true });

export const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);