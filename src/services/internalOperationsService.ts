import type { InternalOperationRecord } from '../types/operations';
import { getOperationStagesForTeamType } from '../types/operations';
import type { ZohoApiResponse } from './zohoService';
import { isValidServiceName } from '../utils/dealSplitUtils';
import { isMatchingName } from '../utils/employeeUtils';

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
 * Normalizes service scheme or name for reliable case-insensitive deduplication and lookup
 */
export function normalizeServiceName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Robustly deduplicates Internal Operations records by Deal ID and normalized Service Name.
 * If multiple records exist for the same service under the same deal, merges them into
 * a single record, prioritizing real numeric Zoho IDs and preserving assigned TL/TM and stages.
 */
export function deduplicateInternalOperations(records: InternalOperationRecord[]): InternalOperationRecord[] {
  if (!Array.isArray(records)) return [];
  const map = new Map<string, InternalOperationRecord>();

  for (const r of records) {
    if (!r) continue;
    const dealId = String(
      r.Deal_ID ||
      (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) ||
      (r as any).zohoDealId ||
      ''
    ).trim().toLowerCase();

    const sName = normalizeServiceName(r.Service_Scheme || r.Name || '');
    if (!dealId || !sName) {
      if (r.id && !map.has(String(r.id))) {
        map.set(String(r.id), r);
      }
      continue;
    }

    const key = `${dealId}__${sName}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, r);
    } else {
      // Prefer real Zoho numeric ID over temporary IO-... ID
      const isExistingZoho = /^\d{15,}$/.test(String(existing.id));
      const isCurrentZoho = /^\d{15,}$/.test(String(r.id));
      const preferred = isCurrentZoho && !isExistingZoho ? r : existing;
      const secondary = preferred === r ? existing : r;

      const isRealStaff = (s: any) => {
        if (!s || (!s.name && !s.id)) return false;
        const n = String(s.name || '');
        if (n.includes('(DL-') || n.includes(' - FORM') || n.includes('PRIVATE LIMITED') || n.includes('PVT LTD') || n.includes('LLP')) return false;
        return true;
      };

      const pickTl = isRealStaff(preferred.Team_Leader) ? preferred.Team_Leader : (isRealStaff(secondary.Team_Leader) ? secondary.Team_Leader : (preferred.Team_Leader || secondary.Team_Leader));
      const pickTm = isRealStaff(preferred.Team_Member) ? preferred.Team_Member : (isRealStaff(secondary.Team_Member) ? secondary.Team_Member : (preferred.Team_Member || secondary.Team_Member));
      const pickTlTL = isRealStaff(preferred.Team_Leader_TL) ? preferred.Team_Leader_TL : (isRealStaff(secondary.Team_Leader_TL) ? secondary.Team_Leader_TL : (pickTl ? { id: pickTl.id, name: pickTl.name } : null));
      const pickTmTM = isRealStaff(preferred.Team_Member_TM) ? preferred.Team_Member_TM : (isRealStaff(secondary.Team_Member_TM) ? secondary.Team_Member_TM : (pickTm ? { id: pickTm.id, name: pickTm.name } : null));

      const merged: InternalOperationRecord = {
        ...secondary,
        ...preferred,
        id: preferred.id,
        Name: preferred.Name || preferred.Service_Scheme || secondary.Name || secondary.Service_Scheme || '',
        Service_Scheme: preferred.Service_Scheme || preferred.Name || secondary.Service_Scheme || secondary.Name || '',
        Team_Leader: pickTl,
        Team_Member: pickTm,
        Team_Leader_TL: pickTlTL,
        Team_Member_TM: pickTmTM,
        Team_Leader_ID: pickTl?.id || preferred.Team_Leader_ID || secondary.Team_Leader_ID || '',
        Team_Leader_Name: pickTl?.name || preferred.Team_Leader_Name || secondary.Team_Leader_Name || '',
        Team_Member_ID: pickTm?.id || preferred.Team_Member_ID || secondary.Team_Member_ID || '',
        Team_Member_Name: pickTm?.name || preferred.Team_Member_Name || secondary.Team_Member_Name || '',
        Stage: preferred.Stage || secondary.Stage,
        Operation_Stage: preferred.Operation_Stage || secondary.Operation_Stage,
        CA_CS1: preferred.CA_CS1 || secondary.CA_CS1,
        CA_CS2: preferred.CA_CS2 || secondary.CA_CS2,
        sectionsData: { ...(secondary.sectionsData || {}), ...(preferred.sectionsData || {}) }
      };
      map.set(key, merged);
    }
  }

  return Array.from(map.values());
}

/**
 * Helper to get all Internal Operations records from localStorage with automatic deduplication
 */
export function getStoredInternalOperations(): InternalOperationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const octStart = new Date('2026-10-01T00:00:00+05:30').getTime();
        const octOnly = parsed.filter((r: any) => {
          const ct = r.Created_Time || r.created_time || r.CreatedTime;
          if (!ct) return true;
          const ms = new Date(ct).getTime();
          return !isNaN(ms) ? ms >= octStart : true;
        });
        return deduplicateInternalOperations(octOnly);
      }
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
    const deduplicated = deduplicateInternalOperations(records);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
    window.dispatchEvent(new CustomEvent('be_internal_operations_updated', { detail: deduplicated }));
  } catch (err) {
    console.warn('[Internal Operations] Failed to write to localStorage:', err);
  }
}

/**
 * Normalizes Team Type string (handles both "Team Incorporation" and "Incorporation")
 */
export function normalizeTeamType(val: any): string {
  const str = formatValue(val).trim();
  const lower = str.toLowerCase();
  if (lower.includes('incorporation')) return 'Incorporation';
  if (lower.includes('compliance')) return 'Compliance';
  if (lower.includes('funding')) return 'Funding';
  if (lower.includes('certification')) return 'Certification';
  if (lower.includes('digital') || lower.includes('marketing')) return 'Digital Marketing';
  return str.replace(/^Team\s+/i, '') || 'Funding';
}

/**
 * Idempotently generates/updates Internal Operations child records for a Deal
 * based on its Legal Details Subform entries.
 *
 * Rules:
 * 1. The number of child records matches exactly the number of services listed in the Legal subform (4 services = 4 child records).
 * 2. If record already exists: Preserves existing TL/TM assignments, CA/CS1, CA/CS2, Stage, and dynamic sections data.
 * 3. If record does not exist: Instantiates a new child record linked to Deal_ID with default Stage 'Doc collection'.
 * 4. Preserves all parent Deal data and subforms without data loss.
 */
export function generateServiceAllocationsForDeal(
  deal: any,
  existingList: InternalOperationRecord[] = getStoredInternalOperations()
): { created: InternalOperationRecord[]; updated: InternalOperationRecord[]; all: InternalOperationRecord[] } {
  if (!deal) {
    return { created: [], updated: [], all: existingList };
  }

  const dealLocalId = String(deal.id || '').trim();
  const dealZohoId = String(
    deal.zohoId ||
    deal.rawZohoDeal?.id ||
    (/^\d{15,}$/.test(dealLocalId) ? dealLocalId : '')
  ).trim();
  const dealId = dealLocalId || dealZohoId;

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
  } else if ((deal.service || deal.Service_Name) && isValidServiceName(deal.service || deal.Service_Name, clientName, companyName, dealId)) {
    subformRows = [{
      schema: deal.service || deal.Service_Name,
      internalTeamType: 'Team Funding',
      legalStatus: 'RECEIVED',
      docTypes: 'Agreement',
      terms1: '3 Months',
      remark: 'Auto-generated from Deal Service'
    }];
  }

  // Deduplicate subform rows so identical service names only yield 1 child record
  const seenServiceKeys = new Set<string>();
  const uniqueSubformRows = subformRows.filter((row: any) => {
    const rawName = row.schema || row.Legal_Schemas || row.Schemas || row.Service_Name || row.name || '';
    const norm = normalizeServiceName(rawName);
    if (!norm) return true;
    if (seenServiceKeys.has(norm)) return false;
    seenServiceKeys.add(norm);
    return true;
  });

  const currentRecords = [...existingList];
  const dealRecords = currentRecords.filter(r => String(r.Deal_ID || '').trim().toLowerCase() === dealId.toLowerCase());
  const otherRecords = currentRecords.filter(r => String(r.Deal_ID || '').trim().toLowerCase() !== dealId.toLowerCase());

  const created: InternalOperationRecord[] = [];
  const updated: InternalOperationRecord[] = [];
  const matchedExistingIds = new Set<string>();
  const resultingDealRecords: InternalOperationRecord[] = [];

  const nowIso = new Date().toISOString();

  uniqueSubformRows.forEach((row: any, idx: number) => {
    const serviceScheme = formatValue(
      row.schema || row.Legal_Schemas || row.Schemas || row.Service_Name || row.name || `Service ${idx + 1}`
    );
    const rawTeamType = formatValue(
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

    // Try finding existing record for this deal:
    // 1. By Subform_Row_ID
    let existingIndex = dealRecords.findIndex(r => !matchedExistingIds.has(r.id) && r.Subform_Row_ID === subformRowId);

    // 2. Fallback: By normalized Service_Scheme / Name
    if (existingIndex < 0) {
      const normTarget = normalizeServiceName(serviceScheme);
      existingIndex = dealRecords.findIndex(
        r => !matchedExistingIds.has(r.id) && normalizeServiceName(r.Service_Scheme || r.Name || '') === normTarget
      );
    }

    // 3. Fallback: By sequential index position
    if (existingIndex < 0 && idx < dealRecords.length && !matchedExistingIds.has(dealRecords[idx].id)) {
      existingIndex = idx;
    }

    if (existingIndex >= 0) {
      const existingRecord = dealRecords[existingIndex];
      matchedExistingIds.add(existingRecord.id);

      const updatedRecord: InternalOperationRecord = {
        ...existingRecord,
        Deal_Name: dealName || existingRecord.Deal_Name,
        Client_Name: clientName || existingRecord.Client_Name,
        Company_Name: companyName || existingRecord.Company_Name,
        Service_Scheme: serviceScheme,
        Name: serviceScheme,
        Internal_Team_Type: rawTeamType,
        Team_Type: rawTeamType,
        Parent_Record_Deal: dealZohoId
          ? { id: dealZohoId, name: dealName }
          : (existingRecord.Parent_Record_Deal || { id: dealId, name: dealName }),
        zohoDealId: dealZohoId || (existingRecord as any).zohoDealId || undefined,
        Internal_Legal_Status: internalLegalStatus,
        Types_of_Legal_Documents: typesOfLegalDocs,
        Agreement_Terms: agreementTerms,
        Remark: remark,
        Tenure_of_Service: tenure || existingRecord.Tenure_of_Service,
        Subform_Row_ID: subformRowId,
        Stage: existingRecord.Stage || getOperationStagesForTeamType(rawTeamType)[0] || 'Document pending from client',
        Operation_Stage: existingRecord.Operation_Stage || existingRecord.Stage || getOperationStagesForTeamType(rawTeamType)[0] || 'Document pending from client',
        Doc_collection_name: existingRecord.Doc_collection_name || '',
        Doc_collection_Date: existingRecord.Doc_collection_Date || '',
        Doc_collection_status: existingRecord.Doc_collection_status || '',
        Doc_collection_File_Upload: existingRecord.Doc_collection_File_Upload || [],
        Name_Application_name: existingRecord.Name_Application_name || '',
        Name_Application_approved_name: existingRecord.Name_Application_approved_name || '',
        Name_Application_date: existingRecord.Name_Application_date || '',
        Name_Application_status: existingRecord.Name_Application_status || '',
        Name_Application_File_Upload: existingRecord.Name_Application_File_Upload || [],
        DSC_Creation_name: existingRecord.DSC_Creation_name || '',
        DSC_Creation_Date: existingRecord.DSC_Creation_Date || '',
        DSC_Creation_status: existingRecord.DSC_Creation_status || '',
        Final_Filing_name: existingRecord.Final_Filing_name || '',
        Final_Filing_Final_Approval_Name: existingRecord.Final_Filing_Final_Approval_Name || '',
        Final_Filing_Date: existingRecord.Final_Filing_Date || '',
        Final_Filing_DOI_Date: existingRecord.Final_Filing_DOI_Date || '',
        Final_Filing_status: existingRecord.Final_Filing_status || '',
        Board_Resolution_name: existingRecord.Board_Resolution_name || '',
        Board_Resolution_Date: existingRecord.Board_Resolution_Date || '',
        Board_Resolution_status: existingRecord.Board_Resolution_status || '',
        Board_Resolution_File_Upload: existingRecord.Board_Resolution_File_Upload || [],
        Share_Certificate_name: existingRecord.Share_Certificate_name || '',
        Share_Certificate_Date: existingRecord.Share_Certificate_Date || '',
        Share_Certificate_status: existingRecord.Share_Certificate_status || '',
        Share_Certificate_File_Upload: existingRecord.Share_Certificate_File_Upload || [],
        MSME_Certificate: existingRecord.MSME_Certificate || '',
        MSME_Certificate_Date: existingRecord.MSME_Certificate_Date || '',
        MSME_Certificate_status: existingRecord.MSME_Certificate_status || '',
        MSME_Certificate_File_Upload: existingRecord.MSME_Certificate_File_Upload || [],
        ADT_1_name: existingRecord.ADT_1_name || '',
        ADT_1_Auditor_name: existingRecord.ADT_1_Auditor_name || '',
        ADT_1_date: existingRecord.ADT_1_date || '',
        ADT_1_status: existingRecord.ADT_1_status || '',
        ADT_1_File_Upload: existingRecord.ADT_1_File_Upload || [],
        INC_20_A_name: existingRecord.INC_20_A_name || '',
        INC_20_A_Date: existingRecord.INC_20_A_Date || '',
        INC_20_A_status: existingRecord.INC_20_A_status || '',
        INC_20_A_File_Upload: existingRecord.INC_20_A_File_Upload || [],
        Finance_Projected_Financials_name: existingRecord.Finance_Projected_Financials_name || '',
        Finance_Projected_Financials_Date: existingRecord.Finance_Projected_Financials_Date || '',
        Finance_Projected_Financials_Status: existingRecord.Finance_Projected_Financials_Status || '',
        Finance_Projected_Financials_File_Upload: existingRecord.Finance_Projected_Financials_File_Upload || [],
        Application_submission_name: existingRecord.Application_submission_name || '',
        Application_submission_Submission_Date: existingRecord.Application_submission_Submission_Date || '',
        Application_submission_status: existingRecord.Application_submission_status || '',
        Application_submission_File_Upload: existingRecord.Application_submission_File_Upload || [],
        Application_submission: existingRecord.Application_submission || '',
        Application_submission_Portal_User_ID: existingRecord.Application_submission_Portal_User_ID || '',
        Application_submission_Portal_Password: existingRecord.Application_submission_Portal_Password || '',
        Director_ITR_Doc_collection: existingRecord.Director_ITR_Doc_collection || '',
        Director_ITR_File_required: existingRecord.Director_ITR_File_required || '',
        Director_ITR_Company_ITR_name: existingRecord.Director_ITR_Company_ITR_name || '',
        Director_ITR_Company_ITR_Date: existingRecord.Director_ITR_Company_ITR_Date || '',
        Director_ITR_Company_ITR_status: existingRecord.Director_ITR_Company_ITR_status || '',
        Director_ITR_Company_ITR_File_Upload: existingRecord.Director_ITR_Company_ITR_File_Upload || [],
        AOC_4_name: existingRecord.AOC_4_name || '',
        AOC_4_Director_Audit_report: existingRecord.AOC_4_Director_Audit_report || '',
        DPR_Pitch_deck_creation_name: existingRecord.DPR_Pitch_deck_creation_name || '',
        DPR_Pitch_deck_creation_Date: existingRecord.DPR_Pitch_deck_creation_Date || '',
        DPR_Pitch_deck_creation_status: existingRecord.DPR_Pitch_deck_creation_status || '',
        DPR_Pitch_deck_creation_File_Upload: existingRecord.DPR_Pitch_deck_creation_File_Upload || [],
        Team_Leader_TL: existingRecord.Team_Leader_TL || (existingRecord.Team_Leader?.id ? { id: existingRecord.Team_Leader.id, name: existingRecord.Team_Leader.name } : null),
        Team_Member_TM: existingRecord.Team_Member_TM || (existingRecord.Team_Member?.id ? { id: existingRecord.Team_Member.id, name: existingRecord.Team_Member.name } : null),
        Modified_Time: nowIso
      };

      resultingDealRecords.push(updatedRecord);
      updated.push(updatedRecord);
    } else {
      // Create new child record with default stage and common fields
      const newRecord: InternalOperationRecord = {
        id: `IO-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
        Deal_ID: dealId,
        Deal_Name: dealName,
        zohoDealId: dealZohoId || undefined,
        Parent_Record_Deal: dealZohoId ? { id: dealZohoId, name: dealName } : { id: dealId, name: dealName },
        Client_Name: clientName,
        Company_Name: companyName,
        Service_Scheme: serviceScheme,
        Name: serviceScheme,
        Internal_Team_Type: rawTeamType,
        Team_Type: rawTeamType,
        Types_of_Legal_Documents: typesOfLegalDocs,
        Agreement_Terms: agreementTerms,
        Remark: remark,
        Internal_Legal_Status: internalLegalStatus,
        Tenure_of_Service: tenure,
        Subform_Row_ID: subformRowId,
        Stage: getOperationStagesForTeamType(rawTeamType)[0] || 'Document pending from client',
        Operation_Stage: getOperationStagesForTeamType(rawTeamType)[0] || 'Document pending from client',
        CA_CS1: '',
        CA_CS2: '',
        After_Allocation: 'No',
        After_Allocation_Workflow: 'No',
        Company_Type: 'PVT LTD',
        Doc_collection_name: '',
        Doc_collection_Date: '',
        Doc_collection_status: 'Pending',
        Doc_collection_File_Upload: [],
        Name_Application_name: '',
        Name_Application_approved_name: '',
        Name_Application_date: '',
        Name_Application_status: 'In-process',
        Name_Application_File_Upload: [],
        DSC_Creation_name: '',
        DSC_Creation_Date: '',
        DSC_Creation_status: 'In process',
        Final_Filing_name: '',
        Final_Filing_Final_Approval_Name: '',
        Final_Filing_Date: '',
        Final_Filing_DOI_Date: '',
        Final_Filing_status: 'In process',
        Board_Resolution_name: '',
        Board_Resolution_Date: '',
        Board_Resolution_status: 'In process',
        Board_Resolution_File_Upload: [],
        Share_Certificate_name: '',
        Share_Certificate_Date: '',
        Share_Certificate_status: 'In process',
        Share_Certificate_File_Upload: [],
        MSME_Certificate: '',
        MSME_Certificate_Date: '',
        MSME_Certificate_status: 'In process',
        MSME_Certificate_File_Upload: [],
        ADT_1_name: '',
        ADT_1_Auditor_name: '',
        ADT_1_date: '',
        ADT_1_status: 'In process',
        ADT_1_File_Upload: [],
        INC_20_A_name: '',
        INC_20_A_Date: '',
        INC_20_A_status: 'In process',
        INC_20_A_File_Upload: [],
        Finance_Projected_Financials_name: '',
        Finance_Projected_Financials_Date: '',
        Finance_Projected_Financials_Status: 'In process',
        Finance_Projected_Financials_File_Upload: [],
        Application_submission_name: '',
        Application_submission_Submission_Date: '',
        Application_submission_status: 'In process',
        Application_submission_File_Upload: [],
        Application_submission: '',
        Application_submission_Portal_User_ID: '',
        Application_submission_Portal_Password: '',
        Director_ITR_Doc_collection: 'Pending',
        Director_ITR_File_required: 'Yes',
        Director_ITR_Company_ITR_name: '',
        Director_ITR_Company_ITR_Date: '',
        Director_ITR_Company_ITR_status: 'In process',
        Director_ITR_Company_ITR_File_Upload: [],
        AOC_4_name: '',
        AOC_4_Director_Audit_report: 'Prepared',
        DPR_Pitch_deck_creation_name: '',
        DPR_Pitch_deck_creation_Date: '',
        DPR_Pitch_deck_creation_status: 'In process',
        DPR_Pitch_deck_creation_File_Upload: [],
        Team_Leader: null,
        Team_Leader_ID: '',
        Team_Leader_Name: '',
        Team_Leader_TL: null,
        Team_Member: null,
        Team_Member_ID: '',
        Team_Member_Name: '',
        Team_Member_TM: null,
        Allocation_Status: 'Pending Allocation',
        sectionsData: {},
        Created_Time: nowIso,
        Modified_Time: nowIso
      };

      resultingDealRecords.push(newRecord);
      created.push(newRecord);
    }
  });

  // Preserve any assigned records that weren't matched if they have assignments
  dealRecords.forEach(r => {
    if (!matchedExistingIds.has(r.id) && (r.Team_Leader?.id || r.Team_Member?.id)) {
      resultingDealRecords.push(r);
    }
  });

  const rawFinal = [...otherRecords, ...resultingDealRecords];
  const finalRecords = deduplicateInternalOperations(rawFinal);

  if (created.length > 0 || updated.length > 0) {
    setStoredInternalOperations(finalRecords);

    // Sync in background with backend endpoint if available
    syncAllocationsToBackend(created.length > 0 ? created : updated).catch(e => {
      console.warn('[Internal Operations] Background sync warning:', e);
    });
  }

  return { created, updated, all: finalRecords };
}

