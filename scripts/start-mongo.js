const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../.data/db');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

async function start() {
  console.log('>>> Khoi dong MongoDB local...');
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbPath: dbPath,
      storageEngine: 'wiredTiger',
    },
  });

  const uri = mongod.getUri();
  console.log(`>>> MongoDB dang chay tai: ${uri} (port 27017)`);

  // Ket noi de kiem tra va seed tai khoan mau
  const conn = await mongoose.createConnection('mongodb://127.0.0.1:27017/diplomachain');
  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    mssv: { type: String, sparse: true },
    role: { type: String, enum: ['university', 'student', 'employer', 'admin'], default: 'student' },
    fabricEnrollmentId: { type: String },
    mustChangePassword: { type: Boolean, default: false }
  }, { timestamps: true });

  const User = conn.model('User', userSchema);

  const count = await User.countDocuments();
  if (count === 0) {
    console.log('>>> Tao tai khoan mau mac dinh...');
    const hashedAdminPw = await bcrypt.hash('Admin@123', 10);
    const hashedUnivPw = await bcrypt.hash('Univ@123', 10);
    const hashedStudentPw = await bcrypt.hash('Student@123', 10);

    await User.create([
      {
        email: 'admin@example.com',
        password: hashedAdminPw,
        name: 'Quản trị viên Hệ thống',
        role: 'admin',
      },
      {
        email: 'university@example.com',
        password: hashedUnivPw,
        name: 'Đại học Thủy Lợi',
        role: 'university',
      },
      {
        email: 'student@example.com',
        password: hashedStudentPw,
        name: 'Nguyễn Văn A',
        role: 'student',
        mssv: '2151060001',
      }
    ]);
    console.log('>>> Da tao thanh cong cac tai khoan mau:');
    console.log('    1. Admin: admin@example.com / Admin@123');
    console.log('    2. Nhan vien nha truong: university@example.com / Univ@123');
    console.log('    3. Sinh vien: student@example.com / Student@123 (MSSV: 2151060001)');
  } else {
    console.log(`>>> Database da ton tai ${count} tai khoan.`);
  }

  await conn.close();
  console.log('>>> MongoDB san sang nhan ket noi tu Backend & Frontend.');
}

start().catch(err => {
  console.error('Loi khoi dong MongoDB:', err);
  process.exit(1);
});
