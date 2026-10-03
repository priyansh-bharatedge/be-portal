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

export const INITIAL_EMPLOYEES: EmployeeData[] = [
  {
    id: 'EMP-001',
    name: 'Managing Director',
    email: 'md@bharat-edge.com',
    mobile: '9876543210',
    dept: 'Management',
    role: 'Managing Director & Super Admin',
    systemRole: 'Super Admin',
    salaryEntity: 'BSPL',
    joined: '2024-01-01',
    status: 'Active',
    formData: {
      empId: 'EMP-001',
      salaryEntity: 'BSPL',
      firstName: 'Managing',
      middleName: '',
      lastName: 'Director',
      dob: '1985-01-01',
      gender: 'Male',
      nationality: 'Indian',
      maritalStatus: 'Married',
      mobile: '9876543210',
      email: 'md@bharat-edge.com',
      permanentAddress: 'Bharat Edge Corporate HQ, Ahmedabad',
      currentAddress: 'Bharat Edge Corporate HQ, Ahmedabad',
      bloodGroup: 'O+',
      education: 'Executive MBA',
      certifications: 'Executive Leadership',
      skills: 'Strategic Leadership, Corporate Governance',
      languages: ['English', 'Hindi', 'Gujarati'],
      emergencyFirstName: 'Emergency',
      emergencyLastName: 'Contact',
      emergencyMobile: '9876543211',
      emergencyRelation: 'Family',
      doj: '2024-01-01',
      dept: 'Management',
      role: 'Managing Director & Super Admin',
      systemRole: 'Super Admin',
      workEmail: 'md@bharat-edge.com',
      previousEmployer: 'Bharat Edge',
      experience: '15 Years',
      employmentType: 'Full Time',
      hasPf: false,
      bankAccount: '100000000001',
      bankName: 'HDFC Bank',
      ifsc: 'HDFC0001234',
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '123456789012',
      passportNumber: 'Z1234567',
      drivingLicense: 'GJ0120201234567',
      pfNumber: '',
      esicNumber: '31000123450000101',
      uanNumber: '100987654321',
      medicalInsurance: 'MED-100001'
    }
  }
];

export const DEMO_USERS: AuthUser[] = [
  {
    id: 'EMP-001',
    name: 'Managing Director',
    email: 'md@bharat-edge.com',
    role: 'Super Admin',
    department: 'Management',
    designation: 'Managing Director (Super Admin)',
    empId: 'EMP-001'
  }
];

export const INITIAL_DSR_REPORTS: any[] = [];



