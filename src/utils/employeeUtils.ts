import type { EmployeeData } from './initialData';
import type { SystemRole } from '../types/roles';

/**
 * Normalizes a name or text for robust comparison:
 * - Lowercases and trims
 * - Removes parenthetical role tags like (TL), (Team Leader), (HOD), (HR)
 * - Replaces non-alphanumeric characters with spaces
 */
export function normalizeName(str: string): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Robustly checks if two names match or refer to the same person.
 * Handles variations such as:
 * - "Romil Prajapati" vs "Romil Amrutbhai Prajapati"
 * - "Romil" vs "Romil Prajapati"
 * - "Romil Amrutbhai Prajapati (Team Leader)" vs "Romil"
 */
export function isMatchingName(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) return false;

  // Exact match
  if (n1 === n2) return true;

  // Direct substring inclusion (either direction)
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Token matching (split by space)
  const tokens1 = n1.split(' ').filter(t => t.length >= 2);
  const tokens2 = n2.split(' ').filter(t => t.length >= 2);

  if (tokens1.length > 0 && tokens2.length > 0) {
    // If first name matches and has >= 3 chars (e.g. 'romil')
    if (tokens1[0] === tokens2[0] && tokens1[0].length >= 3) {
      return true;
    }

    // Check shared tokens
    const common = tokens1.filter(t => tokens2.includes(t));
    if (common.length >= 2 || (common.length === 1 && common[0].length >= 4)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether an employee record is a subordinate of a given Team Leader (TL).
 * Checks:
 * - Specific ID links: teamLeaderId, reportingManagerId, formData ids against tl.id, tl.empId, tl.zohoId
 * - Specific Name links: teamLeaderName, reportingManagerName, Who_is_the_Team_Leader_TL, Reporting_Manager
 * - Bidirectional loose name matching
 * - Department fallback if member has no specific TL assigned
 */
export function isSubordinateOfTL(employee: any, tl: any): boolean {
  if (!employee || !tl) return false;

  // An employee is never their own subordinate
  const empId = String(employee.id || employee.empId || employee.Employment_ID || employee.formData?.empId || '').trim().toLowerCase();
  const tlId = String(tl.id || tl.empId || tl.Employment_ID || tl.formData?.empId || '').trim().toLowerCase();
  if (empId && tlId && empId === tlId) return false;

  // Admins, Super Admins, HODs, HR are never team members under a TL
  const empSysRole = employee.systemRole || employee.role || employee.System_Role;
  if (empSysRole === 'HOD' || empSysRole === 'Super Admin' || empSysRole === 'HR') return false;

  // 1. Gather all candidate IDs for the TL
  const tlIds = new Set<string>();
  [
    tl.id,
    tl.empId,
    tl.zohoId,
    tl.Employment_ID,
    tl.formData?.empId,
    tl.formData?.employeeId,
    tl.formData?.zohoId
  ].forEach(val => {
    if (val) tlIds.add(String(val).trim().toLowerCase());
  });

  // 2. Gather all Member manager/TL ID references
  const memberMgrIds = [
    employee.teamLeaderId,
    employee.reportingManagerId,
    employee.formData?.teamLeaderId,
    employee.formData?.reportingManagerId,
    employee.teamLeader_Id,
    employee.reporting_manager_id,
    employee.Who_is_the_Team_Leader_TL_id,
    employee.Reporting_Manager_id,
    typeof employee.Who_is_the_Team_Leader_TL === 'object' ? employee.Who_is_the_Team_Leader_TL?.id : (typeof employee.Who_is_the_Team_Leader_TL === 'string' && /^\d+$/.test(employee.Who_is_the_Team_Leader_TL) ? employee.Who_is_the_Team_Leader_TL : null),
    typeof employee.Reporting_Manager === 'object' ? employee.Reporting_Manager?.id : (typeof employee.Reporting_Manager === 'string' && /^\d+$/.test(employee.Reporting_Manager) ? employee.Reporting_Manager : null),
    typeof employee.formData?.Who_is_the_Team_Leader_TL === 'object' ? employee.formData?.Who_is_the_Team_Leader_TL?.id : null,
    typeof employee.formData?.Reporting_Manager === 'object' ? employee.formData?.Reporting_Manager?.id : null
  ].filter(Boolean).map(v => String(v).trim().toLowerCase());

  for (const mId of memberMgrIds) {
    if (tlIds.has(mId)) return true;
  }

  // 3. Name Matching
  const tlName = tl.name || (tl.formData ? `${tl.formData.firstName || ''} ${tl.formData.lastName || ''}`.trim() : '');

  // Check candidate manager name fields on member
  const candidateNames = [
    typeof employee.teamLeaderName === 'object' ? employee.teamLeaderName?.name : employee.teamLeaderName,
    typeof employee.reportingManagerName === 'object' ? employee.reportingManagerName?.name : employee.reportingManagerName,
    typeof employee.Who_is_the_Team_Leader_TL === 'object' ? employee.Who_is_the_Team_Leader_TL?.name : employee.Who_is_the_Team_Leader_TL,
    typeof employee.Reporting_Manager === 'object' ? employee.Reporting_Manager?.name : employee.Reporting_Manager,
    employee.formData?.teamLeaderName,
    employee.formData?.reportingManagerName,
    employee.formData?.Who_is_the_Team_Leader_TL,
    employee.formData?.Reporting_Manager,
    employee.formData?.teamLeader,
    employee.formData?.reportingManager,
    employee.Who_is_the_Team_Leader_TL_name,
    employee.Reporting_Manager_name
  ].filter(Boolean);

  for (const candName of candidateNames) {
    if (isMatchingName(String(candName), tlName)) {
      return true;
    }
  }

  // 4. Fallback by department if member is a TM and has no explicit other TL assigned
  const hasSpecificTLAssigned = memberMgrIds.length > 0 || candidateNames.length > 0;
  if (!hasSpecificTLAssigned) {
    const empDept = normalizeName(employee.dept || employee.department || employee.formData?.dept || employee.formData?.department || '');
    const tlDept = normalizeName(tl.dept || tl.department || tl.formData?.dept || tl.formData?.department || '');
    if (empDept && tlDept && empDept === tlDept && (empSysRole === 'TM' || !empSysRole || empSysRole === 'Team Member')) {
      return true;
    }
  }

  return false;
}

export interface SubordinateMemberMatch {
  member: any;
  role: string;
  name: string;
}

/**
 * Checks whether a generic CRM record (Quotation, Company, Client, Deal) is owned by the active TL.
 */
export function isRecordOwnedByTL(rec: any, user: any): boolean {
  if (!rec || !user) return false;
  const userZohoId = String(user.zohoId || '').trim();
  const userEmpId = String(user.empId || user.id || '').trim().toLowerCase();

  // 1. Direct ID checks
  const rEmpId = String(rec.employeeId || rec.employeeZohoId || (typeof rec.Employee === 'object' ? rec.Employee?.id : rec.Employee) || '').trim().toLowerCase();
  if (userZohoId && rEmpId && (rEmpId === userZohoId || rEmpId.includes(userZohoId))) return true;
  if (userEmpId && rEmpId && rEmpId === userEmpId) return true;

  const rOwnerId = String(rec.Owner?.id || rec.Created_By?.id || '').trim();
  if (userZohoId && rOwnerId && rOwnerId === userZohoId) return true;

  // 2. Name checks
  const names = [
    rec.owner,
    rec.employeeName,
    rec.salesEmployee,
    typeof rec.Employee === 'object' ? rec.Employee?.name : null,
    rec.Owner?.name,
    rec.Created_By?.name,
    rec.formData?.salesEmployee,
    rec.formData?.employeeName
  ].filter(Boolean);

  for (const n of names) {
    if (isMatchingName(String(n), user.name || '')) return true;
  }
  return false;
}

/**
 * Determines which subordinate of the active TL owns or created this generic CRM record.
 */
export function getRecordSubordinateMember(rec: any, user: any, employees: any[]): SubordinateMemberMatch | null {
  if (!rec || !user || !Array.isArray(employees)) return null;
  const subordinates = employees.filter((e: any) => isSubordinateOfTL(e, user));
  if (subordinates.length === 0) return null;

  // 1. Check by subordinate IDs
  const rEmpId = String(rec.employeeId || rec.employeeZohoId || (typeof rec.Employee === 'object' ? rec.Employee?.id : rec.Employee) || '').trim().toLowerCase();
  const rOwnerId = String(rec.Owner?.id || rec.Created_By?.id || '').trim().toLowerCase();

  for (const sub of subordinates) {
    const sZohoId = String(sub.zohoId || sub.id || '').trim().toLowerCase();
    const sEmpId = String(sub.empId || sub.id || '').trim().toLowerCase();
    const sUserId = String(sub.zohoUserId || '').trim().toLowerCase();

    if (rEmpId && (rEmpId === sZohoId || rEmpId === sEmpId || (sUserId && rEmpId === sUserId))) {
      return { member: sub, role: 'Team Member', name: sub.name || sub.Name || '' };
    }
    if (rOwnerId && (rOwnerId === sZohoId || rOwnerId === sUserId)) {
      return { member: sub, role: 'Team Member', name: sub.name || sub.Name || '' };
    }
  }

  // 2. Check by subordinate Names
  const names = [
    rec.employeeName,
    rec.salesEmployee,
    typeof rec.Employee === 'object' ? rec.Employee?.name : null,
    rec.Owner?.name,
    rec.Created_By?.name,
    rec.owner,
    rec.formData?.salesEmployee,
    rec.formData?.employeeName
  ].filter(Boolean).map(n => String(n).trim());

  for (const qn of names) {
    for (const sub of subordinates) {
      if (isMatchingName(qn, sub.name || sub.Name || '')) {
        return { member: sub, role: 'Team Member', name: sub.name || sub.Name || qn };
      }
    }
  }

  return null;
}

export function isRecordOwnedBySubordinate(rec: any, user: any, employees: any[]): boolean {
  return getRecordSubordinateMember(rec, user, employees) !== null;
}

/**
 * Standard mapper from raw Zoho CRM Employee record to Portal EmployeeData
 */
export function mapZohoRecordToEmployee(z: any): EmployeeData {
  const firstName = z.Name || '';
  const middleName = z.Middle_Name || '';
  const lastName = z.Last_Name || '';
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || z.Name || 'Employee';
  const empId = z.Employment_ID || (z.id ? `EMP-${String(z.id).slice(-4)}` : `EMP-${Math.floor(1000 + Math.random() * 9000)}`);
  let systemRole: SystemRole = 'TM';
  const rawRole = String(z.System_Role || '').toLowerCase().trim();
  if (rawRole.includes('super') || rawRole.includes('director') || (rawRole.includes('admin') && !rawRole.includes('hod'))) {
    systemRole = 'Super Admin';
  } else if (rawRole.includes('hod') || rawRole.includes('head')) {
    systemRole = 'HOD';
  } else if (rawRole.includes('hr')) {
    systemRole = 'HR';
  } else if (rawRole.includes('leader') || rawRole === 'tl') {
    systemRole = 'TL';
  } else if (rawRole === 'tm' || rawRole.includes('member')) {
    systemRole = 'TM';
  }

  // Handle lookup objects vs strings
  const tlName = typeof z.Who_is_the_Team_Leader_TL === 'object' 
    ? (z.Who_is_the_Team_Leader_TL?.name || '') 
    : (z.Who_is_the_Team_Leader_TL || '');
  const tlId = typeof z.Who_is_the_Team_Leader_TL === 'object' 
    ? (z.Who_is_the_Team_Leader_TL?.id || '') 
    : '';

  const rmName = typeof z.Reporting_Manager === 'object' 
    ? (z.Reporting_Manager?.name || '') 
    : (z.Reporting_Manager || '');
  const rmId = typeof z.Reporting_Manager === 'object' 
    ? (z.Reporting_Manager?.id || '') 
    : '';

  const monthlyTarget = z.Monthly_Target || z.Target || z.Sales_Target || '';

  const fd = {
    empId,
    salaryEntity: z.Salary_Entity || z.Company_Entity || 'BSPL',
    firstName,
    middleName,
    lastName,
    dob: z.Date_of_Birth || '',
    gender: z.Gender || 'Male',
    nationality: z.Nationality || 'Indian',
    maritalStatus: z.Marital_Status || 'Single',
    mobile: z.Contact_Number || '',
    email: z.Personal_Email_Address || z.Email || '',
    permanentAddress: z.Permanent_Address || '',
    currentAddress: z.Current_Address || '',
    bloodGroup: z.Blood_Group || 'O+',
    education: z.Education_Qualification || '',
    certifications: z.Professional_Certifications || '',
    skills: z.Key_Skills || '',
    languages: Array.isArray(z.Languages_Known) ? z.Languages_Known : (typeof z.Languages_Known === 'string' ? z.Languages_Known.split(',').map((s: string) => s.trim()).filter(Boolean) : ['English']),
    emergencyFirstName: z.Emergency_Contact_First_Name || '',
    emergencyLastName: z.Emergency_Contact_Last_Name || '',
    emergencyMobile: z.Emergency_Contact_Number || '',
    emergencyRelation: z.Relationship_with_Contact || '',
    doj: z.Date_of_Joining || new Date().toISOString().split('T')[0],
    dept: z.Department || 'Sales',
    role: z.Designation_Job_Title || '',
    systemRole,
    workEmail: z.Email || z.Personal_Email_Address || '',
    previousEmployer: z.Previous_Employer || '',
    experience: z.Total_Experience || '',
    employmentType: z.Employment_Type || 'Full Time',
    hasPf: Boolean(z.PF_Applicable),
    teamLeaderId: tlId,
    teamLeaderName: tlName,
    reportingManagerId: rmId,
    reportingManagerName: rmName,
    Who_is_the_Team_Leader_TL: z.Who_is_the_Team_Leader_TL,
    Reporting_Manager: z.Reporting_Manager,
    bankAccount: z.Bank_Account_Number || '',
    bankName: z.Bank_Name || '',
    ifsc: z.IFSC_Code || '',
    panNumber: z.Pan_Number || '',
    aadhaarNumber: z.Aadhaar_Number || '',
    passportNumber: z.Passport_Number || '',
    drivingLicense: z.Driving_License_Number || '',
    pfNumber: z.PF_Number || '',
    esicNumber: z.ESIC_Number || '',
    uanNumber: z.UAN_Number || '',
    medicalInsurance: z.Medical_Insurance_Number || '',
    monthlyTarget,
    target: monthlyTarget,
  };

  return {
    id: empId,
    name: fullName,
    email: z.Email || z.Personal_Email_Address || '',
    mobile: z.Contact_Number || '',
    dept: z.Department || 'General',
    role: z.Designation_Job_Title || z.System_Role || 'Team Member',
    systemRole,
    salaryEntity: z.Salary_Entity || z.Company_Entity || 'BSPL',
    teamLeaderId: tlId,
    teamLeaderName: tlName,
    reportingManagerId: rmId,
    reportingManagerName: rmName,
    Who_is_the_Team_Leader_TL: z.Who_is_the_Team_Leader_TL,
    Reporting_Manager: z.Reporting_Manager,
    joined: z.Date_of_Joining || z.Created_Time?.split('T')[0] || new Date().toISOString().split('T')[0],
    status: 'Active',
    formData: fd,
    monthlyTarget,
    target: monthlyTarget,
    zohoId: String(z.id),
    zohoStatus: 'synced',
    zohoSyncedAt: z.Modified_Time || z.Created_Time || new Date().toISOString(),
  };
}
