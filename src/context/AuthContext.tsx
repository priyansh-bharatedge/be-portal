import React, { createContext, useContext, useState, useEffect } from 'react';
import { ROLE_DEFINITIONS } from '../types/roles';
import type { AuthUser, SystemRole } from '../types/roles';
import { DEMO_USERS, INITIAL_EMPLOYEES, INITIAL_DSR_REPORTS } from '../utils/initialData';

interface AuthContextType {
  currentUser: AuthUser;
  currentRole: SystemRole;
  roleInfo: typeof ROLE_DEFINITIONS[SystemRole];
  switchRole: (role: SystemRole) => void;
  switchUser: (user: AuthUser) => void;
  availableUsers: AuthUser[];
  isSuperAdmin: boolean;
  isHR: boolean;
  isHOD: boolean;
  isTL: boolean;
  isTM: boolean;
  can: (permission: string) => boolean;
  login: (email: string, password?: string, role?: SystemRole) => { success: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize storage and clean up dummy data
  useEffect(() => {
    const CLEARED_KEY = 'be_dummy_cleared_clean_v1';
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
      localStorage.setItem('be_employees', JSON.stringify(INITIAL_EMPLOYEES));
      localStorage.setItem('be_active_user', JSON.stringify(DEMO_USERS[0]));
      localStorage.setItem(CLEARED_KEY, 'true');
      setCurrentUser(DEMO_USERS[0]);
    } else {
      // Ensure be_employees exists
      const existing = localStorage.getItem('be_employees');
      if (!existing) {
        localStorage.setItem('be_employees', JSON.stringify(INITIAL_EMPLOYEES));
      }
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
            role: sRole,
            department: e.dept || e.formData?.dept || 'General',
            designation: e.role || e.formData?.role || 'Employee',
            empId: e.id,
            reportingManagerId: e.reportingManagerId || e.formData?.reportingManagerId,
            reportingManagerName: e.reportingManagerName || e.formData?.reportingManagerName,
            teamLeaderId: e.teamLeaderId || e.formData?.teamLeaderId,
            teamLeaderName: e.teamLeaderName || e.formData?.teamLeaderName
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

  const login = (email: string, password?: string, role?: SystemRole): { success: boolean; error?: string } => {
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
        return { success: true };
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

    // 4. Validate password (accept default admin123 or whatever is configured)
    const validPasswords = ['admin123', 'admin', 'password', '123456', (found as any).password].filter(Boolean);
    const isValid = validPasswords.includes(cleanPassword) || cleanPassword === 'admin123';

    if (!isValid) {
      return { 
        success: false, 
        error: 'Incorrect password. (Default password is admin123)' 
      };
    }

    switchUser(found);
    return { success: true };
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

  return (
    <AuthContext.Provider
      value={{
        currentUser: { ...currentUser, role: activeRole },
        currentRole: activeRole,
        roleInfo,
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
        logout
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
