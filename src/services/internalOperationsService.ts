import type { InternalOperationRecord } from '../types/operations';
import type { ZohoApiResponse } from './zohoService';

const STORAGE_KEY = 'be_internal_operations';

/**
 * Format Zoho CRM field values safely
 */
function formatValue(val: any, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') {
    return val.name || val.display_value || val.value || val.id || fallback;
  }
  return String(val);
}

/**
 * Helper to get all Internal Operations records from localStorage
 */
export function getStoredInternalOperations(): InternalOperationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[Internal Operations] Failed to read from localStorage:', err);
  }
  return [];
}

/**
 * Helper to save all Internal Operations records to localStorage and notify listeners
 */
export function setStoredInternalOperations(records: InternalOperationRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('be_internal_operations_updated', { detail: records }));
  } catch (err) {
    console.warn('[Internal Operations] Failed to write to localStorage:', err);
  }
}

/**
 * Idempotently generates/updates Internal Operations sub-child records for a Deal
 * based on its Legal Details Subform entries.
 *
 * Rules:
 * 1. Checks Deal_ID + Service_Scheme for duplicate prevention.
 * 2. If record already exists: Preserves existing TL/TM assignments and updates subform fields.
 * 3. If record does not exist: Instantiates a new sub-child record linked to Deal_ID.
 * 4. Preserves all parent Deal data and subforms without data clearing.
 */
