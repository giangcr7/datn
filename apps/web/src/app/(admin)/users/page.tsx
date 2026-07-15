// src/app/(admin)/users/page.tsx
import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { apiCall } from '@/lib/api';
import UserTable from './UserTable';

export default async function ListUserPage() {
  const session = await getServerSession(authOptions) as any;
  const token = session?.accessToken;

  const rawUsers = await apiCall('/auth/users', 'GET', undefined, token);

  const users = rawUsers.map((user: any, index: number) => ({
    key: user._id?.toString(),
    stt: index + 1,
    fullName: user.name,
    email: user.email,
    role: user.role,
    hasCertificate: !!user.certificate,
  }));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <UserTable data={users} />
    </div>
  );
}
