// src/app/(student)/dashboard/page.tsx
import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { connectDB } from '@/lib/db/connect';
import { Certificate } from '@/lib/db/models/Certificate';
import { User } from '@/lib/db/models/User';
import StudentDashboardClient from './StudentDashboardClient';

export default async function StudentDashboardPage() {
  // 1. Kiểm tra xác thực (Bảo vệ Route)
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role?.toUpperCase() !== 'STUDENT') {
    redirect('/login');
  }

  // Bắt buộc đổi mật khẩu lần đầu
  if ((session.user as any).mustChangePassword) {
    redirect('/change-password');
  }

  // 2. Kết nối Off-chain DB
  await connectDB();

  // 3. Tìm thông tin sinh viên hiện tại và truy vấn văn bằng tương ứng
  // Giả định liên kết qua trường email hoặc một định danh mapping nào đó
  const userEmail = session.user?.email;
  const studentInfo = await User.findOne({ email: userEmail });
  
  // Truy vấn văn bằng đã được cấp phát cho sinh viên này
  // (Trong thực tế, bạn có thể map qua MSSV thay vì fullName/email)
  const rawCertificates = await Certificate.find({ 
    fullName: studentInfo?.name,
    status: 'ON_CHAIN' // Chỉ hiện văn bằng đã có trên Blockchain
  }).lean();

  // 4. Chuẩn hóa dữ liệu để gửi xuống Client
  const certificates = rawCertificates.map((cert: any) => ({
    uuid: cert.uuid,
    type: cert.diplomaType || 'Kỹ sư Phần mềm',
    major: cert.major,
    issueDate: cert.issueDate,
    certNo: cert.certNo || cert.uuid,
    txId: cert.txId,
    fullName: cert.fullName,
    mssv: cert.mssv,
    gpa: cert.gpa,
    grade: cert.grade,
    soHieu: cert.soHieu,
    soVaoSo: cert.soVaoSo,
    className: cert.className,
    namTotNghiep: cert.namTotNghiep,
    certHash: cert.certHash,
  }));

  // 5. Truyền dữ liệu tĩnh xuống giao diện Client
  return <StudentDashboardClient initialCertificates={certificates} />;
}