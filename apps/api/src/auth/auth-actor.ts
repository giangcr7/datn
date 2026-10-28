export interface AuthActor {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'university' | 'student' | 'employer';
  membershipId: string;
  institutionId: string;
  campusId: string;
  org: string;
  campusName: string;
  isHeadquarters: boolean;
  canApproveDiplomas: boolean;
  studentId: string | null;
  mssv: string | null;
  sessionVersion: number;
  mustChangePassword: boolean;
}
