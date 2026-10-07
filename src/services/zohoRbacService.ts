import type { AuthUser, SystemRole, RbacCriteriaResult } from '../types/roles';
import { ZOHO_MODULE_LOOKUP_MAP } from '../types/roles';
import type { ZohoApiResponse, ZohoFetchOptions, ZohoFetchResult } from './zohoService';

/**
 * Retrieves the currently active user from local storage
 */
export function getActiveAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('be_active_user');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[RBAC Service] Failed to read active user from storage:', err);
  }
  return null;
}

/**
 * Helper to get all registered employees from local storage or memory
 */
export function getAllEmployeesList(): any[] {
  try {
    const raw = localStorage.getItem('be_employees');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[RBAC Service] Failed to load employees list:', err);
  }
  return [];
}

/**
 * Resolves accessible employee IDs based on the user's role and organizational hierarchy
 */
export function resolveAccessibleEmployeeIds(
  user: AuthUser | null,
  allEmployees: any[] = getAllEmployeesList(),
  moduleName?: string
): { employeeIds: string[]; zohoIds: string[]; isAll: boolean } {
  if (!user) {
    return { employeeIds: [], zohoIds: [], isAll: false };
  }

  const role = user.role;
  const userEmpId = (user.empId || user.id || '').trim().toLowerCase();
  const userZohoId = (user.zohoId || '').trim();
  const userName = (user.name || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();

  // 1. Super Admin & Head of Department (HOD) have full organizational visibility across all modules
  if (role === 'Super Admin' || role === 'HOD' || userEmail === 'superadmin@be.com' || userEmail === 'md@bharat-edge.com') {
    return { employeeIds: [], zohoIds: [], isAll: true };
  }

  // 2. HR Admin has full visibility over HRMS and organization
  if (role === 'HR' || userEmail === 'hrmshr@be.com') {
    return { employeeIds: [], zohoIds: [], isAll: true };
  }

  // 3. Team Leader (TL) - Self + Team (direct reports via Reporting_Manager or Team Leader)
  if (role === 'TL') {
    const empIds = new Set<string>();
    const zIds = new Set<string>();

    if (userEmpId) empIds.add(userEmpId);
    if (userZohoId) zIds.add(userZohoId);
    if (user.id) empIds.add(String(user.id).toLowerCase());

    allEmployees.forEach((e: any) => {
      const tlId = (e.teamLeaderId || e.formData?.teamLeaderId || '').trim().toLowerCase();
      const tlName = (e.teamLeaderName || e.Who_is_the_Team_Leader_TL || e.formData?.teamLeaderName || '').trim().toLowerCase();
      const rmId = (e.reportingManagerId || e.formData?.reportingManagerId || '').trim().toLowerCase();
      const rmName = (e.reportingManagerName || e.Reporting_Manager || e.formData?.reportingManagerName || '').trim().toLowerCase();

      const isSubordinate = (
        (tlId && (tlId === userEmpId || tlId === userZohoId.toLowerCase())) ||
        (rmId && (rmId === userEmpId || rmId === userZohoId.toLowerCase())) ||
        (tlName && userName && (tlName === userName || userName.includes(tlName))) ||
        (rmName && userName && (rmName === userName || userName.includes(rmName)))
      );

      if (isSubordinate) {
        if (e.id) empIds.add(String(e.id).toLowerCase());
        if (e.empId) empIds.add(String(e.empId).toLowerCase());
        if (e.zohoId) zIds.add(String(e.zohoId));
        if (e.Employment_ID) empIds.add(String(e.Employment_ID).toLowerCase());
      }
    });

    return {
      employeeIds: Array.from(empIds),
      zohoIds: Array.from(zIds),
      isAll: false
    };
  }

  // 5. Team Member (TM) - strictly self only
  const selfEmpIds = new Set<string>();
  const selfZohoIds = new Set<string>();
  if (userEmpId) selfEmpIds.add(userEmpId);
  if (userZohoId) selfZohoIds.add(userZohoId);
  if (user.id) selfEmpIds.add(String(user.id).toLowerCase());

  // Also query registered employee list to add their linked Zoho record ID
  const matchedSelf = allEmployees.find((e: any) => {
    const eEmail = (e.email || e.workEmail || e.formData?.workEmail || e.formData?.email || '').trim().toLowerCase();
    const eEmpId = (e.id || e.empId || e.Employment_ID || e.formData?.empId || '').toString().trim().toLowerCase();
    const eName = (e.name || '').trim().toLowerCase();
    return (userEmail && eEmail === userEmail) || (userEmpId && eEmpId === userEmpId) || (userName && eName === userName);
  });
  if (matchedSelf) {
    if (matchedSelf.zohoId) selfZohoIds.add(String(matchedSelf.zohoId));
    if (matchedSelf.empId) selfEmpIds.add(String(matchedSelf.empId).toLowerCase());
    if (matchedSelf.id) selfEmpIds.add(String(matchedSelf.id).toLowerCase());
    if (matchedSelf.Employment_ID) selfEmpIds.add(String(matchedSelf.Employment_ID).toLowerCase());
  }

  return {
    employeeIds: Array.from(selfEmpIds),
    zohoIds: Array.from(selfZohoIds),
    isAll: false
  };
}

/**
 * Automatically injects the System Employee lookup object into any mutation payload.
 * Format for System: {"Employee": {"id": "CURRENT_USER_EMPLOYEE_ID"}}
 * 
 * Exempt modules: "Company_Calendar", "Company_Policies"
 */
export function injectEmployeeLookup(
  moduleName: string,
  payload: Record<string, any>,
  customUser?: AuthUser | null,
  allEmployees: any[] = getAllEmployeesList()
): Record<string, any> {
  const config = ZOHO_MODULE_LOOKUP_MAP[moduleName];

  const user = customUser || getActiveAuthUser();
  const updatedPayload: Record<string, any> = { ...payload };

  // 1. Resolve employee Zoho ID, Employment ID, and Name from payload or active user session
  let employeeZohoId = (
    payload.employeeZohoId ||
    payload.empZohoId ||
    payload.formData?.employeeZohoId ||
    (typeof payload.Employee === 'object' ? payload.Employee?.id : null) ||
    (typeof payload.Employee === 'string' && /^\d+$/.test(payload.Employee) ? payload.Employee : null) ||
    user?.zohoId
  );

  let employeeName = (
    payload.employeeName ||
    payload.empName ||
    payload.salesEmployee ||
    payload.formData?.employeeName ||
    (typeof payload.Employee === 'object' ? payload.Employee?.name : null) ||
    user?.name
  );

  let employmentId = (
    payload.empId ||
    payload.employeeId ||
    payload.Employment_ID ||
    payload.Employee_Code ||
    payload.formData?.empId ||
    user?.empId ||
    user?.id
  );

  // If zohoId is not yet a real Zoho record ID (18-19 digit number), resolve from registered employee directory
  if ((!employeeZohoId || !/^\d{15,}$/.test(String(employeeZohoId))) && user) {
    const userEmail = (user.email || '').trim().toLowerCase();
    const userId = (user.id || '').trim().toLowerCase();
    const userEmpId = (user.empId || '').trim().toLowerCase();
    const userName = (user.name || '').trim().toLowerCase();

    const matchedEmp = allEmployees.find((e: any) => {
      const eEmail = (e.email || e.workEmail || e.formData?.workEmail || e.formData?.email || '').trim().toLowerCase();
      const eId = String(e.id || '').trim().toLowerCase();
      const eEmpId = String(e.empId || e.Employment_ID || e.formData?.empId || '').trim().toLowerCase();
      const eName = String(e.name || '').trim().toLowerCase();
      return (
        (userEmail && eEmail === userEmail) ||
        (userEmpId && eEmpId === userEmpId) ||
        (userId && eId === userId) ||
        (userName && eName === userName)
      );
    });

    if (matchedEmp) {
      if (matchedEmp.zohoId) employeeZohoId = String(matchedEmp.zohoId);
      if (!employeeName && matchedEmp.name) employeeName = matchedEmp.name;
      if (!employmentId && (matchedEmp.id || matchedEmp.empId)) employmentId = matchedEmp.empId || matchedEmp.id;
    }
  }

  // Fallback to employmentId if no specific zohoId available
  if (!employeeZohoId && employmentId) {
    employeeZohoId = employmentId;
  }

  // 2. Inject standard System lookup object and metadata
  if (employeeZohoId) {
    const lookupField = config?.lookupField || 'Employee';

    // Standard System lookup object
    updatedPayload[lookupField] = {
      id: String(employeeZohoId),
      ...(employeeName ? { name: employeeName } : {})
    };

    // Standard client & server payload keys
    updatedPayload.employeeZohoId = String(employeeZohoId);
    if (employeeName) {
      updatedPayload.employeeName = employeeName;
      updatedPayload.empName = employeeName;
      if (!updatedPayload.salesEmployee) updatedPayload.salesEmployee = employeeName;
    }
    if (employmentId) {
      updatedPayload.empId = String(employmentId);
      updatedPayload.employeeId = String(employmentId);
      updatedPayload.Employment_ID = String(employmentId);
      updatedPayload.Employee_Code = String(employmentId);
    }
  }

  if (user) {
    if (!updatedPayload.employeeEmail) {
      updatedPayload.employeeEmail = user.email || user.workEmail || user.personalEmail || '';
    }
    if (!updatedPayload.userEmail) {
      updatedPayload.userEmail = user.email || user.workEmail || '';
    }
    if (!updatedPayload.employeeName) {
      updatedPayload.employeeName = employeeName || user.name;
    }
    if (!updatedPayload.empName) {
      updatedPayload.empName = employeeName || user.name;
    }
    if (!updatedPayload.salesEmployee) {
      updatedPayload.salesEmployee = employeeName || user.name;
    }
  }

  // 3. Populate secondary lookup / owner fields for complete cross-module layout compatibility
  if (config?.secondaryLookupFields && user) {
    config.secondaryLookupFields.forEach(field => {
      // Do not auto-inject current user into Partner BDM fields
      if (field.startsWith('Partner_BDM') || field.startsWith('partner_bdm')) return;
      if (!updatedPayload[field]) {
        if (field.toLowerCase().includes('name')) {
          updatedPayload[field] = employeeName || user.name;
        } else if (field.toLowerCase().includes('id') || field.toLowerCase().includes('code')) {
          updatedPayload[field] = String(employeeZohoId || user.empId || user.id);
        }
      }
    });
  }

  // 4. Inject standard audit metadata
  if (!updatedPayload.Employee_ID && !updatedPayload.empId && user) {
    updatedPayload.Employee_ID = user.empId || user.id;
  }
  if (!updatedPayload.Employee_Name && !updatedPayload.employeeName && user) {
    updatedPayload.Employee_Name = user.name;
  }
  if (!updatedPayload.Department_Name && !updatedPayload.department && user) {
    updatedPayload.Department_Name = user.department;
  }

  return updatedPayload;
}

/**
 * Convenience helper to associate the active logged-in employee record as a lookup on any record
 */
export function attachCurrentUserEmployeeLookup<T = any>(record: T, customUser?: AuthUser | null): T {
  return injectEmployeeLookup('Generic', record as any, customUser) as T;
}

/**
 * Builds System-compatible Search criteria and COQL WHERE clauses based on the user's RBAC scope.
 */
export function buildZohoRbacCriteria(
  moduleName: string,
  user: AuthUser | null = getActiveAuthUser(),
  allEmployees: any[] = getAllEmployeesList()
): RbacCriteriaResult {
  const config = ZOHO_MODULE_LOOKUP_MAP[moduleName];

  // Exempt modules and full-visibility roles (Super Admin, HOD, HR) have no role filters
  if (
    config?.isLookupExempt || 
    !user || 
    user.role === 'Super Admin' || 
    user.role === 'HOD' || 
    user.role === 'HR' ||
    user.email === 'superadmin@be.com' || 
    user.email === 'md@bharat-edge.com'
  ) {
    return {
      criteria: '',
      coqlWhereClause: '',
      accessibleEmployeeIds: [],
      isUnfiltered: true,
      role: user?.role || 'Super Admin'
    };
  }

  const { employeeIds, zohoIds, isAll } = resolveAccessibleEmployeeIds(user, allEmployees, moduleName);

  if (isAll) {
    return {
      criteria: '',
      coqlWhereClause: '',
      accessibleEmployeeIds: [],
      isUnfiltered: true,
      role: user.role
    };
  }

  const lookupField = config?.lookupField || 'Employee';
  const targetIds = zohoIds.length > 0 ? zohoIds : employeeIds;

  if (targetIds.length === 0) {
    return {
      criteria: `(${lookupField}:equals:0)`,
      coqlWhereClause: `${lookupField}.id = 0`,
      accessibleEmployeeIds: [],
      isUnfiltered: false,
      role: user.role
    };
  }

  if (moduleName === 'Deals' || moduleName === 'Deal') {
    // Include both primary Employee and Partner_BDM lookup in criteria & COQL
    let empCriteria = `(Employee.id:equals:${targetIds[0]})`;
    let partnerCriteria = `(Partner_BDM.id:equals:${targetIds[0]})`;
    for (let i = 1; i < targetIds.length; i++) {
      empCriteria = `(${empCriteria}or(Employee.id:equals:${targetIds[i]}))`;
      partnerCriteria = `(${partnerCriteria}or(Partner_BDM.id:equals:${targetIds[i]}))`;
    }
    const combinedCriteria = `(${empCriteria}or${partnerCriteria})`;

    const formattedCoqlIds = targetIds.map(id => `'${id}'`).join(', ');
    const coqlWhereClause = targetIds.length === 1 
      ? `(Employee.id = '${targetIds[0]}' or Partner_BDM.id = '${targetIds[0]}')` 
      : `(Employee.id in (${formattedCoqlIds}) or Partner_BDM.id in (${formattedCoqlIds}))`;

    return {
      criteria: combinedCriteria,
      coqlWhereClause,
      accessibleEmployeeIds: targetIds,
      isUnfiltered: false,
      role: user.role
    };
  }

  const searchFieldName = lookupField === 'id' ? 'id' : `${lookupField}.id`;
  let criteria = `(${searchFieldName}:equals:${targetIds[0]})`;
  for (let i = 1; i < targetIds.length; i++) {
    criteria = `(${criteria}or(${searchFieldName}:equals:${targetIds[i]}))`;
  }

  // Build COQL WHERE clause: Employee.id in ('id1', 'id2', ...)
  const formattedCoqlIds = targetIds.map(id => `'${id}'`).join(', ');
  const coqlWhereClause = targetIds.length === 1 
    ? `${lookupField}.id = '${targetIds[0]}'` 
    : `${lookupField}.id in (${formattedCoqlIds})`;

  return {
    criteria,
    coqlWhereClause,
    accessibleEmployeeIds: targetIds,
    isUnfiltered: false,
    role: user.role
  };
}

/**
 * Filters any in-memory or IndexedDB cached records array according to current user's RBAC scope.
 */
export function filterRecordsByRbac<T = any>(
  records: T[],
  moduleName: string,
  user: AuthUser | null = getActiveAuthUser(),
  allEmployees: any[] = getAllEmployeesList()
): T[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  if (
    !user || 
    user.role === 'Super Admin' || 
    user.role === 'HOD' || 
    user.role === 'HR' ||
    user.email === 'superadmin@be.com' ||
    user.email === 'md@bharat-edge.com' ||
    user.email === 'hrmshr@be.com'
  ) {
    return records;
  }

  const config = ZOHO_MODULE_LOOKUP_MAP[moduleName];
  if (config?.isLookupExempt || moduleName === 'Company_Calendar' || moduleName === 'Company_Policies' || moduleName === 'Calendar' || moduleName === 'Policies') {
    return records;
  }

  const { employeeIds, zohoIds, isAll } = resolveAccessibleEmployeeIds(user, allEmployees, moduleName);
  if (isAll) return records;

  const idSet = new Set<string>();
  employeeIds.forEach(id => {
    if (id && id.trim()) idSet.add(id.trim().toLowerCase());
  });
  zohoIds.forEach(id => {
    if (id && id.trim()) idSet.add(id.trim().toLowerCase());
  });

  const userName = (user.name || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();
  const userDept = (user.department || '').trim().toLowerCase();

  return records.filter((rec: any) => {
    // 1. Check direct Employee lookup object
    if (rec.Employee && typeof rec.Employee === 'object') {
      const empId = String(rec.Employee.id || '').trim().toLowerCase();
      const empName = String(rec.Employee.name || '').trim().toLowerCase();
      if (empId && idSet.has(empId)) return true;
      if (empName && userName && (empName === userName || (empName.length >= 3 && userName.includes(empName)) || (userName.length >= 3 && empName.includes(userName)) || idSet.has(empName))) return true;
    }

    // 2. Check string Employee ID fields
    const directEmpId = String(rec.Employee || rec.employeeId || rec.empId || rec.Employment_ID || rec.Employee_Code || rec.Employee_ID || '').trim().toLowerCase();
    if (directEmpId && idSet.has(directEmpId)) return true;

    // 3. Check Owner / BDM / Creator fields
    if (rec.Owner && typeof rec.Owner === 'object') {
      const ownerId = String(rec.Owner.id || '').trim().toLowerCase();
      const ownerName = String(rec.Owner.name || '').trim().toLowerCase();
      if (ownerId && idSet.has(ownerId)) return true;
      if (ownerName && userName && (ownerName === userName || (ownerName.length >= 3 && userName.includes(ownerName)) || (userName.length >= 3 && ownerName.includes(userName)) || idSet.has(ownerName))) return true;
    }

    const ownerStr = String(rec.owner || rec.Owner || rec.Created_By || rec.salesEmployee || rec.BDM_names || '').trim().toLowerCase();
    if (ownerStr && userName && (ownerStr === userName || (ownerStr.length >= 3 && userName.includes(ownerStr)) || (userName.length >= 3 && ownerStr.includes(userName)) || idSet.has(ownerStr))) {
      return true;
    }
    if (ownerStr && userEmail && ownerStr === userEmail) {
      return true;
    }

    // 4. Check Partner BDM (Lookup object, ID, Name, or Form Data)
    if (rec.Partner_BDM && typeof rec.Partner_BDM === 'object') {
      const pId = String(rec.Partner_BDM.id || '').trim().toLowerCase();
      const pName = String(rec.Partner_BDM.name || '').trim().toLowerCase();
      if (pId && idSet.has(pId)) return true;
      if (pName && userName && (pName === userName || (pName.length >= 3 && userName.includes(pName)) || (userName.length >= 3 && pName.includes(userName)) || idSet.has(pName))) return true;
    }

    const bdmId = String(rec.partnerBdmId || rec.partner_bdm_id || rec.Partner_BDM_ID || rec.formData?.partnerBdmId || rec.formData?.partner_bdm_id || (typeof rec.Partner_BDM === 'string' ? rec.Partner_BDM : '') || '').trim().toLowerCase();
    if (bdmId && idSet.has(bdmId)) return true;
    const bdmName = String(rec.partnerBdmName || rec.partner_bdm_name || rec.Partner_BDM_Name || rec.formData?.partnerBdmName || rec.formData?.partner_bdm_name || '').trim().toLowerCase();
    if (bdmName && userName && (bdmName === userName || (bdmName.length >= 3 && userName.includes(bdmName)) || (userName.length >= 3 && bdmName.includes(userName)) || idSet.has(bdmName))) return true;

    // 5. For HOD role, check if record's department matches HOD's department
    if (user.role === 'HOD') {
      const recDept = String(rec.Department || rec.department || rec.Department_Name || '').trim().toLowerCase();
      if (recDept && userDept && (recDept === userDept || userDept === 'management' || (userDept === 'sales' && (recDept.includes('sale') || recDept.includes('bdm'))))) return true;
    }

    // 6. Check if associated employee name belongs to accessible employees
    const recEmpName = String(rec.employeeName || rec.Employee_Name || '').trim().toLowerCase();
    if (recEmpName && userName && (recEmpName === userName || (recEmpName.length >= 3 && userName.includes(recEmpName)) || (userName.length >= 3 && recEmpName.includes(userName)) || idSet.has(recEmpName))) return true;

    // 7. Check embedded formData employee identifiers
    const fdEmpName = String(rec.formData?.employeeName || rec.formData?.salesEmployee || rec.formData?.empName || '').trim().toLowerCase();
    if (fdEmpName && userName && (fdEmpName === userName || (fdEmpName.length >= 3 && userName.includes(fdEmpName)) || (userName.length >= 3 && fdEmpName.includes(userName)) || idSet.has(fdEmpName))) return true;

    const fdEmpEmail = String(rec.formData?.employeeEmail || rec.formData?.userEmail || rec.employeeEmail || rec.userEmail || rec.empEmail || '').trim().toLowerCase();
    if (fdEmpEmail && userEmail && fdEmpEmail === userEmail) return true;

    const fdEmpId = String(rec.formData?.empId || rec.formData?.employeeId || rec.formData?.employeeZohoId || rec.empId || rec.employeeId || '').trim().toLowerCase();
    if (fdEmpId && idSet.has(fdEmpId)) return true;

    // 8. Special fallback for Quotations: if created locally or before employee metadata was linked
    if (moduleName === 'Quotations' || moduleName === 'quotation' || moduleName === 'CRM') {
      const isUnassigned = (!rec.Employee || (typeof rec.Employee === 'object' && !rec.Employee.id && !rec.Employee.name)) &&
                           !rec.employeeId && !rec.empId && !rec.employeeName &&
                           (!rec.owner || rec.owner === 'Admin');
      if (isUnassigned) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Maps standard module names to their respective API endpoint paths
 */
export function getEndpointForModule(moduleName: string): string {
  const norm = moduleName.toLowerCase().replace(/_/g, '-');
  if (norm === 'leave-management' || norm === 'leave' || norm === 'leaves') return '/api/zoho/get-leaves';
  if (norm === 'daily-attendance' || norm === 'attendance') return '/api/zoho/get-attendance';
  if (norm === 'raised-queries' || norm === 'cases' || norm === 'queries' || norm === 'query') return '/api/zoho/get-queries';
  if (norm === 'company-policies' || norm === 'policies' || norm === 'policy') return '/api/zoho/get-policies';
  if (norm === 'company-calendar' || norm === 'calendar') return '/api/zoho/get-calendar';
  if (norm === 'employee' || norm === 'employees') return '/api/zoho/get-employees';
  if (norm === 'quotation' || norm === 'quotations') return '/api/zoho/get-quotations';
  if (norm === 'deal' || norm === 'deals') return '/api/zoho/get-deals';
  if (norm === 'client' || norm === 'clients') return '/api/zoho/get-clients';
  if (norm === 'company' || norm === 'companies') return '/api/zoho/get-companies';
  if (norm === 'dsr') return '/api/zoho/get-dsr';
  return `/api/zoho/get-${norm}`;
}

/**
 * Centralized RBAC Mutation Utility (POST & PUT)
 * Automatically injects the Employee Lookup into the payload and executes the request.
 */
export async function mutateZohoWithRbac<T = any>(
  moduleName: string,
  payload: any,
  options?: {
    isUpdate?: boolean;
    recordId?: string;
    user?: AuthUser | null;
  }
): Promise<ZohoApiResponse> {
  try {
    const isUpdate = Boolean(options?.isUpdate || payload.id || payload.zohoId || options?.recordId);
    const enrichedPayload = injectEmployeeLookup(moduleName, payload, options?.user);

    const endpointMap: Record<string, { insert: string; update: string }> = {
      Quotations: { insert: '/api/zoho/insert-quotation', update: '/api/zoho/update-quotation' },
      Deals: { insert: '/api/zoho/insert-deal', update: '/api/zoho/update-deal' },
      Clients: { insert: '/api/zoho/insert-client', update: '/api/zoho/update-client' },
      Companies: { insert: '/api/zoho/insert-company', update: '/api/zoho/update-company' },
      Employee: { insert: '/api/zoho/insert-employee', update: '/api/zoho/update-employee' },
      DSR: { insert: '/api/zoho/insert-dsr', update: '/api/zoho/update-dsr' },
      Leaves: { insert: '/api/zoho/insert-leave', update: '/api/zoho/update-leave' },
      Leave_Management: { insert: '/api/zoho/insert-leave', update: '/api/zoho/update-leave' },
      Salary: { insert: '/api/zoho/insert-salary', update: '/api/zoho/update-salary' },
      Raised_Queries: { insert: '/api/zoho/insert-query', update: '/api/zoho/update-query' },
      Cases: { insert: '/api/zoho/insert-query', update: '/api/zoho/update-query' },
      Company_Policies: { insert: '/api/zoho/insert-policy', update: '/api/zoho/update-policy' },
      Company_Calendar: { insert: '/api/zoho/insert-calendar', update: '/api/zoho/update-calendar' },
    };

    const target = endpointMap[moduleName] || {
      insert: `/api/zoho/insert-${moduleName.toLowerCase()}`,
      update: `/api/zoho/update-${moduleName.toLowerCase()}`
    };

    const url = isUpdate ? target.update : target.insert;
    const method = isUpdate ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(enrichedPayload)
    });

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.error(`[Zoho RBAC] Mutation error for ${moduleName}:`, err);
    return {
      success: false,
      message: err?.message || `Network error mutating ${moduleName}`
    };
  }
}

/**
 * Centralized RBAC Fetch Utility (GET)
 * Automatically builds role-specific criteria and queries System.
 */
export async function fetchZohoWithRbac<T = any>(
  moduleName: string,
  options?: ZohoFetchOptions,
  customUser?: AuthUser | null,
  allEmployees?: any[]
): Promise<ZohoFetchResult<T>> {
  try {
    const user = customUser || getActiveAuthUser();
    const { criteria, isUnfiltered } = buildZohoRbacCriteria(moduleName, user, allEmployees);

    const queryParams = new URLSearchParams();
    if (options?.page) queryParams.set('page', String(options.page));
    if (options?.per_page) queryParams.set('per_page', String(options.per_page || 200));
    if (options?.page_token) queryParams.set('page_token', options.page_token);

    const baseUrl = getEndpointForModule(moduleName);
    
    // If user has restricted role criteria, append criteria query
    if (!isUnfiltered && criteria) {
      queryParams.set('criteria', criteria);
    } else if (options?.criteria) {
      queryParams.set('criteria', options.criteria);
    }

    const qs = queryParams.toString();
    const finalUrl = qs ? `${baseUrl}?${qs}` : baseUrl;

    const response = await fetch(finalUrl);
    const result = await response.json();

    if (response.ok && result.success && Array.isArray(result.data)) {
      // Apply secondary RBAC filter to ensure absolute client-side data security
      const filteredData = isUnfiltered ? result.data : filterRecordsByRbac(result.data, moduleName, user, allEmployees);
      return {
        success: true,
        data: filteredData,
        info: result.info,
        message: `${moduleName} fetched successfully with RBAC filtering.`
      };
    }

    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || `Failed to fetch ${moduleName} from server`
    };
  } catch (err: any) {
    console.error(`[Zoho RBAC] Fetch error for ${moduleName}:`, err);
    return {
      success: false,
      data: [],
      message: err?.message || `Network error fetching ${moduleName}`
    };
  }
}

