import type { AuthUser, SystemRole } from '../types/roles';

export interface EmployeeData {
  id: string;
  name: string;
  email: string;
  mobile: string;
  dept: string;
  role: string;
  systemRole: SystemRole;
  salaryEntity?: 'BSPL' | 'BSAPL' | string;
  reportingManagerId?: string;
  reportingManagerName?: string;
  teamLeaderId?: string;
  teamLeaderName?: string;
  joined: string;
  status: 'Active' | 'On Leave' | 'Inactive';
  formData: any;
  password?: string;
  isActivated?: boolean;
  passwordSet?: boolean;
  activatedAt?: string;
  salaryDocumentName?: string;
  zohoId?: string;
  zohoStatus?: 'synced' | 'pending' | 'failed';
  zohoSyncedAt?: string;
  zohoError?: string;
  monthlyTarget?: string | number;
  target?: string | number;
}

export const INITIAL_EMPLOYEES: EmployeeData[] = [];

export const DEMO_USERS: AuthUser[] = [
  {
    id: 'SUPER-ADMIN',
    name: 'Super Admin',
    email: 'superadmin@be.com',
    role: 'Super Admin',
    department: 'Management',
    designation: 'Managing Director & Super Admin',
    empId: 'SUPER-ADMIN',
    password: 'beportaladmin2026',
    isActivated: true,
    passwordSet: true
  },
  {
    id: 'HR-ADMIN',
    name: 'HR Admin',
    email: 'hrmshr@be.com',
    role: 'HR',
    department: 'Human Resources',
    designation: 'HR Manager & Admin',
    empId: 'HR-ADMIN',
    password: 'hrmshrportal2026',
    isActivated: true,
    passwordSet: true
  }
];

export const INITIAL_DSR_REPORTS: any[] = [];