export function normalizeFileList(rawFiles: any): any[] {
  if (!rawFiles) return [];
  const list = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
  return list.filter(Boolean).map((f: any) => {
    if (typeof f === 'string') {
      return { id: f, name: f, size: 0, url: f, dataUrl: f };
    }
    return {
      id: f.id || f.File_Id__s || f.fileId || `file_${Math.random().toString(36).substring(2, 7)}`,
      name: f.File_Name__s || f.name || f.fileName || 'document',
      size: Number(f.Size__s || f.size) || 0,
      fileId: f.File_Id__s || f.file_id || f.fileId || f.id,
      type: f.type || 'application/octet-stream',
      dataUrl: f.dataUrl || f.url || '',
      uploadedAt: f.Created_Time__s || f.uploadedAt || new Date().toISOString()
    };
  });
}

/**
 * Normalizes an operation record fetched from Zoho CRM Operation_Internal_CRM module
 * by mapping Doc_collection_* fields to sectionsData (for both Incorporation and Compliance)
 */
export function normalizeInternalOperationFromZoho(r: any): InternalOperationRecord {
  const sectionsData = r.sectionsData ? (typeof r.sectionsData === 'string' ? JSON.parse(r.sectionsData) : { ...r.sectionsData }) : {};

  const docName = r.Doc_collection_name || sectionsData.docCollection?.name || sectionsData.compDocCollection?.name || sectionsData.certDocCollection?.name || '';
  const docDate = r.Doc_collection_Date || sectionsData.docCollection?.date || sectionsData.compDocCollection?.date || sectionsData.certDocCollection?.date || '';
  const docStatus = r.Doc_collection_status || sectionsData.docCollection?.status || sectionsData.compDocCollection?.status || sectionsData.certDocCollection?.status || '';
  const rawDocFiles = r.Doc_collection_File_Upload || sectionsData.docCollection?.files || sectionsData.compDocCollection?.files || sectionsData.certDocCollection?.files || [];
  const docFiles = normalizeFileList(rawDocFiles);

  if (!sectionsData.docCollection) sectionsData.docCollection = {};
  if (docName && !sectionsData.docCollection.name) sectionsData.docCollection.name = docName;
  if (docDate && !sectionsData.docCollection.date) sectionsData.docCollection.date = docDate;
  if (docStatus && !sectionsData.docCollection.status) sectionsData.docCollection.status = docStatus;
  if (docFiles && (!sectionsData.docCollection.files || sectionsData.docCollection.files.length === 0)) {
    sectionsData.docCollection.files = docFiles;
  }

  if (!sectionsData.compDocCollection) sectionsData.compDocCollection = {};
  if (docName && !sectionsData.compDocCollection.name) sectionsData.compDocCollection.name = docName;
  if (docDate && !sectionsData.compDocCollection.date) sectionsData.compDocCollection.date = docDate;
  if (docStatus && !sectionsData.compDocCollection.status) sectionsData.compDocCollection.status = docStatus;
  if (docFiles && (!sectionsData.compDocCollection.files || sectionsData.compDocCollection.files.length === 0)) {
    sectionsData.compDocCollection.files = docFiles;
  }

  if (!sectionsData.certDocCollection) sectionsData.certDocCollection = {};
  if (docName && !sectionsData.certDocCollection.name) sectionsData.certDocCollection.name = docName;
  if (docDate && !sectionsData.certDocCollection.date) sectionsData.certDocCollection.date = docDate;
  if (docStatus && !sectionsData.certDocCollection.status) sectionsData.certDocCollection.status = docStatus;
  if (docFiles && (!sectionsData.certDocCollection.files || sectionsData.certDocCollection.files.length === 0)) {
    sectionsData.certDocCollection.files = docFiles;
  }

  // Map Name Application / Accounting fields
  const nameAppName = r.Name_Application_name || sectionsData.nameApp?.name || sectionsData.accounting?.name || '';
  const nameAppApprovedName = r.Name_Application_approved_name || sectionsData.nameApp?.approvedName || '';
  const nameAppDate = r.Name_Application_date || sectionsData.nameApp?.date || sectionsData.accounting?.date || '';
  const nameAppStatus = r.Name_Application_status || sectionsData.nameApp?.status || sectionsData.accounting?.status || '';
  const nameAppFiles = normalizeFileList(r.Name_Application_File_Upload || sectionsData.nameApp?.files || sectionsData.accounting?.files || []);

  if (!sectionsData.nameApp) sectionsData.nameApp = {};
  if (nameAppName && !sectionsData.nameApp.name) sectionsData.nameApp.name = nameAppName;
  if (nameAppApprovedName && !sectionsData.nameApp.approvedName) sectionsData.nameApp.approvedName = nameAppApprovedName;
  if (nameAppDate && !sectionsData.nameApp.date) sectionsData.nameApp.date = nameAppDate;
  if (nameAppStatus && !sectionsData.nameApp.status) sectionsData.nameApp.status = nameAppStatus;
  if (nameAppFiles && (!sectionsData.nameApp.files || sectionsData.nameApp.files.length === 0)) {
    sectionsData.nameApp.files = nameAppFiles;
  }

  if (!sectionsData.accounting) sectionsData.accounting = {};
  if (nameAppName && !sectionsData.accounting.name) sectionsData.accounting.name = nameAppName;
  if (nameAppDate && !sectionsData.accounting.date) sectionsData.accounting.date = nameAppDate;
  if (nameAppStatus && !sectionsData.accounting.status) sectionsData.accounting.status = nameAppStatus;
  if (nameAppFiles && (!sectionsData.accounting.files || sectionsData.accounting.files.length === 0)) {
    sectionsData.accounting.files = nameAppFiles;
  }

  // Map DSC Creation fields
  const dscName = r.DSC_Creation_name || sectionsData.dscCreation?.name || '';
  const dscDate = r.DSC_Creation_Date || sectionsData.dscCreation?.date || '';
  const dscStatus = r.DSC_Creation_status || sectionsData.dscCreation?.status || '';

  if (!sectionsData.dscCreation) sectionsData.dscCreation = {};
  if (dscName && !sectionsData.dscCreation.name) sectionsData.dscCreation.name = dscName;
  if (dscDate && !sectionsData.dscCreation.date) sectionsData.dscCreation.date = dscDate;
  if (dscStatus && !sectionsData.dscCreation.status) sectionsData.dscCreation.status = dscStatus;

  // Map Final Filing fields
  const finalFilingName = r.Final_Filing_name || sectionsData.finalFiling?.name || '';
  const finalFilingApprovalName = r.Final_Filing_Final_Approval_Name || sectionsData.finalFiling?.finalApprovalName || '';
  const finalFilingDate = r.Final_Filing_Date || sectionsData.finalFiling?.date || '';
  const finalFilingDoiDate = r.Final_Filing_DOI_Date || sectionsData.finalFiling?.doiDate || '';
  const finalFilingStatus = r.Final_Filing_status || sectionsData.finalFiling?.status || '';

  if (!sectionsData.finalFiling) sectionsData.finalFiling = {};
  if (finalFilingName && !sectionsData.finalFiling.name) sectionsData.finalFiling.name = finalFilingName;
  if (finalFilingApprovalName && !sectionsData.finalFiling.finalApprovalName) sectionsData.finalFiling.finalApprovalName = finalFilingApprovalName;
  if (finalFilingDate && !sectionsData.finalFiling.date) sectionsData.finalFiling.date = finalFilingDate;
  if (finalFilingDoiDate && !sectionsData.finalFiling.doiDate) sectionsData.finalFiling.doiDate = finalFilingDoiDate;
  if (finalFilingStatus && !sectionsData.finalFiling.status) sectionsData.finalFiling.status = finalFilingStatus;

  // Map Board Resolution / Audit fields
  const brName = r.Board_Resolution_name || sectionsData.boardResolution?.name || sectionsData.audit?.name || '';
  const brDate = r.Board_Resolution_Date || sectionsData.boardResolution?.date || sectionsData.audit?.date || '';
  const brStatus = r.Board_Resolution_status || sectionsData.boardResolution?.status || sectionsData.audit?.status || '';
  const brFiles = normalizeFileList(r.Board_Resolution_File_Upload || sectionsData.boardResolution?.files || sectionsData.audit?.files || []);

  if (!sectionsData.boardResolution) sectionsData.boardResolution = {};
  if (brName && !sectionsData.boardResolution.name) sectionsData.boardResolution.name = brName;
  if (brDate && !sectionsData.boardResolution.date) sectionsData.boardResolution.date = brDate;
  if (brStatus && !sectionsData.boardResolution.status) sectionsData.boardResolution.status = brStatus;
  if (brFiles && (!sectionsData.boardResolution.files || sectionsData.boardResolution.files.length === 0)) {
    sectionsData.boardResolution.files = brFiles;
  }

  if (!sectionsData.audit) sectionsData.audit = {};
  if (brName && !sectionsData.audit.name) sectionsData.audit.name = brName;
  if (brDate && !sectionsData.audit.date) sectionsData.audit.date = brDate;
  if (brStatus && !sectionsData.audit.status) sectionsData.audit.status = brStatus;
  if (brFiles && (!sectionsData.audit.files || sectionsData.audit.files.length === 0)) {
    sectionsData.audit.files = brFiles;
  }

  // Map 2-Share Certificate / MGT-7 / 7A fields
  const scName = r.Share_Certificate_name || sectionsData.shareCertificate?.name || sectionsData.mgt7?.name || '';
  const scDate = r.Share_Certificate_Date || sectionsData.shareCertificate?.date || sectionsData.mgt7?.date || '';
  const scStatus = r.Share_Certificate_status || sectionsData.shareCertificate?.status || sectionsData.mgt7?.status || '';
  const scFiles = normalizeFileList(r.Share_Certificate_File_Upload || sectionsData.shareCertificate?.files || sectionsData.mgt7?.files || []);

  if (!sectionsData.shareCertificate) sectionsData.shareCertificate = {};
  if (scName && !sectionsData.shareCertificate.name) sectionsData.shareCertificate.name = scName;
  if (scDate && !sectionsData.shareCertificate.date) sectionsData.shareCertificate.date = scDate;
  if (scStatus && !sectionsData.shareCertificate.status) sectionsData.shareCertificate.status = scStatus;
  if (scFiles && (!sectionsData.shareCertificate.files || sectionsData.shareCertificate.files.length === 0)) {
    sectionsData.shareCertificate.files = scFiles;
  }

  if (!sectionsData.mgt7) sectionsData.mgt7 = {};
  if (scName && !sectionsData.mgt7.name) sectionsData.mgt7.name = scName;
  if (scDate && !sectionsData.mgt7.date) sectionsData.mgt7.date = scDate;
  if (scStatus && !sectionsData.mgt7.status) sectionsData.mgt7.status = scStatus;
  if (scFiles && (!sectionsData.mgt7.files || sectionsData.mgt7.files.length === 0)) {
    sectionsData.mgt7.files = scFiles;
  }

  // Map MSME Certificate fields
  const msmeDate = r.MSME_Certificate_Date || sectionsData.msmeCertificate?.date || sectionsData.msmeCertificateLlp?.date || '';
  const msmeStatus = r.MSME_Certificate_status || sectionsData.msmeCertificate?.status || sectionsData.msmeCertificateLlp?.status || '';
  const msmeFileVal = r.MSME_Certificate || sectionsData.msmeCertificate?.fileUpload || sectionsData.msmeCertificateLlp?.fileUpload || '';
  const msmeFiles = normalizeFileList(r.MSME_Certificate_File_Upload || sectionsData.msmeCertificate?.files || sectionsData.msmeCertificateLlp?.files || (msmeFileVal ? [{ name: msmeFileVal, url: msmeFileVal }] : []));

  if (!sectionsData.msmeCertificate) sectionsData.msmeCertificate = {};
  if (msmeDate && !sectionsData.msmeCertificate.date) sectionsData.msmeCertificate.date = msmeDate;
  if (msmeStatus && !sectionsData.msmeCertificate.status) sectionsData.msmeCertificate.status = msmeStatus;
  if (msmeFiles && (!sectionsData.msmeCertificate.files || sectionsData.msmeCertificate.files.length === 0)) {
    sectionsData.msmeCertificate.files = msmeFiles;
  }

  if (!sectionsData.msmeCertificateLlp) sectionsData.msmeCertificateLlp = {};
  if (msmeDate && !sectionsData.msmeCertificateLlp.date) sectionsData.msmeCertificateLlp.date = msmeDate;
  if (msmeStatus && !sectionsData.msmeCertificateLlp.status) sectionsData.msmeCertificateLlp.status = msmeStatus;
  if (msmeFiles && (!sectionsData.msmeCertificateLlp.files || sectionsData.msmeCertificateLlp.files.length === 0)) {
    sectionsData.msmeCertificateLlp.files = msmeFiles;
  }

  // Map AOC-4 fields
  const aoc4Name = r.AOC_4_name || sectionsData.aoc4?.name || '';
  const aoc4DirectorAudit = r.AOC_4_Director_Audit_report || sectionsData.aoc4?.directorAuditReport || '';

  if (!sectionsData.aoc4) sectionsData.aoc4 = {};
  if (aoc4Name && !sectionsData.aoc4.name) sectionsData.aoc4.name = aoc4Name;
  if (aoc4DirectorAudit && !sectionsData.aoc4.directorAuditReport) sectionsData.aoc4.directorAuditReport = aoc4DirectorAudit;
  if (msmeDate && !sectionsData.aoc4.date) sectionsData.aoc4.date = msmeDate;
  if (msmeStatus && !sectionsData.aoc4.status) sectionsData.aoc4.status = msmeStatus;
  if (msmeFiles && (!sectionsData.aoc4.files || sectionsData.aoc4.files.length === 0)) {
    sectionsData.aoc4.files = msmeFiles;
  }

  // Map DPR / Pitch deck creation / INC fields
  const dprName = r.DPR_Pitch_deck_creation_name || sectionsData.dprCreation?.name || sectionsData.compInc?.name || sectionsData.inc?.name || '';
  const dprDate = r.DPR_Pitch_deck_creation_Date || sectionsData.dprCreation?.date || sectionsData.compInc?.date || sectionsData.inc?.date || '';
  const dprStatus = r.DPR_Pitch_deck_creation_status || sectionsData.dprCreation?.status || sectionsData.compInc?.status || sectionsData.inc?.status || '';
  const dprFiles = normalizeFileList(r.DPR_Pitch_deck_creation_File_Upload || r.DPR_Pitch_deck_creation_File_U || sectionsData.dprCreation?.files || sectionsData.compInc?.files || sectionsData.inc?.files || []);

  if (!sectionsData.dprCreation) sectionsData.dprCreation = {};
  if (dprName && !sectionsData.dprCreation.name) sectionsData.dprCreation.name = dprName;
  if (dprDate && !sectionsData.dprCreation.date) sectionsData.dprCreation.date = dprDate;
  if (dprStatus && !sectionsData.dprCreation.status) sectionsData.dprCreation.status = dprStatus;
  if (dprFiles && (!sectionsData.dprCreation.files || sectionsData.dprCreation.files.length === 0)) {
    sectionsData.dprCreation.files = dprFiles;
  }

  if (!sectionsData.compInc) sectionsData.compInc = {};
  if (dprName && !sectionsData.compInc.name) sectionsData.compInc.name = dprName;
  if (dprDate && !sectionsData.compInc.date) sectionsData.compInc.date = dprDate;
  if (dprStatus && !sectionsData.compInc.status) sectionsData.compInc.status = dprStatus;
  if (dprFiles && (!sectionsData.compInc.files || sectionsData.compInc.files.length === 0)) {
    sectionsData.compInc.files = dprFiles;
  }

  if (!sectionsData.inc) sectionsData.inc = {};
  if (dprName && !sectionsData.inc.name) sectionsData.inc.name = dprName;
  if (dprDate && !sectionsData.inc.date) sectionsData.inc.date = dprDate;
  if (dprStatus && !sectionsData.inc.status) sectionsData.inc.status = dprStatus;
  if (dprFiles && (!sectionsData.inc.files || sectionsData.inc.files.length === 0)) {
    sectionsData.inc.files = dprFiles;
  }

  // Map ADT-1 fields
  const adt1Name = r.ADT_1_name || sectionsData.adt1?.name || sectionsData.compAdt1?.name || '';
  const adt1Auditor = r.ADT_1_Auditor_name || sectionsData.adt1?.auditorName || '';
  const adt1Date = r.ADT_1_date || sectionsData.adt1?.date || sectionsData.compAdt1?.date || '';
  const adt1Status = r.ADT_1_status || sectionsData.adt1?.status || sectionsData.compAdt1?.status || '';
  const adt1Files = normalizeFileList(r.ADT_1_File_Upload || sectionsData.adt1?.files || sectionsData.compAdt1?.files || []);

  if (!sectionsData.adt1) sectionsData.adt1 = {};
  if (adt1Name && !sectionsData.adt1.name) sectionsData.adt1.name = adt1Name;
  if (adt1Auditor && !sectionsData.adt1.auditorName) sectionsData.adt1.auditorName = adt1Auditor;
  if (adt1Date && !sectionsData.adt1.date) sectionsData.adt1.date = adt1Date;
  if (adt1Status && !sectionsData.adt1.status) sectionsData.adt1.status = adt1Status;
  if (adt1Files && (!sectionsData.adt1.files || sectionsData.adt1.files.length === 0)) {
    sectionsData.adt1.files = adt1Files;
  }

  if (!sectionsData.compAdt1) sectionsData.compAdt1 = {};
  if (adt1Name && !sectionsData.compAdt1.name) sectionsData.compAdt1.name = adt1Name;
  if (adt1Date && !sectionsData.compAdt1.date) sectionsData.compAdt1.date = adt1Date;
  if (adt1Status && !sectionsData.compAdt1.status) sectionsData.compAdt1.status = adt1Status;
  if (adt1Files && (!sectionsData.compAdt1.files || sectionsData.compAdt1.files.length === 0)) {
    sectionsData.compAdt1.files = adt1Files;
  }

  // Map INC 20-A / DPT 3 fields
  const inc20AName = r.INC_20_A_name || sectionsData.inc20A?.name || sectionsData.dpt3?.name || '';
  const inc20ADate = r.INC_20_A_Date || sectionsData.inc20A?.date || sectionsData.dpt3?.date || '';
  const inc20AStatus = r.INC_20_A_status || sectionsData.inc20A?.status || sectionsData.dpt3?.status || '';
  const inc20AFiles = normalizeFileList(r.INC_20_A_File_Upload || sectionsData.inc20A?.files || sectionsData.dpt3?.files || []);

  if (!sectionsData.inc20A) sectionsData.inc20A = {};
  if (inc20AName && !sectionsData.inc20A.name) sectionsData.inc20A.name = inc20AName;
  if (inc20ADate && !sectionsData.inc20A.date) sectionsData.inc20A.date = inc20ADate;
  if (inc20AStatus && !sectionsData.inc20A.status) sectionsData.inc20A.status = inc20AStatus;
  if (inc20AFiles && (!sectionsData.inc20A.files || sectionsData.inc20A.files.length === 0)) {
    sectionsData.inc20A.files = inc20AFiles;
  }

  if (!sectionsData.dpt3) sectionsData.dpt3 = {};
  if (inc20AName && !sectionsData.dpt3.name) sectionsData.dpt3.name = inc20AName;
  if (inc20ADate && !sectionsData.dpt3.date) sectionsData.dpt3.date = inc20ADate;
  if (inc20AStatus && !sectionsData.dpt3.status) sectionsData.dpt3.status = inc20AStatus;
  if (inc20AFiles && (!sectionsData.dpt3.files || sectionsData.dpt3.files.length === 0)) {
    sectionsData.dpt3.files = inc20AFiles;
  }

  // Map Form 3 (Finance / Projected Financials) fields
  const form3Name = r.Finance_Projected_Financials_name || sectionsData.form3?.name || sectionsData.compForm3?.name || sectionsData.fundingFinance?.name || '';
  const form3Date = r.Finance_Projected_Financials_Date || sectionsData.form3?.date || sectionsData.compForm3?.date || sectionsData.fundingFinance?.date || '';
  const form3Status = r.Finance_Projected_Financials_Status || sectionsData.form3?.status || sectionsData.compForm3?.status || sectionsData.fundingFinance?.status || '';
  const form3Files = normalizeFileList(r.Finance_Projected_Financials_File_Upload || sectionsData.form3?.files || sectionsData.compForm3?.files || sectionsData.fundingFinance?.files || []);

  if (!sectionsData.form3) sectionsData.form3 = {};
  if (form3Name && !sectionsData.form3.name) sectionsData.form3.name = form3Name;
  if (form3Date && !sectionsData.form3.date) sectionsData.form3.date = form3Date;
  if (form3Status && !sectionsData.form3.status) sectionsData.form3.status = form3Status;
  if (form3Files && (!sectionsData.form3.files || sectionsData.form3.files.length === 0)) {
    sectionsData.form3.files = form3Files;
  }

  if (!sectionsData.compForm3) sectionsData.compForm3 = {};
  if (form3Name && !sectionsData.compForm3.name) sectionsData.compForm3.name = form3Name;
  if (form3Date && !sectionsData.compForm3.date) sectionsData.compForm3.date = form3Date;
  if (form3Status && !sectionsData.compForm3.status) sectionsData.compForm3.status = form3Status;
  if (form3Files && (!sectionsData.compForm3.files || sectionsData.compForm3.files.length === 0)) {
    sectionsData.compForm3.files = form3Files;
  }

  if (!sectionsData.fundingFinance) sectionsData.fundingFinance = {};
  if (form3Name && !sectionsData.fundingFinance.name) sectionsData.fundingFinance.name = form3Name;
  if (form3Date && !sectionsData.fundingFinance.date) sectionsData.fundingFinance.date = form3Date;
  if (form3Status && !sectionsData.fundingFinance.status) sectionsData.fundingFinance.status = form3Status;
  if (form3Files && (!sectionsData.fundingFinance.files || sectionsData.fundingFinance.files.length === 0)) {
    sectionsData.fundingFinance.files = form3Files;
  }

  // Map LLP Agreement / Application Submission fields
  const isFundingRec = (r.Internal_Team_Type || '').toLowerCase().includes('funding');
  const isCertificationRec = (r.Internal_Team_Type || '').toLowerCase().includes('certification');
  const certAppObj = sectionsData.certFinalApp || {};
  const appSubObj = sectionsData.appSubmission || {};
  const llpObj = sectionsData.llpAgreement || {};

  const llpName = r.Application_submission_name || (isCertificationRec ? certAppObj.name : isFundingRec ? appSubObj.name : llpObj.name) || certAppObj.name || appSubObj.name || llpObj.name || '';
  const llpDate = r.Application_submission_Submission_Date || (isCertificationRec ? certAppObj.date : isFundingRec ? appSubObj.date : llpObj.date) || certAppObj.date || appSubObj.date || llpObj.date || '';
  const llpStatus = r.Application_submission_status || (isCertificationRec ? certAppObj.status : isFundingRec ? appSubObj.status : llpObj.status) || certAppObj.status || appSubObj.status || llpObj.status || '';
  const llpFiles = normalizeFileList(r.Application_submission_File_Upload || (isCertificationRec ? certAppObj.files : isFundingRec ? appSubObj.files : llpObj.files) || certAppObj.files || appSubObj.files || llpObj.files || []);
  const appSubVal = r.Application_submission || appSubObj.registrationNumber || appSubObj.applicationSubmission || '';
  const appPortalId = r.Application_submission_Portal_User_ID || appSubObj.portalId || '';
  const appPortalPwd = r.Application_submission_Portal_Password || appSubObj.portalPassword || '';

  if (!sectionsData.llpAgreement) sectionsData.llpAgreement = {};
  if (llpName && !sectionsData.llpAgreement.name) sectionsData.llpAgreement.name = llpName;
  if (llpDate && !sectionsData.llpAgreement.date) sectionsData.llpAgreement.date = llpDate;
  if (llpStatus && !sectionsData.llpAgreement.status) sectionsData.llpAgreement.status = llpStatus;
  if (llpFiles && (!sectionsData.llpAgreement.files || sectionsData.llpAgreement.files.length === 0)) {
    sectionsData.llpAgreement.files = llpFiles;
  }

  if (!sectionsData.appSubmission) sectionsData.appSubmission = {};
  if (llpName && !sectionsData.appSubmission.name) sectionsData.appSubmission.name = llpName;
  if (llpDate && !sectionsData.appSubmission.date) sectionsData.appSubmission.date = llpDate;
  if (llpStatus && !sectionsData.appSubmission.status) sectionsData.appSubmission.status = llpStatus;
  if (llpFiles && (!sectionsData.appSubmission.files || sectionsData.appSubmission.files.length === 0)) {
    sectionsData.appSubmission.files = llpFiles;
  }
  if (appSubVal && !sectionsData.appSubmission.registrationNumber) sectionsData.appSubmission.registrationNumber = appSubVal;
  if (appPortalId && !sectionsData.appSubmission.portalId) sectionsData.appSubmission.portalId = appPortalId;
  if (appPortalPwd && !sectionsData.appSubmission.portalPassword) sectionsData.appSubmission.portalPassword = appPortalPwd;

  if (!sectionsData.certFinalApp) sectionsData.certFinalApp = {};
  if (llpName && !sectionsData.certFinalApp.name) sectionsData.certFinalApp.name = llpName;
  if (llpDate && !sectionsData.certFinalApp.date) sectionsData.certFinalApp.date = llpDate;
  if (llpStatus && !sectionsData.certFinalApp.status) sectionsData.certFinalApp.status = llpStatus;
  if (llpFiles && (!sectionsData.certFinalApp.files || sectionsData.certFinalApp.files.length === 0)) {
    sectionsData.certFinalApp.files = llpFiles;
  }

  // Map Director ITR & Company ITR fields
  const isCompanyItrService = (r.Service_Scheme || '').toLowerCase().includes('company itr');
  const itrName = r.Director_ITR_Company_ITR_name || (isCompanyItrService ? sectionsData.companyItr?.name : sectionsData.directorItr?.name) || sectionsData.directorItr?.name || sectionsData.companyItr?.name || '';
  const itrDate = r.Director_ITR_Company_ITR_Date || (isCompanyItrService ? sectionsData.companyItr?.date : sectionsData.directorItr?.date) || sectionsData.directorItr?.date || sectionsData.companyItr?.date || '';
  const itrStatus = r.Director_ITR_Company_ITR_status || (isCompanyItrService ? sectionsData.companyItr?.status : sectionsData.directorItr?.status) || sectionsData.directorItr?.status || sectionsData.companyItr?.status || '';
  const itrFiles = normalizeFileList(r.Director_ITR_Company_ITR_File_Upload || (isCompanyItrService ? sectionsData.companyItr?.files : sectionsData.directorItr?.files) || sectionsData.directorItr?.files || sectionsData.companyItr?.files || []);
  const itrDocCollection = r.Director_ITR_Doc_collection || sectionsData.directorItr?.docCollection || '';
  const itrFileRequired = r.Director_ITR_File_required || sectionsData.directorItr?.fileRequired || '';

  if (!sectionsData.directorItr) sectionsData.directorItr = {};
  if (itrName && !sectionsData.directorItr.name) sectionsData.directorItr.name = itrName;
  if (itrDate && !sectionsData.directorItr.date) sectionsData.directorItr.date = itrDate;
  if (itrStatus && !sectionsData.directorItr.status) sectionsData.directorItr.status = itrStatus;
  if (itrFiles && (!sectionsData.directorItr.files || sectionsData.directorItr.files.length === 0)) {
    sectionsData.directorItr.files = itrFiles;
  }
  if (itrDocCollection && !sectionsData.directorItr.docCollection) sectionsData.directorItr.docCollection = itrDocCollection;
  if (itrFileRequired && !sectionsData.directorItr.fileRequired) sectionsData.directorItr.fileRequired = itrFileRequired;

  if (!sectionsData.companyItr) sectionsData.companyItr = {};
  if (itrName && !sectionsData.companyItr.name) sectionsData.companyItr.name = itrName;
  if (itrDate && !sectionsData.companyItr.date) sectionsData.companyItr.date = itrDate;
  if (itrStatus && !sectionsData.companyItr.status) sectionsData.companyItr.status = itrStatus;
  if (itrFiles && (!sectionsData.companyItr.files || sectionsData.companyItr.files.length === 0)) {
    sectionsData.companyItr.files = itrFiles;
  }

  // Map After Allocation Workflow
  const afterAllocation = r.After_Allocation_Workflow || r.After_Allocation || sectionsData.afterAllocation || 'No';
  sectionsData.afterAllocation = afterAllocation;

  // Map Core Zoho CRM Fields (Module: Operation_Internal_CRM)
  const dealId = r.Parent_Record_Deal?.id || (typeof r.Parent_Record_Deal === 'string' ? r.Parent_Record_Deal : '') || (r.Deal_ID?.id || (typeof r.Deal_ID === 'string' ? r.Deal_ID : '')) || '';
  const dealName = r.Parent_Record_Deal?.name || (typeof r.Parent_Record_Deal === 'object' && r.Parent_Record_Deal?.lookup_label ? r.Parent_Record_Deal.lookup_label : '') || r.Deal_Name || '';
  const serviceName = r.Name || r.Service_Scheme || '';
  const teamType = r.Team_Type || r.Internal_Team_Type || '';
  const opStage = r.Operation_Stage || r.Stage || 'Document pending from client';

  // Extract TL (Lookup to Employees module: Team_Leader_TL)
  const rawTl = r.Team_Leader_TL || r.Team_Leader;
  const tlId = rawTl?.id || (typeof rawTl === 'string' ? rawTl : '') || r.Team_Leader_ID || '';
  const tlName = rawTl?.name || (typeof rawTl === 'object' && rawTl?.lookup_label ? rawTl.lookup_label : '') || r.Team_Leader_Name || '';
  const tlUser = (tlId || tlName) ? { id: tlId, name: tlName, email: rawTl?.email, empId: tlId } : null;

  // Extract TM (Lookup to Employees module: Team_Member_TM)
  const isDealName = (n: any) => {
    const s = String(n || '');
    return s.includes('(DL-') || s.includes(' - FORM') || s.includes('PRIVATE LIMITED') || s.includes('PVT LTD') || s.includes('LLP');
  };

  const rawTmCandidate = r.Team_Member_TM;
  const isRawTmDeal = isDealName(rawTmCandidate?.name || rawTmCandidate?.lookup_label);
  const rawTm = (!isRawTmDeal && rawTmCandidate) ? rawTmCandidate : r.Team_Member;
  const tmId = rawTm?.id || (typeof rawTm === 'string' ? rawTm : '') || r.Team_Member_ID || '';
  const tmName = rawTm?.name || (typeof rawTm === 'object' && rawTm?.lookup_label ? rawTm.lookup_label : '') || r.Team_Member_Name || '';
  const tmUser = (tmId || tmName) && !isDealName(tmName) ? { id: tmId, name: tmName, email: rawTm?.email, empId: tmId } : (r.Team_Member && !isDealName(r.Team_Member.name) ? r.Team_Member : null);

  return {
    ...r,
    Deal_ID: dealId || r.Deal_ID,
    Deal_Name: dealName || r.Deal_Name,
    Parent_Record_Deal: r.Parent_Record_Deal || (dealId ? { id: dealId, name: dealName } : undefined),
    Service_Scheme: serviceName || r.Service_Scheme,
    Name: serviceName || r.Name,
    Internal_Team_Type: teamType || r.Internal_Team_Type,
    Team_Type: teamType || r.Team_Type,
    Stage: (opStage || r.Stage) as any,
    Operation_Stage: opStage || r.Operation_Stage,
    Team_Leader: tlUser || r.Team_Leader || null,
    Team_Leader_ID: tlId || r.Team_Leader_ID || '',
    Team_Leader_Name: tlName || r.Team_Leader_Name || '',
    Team_Leader_TL: r.Team_Leader_TL || (tlId ? { id: tlId, name: tlName } : (tlName ? { id: '', name: tlName } : null)),
    Team_Member: tmUser || (r.Team_Member && !isDealName(r.Team_Member.name) ? r.Team_Member : null),
    Team_Member_ID: tmUser?.id || (!isDealName(r.Team_Member_Name) ? r.Team_Member_ID : '') || '',
    Team_Member_Name: tmUser?.name || (!isDealName(r.Team_Member_Name) ? r.Team_Member_Name : '') || '',
    Team_Member_TM: tmUser ? { id: tmUser.id, name: tmUser.name } : null,
    After_Allocation: afterAllocation,
    After_Allocation_Workflow: afterAllocation,
    Doc_collection_name: docName,
    Doc_collection_Date: docDate,
    Doc_collection_status: docStatus,
    Doc_collection_File_Upload: docFiles,
    Name_Application_name: nameAppName,
    Name_Application_approved_name: nameAppApprovedName,
    Name_Application_date: nameAppDate,
    Name_Application_status: nameAppStatus,
    Name_Application_File_Upload: nameAppFiles,
    DSC_Creation_name: dscName,
    DSC_Creation_Date: dscDate,
    DSC_Creation_status: dscStatus,
    Final_Filing_name: finalFilingName,
    Final_Filing_Final_Approval_Name: finalFilingApprovalName,
    Final_Filing_Date: finalFilingDate,
    Final_Filing_DOI_Date: finalFilingDoiDate,
    Final_Filing_status: finalFilingStatus,
    Board_Resolution_name: brName,
    Board_Resolution_Date: brDate,
    Board_Resolution_status: brStatus,
    Board_Resolution_File_Upload: brFiles,
    Share_Certificate_name: scName,
    Share_Certificate_Date: scDate,
    Share_Certificate_status: scStatus,
    Share_Certificate_File_Upload: scFiles,
    MSME_Certificate: msmeFileVal,
    MSME_Certificate_Date: msmeDate,
    MSME_Certificate_status: msmeStatus,
    MSME_Certificate_File_Upload: msmeFiles,
    ADT_1_name: adt1Name,
    ADT_1_Auditor_name: adt1Auditor,
    ADT_1_date: adt1Date,
    ADT_1_status: adt1Status,
    ADT_1_File_Upload: adt1Files,
    INC_20_A_name: inc20AName,
    INC_20_A_Date: inc20ADate,
    INC_20_A_status: inc20AStatus,
    INC_20_A_File_Upload: inc20AFiles,
    Finance_Projected_Financials_name: form3Name,
    Finance_Projected_Financials_Date: form3Date,
    Finance_Projected_Financials_Status: form3Status,
    Finance_Projected_Financials_File_Upload: form3Files,
    Application_submission_name: llpName,
    Application_submission_Submission_Date: llpDate,
    Application_submission_status: llpStatus,
    Application_submission_File_Upload: llpFiles,
    Application_submission: appSubVal,
    Application_submission_Portal_User_ID: appPortalId,
    Application_submission_Portal_Password: appPortalPwd,
    Director_ITR_Doc_collection: itrDocCollection,
    Director_ITR_File_required: itrFileRequired,
    Director_ITR_Company_ITR_name: itrName,
    Director_ITR_Company_ITR_Date: itrDate,
    Director_ITR_Company_ITR_status: itrStatus,
    Director_ITR_Company_ITR_File_Upload: itrFiles,
    AOC_4_name: aoc4Name,
    AOC_4_Director_Audit_report: aoc4DirectorAudit,
    DPR_Pitch_deck_creation_name: dprName,
    DPR_Pitch_deck_creation_Date: dprDate,
    DPR_Pitch_deck_creation_status: dprStatus,
    DPR_Pitch_deck_creation_File_Upload: dprFiles,
    sectionsData
  };
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
        // Dual-layer defense: strictly filter internal operations by October 2026 Created_Time
        const octStart = new Date('2026-10-01T00:00:00+05:30').getTime();
        const octFilteredData = data.data.filter((r: any) => {
          const ct = r.Created_Time || r.created_time || r.CreatedTime;
          if (!ct) return true;
          const ms = new Date(ct).getTime();
          return !isNaN(ms) ? ms >= octStart : true;
        });
        // Deduplicate and merge server records with local storage records
        const serverNormalized = octFilteredData.map(normalizeInternalOperationFromZoho);
        records = deduplicateInternalOperations([...serverNormalized, ...records]);
        setStoredInternalOperations(records);
      }
    }
  } catch (err) {
    // If backend endpoint is unreachable, fallback to localStorage gracefully
  }

  if (options?.dealId) {
    const dId = String(options.dealId).trim().toLowerCase();
    return records.filter(r => {
      const recDealId = String(r.Deal_ID || (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) || '').trim().toLowerCase();
      return recDealId === dId;
    });
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

  // Extract Doc Collection fields for Zoho CRM Operation_Internal_CRM mapping
  const isCompliance = (record.Internal_Team_Type || '').toLowerCase().includes('compliance');
  const isCertification = (record.Internal_Team_Type || '').toLowerCase().includes('certification');
  const activeDoc = isCertification
    ? record.sectionsData?.certDocCollection
    : (isCompliance ? record.sectionsData?.compDocCollection : record.sectionsData?.docCollection);
  const fallbackDoc = isCertification
    ? (record.sectionsData?.compDocCollection || record.sectionsData?.docCollection)
    : (isCompliance ? record.sectionsData?.docCollection : record.sectionsData?.compDocCollection);

  const docName = record.Doc_collection_name || activeDoc?.name || fallbackDoc?.name || '';
  const docDate = record.Doc_collection_Date || activeDoc?.date || fallbackDoc?.date || '';
  const docStatus = record.Doc_collection_status || activeDoc?.status || fallbackDoc?.status || '';
  const docFiles = (record.Doc_collection_File_Upload && record.Doc_collection_File_Upload.length > 0)
    ? record.Doc_collection_File_Upload
    : (activeDoc?.files || fallbackDoc?.files || []);

  // Extract Name Application / Accounting fields for Zoho CRM Operation_Internal_CRM mapping
  const activeNameApp = isCompliance ? record.sectionsData?.accounting : record.sectionsData?.nameApp;
  const fallbackNameApp = isCompliance ? record.sectionsData?.nameApp : record.sectionsData?.accounting;

  const nameAppName = record.Name_Application_name || activeNameApp?.name || fallbackNameApp?.name || '';
  const nameAppApprovedName = record.Name_Application_approved_name || record.sectionsData?.nameApp?.approvedName || '';
  const nameAppDate = record.Name_Application_date || activeNameApp?.date || fallbackNameApp?.date || '';
  const nameAppStatus = record.Name_Application_status || activeNameApp?.status || fallbackNameApp?.status || '';
  const nameAppFiles = (record.Name_Application_File_Upload && record.Name_Application_File_Upload.length > 0)
    ? record.Name_Application_File_Upload
    : (activeNameApp?.files || fallbackNameApp?.files || []);

  // Extract DSC Creation fields for Zoho CRM Operation_Internal_CRM mapping
  const dscName = record.DSC_Creation_name || record.sectionsData?.dscCreation?.name || '';
  const dscDate = record.DSC_Creation_Date || record.sectionsData?.dscCreation?.date || '';
  const dscStatus = record.DSC_Creation_status || record.sectionsData?.dscCreation?.status || '';

  // Extract Final Filing fields for Zoho CRM Operation_Internal_CRM mapping
  const finalFilingName = record.Final_Filing_name || record.sectionsData?.finalFiling?.name || '';
  const finalFilingApprovalName = record.Final_Filing_Final_Approval_Name || record.sectionsData?.finalFiling?.finalApprovalName || '';
  const finalFilingDate = record.Final_Filing_Date || record.sectionsData?.finalFiling?.date || '';
  const finalFilingDoiDate = record.Final_Filing_DOI_Date || record.sectionsData?.finalFiling?.doiDate || '';
  const finalFilingStatus = record.Final_Filing_status || record.sectionsData?.finalFiling?.status || '';

  // Extract Board Resolution / Audit fields for Zoho CRM Operation_Internal_CRM mapping
  const brName = record.Board_Resolution_name || record.sectionsData?.boardResolution?.name || record.sectionsData?.audit?.name || '';
  const brDate = record.Board_Resolution_Date || record.sectionsData?.boardResolution?.date || record.sectionsData?.audit?.date || '';
  const brStatus = record.Board_Resolution_status || record.sectionsData?.boardResolution?.status || record.sectionsData?.audit?.status || '';
  const brFiles = record.Board_Resolution_File_Upload || record.sectionsData?.boardResolution?.files || record.sectionsData?.audit?.files || [];

  // Extract 2-Share Certificate / MGT-7 / 7A fields for Zoho CRM Operation_Internal_CRM mapping
  const scName = record.Share_Certificate_name || record.sectionsData?.shareCertificate?.name || record.sectionsData?.mgt7?.name || '';
  const scDate = record.Share_Certificate_Date || record.sectionsData?.shareCertificate?.date || record.sectionsData?.mgt7?.date || '';
  const scStatus = record.Share_Certificate_status || record.sectionsData?.shareCertificate?.status || record.sectionsData?.mgt7?.status || '';
  const scFiles = record.Share_Certificate_File_Upload || record.sectionsData?.shareCertificate?.files || record.sectionsData?.mgt7?.files || [];

  // Extract MSME Certificate / AOC-4 fields for Zoho CRM Operation_Internal_CRM mapping
  const activeMsmeAoc4 = isCompliance ? record.sectionsData?.aoc4 : (record.sectionsData?.msmeCertificate || record.sectionsData?.msmeCertificateLlp);
  const fallbackMsmeAoc4 = isCompliance ? (record.sectionsData?.msmeCertificate || record.sectionsData?.msmeCertificateLlp) : record.sectionsData?.aoc4;

  const msmeDate = record.MSME_Certificate_Date || activeMsmeAoc4?.date || fallbackMsmeAoc4?.date || '';
  const msmeStatus = record.MSME_Certificate_status || activeMsmeAoc4?.status || fallbackMsmeAoc4?.status || '';
  const msmeFiles = record.MSME_Certificate_File_Upload || activeMsmeAoc4?.files || fallbackMsmeAoc4?.files || (record.MSME_Certificate ? [{ name: record.MSME_Certificate, url: record.MSME_Certificate }] : []);
  const msmeFileVal = record.MSME_Certificate !== undefined && record.MSME_Certificate !== ''
    ? record.MSME_Certificate
    : (msmeFiles.length > 0 ? (typeof msmeFiles[0] === 'string' ? msmeFiles[0] : (msmeFiles[0]?.url || msmeFiles[0]?.name || '')) : '');

  const aoc4Name = record.AOC_4_name || record.sectionsData?.aoc4?.name || '';
  const aoc4DirectorAudit = record.AOC_4_Director_Audit_report || record.sectionsData?.aoc4?.directorAuditReport || '';

  // Extract ADT-1 fields for Zoho CRM Operation_Internal_CRM mapping
  const adt1Name = record.ADT_1_name || record.sectionsData?.adt1?.name || record.sectionsData?.compAdt1?.name || '';
  const adt1Auditor = record.ADT_1_Auditor_name || record.sectionsData?.adt1?.auditorName || '';
  const adt1Date = record.ADT_1_date || record.sectionsData?.adt1?.date || record.sectionsData?.compAdt1?.date || '';
  const adt1Status = record.ADT_1_status || record.sectionsData?.adt1?.status || record.sectionsData?.compAdt1?.status || '';
  const adt1Files = record.ADT_1_File_Upload || record.sectionsData?.adt1?.files || record.sectionsData?.compAdt1?.files || [];

  // Extract INC 20-A / DPT 3 fields for Zoho CRM Operation_Internal_CRM mapping
  const inc20AName = record.INC_20_A_name || record.sectionsData?.inc20A?.name || record.sectionsData?.dpt3?.name || '';
  const inc20ADate = record.INC_20_A_Date || record.sectionsData?.inc20A?.date || record.sectionsData?.dpt3?.date || '';
  const inc20AStatus = record.INC_20_A_status || record.sectionsData?.inc20A?.status || record.sectionsData?.dpt3?.status || '';
  const inc20AFiles = record.INC_20_A_File_Upload || record.sectionsData?.inc20A?.files || record.sectionsData?.dpt3?.files || [];

  // Extract Form 3 (Finance / Projected Financials) fields for Zoho CRM Operation_Internal_CRM mapping
  const isFundingSave = (record.Internal_Team_Type || '').toLowerCase().includes('funding');
  const activeForm3Save = isFundingSave
    ? record.sectionsData?.fundingFinance
    : isCompliance
      ? (record.sectionsData?.compForm3 || record.sectionsData?.form3)
      : record.sectionsData?.form3;
  const fallbackForm3Save = isFundingSave
    ? (record.sectionsData?.compForm3 || record.sectionsData?.form3)
    : isCompliance
      ? (record.sectionsData?.fundingFinance || record.sectionsData?.form3)
      : (record.sectionsData?.fundingFinance || record.sectionsData?.compForm3);

  const form3Name = record.Finance_Projected_Financials_name || activeForm3Save?.name || fallbackForm3Save?.name || '';
  const form3Date = record.Finance_Projected_Financials_Date || activeForm3Save?.date || fallbackForm3Save?.date || '';
  const form3Status = record.Finance_Projected_Financials_Status || activeForm3Save?.status || fallbackForm3Save?.status || '';
  const form3Files = record.Finance_Projected_Financials_File_Upload || activeForm3Save?.files || fallbackForm3Save?.files || [];

  // Extract LLP Agreement / Application Submission fields for Zoho CRM Operation_Internal_CRM mapping
  const activeLlpSave = isCertification
    ? record.sectionsData?.certFinalApp
    : isFundingSave
      ? record.sectionsData?.appSubmission
      : record.sectionsData?.llpAgreement;
  const fallbackLlpSave = isCertification
    ? (record.sectionsData?.appSubmission || record.sectionsData?.llpAgreement)
    : isFundingSave
      ? record.sectionsData?.llpAgreement
      : record.sectionsData?.appSubmission;

  const llpName = record.Application_submission_name || activeLlpSave?.name || fallbackLlpSave?.name || '';
  const llpDate = record.Application_submission_Submission_Date || activeLlpSave?.date || fallbackLlpSave?.date || '';
  const llpStatus = record.Application_submission_status || activeLlpSave?.status || fallbackLlpSave?.status || '';
  const llpFiles = record.Application_submission_File_Upload || activeLlpSave?.files || fallbackLlpSave?.files || [];
  const appSubVal = record.Application_submission || record.sectionsData?.appSubmission?.registrationNumber || record.sectionsData?.appSubmission?.applicationSubmission || '';
  const appPortalId = record.Application_submission_Portal_User_ID || record.sectionsData?.appSubmission?.portalId || '';
  const appPortalPwd = record.Application_submission_Portal_Password || record.sectionsData?.appSubmission?.portalPassword || '';

  // Extract Director ITR & Company ITR fields for Zoho CRM mapping
  const isCompanyItrServiceSave = (record.Service_Scheme || '').toLowerCase().includes('company itr');
  const primaryItr = isCompanyItrServiceSave ? record.sectionsData?.companyItr : record.sectionsData?.directorItr;
  const secondaryItr = isCompanyItrServiceSave ? record.sectionsData?.directorItr : record.sectionsData?.companyItr;

  const itrName = record.Director_ITR_Company_ITR_name || primaryItr?.name || secondaryItr?.name || '';
  const itrDate = record.Director_ITR_Company_ITR_Date || primaryItr?.date || secondaryItr?.date || '';
  const itrStatus = record.Director_ITR_Company_ITR_status || primaryItr?.status || secondaryItr?.status || '';
  const itrFiles = record.Director_ITR_Company_ITR_File_Upload || primaryItr?.files || secondaryItr?.files || [];
  const itrDocCollection = record.Director_ITR_Doc_collection || record.sectionsData?.directorItr?.docCollection || '';
  const itrFileRequired = record.Director_ITR_File_required || record.sectionsData?.directorItr?.fileRequired || '';

  // Extract DPR / Pitch deck creation / INC fields for Zoho CRM mapping
  const activeDprInc = isCompliance ? (record.sectionsData?.compInc || record.sectionsData?.inc) : record.sectionsData?.dprCreation;
  const fallbackDprInc = isCompliance ? record.sectionsData?.dprCreation : (record.sectionsData?.compInc || record.sectionsData?.inc);

  const dprName = record.DPR_Pitch_deck_creation_name || activeDprInc?.name || fallbackDprInc?.name || '';
  const dprDate = record.DPR_Pitch_deck_creation_Date || activeDprInc?.date || fallbackDprInc?.date || '';
  const dprStatus = record.DPR_Pitch_deck_creation_status || activeDprInc?.status || fallbackDprInc?.status || '';
  const dprFiles = record.DPR_Pitch_deck_creation_File_Upload || activeDprInc?.files || fallbackDprInc?.files || [];

  // Extract After Allocation Workflow
  const afterAllocation = record.After_Allocation_Workflow || record.After_Allocation || record.sectionsData?.afterAllocation || 'No';

  const dealId = record.Deal_ID || (record.Parent_Record_Deal?.id || (typeof record.Parent_Record_Deal === 'string' ? record.Parent_Record_Deal : '')) || '';
  const serviceName = record.Service_Scheme || record.Name || '';
  const teamType = record.Internal_Team_Type || record.Team_Type || '';
  const opStage = record.Stage || record.Operation_Stage || '';
  const tlId = record.Team_Leader?.id || record.Team_Leader_ID || record.Team_Leader_TL?.id || (typeof record.Team_Leader_TL === 'string' ? record.Team_Leader_TL : '');
  const tmId = record.Team_Member?.id || record.Team_Member_ID || record.Team_Member_TM?.id || (typeof record.Team_Member_TM === 'string' ? record.Team_Member_TM : '');

  let zohoDealId = record.zohoDealId || (/^\d{15,}$/.test(String(dealId)) ? String(dealId) : undefined);
  if (!zohoDealId) {
    try {
      const savedDeals = localStorage.getItem('be_deals');
      if (savedDeals) {
        const deals = JSON.parse(savedDeals);
        const matched = deals.find((d: any) =>
          String(d.id || '').toLowerCase() === String(dealId).toLowerCase() ||
          String(d.zohoId || '').toLowerCase() === String(dealId).toLowerCase() ||
          (d.name && record.Deal_Name && d.name.toLowerCase() === record.Deal_Name.toLowerCase())
        );
        if (matched?.zohoId && /^\d{15,}$/.test(String(matched.zohoId))) {
          zohoDealId = String(matched.zohoId);
        } else if (matched?.id && /^\d{15,}$/.test(String(matched.id))) {
          zohoDealId = String(matched.id);
        }
      }
    } catch (_) {}
  }

  const updatedRecord: InternalOperationRecord = {
    ...record,
    Deal_ID: dealId || record.Deal_ID,
    zohoDealId: zohoDealId || undefined,
    Parent_Record_Deal: zohoDealId
      ? { id: zohoDealId, name: record.Deal_Name }
      : (record.Parent_Record_Deal || (dealId ? (/^\d{15,}$/.test(String(dealId)) ? { id: String(dealId) } : dealId) : undefined)),
    Name: serviceName,
    Service_Scheme: serviceName,
    Team_Type: teamType,
    Internal_Team_Type: teamType,
    Operation_Stage: opStage,
    Stage: opStage as any,
    Team_Leader_TL: record.Team_Leader_TL || (tlId ? (/^\d{15,}$/.test(String(tlId)) ? { id: String(tlId), name: record.Team_Leader_Name } : tlId) : null),
    Team_Member_TM: record.Team_Member_TM || (tmId ? (/^\d{15,}$/.test(String(tmId)) ? { id: String(tmId), name: record.Team_Member_Name } : tmId) : null),
    After_Allocation: afterAllocation as 'Yes' | 'No',
    After_Allocation_Workflow: afterAllocation,
    Doc_collection_name: docName,
    Doc_collection_Date: docDate,
    Doc_collection_status: docStatus,
    Doc_collection_File_Upload: docFiles,
    Name_Application_name: nameAppName,
    Name_Application_approved_name: nameAppApprovedName,
    Name_Application_date: nameAppDate,
    Name_Application_status: nameAppStatus,
    Name_Application_File_Upload: nameAppFiles,
    DSC_Creation_name: dscName,
    DSC_Creation_Date: dscDate,
    DSC_Creation_status: dscStatus,
    Final_Filing_name: finalFilingName,
    Final_Filing_Final_Approval_Name: finalFilingApprovalName,
    Final_Filing_Date: finalFilingDate,
    Final_Filing_DOI_Date: finalFilingDoiDate,
    Final_Filing_status: finalFilingStatus,
    Board_Resolution_name: brName,
    Board_Resolution_Date: brDate,
    Board_Resolution_status: brStatus,
    Board_Resolution_File_Upload: brFiles,
    Share_Certificate_name: scName,
    Share_Certificate_Date: scDate,
    Share_Certificate_status: scStatus,
    Share_Certificate_File_Upload: scFiles,
    MSME_Certificate: msmeFileVal,
    MSME_Certificate_Date: msmeDate,
    MSME_Certificate_status: msmeStatus,
    MSME_Certificate_File_Upload: msmeFiles,
    ADT_1_name: adt1Name,
    ADT_1_Auditor_name: adt1Auditor,
    ADT_1_date: adt1Date,
    ADT_1_status: adt1Status,
    ADT_1_File_Upload: adt1Files,
    INC_20_A_name: inc20AName,
    INC_20_A_Date: inc20ADate,
    INC_20_A_status: inc20AStatus,
    INC_20_A_File_Upload: inc20AFiles,
    Finance_Projected_Financials_name: form3Name,
    Finance_Projected_Financials_Date: form3Date,
    Finance_Projected_Financials_Status: form3Status,
    Finance_Projected_Financials_File_Upload: form3Files,
    Application_submission_name: llpName,
    Application_submission_Submission_Date: llpDate,
    Application_submission_status: llpStatus,
    Application_submission_File_Upload: llpFiles,
    Application_submission: appSubVal,
    Application_submission_Portal_User_ID: appPortalId,
    Application_submission_Portal_Password: appPortalPwd,
    Director_ITR_Doc_collection: itrDocCollection,
    Director_ITR_File_required: itrFileRequired,
    Director_ITR_Company_ITR_name: itrName,
    Director_ITR_Company_ITR_Date: itrDate,
    Director_ITR_Company_ITR_status: itrStatus,
    Director_ITR_Company_ITR_File_Upload: itrFiles,
    AOC_4_name: aoc4Name,
    AOC_4_Director_Audit_report: aoc4DirectorAudit,
    DPR_Pitch_deck_creation_name: dprName,
    DPR_Pitch_deck_creation_Date: dprDate,
    DPR_Pitch_deck_creation_status: dprStatus,
    DPR_Pitch_deck_creation_File_Upload: dprFiles,
    Modified_Time: nowIso
  };

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
    const hasZohoId = Boolean(
      (updatedRecord.zohoId && /^\d{15,}$/.test(String(updatedRecord.zohoId))) ||
      (updatedRecord.id && /^\d{15,}$/.test(String(updatedRecord.id)))
    );
    const response = await fetch('/api/zoho/internal-operations', {
      method: hasZohoId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedRecord)
    });
    const data = await response.json();
    const createdZohoId = data?.data?.[0]?.details?.id || data?.zohoId;
    if (createdZohoId && /^\d{15,}$/.test(String(createdZohoId))) {
      updatedRecord.zohoId = String(createdZohoId);
      const reSaved = getStoredInternalOperations().map(r => r.id === updatedRecord.id ? { ...r, zohoId: String(createdZohoId) } : r);
      setStoredInternalOperations(reSaved);
    }
    return {
      success: true,
      zohoId: createdZohoId || updatedRecord.zohoId || updatedRecord.id,
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

  let resolvedTlId = tl?.id || '';
  if (resolvedTlId && !/^\d{15,}$/.test(resolvedTlId)) {
    try {
      const emps = JSON.parse(localStorage.getItem('be_employees') || '[]');
      const found = emps.find((e: any) => 
        (e.id && String(e.id).toLowerCase() === resolvedTlId.toLowerCase()) ||
        (e.Employment_ID && String(e.Employment_ID).toLowerCase() === resolvedTlId.toLowerCase()) ||
        (e.name && tl?.name && e.name.toLowerCase() === tl.name.toLowerCase()) ||
        (e.Name && tl?.name && e.Name.toLowerCase() === tl.name.toLowerCase())
      );
      if (found?.zohoId && /^\d{15,}$/.test(String(found.zohoId))) {
        resolvedTlId = String(found.zohoId);
      }
    } catch (_) {}
  }

  let resolvedTmId = tm?.id || '';
  if (resolvedTmId && !/^\d{15,}$/.test(resolvedTmId)) {
    try {
      const emps = JSON.parse(localStorage.getItem('be_employees') || '[]');
      const found = emps.find((e: any) => 
        (e.id && String(e.id).toLowerCase() === resolvedTmId.toLowerCase()) ||
        (e.Employment_ID && String(e.Employment_ID).toLowerCase() === resolvedTmId.toLowerCase()) ||
        (e.name && tm?.name && e.name.toLowerCase() === tm.name.toLowerCase()) ||
        (e.Name && tm?.name && e.Name.toLowerCase() === tm.name.toLowerCase())
      );
      if (found?.zohoId && /^\d{15,}$/.test(String(found.zohoId))) {
        resolvedTmId = String(found.zohoId);
      }
    } catch (_) {}
  }

  const updatedRecord: InternalOperationRecord = {
    ...record,
    Team_Leader: tl ? { id: resolvedTlId || tl.id, name: tl.name, email: tl.email, empId: tl.empId || tl.id } : null,
    Team_Leader_ID: resolvedTlId || tl?.id || '',
    Team_Leader_Name: tl?.name || '',
    Team_Leader_TL: (resolvedTlId || tl?.id) ? (/^\d{15,}$/.test(String(resolvedTlId)) ? { id: String(resolvedTlId), name: tl?.name } : { id: String(resolvedTlId), name: tl?.name }) : null,
    Team_Member: tm ? { id: resolvedTmId || tm.id, name: tm.name, email: tm.email, empId: tm.empId || tm.id } : null,
    Team_Member_ID: resolvedTmId || tm?.id || '',
    Team_Member_Name: tm?.name || '',
    Team_Member_TM: (resolvedTmId || tm?.id) ? (/^\d{15,}$/.test(String(resolvedTmId)) ? { id: String(resolvedTmId), name: tm?.name } : { id: String(resolvedTmId), name: tm?.name }) : null,
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

/**
 * Deletes an Internal Operation record from storage and optionally Zoho CRM
 */
export async function deleteInternalOperation(id: string): Promise<{ success: boolean; message: string }> {
  if (!id) return { success: false, message: 'Invalid ID' };

  const current = getStoredInternalOperations();
  const recordToDelete = current.find(r => r.id === id);
  const updatedList = current.filter(r => r.id !== id);
  setStoredInternalOperations(updatedList);

  const realZohoId = (recordToDelete?.zohoId && /^\d{15,}$/.test(String(recordToDelete.zohoId)))
    ? String(recordToDelete.zohoId)
    : (/^\d{15,}$/.test(String(id)) ? id : null);

  if (realZohoId) {
    try {
      await fetch(`/api/zoho/delete-internal-operation?id=${realZohoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.warn('[Internal Operations] Zoho delete error:', err);
    }
  }

  return { success: true, message: 'Service allocation deleted successfully' };
}

/**
 * Normalizes short or varied team types to the standard Zoho CRM Legal Details subform format:
 * e.g. 'Funding' -> 'Team Funding', 'Compliance' -> 'Team Compliance'
 */
export function toInternalTeamType(teamType: string): string {
  const norm = normalizeTeamType(teamType);
  switch (norm) {
    case 'Incorporation':
      return 'Team Incorporation';
    case 'Compliance':
      return 'Team Compliance';
    case 'Funding':
      return 'Team Funding';
    case 'Certification':
      return 'Team Certification';
    case 'Digital Marketing':
      return 'Team Digital Marketing';
    default:
      return teamType.startsWith('Team ') ? teamType : `Team ${teamType}`;
  }
}

/**
 * Synchronizes an updated Team Type from an Internal Operation record back to the
 * parent Deal's Legal Details Subform (both in localStorage and via Zoho CRM Deals API).
 */
export async function syncTeamTypeToLegalSubform(
  operationRecord: InternalOperationRecord,
  newTeamType: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const parentDealId = operationRecord.Deal_ID || 
      (operationRecord.Parent_Record_Deal && typeof operationRecord.Parent_Record_Deal === 'object' ? operationRecord.Parent_Record_Deal.id : operationRecord.Parent_Record_Deal) ||
      operationRecord.zohoDealId || '';
    
    const parentDealName = operationRecord.Deal_Name || 
      (operationRecord.Parent_Record_Deal && typeof operationRecord.Parent_Record_Deal === 'object' ? operationRecord.Parent_Record_Deal.name : '') || '';
    
    const subformRowId = operationRecord.Subform_Row_ID || operationRecord.id || '';
    const serviceScheme = (operationRecord.Service_Scheme || operationRecord.Name || '').trim().toLowerCase();
    const zohoTeamType = toInternalTeamType(newTeamType);
    const normTeamType = normalizeTeamType(newTeamType);

    // 1. Update in localStorage 'be_deals'
    let matchedDeal: any = null;
    let targetZohoDealId = '';
    const storedDeals = localStorage.getItem('be_deals');
    if (storedDeals) {
      try {
        const deals = JSON.parse(storedDeals);
        if (Array.isArray(deals)) {
          const dealIdx = deals.findIndex((d: any) => 
            (parentDealId && (
              String(d.id || '').toLowerCase() === String(parentDealId).toLowerCase() ||
              String(d.zohoId || '').toLowerCase() === String(parentDealId).toLowerCase()
            )) ||
            (parentDealName && String(d.name || d.Deal_Name || '').trim().toLowerCase() === parentDealName.trim().toLowerCase())
          );

          if (dealIdx >= 0) {
            matchedDeal = deals[dealIdx];
            targetZohoDealId = String(
              matchedDeal.zohoId || 
              (matchedDeal.id && /^\d{15,}$/.test(String(matchedDeal.id)) ? matchedDeal.id : '') || 
              ''
            ).trim();

            const updateSubformRows = (rows: any[]) => {
              if (!Array.isArray(rows)) return rows;
              return rows.map((row: any) => {
                const rowId = String(row.id || '');
                const rowScheme = String(row.Legal_Schemas || row.Schemas || row.schema || row.Service_Name || '').trim().toLowerCase();
                const isMatch = (subformRowId && rowId && rowId === String(subformRowId)) ||
                                (rowScheme && serviceScheme && (rowScheme === serviceScheme || isMatchingName(rowScheme, serviceScheme)));
                if (isMatch) {
                  return {
                    ...row,
                    Internal_team_type: zohoTeamType,
                    internalTeamType: zohoTeamType,
                    Team_Type: normTeamType
                  };
                }
                return row;
              });
            };

            if (matchedDeal.Legal) matchedDeal.Legal = updateSubformRows(matchedDeal.Legal);
            if (matchedDeal.legalData) matchedDeal.legalData = updateSubformRows(matchedDeal.legalData);
            if (matchedDeal.rawZohoDeal?.Legal) matchedDeal.rawZohoDeal.Legal = updateSubformRows(matchedDeal.rawZohoDeal.Legal);
            if (matchedDeal.formData?.legalData) matchedDeal.formData.legalData = updateSubformRows(matchedDeal.formData.legalData);
            if (matchedDeal.formData?.Legal) matchedDeal.formData.Legal = updateSubformRows(matchedDeal.formData.Legal);

            deals[dealIdx] = matchedDeal;
            localStorage.setItem('be_deals', JSON.stringify(deals));

            // Notify real-time global deal updates
            try {
              window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: matchedDeal }));
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('[Sync] Failed updating deal in localStorage:', err);
      }
    }

    // 2. Also update in-memory / stored operations list
    try {
      const storedOps = localStorage.getItem('be_internal_operations');
      if (storedOps) {
        const ops = JSON.parse(storedOps);
        if (Array.isArray(ops)) {
          let opUpdated = false;
          const updatedOps = ops.map((op: any) => {
            if (op.id === operationRecord.id || (subformRowId && op.Subform_Row_ID === subformRowId)) {
              opUpdated = true;
              return {
                ...op,
                Internal_Team_Type: normTeamType,
                Team_Type: normTeamType
              };
            }
            return op;
          });
          if (opUpdated) {
            localStorage.setItem('be_internal_operations', JSON.stringify(updatedOps));
            try {
              window.dispatchEvent(new CustomEvent('be_internal_ops_updated', { detail: operationRecord }));
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // 3. Sync to Zoho CRM Deals API to persist to Legal Details subform in CRM
    const zohoIdToUse = targetZohoDealId || (/^\d{15,}$/.test(String(parentDealId)) ? String(parentDealId) : '');
    if (zohoIdToUse && matchedDeal) {
      const existingLegal = matchedDeal.rawZohoDeal?.Legal || matchedDeal.Legal || [];
      if (Array.isArray(existingLegal) && existingLegal.length > 0) {
        const formattedLegal = existingLegal.map((lg: any) => ({
          ...(lg.id && /^\d{15,}$/.test(String(lg.id)) ? { id: lg.id } : {}),
          Legal_Schemas: lg.Legal_Schemas || lg.schema || lg.Schemas || 'Service',
          Internal_team_type: lg.Internal_team_type || lg.internalTeamType || zohoTeamType,
          Internal_legal_status: lg.Internal_legal_status || lg.legalStatus || 'RECEIVED',
          Remark: lg.Remark || lg.remark || '',
          Types_of_legal_documents: lg.Types_of_legal_documents || lg.docTypes || '',
          Agreement_Terms_I: lg.Agreement_Terms_I || lg.terms1 || '',
          Agreement_Terms_II: lg.Agreement_Terms_II || lg.terms2 || '',
          Tenure_of_Service: lg.Tenure_of_Service || lg.tenure || ''
        }));

        try {
          await fetch('/api/zoho/update-deal', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: zohoIdToUse,
              zohoId: zohoIdToUse,
              Legal: formattedLegal,
              isPartial: true
            })
          });
        } catch (apiErr) {
          console.warn('[Sync] Failed updating Legal subform in Zoho CRM Deal:', apiErr);
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Sync] Error in syncTeamTypeToLegalSubform:', err);
    return { success: false, message: err?.message };
  }
}
