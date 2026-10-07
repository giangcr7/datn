import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { apiCall } from "@/lib/api";
import StudentProfileClient from "./StudentProfileClient";

export default async function StudentProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user as any).role?.toUpperCase() !== 'STUDENT') {
    redirect('/login');
  }

  let profile = session.user as any;
  try {
    const me = await apiCall('/auth/me', 'GET', undefined, (session as any).accessToken);
    if (me) profile = me;
  } catch {
    // Fallback sang thông tin session nếu mạng bận
  }

  return (
    <StudentProfileClient
      user={{
        name: profile?.name || '',
        email: profile?.email || '',
        mssv: profile?.fabricEnrollmentId || profile?.mssv || '',
        role: profile?.role || 'student',
        createdAt: profile?.createdAt ? new Date(profile.createdAt).toISOString() : '',
      }}
    />
  );
}

