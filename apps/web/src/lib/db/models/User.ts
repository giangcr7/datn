import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  
  // Thêm MSSV vào đây để ánh xạ giữa tài khoản Web và danh tính Blockchain
  mssv: { type: String, unique: true, sparse: true }, 
  
  role: { 
    type: String, 
    enum: ['university', 'student', 'employer', 'admin'], 
    default: 'student' 
  },
  
  // Dùng để lưu Certificate Enrollment ID của Hyperledger Fabric
  fabricEnrollmentId: { type: String },

  // Bắt buộc đổi mật khẩu lần đầu
  mustChangePassword: { type: Boolean, default: false }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', UserSchema);