export function generateServiceAllocationsForDeal(
  deal: any,
  existingList: InternalOperationRecord[] = getStoredInternalOperations()
): { created: InternalOperationRecord[]; updated: InternalOperationRecord[]; all: InternalOperationRecord[] } {
  if (!deal) {
    return { created: [], updated: [], all: existingList };
  }

  const dealId = String(deal.id || deal.zohoId || '').trim();
  if (!dealId) {
    return { created: [], updated: [], all: existingList };
  }

  const dealName = formatValue(deal.Deal_Name || deal.name || `Deal #${dealId}`);
  const clientName = formatValue(
    deal.Client_Name || deal.clientName || deal.Contact_Name || deal.Clients || deal.Account_Name || deal.Company_Name || ''
  );
  const companyName = formatValue(deal.Company_Name || deal.companyName || deal.Account_Name || clientName);

  // Collect subform rows from all possible deal representations
  const raw = deal.rawZohoDeal || {};
  const fd = deal.formData || {};

  let subformRows: any[] = [];
  if (Array.isArray(deal.legalData) && deal.legalData.length > 0) {
    subformRows = deal.legalData;
  } else if (Array.isArray(raw.Legal) && raw.Legal.length > 0) {
    subformRows = raw.Legal;
  } else if (Array.isArray(fd.legalData) && fd.legalData.length > 0) {
    subformRows = fd.legalData;
  } else if (Array.isArray(raw.Subform_1) && raw.Subform_1.length > 0) {
    subformRows = raw.Subform_1;
  } else if (Array.isArray(deal.servicesData) && deal.servicesData.length > 0) {
    subformRows = deal.servicesData;
  } else if (deal.service || deal.Service_Name) {
    subformRows = [{
      schema: deal.service || deal.Service_Name,
      internalTeamType: 'Team Funding',
      legalStatus: 'RECEIVED',
      docTypes: 'Agreement',
      terms1: '3 Months',
      remark: 'Auto-generated from Deal Service'
    }];
  }

  // Deduplicate subform entries by scheme name
  const seenSchemes = new Set<string>();
  const uniqueSubformRows = subformRows.filter((row: any) => {
    const sName = formatValue(
      row.schema || row.Legal_Schemas || row.Schemas || row.Service_Name || row.name || deal.service || 'Service'
    ).trim().toLowerCase();
    if (!sName || seenSchemes.has(sName)) return false;
    seenSchemes.add(sName);
    return true;
  });

  const currentRecords = [...existingList];
  const created: InternalOperationRecord[] = [];
  const updated: InternalOperationRecord[] = [];

  const nowIso = new Date().toISOString();

  uniqueSubformRows.forEach((row: any, idx: number) => {
    const serviceScheme = formatValue(
      row.schema || row.Legal_Schemas || row.Schemas || row.Service_Name || row.name || `Service ${idx + 1}`
    );
    const internalTeamType = formatValue(
      row.internalTeamType || row.Internal_team_type || 'Team Funding'
    );
    const typesOfLegalDocs = formatValue(
      row.docTypes || row.Types_of_legal_documents || 'Agreement'
    );
    const agreementTerms = formatValue(
      row.terms1 || row.Agreement_Terms_I || row.Agreement_Terms || row.agreementTerms || '3 Months'
    );
    const remark = formatValue(row.remark || row.Remark || '');
    const internalLegalStatus = formatValue(
      row.legalStatus || row.Internal_legal_status || 'RECEIVED'
    );
    const tenure = formatValue(row.tenure || row.Tenure_of_Service || '');
    const subformRowId = String(row.id || `row_${idx + 1}`);

    // Idempotency lookup: Match Deal_ID + Service_Scheme
    const matchKey = `${dealId.toLowerCase()}::${serviceScheme.toLowerCase()}`;
    const existingIndex = currentRecords.findIndex(r => {
      const rDealId = String(r.Deal_ID || '').trim().toLowerCase();
      const rScheme = String(r.Service_Scheme || '').trim().toLowerCase();
      return `${rDealId}::${rScheme}` === matchKey;
    });

    if (existingIndex >= 0) {
      // Existing record found: Preserves TL/TM while updating modified legal details
      const existingRecord = currentRecords[existingIndex];
      const hasChanges =
        existingRecord.Internal_Team_Type !== internalTeamType ||
        existingRecord.Internal_Legal_Status !== internalLegalStatus ||
        existingRecord.Types_of_Legal_Documents !== typesOfLegalDocs ||
        existingRecord.Agreement_Terms !== agreementTerms ||
        existingRecord.Remark !== remark;

      if (hasChanges) {
        const updatedRecord: InternalOperationRecord = {
          ...existingRecord,
          Deal_Name: dealName || existingRecord.Deal_Name,
          Client_Name: clientName || existingRecord.Client_Name,
          Company_Name: companyName || existingRecord.Company_Name,
          Internal_Team_Type: internalTeamType,
          Internal_Legal_Status: internalLegalStatus,
          Types_of_Legal_Documents: typesOfLegalDocs,
          Agreement_Terms: agreementTerms,
          Remark: remark,
          Tenure_of_Service: tenure || existingRecord.Tenure_of_Service,
          Subform_Row_ID: subformRowId || existingRecord.Subform_Row_ID,
          Modified_Time: nowIso
        };
        currentRecords[existingIndex] = updatedRecord;
        updated.push(updatedRecord);
      }
    } else {
      // Create new sub-child record
      const newRecord: InternalOperationRecord = {
        id: `IO-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
        Deal_ID: dealId,
        Deal_Name: dealName,
        Client_Name: clientName,
        Company_Name: companyName,
        Service_Scheme: serviceScheme,
        Internal_Team_Type: internalTeamType,
        Types_of_Legal_Documents: typesOfLegalDocs,
        Agreement_Terms: agreementTerms,
        Remark: remark,
        Internal_Legal_Status: internalLegalStatus,
        Tenure_of_Service: tenure,
        Subform_Row_ID: subformRowId,
        Team_Leader: null,
        Team_Leader_ID: '',
        Team_Leader_Name: '',
        Team_Member: null,
        Team_Member_ID: '',
        Team_Member_Name: '',
        Allocation_Status: 'Pending Allocation',
        Created_Time: nowIso,
        Modified_Time: nowIso
      };
      currentRecords.push(newRecord);
      created.push(newRecord);
    }
  });

  if (created.length > 0 || updated.length > 0) {
    setStoredInternalOperations(currentRecords);

    // Sync in background with backend endpoint if available
    syncAllocationsToBackend(created.length > 0 ? created : updated).catch(e => {
      console.warn('[Internal Operations] Background sync warning:', e);
    });
  }

  return { created, updated, all: currentRecords };
}

/**
 * Fetches all Internal Operations records, optionally filtered by Deal ID
 */
export async function fetchInternalOperations(options?: { dealId?: string }): Promise<InternalOperationRecord[]> {
  let records = getStoredInternalOperations();

  try {
    const qs = options?.dealId ? `?deal_id=${encodeURIComponent(options.dealId)}` : '';
    const res = await fetch(`/api/zoho/internal-operations${qs}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        // Merge server records with local storage records
        const serverMap = new Map<string, InternalOperationRecord>();
        data.data.forEach((r: any) => {
          if (r.id) serverMap.set(String(r.id), r);
        });

        records.forEach(r => {
          if (r.id && !serverMap.has(String(r.id))) {
            serverMap.set(String(r.id), r);
          }
        });

        records = Array.from(serverMap.values());
        setStoredInternalOperations(records);
      }
    }
  } catch (err) {
    // If backend endpoint is unreachable, fallback to localStorage gracefully
  }

  if (options?.dealId) {
    const dId = String(options.dealId).trim().toLowerCase();
    return records.filter(r => String(r.Deal_ID || '').trim().toLowerCase() === dId);
  }

  return records;
}

/**
 * Saves or updates a single Internal Operation record
 */
export async function saveInternalOperation(record: InternalOperationRecord): Promise<ZohoApiResponse> {
  const current = getStoredInternalOperations();
  const index = current.findIndex(r => r.id === record.id);
  const nowIso = new Date().toISOString();
  const updatedRecord = { ...record, Modified_Time: nowIso };

  let updatedList: InternalOperationRecord[];
  if (index >= 0) {
    updatedList = [...current];
    updatedList[index] = updatedRecord;
  } else {
    updatedList = [updatedRecord, ...current];
  }

  setStoredInternalOperations(updatedList);

  // Background sync to backend API
  try {
    const response = await fetch('/api/zoho/internal-operations', {
      method: index >= 0 ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedRecord)
    });
    const data = await response.json();
    return {
      success: true,
      zohoId: data?.zohoId || updatedRecord.zohoId || updatedRecord.id,
      message: 'Internal Operations record updated successfully',
      data: updatedRecord
    };
  } catch (err: any) {
    return {
      success: true,
      zohoId: updatedRecord.id,
      message: 'Saved locally',
      data: updatedRecord
    };
  }
}

