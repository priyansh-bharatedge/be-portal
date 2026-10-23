import type { AuthUser, SystemRole, RbacCriteriaResult } from '../types/roles';
import { ZOHO_MODULE_LOOKUP_MAP } from '../types/roles';
import type { ZohoApiResponse, ZohoFetchOptions, ZohoFetchResult } from './zohoService';
import { isSubordinateOfTL, isMatchingName } from '../utils/employeeUtils';

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
export function getAllEmployeesList(additionalUsers?: any[]): any[] {
  const mergedMap = new Map<string, any>();
  if (Array.isArray(additionalUsers)) {
    additionalUsers.forEach((e: any) => {
      const key = String(e.id || e.zohoId || e.empId || e.email || Math.random());
      mergedMap.set(key, e);
    });
  }
  try {
    const raw = localStorage.getItem('be_employees');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((e: any) => {
          const key = String(e.id || e.zohoId || e.empId || e.email || Math.random());
          if (!mergedMap.has(key)) {
            mergedMap.set(key, e);
          }
        });
      }
    }
  } catch (err) {
    console.warn('[RBAC Service] Failed to load employees list:', err);
  }
  try {
    const rawSales = localStorage.getItem('be_sales_employees');
    if (rawSales) {
      const parsed = JSON.parse(rawSales);
      if (Array.isArray(parsed)) {
        parsed.forEach((e: any) => {
          const key = String(e.id || e.zohoId || e.empId || e.email || Math.random());
          if (!mergedMap.has(key)) {
            mergedMap.set(key, e);
          }
        });
      }
    }
  } catch (err) {}
  return Array.from(mergedMap.values());
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

  const dept = (user.department || '').trim().toLowerCase();
  const isAccounts = dept.includes('account') || dept.includes('finance');
  const isLegal = dept.includes('legal');

  // 1. Super Admin, Head of Department (HOD), Accounts, & Legal Department have full organizational visibility across all modules
  if (role === 'Super Admin' || role === 'HOD' || isAccounts || isLegal || userEmail === 'superadmin@be.com' || userEmail === 'md@bharat-edge.com') {
    return { employeeIds: [], zohoIds: [], isAll: true };
  }

  // 2. HR Admin has full visibility over HRMS and organization
  if (role === 'HR' || userEmail === 'hrmshr@be.com') {
    return { employeeIds: [], zohoIds: [], isAll: true };
  }

  // 3. Team Leader (TL) - Self + Team (direct reports via Reporting_Manager or Team Leader across all departments)
  if (role === 'TL') {
    const empIds = new Set<string>();
    const zIds = new Set<string>();

    if (userEmpId) empIds.add(userEmpId);
    if (userZohoId) zIds.add(userZohoId);
    if (user.id) {
      empIds.add(String(user.id).toLowerCase());
      if (/^\d{10,}$/.test(String(user.id))) {
        zIds.add(String(user.id));
      }
    }

    // Match TL themselves in allEmployees to retrieve their live Zoho record ID and User ID
    const selfInEmployees = allEmployees.find((e: any) => 
      (e.email && userEmail && e.email.toLowerCase() === userEmail) ||
      (e.name && userName && isMatchingName(e.name, userName)) ||
      (e.Name && userName && isMatchingName(e.Name, userName))
    );
    if (selfInEmployees) {
      if (selfInEmployees.id && /^\d{10,}$/.test(String(selfInEmployees.id))) zIds.add(String(selfInEmployees.id));
      if (selfInEmployees.zohoId && /^\d{10,}$/.test(String(selfInEmployees.zohoId))) zIds.add(String(selfInEmployees.zohoId));
      if (selfInEmployees.zohoUserId && /^\d{10,}$/.test(String(selfInEmployees.zohoUserId))) zIds.add(String(selfInEmployees.zohoUserId));
      if (selfInEmployees.empId) empIds.add(String(selfInEmployees.empId).toLowerCase());
    }

    allEmployees.forEach((e: any) => {
      const isSubordinate = isSubordinateOfTL(e, user);

      if (isSubordinate) {
        if (e.id) {
          empIds.add(String(e.id).toLowerCase());
          if (/^\d{10,}$/.test(String(e.id))) {
            zIds.add(String(e.id));
          }
        }
        if (e.empId) empIds.add(String(e.empId).toLowerCase());
        if (e.zohoId && /^\d{10,}$/.test(String(e.zohoId))) zIds.add(String(e.zohoId));
        if (e.zohoUserId && /^\d{10,}$/.test(String(e.zohoUserId))) zIds.add(String(e.zohoUserId));
        if (e.Employment_ID) empIds.add(String(e.Employment_ID).toLowerCase());
        if (e.Employee_Code) empIds.add(String(e.Employee_Code).toLowerCase());
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
      // Do not auto-inject current user into Partner BDM fields or BDM_names lookup
      if (field === 'BDM_names' || field.startsWith('Partner_BDM') || field.startsWith('partner_bdm')) return;
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

  const userDept = (user?.department || '').trim().toLowerCase();
  const isAccounts = userDept.includes('account') || userDept.includes('finance');
  const isLegal = userDept.includes('legal');

  // Exempt modules and full-visibility roles (Super Admin, HOD, HR, Accounts, Legal) have no role filters
  if (
    config?.isLookupExempt || 
    !user || 
    user.role === 'Super Admin' || 
    user.role === 'HOD' || 
    user.role === 'HR' ||
    isAccounts ||
    isLegal ||
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
    const idList = targetIds.join(',');
    const combinedCriteria = `(((Employee.id:in:${idList})or(Partner_BDM.id:in:${idList}))or(Owner.id:in:${idList}))`;

    const formattedCoqlIds = targetIds.map(id => `'${id}'`).join(', ');
    const coqlWhereClause = `(Employee.id in (${formattedCoqlIds}) or Partner_BDM.id in (${formattedCoqlIds}) or Owner.id in (${formattedCoqlIds}))`;

    return {
      criteria: combinedCriteria,
      coqlWhereClause,
      accessibleEmployeeIds: targetIds,
      isUnfiltered: false,
      role: user.role
    };
  }

  if (
    moduleName === 'Quotations' || moduleName === 'Quotation' ||
    moduleName === 'Companies' || moduleName === 'Company' ||
    moduleName === 'Clients' || moduleName === 'Client'
  ) {
    const idList = targetIds.join(',');
    const combinedCriteria = `((Employee.id:in:${idList})or(Owner.id:in:${idList}))`;

    const formattedCoqlIds = targetIds.map(id => `'${id}'`).join(', ');
    const coqlWhereClause = `(Employee.id in (${formattedCoqlIds}) or Owner.id in (${formattedCoqlIds}))`;

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
  const userDept = (user?.department || '').trim().toLowerCase();
  const isAccounts = userDept.includes('account') || userDept.includes('finance');
  const isLegal = userDept.includes('legal');

  if (
    !user || 
    user.role === 'Super Admin' || 
    user.role === 'HOD' || 
    user.role === 'HR' ||
    isAccounts ||
    isLegal ||
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

  if (user.zohoId) idSet.add(String(user.zohoId).trim().toLowerCase());
  if (user.id) idSet.add(String(user.id).trim().toLowerCase());
  if (user.empId) idSet.add(String(user.empId).trim().toLowerCase());

  const userName = (user.name || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();

  const accessibleNames: string[] = [];
  const accessibleEmails = new Set<string>();

  if (userName) accessibleNames.push(userName);
  if (userEmail) accessibleEmails.add(userEmail);

  // If user is a Team Leader (TL), gather all subordinates' names, emails, and IDs across all departments
  if (user.role === 'TL') {
    allEmployees.forEach((e: any) => {
      if (isSubordinateOfTL(e, user)) {
        // Collect subordinate IDs into idSet
        [
          e.id,
          e.empId,
          e.zohoId,
          e.Employment_ID,
          e.Employee_Code,
          e.zohoUserId,
          e.formData?.empId,
          e.formData?.zohoId,
          e.formData?.employeeId
        ].forEach(val => {
          if (val) idSet.add(String(val).trim().toLowerCase());
        });

        // Collect subordinate names
        const fullName = (e.name || [e.Name, e.Middle_Name, e.Last_Name].filter(Boolean).join(' ') || '').trim();
        if (fullName) {
          accessibleNames.push(fullName);
          idSet.add(fullName.toLowerCase());
        }
        if (e.firstName && typeof e.firstName === 'string') {
          accessibleNames.push(e.firstName.trim());
        }
        if (e.Name && typeof e.Name === 'string') {
          accessibleNames.push(e.Name.trim());
        }
        if (e.formData?.firstName) {
          accessibleNames.push(String(e.formData.firstName).trim());
        }

        // Collect subordinate emails
        [
          e.email,
          e.workEmail,
          e.Personal_Email_Address,
          e.formData?.email,
          e.formData?.workEmail
        ].forEach(val => {
          if (val) accessibleEmails.add(String(val).trim().toLowerCase());
        });
      }
    });
  }

  // Unified person matcher that checks against both TL and all subordinates
  const isAccessiblePerson = (candidateNameOrId?: any, candidateEmail?: any): boolean => {
    if (candidateNameOrId) {
      if (typeof candidateNameOrId === 'object' && candidateNameOrId !== null) {
        const objId = String(candidateNameOrId.id || '').trim().toLowerCase();
        const objName = String(candidateNameOrId.name || '').trim();
        if (objId && idSet.has(objId)) return true;
        if (objName && isAccessiblePerson(objName)) return true;
      } else {
        const val = String(candidateNameOrId).trim();
        const valLower = val.toLowerCase();
        if (valLower && idSet.has(valLower)) return true;
        if (val && accessibleNames.some(n => isMatchingName(val, n))) return true;
      }
    }
    if (candidateEmail) {
      const em = String(candidateEmail).trim().toLowerCase();
      if (em && accessibleEmails.has(em)) return true;
    }
    return false;
  };

  return records.filter((rec: any) => {
    // 1. Check direct Employee lookup object
    const empLookup = rec.Employee || rec.rawZohoDeal?.Employee;
    if (empLookup && isAccessiblePerson(empLookup)) return true;

    // 2. Check string Employee ID fields
    const directEmpId = String(rec.Employee || rec.employeeId || rec.empId || rec.Employment_ID || rec.Employee_Code || rec.Employee_ID || rec.rawZohoDeal?.Employment_ID || rec.rawZohoDeal?.Employee_Code || '').trim().toLowerCase();
    if (directEmpId && idSet.has(directEmpId)) return true;

    // 3. Check Owner / BDM / Creator fields
    const ownerLookup = rec.Owner || rec.rawZohoDeal?.Owner;
    if (ownerLookup && isAccessiblePerson(ownerLookup)) return true;

    const ownerStr = String(rec.owner || rec.Owner || rec.Created_By || rec.salesEmployee || rec.BDM_names || rec.rawZohoDeal?.Owner?.name || rec.rawZohoDeal?.salesEmployee || '').trim();
    if (ownerStr && (isAccessiblePerson(ownerStr) || isAccessiblePerson(undefined, ownerStr))) return true;

    // 4. Check Partner BDM (Lookup object, ID, Name, or Form Data)
    const partnerLookup = rec.Partner_BDM || rec.rawZohoDeal?.Partner_BDM;
    if (partnerLookup && isAccessiblePerson(partnerLookup)) return true;

    const bdmId = String(rec.partnerBdmId || rec.partner_bdm_id || rec.Partner_BDM_ID || rec.rawZohoDeal?.Partner_BDM_ID || rec.rawZohoDeal?.partner_bdm_id || rec.formData?.partnerBdmId || rec.formData?.partner_bdm_id || (typeof partnerLookup === 'string' ? partnerLookup : '') || '').trim().toLowerCase();
    if (bdmId && idSet.has(bdmId)) return true;

    const bdmName = String(rec.partnerBdmName || rec.partner_bdm_name || rec.Partner_BDM_Name || rec.rawZohoDeal?.Partner_BDM_Name || rec.rawZohoDeal?.Partner_BDM_name || rec.rawZohoDeal?.Partner_BDM_Names || rec.rawZohoDeal?.Partner_BDM_Names_bp || rec.rawZohoDeal?.Partner_BDM_Names_st || rec.formData?.partnerBdmName || rec.formData?.partner_bdm_name || '').trim();
    if (bdmName && isAccessiblePerson(bdmName)) return true;

    // 5. For HOD role, check if record's department matches HOD's department
    if (user.role === 'HOD') {
      const recDept = String(rec.Department || rec.department || rec.Department_Name || '').trim().toLowerCase();
      if (recDept && userDept && (recDept === userDept || userDept === 'management' || (userDept === 'sales' && (recDept.includes('sale') || recDept.includes('bdm'))))) return true;
    }

    // 6. Check if associated employee name/email belongs to accessible employees
    const recEmpName = String(rec.employeeName || rec.Employee_Name || rec.salesRepresentative || rec.createdBy || '').trim();
    const recEmpEmail = String(rec.employeeEmail || rec.userEmail || rec.empEmail || '').trim();
    if (recEmpName && isAccessiblePerson(recEmpName, recEmpEmail)) return true;
    if (recEmpEmail && isAccessiblePerson(undefined, recEmpEmail)) return true;

    // 7. Check embedded formData employee identifiers
    const fdEmpName = String(rec.formData?.employeeName || rec.formData?.salesEmployee || rec.formData?.empName || '').trim();
    const fdEmpEmail = String(rec.formData?.employeeEmail || rec.formData?.userEmail || '').trim();
    if (fdEmpName && isAccessiblePerson(fdEmpName, fdEmpEmail)) return true;
    if (fdEmpEmail && isAccessiblePerson(undefined, fdEmpEmail)) return true;

    const fdEmpId = String(rec.formData?.empId || rec.formData?.employeeId || rec.formData?.employeeZohoId || rec.empId || rec.employeeId || '').trim().toLowerCase();
    if (fdEmpId && idSet.has(fdEmpId)) return true;

    // 8. Check Subforms (e.g. Legal subform rows) for assigned subordinates in any department
    if (Array.isArray(rec.legalData) && rec.legalData.length > 0) {
      const hasSubordinateInLegal = rec.legalData.some((row: any) =>
        isAccessiblePerson(row.dprMember) ||
        isAccessiblePerson(row.dprTl) ||
        isAccessiblePerson(row.financeMember) ||
        isAccessiblePerson(row.financeTl) ||
        isAccessiblePerson(row.dataChecker)
      );
      if (hasSubordinateInLegal) return true;
    }

    // 9. Legal Department access: If user is in Legal department, allow access to all deals in Legal stage or with Legal department/subforms
    if (userDept.includes('legal') && (moduleName === 'Deals' || moduleName === 'Deal' || moduleName === 'CRM')) {
      const dealStage = String(rec.stage || rec.Stage || rec.status || rec.Status || rec.rawZohoDeal?.Stage || '').toLowerCase().trim();
      const recDept = String(rec.Department || rec.department || rec.Department_Name || '').toLowerCase().trim();
      if (dealStage.includes('legal') || recDept === 'legal' || (Array.isArray(rec.legalData) && rec.legalData.length > 0)) {
        return true;
      }
    }

    // 9b. Operations Department access: If user is assigned as TL or TM to any child Internal Operations record for this Deal
    if (moduleName === 'Deals' || moduleName === 'Deal' || moduleName === 'CRM') {
      try {
        const rawIO = localStorage.getItem('be_internal_operations');
        if (rawIO) {
          const ioList = JSON.parse(rawIO);
          const dId = String(rec.id || rec.zohoId || '').trim().toLowerCase();
          if (dId && Array.isArray(ioList)) {
            const hasAssignedChild = ioList.some((io: any) => {
              if (String(io.Deal_ID || '').trim().toLowerCase() !== dId) return false;
              const tlId = String(io.Team_Leader?.id || io.Team_Leader_ID || '').toLowerCase();
              const tlName = String(io.Team_Leader?.name || io.Team_Leader_Name || '').toLowerCase();
              const tmId = String(io.Team_Member?.id || io.Team_Member_ID || '').toLowerCase();
              const tmName = String(io.Team_Member?.name || io.Team_Member_Name || '').toLowerCase();
              return (
                (tlId && idSet.has(tlId)) ||
                (tlName && isAccessiblePerson(tlName)) ||
                (tmId && idSet.has(tmId)) ||
                (tmName && isAccessiblePerson(tmName))
              );
            });
            if (hasAssignedChild) return true;
          }
        }
      } catch (_) {}
    }

    // 10. Special fallback for Quotations: if created locally or before employee metadata was linked
    if (moduleName === 'Quotations' || moduleName === 'quotation' || moduleName === 'CRM') {
      const isUnassigned = (!rec.Employee || (typeof rec.Employee === 'object' && !rec.Employee.id && !rec.Employee.name)) &&
                           !rec.employeeId && !rec.empId && !rec.employeeName &&
                           (!rec.owner || rec.owner === 'Admin');
      if (isUnassigned) {
        return true;
      }
    }

    // 11. Internal Operations module scoping:
    // Super Admin & Operations HOD have full management & assignment access.
    // Legal HOD has supervisory oversight and visibility over legal sub-child details.
    // Operations TL / TM have visibility over their specifically assigned service records.
    // Unauthorized personnel (sales, accounts, unassigned staff) are blocked.
    if (moduleName === 'Internal_Operations' || moduleName === 'internal_operations' || moduleName === 'Operation_Internal_CRM' || moduleName === 'operation_internal_crm') {
      const isSuperAdmin = user.role === 'Super Admin' || user.email === 'superadmin@be.com' || user.email === 'md@bharat-edge.com';
      const isOpsHOD = user.role === 'HOD' && (userDept.includes('operat') || !userDept.includes('legal'));
      const isLegalHOD = user.role === 'HOD' && userDept.includes('legal');
      if (isSuperAdmin || isOpsHOD || isLegalHOD) return true;

      // TL check: Assigned as TL
      const tlId = String(rec.Team_Leader?.id || rec.Team_Leader_ID || '').toLowerCase();
      const tlName = String(rec.Team_Leader?.name || rec.Team_Leader_Name || '').toLowerCase();
      if (tlId && idSet.has(tlId)) return true;
      if (tlName && isAccessiblePerson(tlName)) return true;

      // TM check: Assigned as TM
      const tmId = String(rec.Team_Member?.id || rec.Team_Member_ID || '').toLowerCase();
      const tmName = String(rec.Team_Member?.name || rec.Team_Member_Name || '').toLowerCase();
      if (tmId && idSet.has(tmId)) return true;
      if (tmName && isAccessiblePerson(tmName)) return true;

      return false;
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
  if (norm === 'internal-operations' || norm === 'internal-operation') return '/api/zoho/internal-operations';
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
      Internal_Operations: { insert: '/api/zoho/internal-operations', update: '/api/zoho/internal-operations' },
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

