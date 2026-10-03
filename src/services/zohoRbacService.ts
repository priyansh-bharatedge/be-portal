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
  allEmployees: any[] = getAllEmployeesList()
): { employeeIds: string[]; zohoIds: string[]; isAll: boolean } {
  if (!user) {
    return { employeeIds: [], zohoIds: [], isAll: false };
  }

  const role = user.role;
  const userEmpId = (user.empId || user.id || '').trim().toLowerCase();
  const userZohoId = (user.zohoId || '').trim();

  // 1. Super Admin / Admin has full organizational visibility
  if (role === 'Super Admin' || user.email === 'md@bharat-edge.com') {
    return { employeeIds: [], zohoIds: [], isAll: true };
  }

  // 2. HR Admin has full visibility over HRMS and organization
  if (role === 'HR' || user.email?.toLowerCase().includes('hr@')) {
    return { employeeIds: [], zohoIds: [], isAll: true };
  }

  // 3. Head of Department (HOD) - can view all records in their department
  if (role === 'HOD') {
    const userDept = (user.department || '').trim().toLowerCase();
    const deptEmployees = allEmployees.filter((e: any) => {
      const eDept = (e.dept || e.department || e.formData?.dept || '').trim().toLowerCase();
      return eDept === userDept || (userDept === 'management');
    });

    const empIds = new Set<string>();
    const zIds = new Set<string>();

    if (userEmpId) empIds.add(userEmpId);
    if (userZohoId) zIds.add(userZohoId);

    deptEmployees.forEach((e: any) => {
      if (e.id) empIds.add(String(e.id).toLowerCase());
      if (e.empId) empIds.add(String(e.empId).toLowerCase());
      if (e.zohoId) zIds.add(String(e.zohoId));
    });

    return {
      employeeIds: Array.from(empIds),
      zohoIds: Array.from(zIds),
      isAll: false
    };
  }

  // 4. Team Leader (TL) - can view own data AND all team members reporting to them
  if (role === 'TL') {
    const teamEmployees = allEmployees.filter((e: any) => {
      const tlId = (e.teamLeaderId || e.formData?.teamLeaderId || '').trim().toLowerCase();
      const tlName = (e.teamLeaderName || e.formData?.teamLeaderName || '').trim().toLowerCase();
      const rmId = (e.reportingManagerId || e.formData?.reportingManagerId || '').trim().toLowerCase();
      const rmName = (e.reportingManagerName || e.formData?.reportingManagerName || '').trim().toLowerCase();
      const userName = (user.name || '').trim().toLowerCase();

      return (
        (tlId && (tlId === userEmpId || tlId === userZohoId.toLowerCase())) ||
        (rmId && (rmId === userEmpId || rmId === userZohoId.toLowerCase())) ||
        (tlName && userName && tlName === userName) ||
        (rmName && userName && rmName === userName)
      );
    });

    const empIds = new Set<string>();
    const zIds = new Set<string>();

    if (userEmpId) empIds.add(userEmpId);
    if (userZohoId) zIds.add(userZohoId);

    teamEmployees.forEach((e: any) => {
      if (e.id) empIds.add(String(e.id).toLowerCase());
      if (e.empId) empIds.add(String(e.empId).toLowerCase());
      if (e.zohoId) zIds.add(String(e.zohoId));
    });

    return {
      employeeIds: Array.from(empIds),
      zohoIds: Array.from(zIds),
      isAll: false
    };
  }

  // 5. Team Member (TM) - strictly self only
  const selfEmpIds = userEmpId ? [userEmpId] : [];
  const selfZohoIds = userZohoId ? [userZohoId] : [];
  return {
    employeeIds: selfEmpIds,
    zohoIds: selfZohoIds,
    isAll: false
  };
}

/**
 * Automatically injects the Zoho CRM Employee lookup object into any mutation payload.
 * Format for Zoho CRM: {"Employee": {"id": "CURRENT_USER_EMPLOYEE_ID"}}
 * 
 * Exempt modules: "Company_Calendar", "Company_Policies"
 */