/**
 * Assigns Team Leader (TL) and Team Member (TM) to an Internal Operation record
 */
export async function assignStaffToOperation(
  operationId: string,
  tl: { id: string; name: string; email?: string; empId?: string } | null,
  tm: { id: string; name: string; email?: string; empId?: string } | null,
  allocatedBy?: { id: string; name: string }
): Promise<InternalOperationRecord | null> {
  const current = getStoredInternalOperations();
  const record = current.find(r => r.id === operationId);
  if (!record) return null;

  const nowIso = new Date().toISOString();
  const isFullyAllocated = Boolean(tl?.id && tm?.id);
  const isPartiallyAllocated = Boolean(tl?.id || tm?.id);

  const updatedRecord: InternalOperationRecord = {
    ...record,
    Team_Leader: tl ? { id: tl.id, name: tl.name, email: tl.email, empId: tl.empId } : null,
    Team_Leader_ID: tl?.id || '',
    Team_Leader_Name: tl?.name || '',
    Team_Member: tm ? { id: tm.id, name: tm.name, email: tm.email, empId: tm.empId } : null,
    Team_Member_ID: tm?.id || '',
    Team_Member_Name: tm?.name || '',
    Allocation_Status: isFullyAllocated ? 'Allocated' : isPartiallyAllocated ? 'In Progress' : 'Pending Allocation',
    Allocated_At: (tl || tm) ? nowIso : record.Allocated_At,
    Allocated_By: allocatedBy?.id || record.Allocated_By,
    Allocated_By_Name: allocatedBy?.name || record.Allocated_By_Name,
    Modified_Time: nowIso
  };

  await saveInternalOperation(updatedRecord);
  return updatedRecord;
}

/**
 * Sends newly created or updated allocations to the backend API endpoint
 */
async function syncAllocationsToBackend(records: InternalOperationRecord[]): Promise<void> {
  if (!Array.isArray(records) || records.length === 0) return;
  try {
    await fetch('/api/zoho/internal-operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: records })
    });
  } catch (err) {
    // Graceful background sync failure
  }
}
