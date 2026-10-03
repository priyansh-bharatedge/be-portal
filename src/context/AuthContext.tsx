import React, { createContext, useContext, useState, useEffect } from 'react';
import { ROLE_DEFINITIONS } from '../types/roles';
import type { AuthUser, SystemRole, RbacCriteriaResult } from '../types/roles';
import { DEMO_USERS, INITIAL_EMPLOYEES, INITIAL_DSR_REPORTS } from '../utils/initialData';
import { sendOtpEmail } from '../services/emailService';
import { saveOrUpdateZohoEmployee, updateZohoEmployeePassword, fetchZohoEmployees } from '../services/zohoService';
import type { ZohoApiResponse, ZohoFetchOptions, ZohoFetchResult } from '../services/zohoService';
import {
  injectEmployeeLookup,
  buildZohoRbacCriteria,
  filterRecordsByRbac,
  mutateZohoWithRbac,
  fetchZohoWithRbac,
  resolveAccessibleEmployeeIds,
  getAllEmployeesList
} from '../services/zohoRbacService';

interface AuthContextType {
  currentUser: AuthUser;
  currentRole: SystemRole;
  roleInfo: typeof ROLE_DEFINITIONS[SystemRole];
  employeeId: string;
  departmentName: string;
  teamId?: string;
  switchRole: (role: SystemRole) => void;
  switchUser: (user: AuthUser) => void;
  availableUsers: AuthUser[];
  isSuperAdmin: boolean;
  isHR: boolean;
  isHOD: boolean;
  isTL: boolean;
  isTM: boolean;
  can: (permission: string) => boolean;
  login: (email: string, password?: string, role?: SystemRole) => { success: boolean; error?: string; isFirstLogin?: boolean; user?: AuthUser };
  requestOtp: (emailOrId: string) => Promise<{ success: boolean; error?: string; maskedEmail?: string; otp?: string; empName?: string; targetEmail?: string }>;
  verifyOtp: (emailOrId: string, otp: string) => { success: boolean; error?: string };
  setPasswordAndActivate: (emailOrId: string, otp: string, newPassword: string) => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  logout: () => void;
  
  // RBAC & Relationship Mapping Deliverables
  getTeamMemberIds: (includeSelf?: boolean) => string[];
  getDepartmentMemberIds: () => string[];
  injectLookup: (moduleName: string, payload: any) => any;
  mutateZoho: <T = any>(moduleName: string, payload: any, isUpdate?: boolean) => Promise<ZohoApiResponse>;
  fetchZoho: <T = any>(moduleName: string, options?: ZohoFetchOptions) => Promise<ZohoFetchResult<T>>;
  filterRecords: <T = any>(records: T[], moduleName: string) => T[];
  hasAccessToRecord: (record: any, moduleName?: string) => boolean;
  getRbacCriteria: (moduleName: string) => RbacCriteriaResult;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize storage and clean up dummy data
  useEffect(() => {
    const CLEARED_KEY = 'be_dummy_cleared_clean_v3';
    const isCleaned = localStorage.getItem(CLEARED_KEY);

    if (!isCleaned) {
      // Purge all dummy data across all modules
      localStorage.setItem('be_deals', JSON.stringify([]));
      localStorage.setItem('be_quotations', JSON.stringify([]));
      localStorage.setItem('be_companies', JSON.stringify([]));
      localStorage.setItem('be_clients', JSON.stringify([]));
      localStorage.setItem('be_salaries', JSON.stringify([]));
      localStorage.setItem('be_dsr_reports', JSON.stringify([]));
      localStorage.setItem('be_queries', JSON.stringify([]));
      localStorage.setItem('be_leaves', JSON.stringify([]));
      localStorage.setItem('be_attendance', JSON.stringify([]));
      localStorage.setItem('be_emp_docs', JSON.stringify([]));
      localStorage.setItem('be_employees', JSON.stringify([]));
      localStorage.setItem('be_active_user', JSON.stringify(DEMO_USERS[0]));
      localStorage.setItem(CLEARED_KEY, 'true');
      setCurrentUser(DEMO_USERS[0]);
    }
  }, []);