export function injectEmployeeLookup(
  moduleName: string,
  payload: Record<string, any>,
  customUser?: AuthUser | null
): Record<string, any> {
  const config = ZOHO_MODULE_LOOKUP_MAP[moduleName];

  // 1. If module is explicitly exempt from employee lookup, return unmodified
  if (config?.isLookupExempt || moduleName === 'Company_Calendar' || moduleName === 'Company_Policies' || moduleName === 'Calendar' || moduleName === 'Policies') {
    return { ...payload };
  }

  const user = customUser || getActiveAuthUser();
  if (!user) {
    return { ...payload };
  }

  const employeeZohoId = user.zohoId || user.empId || user.id;
  if (!employeeZohoId) {
    return { ...payload };
  }

  const lookupField = config?.lookupField || 'Employee';
  const updatedPayload: Record<string, any> = { ...payload };

  // 2. Inject standard Zoho CRM lookup object if not already explicitly provided
  if (!updatedPayload[lookupField]) {
    updatedPayload[lookupField] = {
      id: String(employeeZohoId),
      name: user.name || undefined
    };
  } else if (typeof updatedPayload[lookupField] === 'string') {
    updatedPayload[lookupField] = {
      id: updatedPayload[lookupField],
      name: user.name || undefined
    };
  }

  // 3. Populate secondary lookup / owner fields for complete cross-module layout compatibility
  if (config?.secondaryLookupFields) {
    config.secondaryLookupFields.forEach(field => {
      if (!updatedPayload[field]) {
        if (field.toLowerCase().includes('name')) {
          updatedPayload[field] = user.name;
        } else if (field.toLowerCase().includes('id') || field.toLowerCase().includes('code')) {
          updatedPayload[field] = String(employeeZohoId);
        }
      }
    });
  }

  // 4. Inject standard audit metadata
  if (!updatedPayload.Employee_ID && !updatedPayload.empId) {
    updatedPayload.Employee_ID = user.empId || user.id;
  }
  if (!updatedPayload.Employee_Name && !updatedPayload.employeeName) {
    updatedPayload.Employee_Name = user.name;
  }
  if (!updatedPayload.Department_Name && !updatedPayload.department) {
    updatedPayload.Department_Name = user.department;
  }

  return updatedPayload;
}

/**
 * Builds Zoho CRM-compatible Search criteria and COQL WHERE clauses based on the user's RBAC scope.
 */
export function buildZohoRbacCriteria(
  moduleName: string,
  user: AuthUser | null = getActiveAuthUser(),
  allEmployees: any[] = getAllEmployeesList()
): RbacCriteriaResult {
  const config = ZOHO_MODULE_LOOKUP_MAP[moduleName];

  // Exempt modules have no role filters
  if (config?.isLookupExempt || !user) {
    return {
      criteria: '',
      coqlWhereClause: '',
      accessibleEmployeeIds: [],
      isUnfiltered: true,
      role: user?.role || 'TM'
    };
  }

  const { employeeIds, zohoIds, isAll } = resolveAccessibleEmployeeIds(user, allEmployees);

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

  // Build recursive Zoho CRM Search criteria: (((Field:equals:A)or(Field:equals:B))or(Field:equals:C))
  let criteria = `(${lookupField}:equals:${targetIds[0]})`;
  for (let i = 1; i < targetIds.length; i++) {
    criteria = `(${criteria}or(${lookupField}:equals:${targetIds[i]}))`;
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
  if (!user) return records;

  const config = ZOHO_MODULE_LOOKUP_MAP[moduleName];
  if (config?.isLookupExempt) return records;

  const { employeeIds, zohoIds, isAll } = resolveAccessibleEmployeeIds(user, allEmployees);
  if (isAll) return records;

  const idSet = new Set<string>();
  employeeIds.forEach(id => idSet.add(id.toLowerCase()));
  zohoIds.forEach(id => idSet.add(id.toLowerCase()));

  const userName = (user.name || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();

  return records.filter((rec: any) => {
    // 1. Check direct Employee lookup object
    if (rec.Employee && typeof rec.Employee === 'object') {
      const empId = String(rec.Employee.id || '').toLowerCase();
      const empName = String(rec.Employee.name || '').toLowerCase();
      if (empId && idSet.has(empId)) return true;
      if (empName && empName === userName) return true;
    }

    // 2. Check string Employee ID fields
    const directEmpId = String(rec.Employee || rec.employeeId || rec.empId || rec.Employee_ID || '').toLowerCase();
    if (directEmpId && idSet.has(directEmpId)) return true;

    // 3. Check Owner / BDM / Creator fields
    if (rec.Owner && typeof rec.Owner === 'object') {
      const ownerId = String(rec.Owner.id || '').toLowerCase();
      const ownerName = String(rec.Owner.name || '').toLowerCase();
      if (ownerId && idSet.has(ownerId)) return true;
      if (ownerName && (ownerName === userName || idSet.has(ownerName))) return true;
    }

    const ownerStr = String(rec.owner || rec.Owner || rec.Created_By || rec.salesEmployee || '').toLowerCase();
    if (ownerStr && (ownerStr === userName || idSet.has(ownerStr) || ownerStr === userEmail)) {
      return true;
    }

    // 4. Check Partner BDM ID
    const bdmId = String(rec.partnerBdmId || rec.partner_bdm_id || rec.Partner_BDM_ID || '').toLowerCase();
    if (bdmId && idSet.has(bdmId)) return true;

    return false;
  });
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
      Salary: { insert: '/api/zoho/insert-salary', update: '/api/zoho/update-salary' },
      Raised_Queries: { insert: '/api/zoho/insert-query', update: '/api/zoho/update-query' },
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
 * Automatically builds role-specific criteria and queries Zoho CRM.
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

    let url = `/api/zoho/get-${moduleName.toLowerCase().replace(/_/g, '-')}`;
    
    // If user has restricted role criteria, append criteria query
    if (!isUnfiltered && criteria) {
      queryParams.set('criteria', criteria);
    }

    const qs = queryParams.toString();
    const finalUrl = qs ? `${url}?${qs}` : url;

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
      message: result.message || `Failed to fetch ${moduleName} from Zoho CRM`
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
