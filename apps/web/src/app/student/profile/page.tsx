import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import StudentProfileClient from "./StudentProfileClient";

export default async function StudentProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user as any).role?.toUpperCase() !== 'STUDENT') {
    redirect('/login');
  }

  await connectDB();
  const user = await User.findOne({ email: session.user?.email }).lean() as any;

  return (
    <StudentProfileClient
      user={{
        name: user?.name || '',
        email: user?.email || '',
        mssv: user?.fabricEnrollmentId || user?.mssv || '',
        role: user?.role || 'student',
        createdAt: user?.createdAt?.toISOString() || '',
      }}
    />
  );
}
