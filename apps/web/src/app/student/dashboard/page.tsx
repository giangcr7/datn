// src/app/(student)/dashboard/page.tsx
import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
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

  // 2. Truy vấn danh sách văn bằng qua REST API Backend theo MSSV duy nhất
  const studentMssv = (session.user as any)?.mssv;
  let rawCertificates: any[] = [];

  if (studentMssv) {
    try {
      const res = await apiCall(`/cert/student/${studentMssv}`, 'GET', undefined, (session as any).accessToken);
      if (Array.isArray(res)) {
        rawCertificates = res.filter((c: any) => c.status === 'ON_CHAIN');
      }
    } catch {
      // Trường hợp không có văn bằng hoặc lỗi kết nối
      rawCertificates = [];
    }
  }

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