  const [currentUser, setCurrentUser] = useState<AuthUser>(() => {
    const saved = localStorage.getItem('be_active_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.email !== 'admin@bharatedge.com') {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse active user', e);
      }
    }
    return DEMO_USERS[0]; // Default Super Admin md@bharat-edge.com
  });

  const getAllUsersFromStorage = (): AuthUser[] => {
    try {
      const savedEmps = localStorage.getItem('be_employees');
      if (savedEmps) {
        const emps = JSON.parse(savedEmps);
        const mapped = emps.map((e: any) => {
          const sRole = e.systemRole || (e.role?.includes('HR') ? 'HR' : e.role?.includes('HOD') ? 'HOD' : e.role?.includes('TL') || e.role?.includes('Lead') ? 'TL' : e.role?.includes('Super Admin') ? 'Super Admin' : 'TM');
          return {
            id: e.id,
            name: e.name,
            email: e.email || e.formData?.workEmail || e.formData?.email || '',
            personalEmail: e.formData?.email || e.email || '',
            workEmail: e.formData?.workEmail || e.email || '',
            mobile: e.mobile || e.formData?.mobile || '',
            role: sRole,
            department: e.dept || e.formData?.dept || 'General',
            designation: e.role || e.formData?.role || 'Employee',
            empId: e.id,
            password: e.password || e.formData?.password,
            isActivated: e.isActivated || e.formData?.isActivated || false,
            passwordSet: e.passwordSet || e.formData?.passwordSet || false,
            reportingManagerId: e.reportingManagerId || e.formData?.reportingManagerId,
            reportingManagerName: e.reportingManagerName || e.formData?.reportingManagerName,
            teamLeaderId: e.teamLeaderId || e.formData?.teamLeaderId,
            teamLeaderName: e.teamLeaderName || e.formData?.teamLeaderName,
            monthlyTarget: e.monthlyTarget || e.formData?.monthlyTarget || e.target || e.formData?.target || '',
            target: e.target || e.formData?.target || e.monthlyTarget || e.formData?.monthlyTarget || ''
          };
        });
        if (mapped.length > 0) return mapped;
      }
    } catch (e) {
      console.error('Failed to parse employees for users', e);
    }
    return DEMO_USERS;
  };

  const [availableUsers, setAvailableUsers] = useState<AuthUser[]>(() => getAllUsersFromStorage());

  // Sync available users whenever employees change
  useEffect(() => {
    const loadUsers = () => {
      const users = getAllUsersFromStorage();
      setAvailableUsers(users);
    };
    loadUsers();
    window.addEventListener('storage', loadUsers);
    window.addEventListener('be_employees_updated', loadUsers);
    return () => {
      window.removeEventListener('storage', loadUsers);
      window.removeEventListener('be_employees_updated', loadUsers);
    };
  }, []);

  const switchUser = (user: AuthUser) => {
    setCurrentUser(user);
    localStorage.setItem('be_active_user', JSON.stringify(user));
  };

  const switchRole = (role: SystemRole) => {
    const usersList = getAllUsersFromStorage();
    const userForRole = usersList.find(u => u.role === role) || {
      id: `USER-${role.replace(/\s+/g, '-').toUpperCase()}`,
      name: role === 'Super Admin' ? 'Managing Director' : `${role} User`,
      email: role === 'Super Admin' ? 'md@bharat-edge.com' : `${role.toLowerCase().replace(/\s+/g, '')}@bharat-edge.com`,
      role: role,
      department: role === 'Super Admin' ? 'Management' : role === 'HR' ? 'Human Resources' : role === 'HOD' ? 'Operations' : 'Operations',
      designation: role === 'Super Admin' ? 'Managing Director & Super Admin' : `${role} Officer`,
      empId: `EMP-${role.replace(/\s+/g, '')}`
    };
    switchUser(userForRole);
  };

  const requestOtp = async (emailOrId: string): Promise<{ success: boolean; error?: string; maskedEmail?: string; otp?: string; empName?: string; targetEmail?: string }> => {
    const clean = (emailOrId || '').trim().toLowerCase();
    if (!clean) {
      return { success: false, error: 'Please enter your registered Email address or Employee ID.' };
    }

    const savedEmps = localStorage.getItem('be_employees');
    let emps = savedEmps ? JSON.parse(savedEmps) : INITIAL_EMPLOYEES;
    
    // Find matching employee across email, workEmail, personalEmail, and ID
    let foundEmp = emps.find((e: any) => {
      const emailMatches = e.email?.trim().toLowerCase() === clean;
      const personalEmailMatches = e.formData?.email?.trim().toLowerCase() === clean;
      const workEmailMatches = e.formData?.workEmail?.trim().toLowerCase() === clean;
      const idMatches = e.id?.toString().trim().toLowerCase() === clean || e.empId?.toString().trim().toLowerCase() === clean;
      const nameMatches = e.name?.trim().toLowerCase() === clean;
      return emailMatches || personalEmailMatches || workEmailMatches || idMatches || nameMatches;
    });

    // If not found in local cache, query live from Zoho CRM
    if (!foundEmp) {
      try {
        const zohoRes = await fetchZohoEmployees();
        if (zohoRes.success && Array.isArray(zohoRes.data)) {
          const zMatch = zohoRes.data.find((z: any) => {
            const zId = (z.Employment_ID || String(z.id || '')).trim().toLowerCase();
            const zEmail = (z.Email || '').trim().toLowerCase();
            const zPersonalEmail = (z.Personal_Email_Address || '').trim().toLowerCase();
            const zName = (z.Name || '').trim().toLowerCase();
            return zId === clean || zEmail === clean || zPersonalEmail === clean || zName === clean;
          });
          if (zMatch) {
            foundEmp = {
              id: zMatch.Employment_ID || `EMP-${String(zMatch.id).slice(-4)}`,
              name: [zMatch.Name, zMatch.Middle_Name, zMatch.Last_Name].filter(Boolean).join(' ') || zMatch.Name,
              email: zMatch.Email || zMatch.Personal_Email_Address || '',
              mobile: zMatch.Contact_Number || '',
              dept: zMatch.Department || 'Sales',
              role: zMatch.Designation_Job_Title || 'Team Member',
              systemRole: zMatch.System_Role || 'TM',
              joined: zMatch.Date_of_Joining || '2026-02-03',
              zohoId: String(zMatch.id),
              formData: {
                email: zMatch.Personal_Email_Address || zMatch.Email || '',
                workEmail: zMatch.Email || '',
                mobile: zMatch.Contact_Number || '',
                empId: zMatch.Employment_ID || `EMP-${String(zMatch.id).slice(-4)}`,
                firstName: zMatch.Name || '',
                lastName: zMatch.Last_Name || '',
              }
            };
            emps.push(foundEmp);
            localStorage.setItem('be_employees', JSON.stringify(emps));
          }
        }
      } catch (err) {
        console.warn('Could not query Zoho employees during OTP request:', err);
      }
    }

    if (!foundEmp) {
      return { 
        success: false, 
        error: `No registered employee record found for "${emailOrId}". Please verify your email/ID or contact HR.` 
      };
    }

    const targetEmail = clean.includes('@') 
      ? clean 
      : (foundEmp.formData?.workEmail || foundEmp.formData?.email || foundEmp.email || 'support@bharat-edge.com');
    
    // Create masked email (e.g. r****l@bharat-edge.com)
    let maskedEmail = targetEmail;
    if (targetEmail.includes('@')) {
      const [local, domain] = targetEmail.split('@');
      const maskedLocal = local.length <= 2 
        ? local + '***' 
        : `${local[0]}${'*'.repeat(Math.max(local.length - 2, 3))}${local[local.length - 1]}`;
      maskedEmail = `${maskedLocal}@${domain}`;
    }

    // Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins validity

    const otpSession = {
      identifier: clean,
      empId: foundEmp.id,
      targetEmail,
      otp: generatedOtp,
      expiresAt,
      sender: 'support@bharat-edge.com',
      createdAt: new Date().toISOString()
    };
    sessionStorage.setItem('be_active_otp_session', JSON.stringify(otpSession));

    // Dispatch email via Nodemailer API
    try {
      await sendOtpEmail({
        toEmail: targetEmail,
        empName: foundEmp.name,
        otpCode: generatedOtp
      });
    } catch (err) {
      console.warn('Background email delivery attempt:', err);
    }

    return {
      success: true,
      otp: generatedOtp,
      maskedEmail,
      empName: foundEmp.name,
      targetEmail
    };
  };

  const verifyOtp = (emailOrId: string, inputOtp: string): { success: boolean; error?: string } => {
    const cleanOtp = (inputOtp || '').trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      return { success: false, error: 'Please enter the complete 6-digit OTP verification code.' };
    }

    const savedSession = sessionStorage.getItem('be_active_otp_session');
    if (!savedSession) {
      return { success: false, error: 'No active OTP session found. Please request an OTP first.' };
    }

    try {
      const session = JSON.parse(savedSession);
      if (Date.now() > session.expiresAt) {
        return { success: false, error: 'Verification code has expired. Please click "Resend OTP".' };
      }
      if (session.otp !== cleanOtp) {
        return { success: false, error: 'Invalid verification code. Please check the code sent from support@bharat-edge.com.' };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Failed to verify OTP. Please try again.' };
    }
  };

  const setPasswordAndActivate = async (emailOrId: string, inputOtp: string, newPassword: string): Promise<{ success: boolean; error?: string; user?: AuthUser }> => {
    const otpResult = verifyOtp(emailOrId, inputOtp);
    if (!otpResult.success) {
      return { success: false, error: otpResult.error };
    }

    const cleanPassword = (newPassword || '').trim();
    if (cleanPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    const savedSession = sessionStorage.getItem('be_active_otp_session');
    const session = savedSession ? JSON.parse(savedSession) : null;
    const empId = session?.empId;

    const savedEmps = localStorage.getItem('be_employees');
    let emps = savedEmps ? JSON.parse(savedEmps) : INITIAL_EMPLOYEES;

    const cleanId = (emailOrId || '').trim().toLowerCase();
    const empIndex = emps.findIndex((e: any) => 
      e.id === empId || 
      e.id?.toLowerCase() === cleanId ||
      e.empId?.toLowerCase() === cleanId ||
      e.email?.toLowerCase() === cleanId ||
      e.formData?.email?.toLowerCase() === cleanId ||
      e.formData?.workEmail?.toLowerCase() === cleanId ||
      (session?.targetEmail && (e.email?.toLowerCase() === session.targetEmail.toLowerCase() || e.formData?.email?.toLowerCase() === session.targetEmail.toLowerCase()))
    );

    if (empIndex === -1) {
      return { success: false, error: 'Employee account record not found.' };
    }

    // Save updated password and mark account as activated
    emps[empIndex] = {
      ...emps[empIndex],
      password: cleanPassword,
      isActivated: true,
      passwordSet: true,
      activatedAt: new Date().toISOString(),
      formData: {
        ...(emps[empIndex].formData || {}),
        password: cleanPassword,
        isActivated: true,
        passwordSet: true
      }
    };

    localStorage.setItem('be_employees', JSON.stringify(emps));
    window.dispatchEvent(new Event('be_employees_updated'));

    // Clear active OTP session
    sessionStorage.removeItem('be_active_otp_session');

    const updatedEmp = emps[empIndex];
    const sRole = updatedEmp.systemRole || (updatedEmp.role?.includes('HR') ? 'HR' : updatedEmp.role?.includes('HOD') ? 'HOD' : updatedEmp.role?.includes('TL') ? 'TL' : updatedEmp.role?.includes('Super Admin') ? 'Super Admin' : 'TM');
    
    const authUser: AuthUser = {
      id: updatedEmp.id,
      name: updatedEmp.name,
      email: updatedEmp.email || updatedEmp.formData?.workEmail || updatedEmp.formData?.email || '',
      personalEmail: updatedEmp.formData?.email || updatedEmp.email || '',
      workEmail: updatedEmp.formData?.workEmail || updatedEmp.email || '',
      mobile: updatedEmp.mobile || updatedEmp.formData?.mobile || '',
      role: sRole,
      department: updatedEmp.dept || updatedEmp.formData?.dept || 'General',
      designation: updatedEmp.role || updatedEmp.formData?.role || 'Employee',
      empId: updatedEmp.id,
      password: cleanPassword,
      isActivated: true,
      passwordSet: true,
      reportingManagerId: updatedEmp.reportingManagerId,
      reportingManagerName: updatedEmp.reportingManagerName,
      teamLeaderId: updatedEmp.teamLeaderId,
      teamLeaderName: updatedEmp.teamLeaderName
    };

    // 1. Direct targeted password update in Zoho CRM Employee module by finding the record via email
    const userEmail = updatedEmp.formData?.email || updatedEmp.email || updatedEmp.formData?.workEmail || session?.targetEmail || (emailOrId.includes('@') ? emailOrId : '');
    if (userEmail) {
      try {
        const passSyncRes = await updateZohoEmployeePassword(userEmail, cleanPassword, updatedEmp.zohoId);
        console.log(`[Zoho CRM] Direct password update response:`, passSyncRes);
        if (passSyncRes.success && passSyncRes.zohoId && !updatedEmp.zohoId) {
          updatedEmp.zohoId = passSyncRes.zohoId;
          emps[empIndex].zohoId = passSyncRes.zohoId;
          localStorage.setItem('be_employees', JSON.stringify(emps));
          window.dispatchEvent(new Event('be_employees_updated'));
        }
      } catch (err) {
        console.warn('[Zoho CRM] Direct password update to Zoho CRM failed:', err);
      }
    }

    // 2. Sync updated employee record to Zoho CRM in background
    saveOrUpdateZohoEmployee(updatedEmp).catch((err: any) => console.warn('[Zoho CRM] Background sync of updated employee password failed:', err));

    switchUser(authUser);
    return { success: true, user: authUser };
  };

  const login = (email: string, password?: string, role?: SystemRole): { success: boolean; error?: string; isFirstLogin?: boolean; user?: AuthUser } => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    const usersList = getAllUsersFromStorage();

    // 1. If 1-click test role login
    if (role) {
      const foundByRole = usersList.find(u => 
        u.role === role || 
        (role === 'HR' && (u.email?.toLowerCase().includes('hr@') || u.role === 'HR')) ||
        (role === 'Super Admin' && (u.email === 'md@bharat-edge.com' || u.role === 'Super Admin')) ||
        (role === 'HOD' && (u.email === 'mishal@bharat-edge.com' || u.role === 'HOD'))
      );
      if (foundByRole) {
        switchUser(foundByRole);
        return { success: true, user: foundByRole };
      }
      switchRole(role);
      return { success: true };
    }

    // 2. Validate non-empty credentials
    if (!cleanEmail) {
      return { success: false, error: 'Please enter your email address or User ID.' };
    }
    if (!cleanPassword) {
      return { success: false, error: 'Please enter your password.' };
    }

    // 3. Search for registered user across all email & ID fields
    const found = usersList.find(u => {
      const emailMatches = u.email?.trim().toLowerCase() === cleanEmail;
      const personalEmailMatches = u.personalEmail?.trim().toLowerCase() === cleanEmail;
      const workEmailMatches = u.workEmail?.trim().toLowerCase() === cleanEmail;
      const idMatches = u.id?.toString().trim().toLowerCase() === cleanEmail || u.empId?.toString().trim().toLowerCase() === cleanEmail;
      const nameMatches = u.name?.trim().toLowerCase() === cleanEmail;
      return emailMatches || personalEmailMatches || workEmailMatches || idMatches || nameMatches;
    });

    if (!found) {
      return { 
        success: false, 
        error: `No account found for "${email}". Please enter the registered email or Employee ID.` 
      };
    }

    // 4. Validate password (accept employee's custom password or default admin123)
    const userCustomPassword = (found as any).password;
    let isValid = false;
    if (userCustomPassword) {
      isValid = cleanPassword === userCustomPassword || cleanPassword === 'admin123';
    } else {
      const validPasswords = ['admin123', 'admin', 'password', '123456'];
      isValid = validPasswords.includes(cleanPassword);
    }

    if (!isValid) {
      const hasPasswordSet = Boolean(userCustomPassword);
      return { 
        success: false,
        error: hasPasswordSet 
          ? 'Incorrect password. Please try again or use "Forgot / Set Password" with OTP.'
          : 'Incorrect password. (First time login? Click "First-Time Login" to verify via OTP and set password)' 
      };
    }

    switchUser(found);
    return { success: true, user: found };
  };

  const logout = () => {
    localStorage.removeItem('be_active_user');
    switchRole('Super Admin');
  };

  const isHR = (currentUser.role as string) === 'HR' || 
               (currentUser.role as string) === 'HR Admin' || 
               currentUser.email?.toLowerCase() === 'hr@bharat-edge.com' ||
               currentUser.email?.toLowerCase().includes('hr@') ||
               currentUser.department?.toLowerCase().includes('human resources');
  const isSuperAdmin = !isHR && (currentUser.role === 'Super Admin' || currentUser.email === 'md@bharat-edge.com');
  const isHOD = !isHR && !isSuperAdmin && (currentUser.role === 'HOD' || currentUser.email === 'mishal@bharat-edge.com');
  const isTL = !isHR && !isSuperAdmin && !isHOD && currentUser.role === 'TL';
  const isTM = !isHR && !isSuperAdmin && !isHOD && !isTL;

  const activeRole: SystemRole = isHR ? 'HR' : isSuperAdmin ? 'Super Admin' : isHOD ? 'HOD' : isTL ? 'TL' : 'TM';
  const roleInfo = ROLE_DEFINITIONS[activeRole] || ROLE_DEFINITIONS['Super Admin'];

  const can = (permission: string): boolean => {
    switch (permission) {
      case 'manage_all':
        return isSuperAdmin;
      case 'manage_employees':
        return isSuperAdmin || isHR;
      case 'create_employee':
        return isSuperAdmin || isHR;
      case 'delete_employee':
        return isSuperAdmin || isHR;
      case 'view_all_salaries':
        return isSuperAdmin || isHR;
      case 'create_salary':
        return isSuperAdmin || isHR;
      case 'approve_leave_tl':
        return isSuperAdmin || isHR || isTL;
      case 'approve_leave_hr':
        return isSuperAdmin || isHR;
      case 'manage_policies':
        return isSuperAdmin || isHR;
      case 'manage_all_deals':
        return isSuperAdmin || isHOD || isTL;
      default:
        return true;
    }
  };

  const employeeId = currentUser.zohoId || currentUser.empId || currentUser.id;
  const departmentName = currentUser.department || 'General';
  const teamId = currentUser.teamId || currentUser.teamLeaderId || '';

  const getTeamMemberIds = (includeSelf = true): string[] => {
    const { employeeIds, zohoIds, isAll } = resolveAccessibleEmployeeIds(currentUser, availableUsers);
    if (isAll) return [];
    const combined = Array.from(new Set([...zohoIds, ...employeeIds]));
    if (!includeSelf && employeeId) {
      return combined.filter(id => id.toLowerCase() !== employeeId.toLowerCase());
    }
    return combined;
  };

  const getDepartmentMemberIds = (): string[] => {
    const userDept = (currentUser.department || '').trim().toLowerCase();
    const deptEmployees = availableUsers.filter((e: AuthUser) => {
      const eDept = (e.department || '').trim().toLowerCase();
      return eDept === userDept;
    });
    const ids = new Set<string>();
    deptEmployees.forEach((e: AuthUser) => {
      if (e.zohoId) ids.add(String(e.zohoId));
      if (e.empId) ids.add(String(e.empId));
      if (e.id) ids.add(String(e.id));
    });
    return Array.from(ids);
  };

  const injectLookup = (moduleName: string, payload: any) => {
    return injectEmployeeLookup(moduleName, payload, currentUser);
  };

  const mutateZoho = async <T = any>(moduleName: string, payload: any, isUpdate = false): Promise<ZohoApiResponse> => {
    return mutateZohoWithRbac<T>(moduleName, payload, { isUpdate, user: currentUser });
  };

  const fetchZoho = async <T = any>(moduleName: string, options?: ZohoFetchOptions): Promise<ZohoFetchResult<T>> => {
    return fetchZohoWithRbac<T>(moduleName, options, currentUser, availableUsers);
  };

  const filterRecords = <T = any>(records: T[], moduleName: string): T[] => {
    return filterRecordsByRbac<T>(records, moduleName, currentUser, availableUsers);
  };

  const hasAccessToRecord = (record: any, moduleName = 'Deals'): boolean => {
    const filtered = filterRecordsByRbac([record], moduleName, currentUser, availableUsers);
    return filtered.length > 0;
  };

  const getRbacCriteria = (moduleName: string): RbacCriteriaResult => {
    return buildZohoRbacCriteria(moduleName, currentUser, availableUsers);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser: { ...currentUser, role: activeRole },
        currentRole: activeRole,
        roleInfo,
        employeeId,
        departmentName,
        teamId,
        switchRole,
        switchUser,
        availableUsers,
        isSuperAdmin,
        isHR,
        isHOD,
        isTL,
        isTM,
        can,
        login,
        requestOtp,
        verifyOtp,
        setPasswordAndActivate,
        logout,
        getTeamMemberIds,
        getDepartmentMemberIds,
        injectLookup,
        mutateZoho,
        fetchZoho,
        filterRecords,
        hasAccessToRecord,
        getRbacCriteria
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
