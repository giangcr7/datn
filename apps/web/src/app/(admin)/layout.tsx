import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../api/auth/[...nextauth]/route';
import AdminShell from './AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const role = (session.user as any)?.role?.toUpperCase();
  if (role === 'STUDENT') {
    redirect('/student/dashboard');
  }

  return (
    <AdminShell user={session.user as any}>
      {children}
    </AdminShell>
  );
}