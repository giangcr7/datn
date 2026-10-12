export interface AuthActor {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'university' | 'student' | 'employer';
  membershipId: string;
  institutionId: string;
  campusId: string;
  org: string;
  studentId: string | null;
  mssv: string | null;
  sessionVersion: number;
  mustChangePassword: boolean;
}
