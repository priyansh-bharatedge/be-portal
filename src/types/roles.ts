export type SystemRole = 'Super Admin' | 'HR' | 'HOD' | 'TL' | 'TM';

export interface RoleInfo {
  role: SystemRole;
  label: string;
  shortLabel: string;
  level: number; // 5: Super Admin, 4: HR, 3: HOD, 2: TL, 1: TM
  description: string;
  badgeClass: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

export const ROLE_DEFINITIONS: Record<SystemRole, RoleInfo> = {
  'Super Admin': {
    role: 'Super Admin',
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    level: 5,
    description: 'Full organizational control, all module privileges, user & policy management',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    borderClass: 'border-purple-500',
    bgClass: 'bg-purple-50',
    textClass: 'text-purple-700'
  },
  'HR': {
    role: 'HR',
    label: 'HR / HR Admin',
    shortLabel: 'HR Admin',
    level: 4,
    description: 'Create & manage employee directory, onboarding, policies, leaves & salary processing',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    borderClass: 'border-rose-500',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700'
  },
  'HOD': {
    role: 'HOD',
    label: 'Admin (HOD)',
    shortLabel: 'Admin (HOD)',
    level: 3,
    description: 'Admin level operations management, global visibility across all Deals, oversees TLs & TMs across CRM & Quality modules',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    borderClass: 'border-blue-500',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700'
  },
  'TL': {
    role: 'TL',
    label: 'Team Leader (TL)',
    shortLabel: 'Team Leader',
    level: 2,
    description: 'Leads team members, assigns tasks/deals, first-level approval of team leaves',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    borderClass: 'border-amber-500',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700'
  },
  'TM': {
    role: 'TM',
    label: 'Team Member (TM)',
    shortLabel: 'Team Member',
    level: 1,
    description: 'Individual contributor, manages assigned deals & tasks, self-service leaves & salary',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borderClass: 'border-emerald-500',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700'
  }
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  personalEmail?: string;
  workEmail?: string;
  mobile?: string;
  role: SystemRole;
  department: string;
  designation: string;
  empId: string;
  avatar?: string;
  password?: string;
  isActivated?: boolean;
  passwordSet?: boolean;
  reportingManagerId?: string;
  reportingManagerName?: string;
  teamLeaderId?: string;
  teamLeaderName?: string;
  teamId?: string;
  zohoId?: string;
  monthlyTarget?: string | number;
  target?: string | number;
}

export type ZohoModuleSection = 'CRM' | 'HRMS' | 'Quality';

export interface ZohoModuleConfig {
  section: ZohoModuleSection;
  moduleName: string;
  lookupField: string;
  isLookupExempt?: boolean;
  secondaryLookupFields?: string[];
}

/**
 * Registry of all enterprise Zoho CRM modules and their Employee lookup configuration.
 * Exempt modules: Company Calendar, Company Policies (no lookup required).
 */
export const ZOHO_MODULE_LOOKUP_MAP: Record<string, ZohoModuleConfig> = {
  // 1. CRM Section
  Quotations: { section: 'CRM', moduleName: 'Quotations', lookupField: 'Employee', secondaryLookupFields: ['Created_By_Employee', 'Sales_Representative'] },
  Deals: { section: 'CRM', moduleName: 'Deals', lookupField: 'Employee', secondaryLookupFields: ['BDM_names', 'Owner', 'Partner_BDM', 'Partner_BDM_ID'] },
  Clients: { section: 'CRM', moduleName: 'Clients', lookupField: 'Employee', secondaryLookupFields: ['Owner', 'Created_By'] },
  Companies: { section: 'CRM', moduleName: 'Companies', lookupField: 'Employee', secondaryLookupFields: ['Owner', 'Created_By'] },

  // 2. HRMS Section
  Employee: { section: 'HRMS', moduleName: 'Employee', lookupField: 'id' },
  Attendance: { section: 'HRMS', moduleName: 'Attendance', lookupField: 'Employee', secondaryLookupFields: ['Employee_Name', 'emp_code'] },
  Leaves: { section: 'HRMS', moduleName: 'Leaves', lookupField: 'Employee', secondaryLookupFields: ['Employee_Name', 'Employee_ID'] },
  Leave_Management: { section: 'HRMS', moduleName: 'Leave_Management', lookupField: 'Employee', secondaryLookupFields: ['Employee_Name', 'Employee_ID'] },
  DSR: { section: 'HRMS', moduleName: 'DSR', lookupField: 'Employee', secondaryLookupFields: ['Employee_Name', 'Created_By'] },
  Salary: { section: 'HRMS', moduleName: 'Salary', lookupField: 'Employee', secondaryLookupFields: ['Employee_Name', 'Salary_Entity'] },
  Salaries: { section: 'HRMS', moduleName: 'Salaries', lookupField: 'Employee', secondaryLookupFields: ['Employee_Name', 'Salary_Entity'] },
  Company_Calendar: { section: 'HRMS', moduleName: 'Company_Calendar', lookupField: '', isLookupExempt: true },
  Calendar: { section: 'HRMS', moduleName: 'Calendar', lookupField: '', isLookupExempt: true },
  Company_Policies: { section: 'HRMS', moduleName: 'Company_Policies', lookupField: '', isLookupExempt: true },
  Policies: { section: 'HRMS', moduleName: 'Policies', lookupField: '', isLookupExempt: true },

  // 3. Quality Section
  Raised_Queries: { section: 'Quality', moduleName: 'Raised_Queries', lookupField: 'Employee', secondaryLookupFields: ['salesEmployee', 'Employee_Name'] },
  Quality_Queries: { section: 'Quality', moduleName: 'Quality_Queries', lookupField: 'Employee', secondaryLookupFields: ['salesEmployee', 'Employee_Name'] },
  Queries: { section: 'Quality', moduleName: 'Queries', lookupField: 'Employee', secondaryLookupFields: ['salesEmployee', 'Employee_Name'] },
};

export interface RbacCriteriaResult {
  criteria: string;
  coqlWhereClause: string;
  accessibleEmployeeIds: string[];
  isUnfiltered: boolean;
  role: SystemRole;
}
