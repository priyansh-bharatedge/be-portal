import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { InternalOperationRecord, OperationStage } from '../../types/operations';
import { OPERATION_STAGES, ALL_OPERATION_STAGES, getOperationStagesForTeamType } from '../../types/operations';
import {
  getStoredInternalOperations,
  fetchInternalOperations,
  saveInternalOperation,
  deleteInternalOperation,
  assignStaffToOperation,
  generateServiceAllocationsForDeal,
  normalizeTeamType
} from '../../services/internalOperationsService';
import { fetchZohoEmployees, fetchSalesEmployees } from '../../services/zohoService';
import { getAllEmployeesList } from '../../services/zohoRbacService';
import {
  Users,
  Briefcase,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  Edit3,
  Save,
  RefreshCw,
  Loader2,
  Tag,
  Check,
  X,
  AlertCircle,
  FolderOpen,
  Eye,
  Building,
  Award,
  Share2,
  Trash2,
  UserCheck
} from 'lucide-react';
import { INTERNAL_TEAM_TYPES } from '../../pages/crm/DealDetails';
import { InternalOperationDetailModal } from './InternalOperationDetailModal';
import { DeleteConfirmModal } from '../ui/DeleteConfirmModal';
import { isMatchingName, normalizeName } from '../../utils/employeeUtils';

export interface NormalizedStaff {
  id: string;
  name: string;
  role: string;
  systemRole: string;
  dept: string;
  email: string;
  empId?: string;
  zohoId?: string;
  isTL: boolean;
  isTM: boolean;
}

/**
 * Robustly checks if an active user (AuthUser) matches an assigned staff member on an Internal Operation record.
 * Supports matching via:
 * 1. User IDs (id, empId, zohoId, Employment_ID)
 * 2. Email addresses (case-insensitive)
 * 3. Exact and tokenized/middle-name fuzzy matching (e.g. "Pratham" matches "Pratham Kantilal Chouhan")
 */
export function checkUserMatchesStaff(
  user: any,
  staffObj: any,
  fallbackId?: string,
  fallbackName?: string
): boolean {
  if (!user) return false;

  const staffId = String(staffObj?.id || fallbackId || (typeof staffObj === 'string' ? staffObj : '') || '').trim().toLowerCase();
  const staffName = String(staffObj?.name || staffObj?.lookup_label || staffObj?.value || fallbackName || '').trim();
  const staffEmail = String(staffObj?.email || staffObj?.workEmail || staffObj?.Email || '').trim().toLowerCase();

  // If no staff info is present on the record, no match
  if (!staffId && !staffName && !staffEmail) return false;

  const uId = String(user.id || '').trim().toLowerCase();
  const uEmpId = String(user.empId || user.Employment_ID || '').trim().toLowerCase();
  const uZohoId = String(user.zohoId || '').trim().toLowerCase();
  const uEmail = String(user.email || user.workEmail || user.personalEmail || '').trim().toLowerCase();
  const uName = String(user.name || user.fullName || user.Employee_Name || user.First_Name || '').trim();

  // 1. Direct ID matches (checking all permutations of user IDs)
  const candidateIds = [uId, uEmpId, uZohoId].filter(Boolean);
  if (staffId && candidateIds.includes(staffId)) return true;

  // 2. Direct Email matches
  if (staffEmail && uEmail && staffEmail === uEmail) return true;

  // 3. Robust Name matches (handles middle names & substrings, e.g. "Pratham" vs "Pratham Kantilal Chouhan")
  if (staffName && uName) {
    if (staffName.toLowerCase() === uName.toLowerCase()) return true;
    if (isMatchingName(uName, staffName)) return true;
  }

  // 4. Fallback: staffId might be an email or vice versa
  if (staffId && uEmail && staffId === uEmail) return true;

  return false;
}

/**
 * Checks whether an InternalOperationRecord is assigned to a specific user (either as TL or TM).
 * Inspects both lookup objects (Team_Leader_TL, Team_Member_TM) and mapped fields (Team_Leader, Team_Member).
 */
export function checkRecordAssignedToUser(record: any, user: any): boolean {
  if (!user || !record) return false;

  // 1. Check TL assignment
  const tlObj = record.Team_Leader_TL || record.Team_Leader;
  const tlId = tlObj?.id || record.Team_Leader_ID || (typeof tlObj === 'string' ? tlObj : '');
  const tlName = tlObj?.name || record.Team_Leader_Name || '';
  if (checkUserMatchesStaff(user, tlObj, tlId, tlName)) return true;

  // 2. Check TM assignment
  const tmObj = record.Team_Member_TM || record.Team_Member;
  const tmId = tmObj?.id || record.Team_Member_ID || (typeof tmObj === 'string' ? tmObj : '');
  const tmName = tmObj?.name || record.Team_Member_Name || '';
  if (checkUserMatchesStaff(user, tmObj, tmId, tmName)) return true;

  // 3. Fallback check for any direct assigned staff or Owner/Assigned_To
  const assignedObj = record.Assigned_To || record.assignedTo || record.Owner || record.Owner_ID;
  const assignedId = assignedObj?.id || (typeof assignedObj === 'string' ? assignedObj : '');
  const assignedName = assignedObj?.name || (typeof assignedObj === 'string' ? assignedObj : '');
  if (checkUserMatchesStaff(user, assignedObj, assignedId, assignedName)) return true;

  return false;
}

/**
 * Checks whether an InternalOperationRecord is specifically assigned to a user as a Team Member (TM).
 */
export function checkRecordAssignedToTM(record: any, user: any): boolean {
  if (!user || !record) return false;
  const tmObj = record.Team_Member_TM || record.Team_Member;
  const tmId = tmObj?.id || record.Team_Member_ID || (typeof tmObj === 'string' ? tmObj : '');
  const tmName = tmObj?.name || record.Team_Member_Name || '';
  return checkUserMatchesStaff(user, tmObj, tmId, tmName);
}

export function normalizeStaffRecord(e: any): NormalizedStaff {
  const firstName = e.Name || e.First_Name || e.firstName || '';
  const middleName = e.Middle_Name || e.middleName || '';
  const lastName = e.Last_Name || e.lastName || '';
  const compositeName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  const name = String(e.name || compositeName || e.Employee_Name || e.fullName || e.email || e.Personal_Email_Address || 'Staff Member').trim();
  
  // Prefer real 15+ digit Zoho CRM record ID so lookups in Zoho CRM match correctly
  const zohoRecordId = (e.zohoId && /^\d{15,}$/.test(String(e.zohoId).trim()))
    ? String(e.zohoId).trim()
    : (/^\d{15,}$/.test(String(e.id || '').trim()) ? String(e.id).trim() : '');

  const id = zohoRecordId || String(e.id || e.empId || e.Employment_ID || e.zohoId || e.email || '').trim();
  const email = String(e.email || e.Personal_Email_Address || e.Email || e.formData?.workEmail || e.formData?.email || '').trim();
  const empId = String(e.empId || e.Employment_ID || e.id || '').trim();
  
  const rawRole = String(e.systemRole || e.System_Role || e.role || e.Designation_Job_Title || e.designation || 'TM').trim();
  const rawDesig = String(e.Designation_Job_Title || e.designation || e.role || '').trim();
  const dept = String(e.dept || e.department || e.Department || e.formData?.dept || 'Operations').trim();

  const roleLower = rawRole.toLowerCase();
  const desigLower = rawDesig.toLowerCase();

  const isAdminOrHOD = (
    e.systemRole === 'Super Admin' ||
    e.systemRole === 'HOD' ||
    e.systemRole === 'HR' ||
    e.System_Role === 'Super Admin' ||
    e.System_Role === 'HOD' ||
    e.System_Role === 'HR' ||
    roleLower === 'super admin' ||
    roleLower === 'hod' ||
    roleLower === 'hr' ||
    roleLower.includes('super admin') ||
    roleLower.includes('managing director') ||
    desigLower.includes('head of department') ||
    desigLower.includes('managing director')
  );

  const isTL = !isAdminOrHOD && Boolean(
    e.systemRole === 'TL' ||
    e.System_Role === 'TL' ||
    roleLower === 'tl' ||
    roleLower.includes('team leader') ||
    roleLower.includes('lead') ||
    desigLower.includes('team leader') ||
    desigLower.includes('lead')
  );

  const isTM = !isAdminOrHOD && !isTL;
  const displayRole = isTL ? 'TL' : (isTM ? 'TM' : rawRole);

  return {
    id: id || name,
    name,
    role: displayRole,
    systemRole: isTL ? 'TL' : (isTM ? 'TM' : rawRole),
    dept,
    email,
    empId,
    zohoId: zohoRecordId || undefined,
    isTL,
    isTM
  };
}

interface InternalOperationsAllocationTableProps {
  deal?: any; // If provided, shows records specifically for this Deal
  mode?: 'global' | 'deal';
  hideCardHeader?: boolean;
  onProceedToExecutors?: () => void;
  canProceedToExecutors?: boolean;
}

export const InternalOperationsAllocationTable: React.FC<InternalOperationsAllocationTableProps> = ({
  deal,
  mode = 'global',
  hideCardHeader = false,
  onProceedToExecutors,
  canProceedToExecutors = false
}) => {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isHOD, isLegal, isOperationsHOD, isLegalHOD, isSales, availableUsers, isTL, isTM } = useAuth();

  const isSalesDeptUser = !isSuperAdmin && Boolean(
    isSales || 
    (currentUser?.department && (
      currentUser.department.toLowerCase().includes('sale') || 
      currentUser.department.toLowerCase().includes('bdm') || 
      currentUser.department.toLowerCase().includes('business dev')
    ))
  );

  // If in Deal mode and active user is in Sales department, hide table
  if (mode === 'deal' && isSalesDeptUser) {
    return null;
  }

  const [records, setRecords] = useState<InternalOperationRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTeamType, setSelectedTeamType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State for Staff Assignment
  const [assigningRecord, setAssigningRecord] = useState<InternalOperationRecord | null>(null);
  const [modalSelectedTl, setModalSelectedTl] = useState<string>('');
  const [modalSelectedTm, setModalSelectedTm] = useState<string>('');

  // Child Record Detail Modal State
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<InternalOperationRecord | null>(null);

  // Permission Checks:
  // - Operations HOD & Super Admin have full management & assignment rights.
  // - Legal HOD has supervisory oversight (view & audit status and assigned staff).
  // - Legal HOD, Operations HOD & Super Admin have allocation deletion rights.
  const canManageAllocations = Boolean(isSuperAdmin || isOperationsHOD || (isHOD && !isLegal && !isSalesDeptUser));
  const hasSupervisoryOversight = Boolean(isLegalHOD || isLegal);
  const isTeamLeader = Boolean(
    isTL || 
    currentUser?.role === 'TL' || 
    (currentUser as any)?.systemRole === 'TL' || 
    (currentUser?.role && currentUser.role.toLowerCase().includes('team leader')) || 
    (currentUser?.role && currentUser.role.toLowerCase().includes('tl')) ||
    (currentUser?.designation && (
      currentUser.designation.toLowerCase().includes('team leader') || 
      currentUser.designation.toLowerCase().includes('lead')
    ))
  );
  // Team Leaders (TL) can assign Team Members (TM)
  const canAssignTM = Boolean(canManageAllocations || isTeamLeader);
  const canDeleteAllocations = Boolean(isSuperAdmin || isOperationsHOD || isLegalHOD || hasSupervisoryOversight || canManageAllocations);
  const isIndividualContributor = !canManageAllocations && !hasSupervisoryOversight;
  // Team Member (TM): Individual contributor who is not an Admin, HOD, or Team Leader
  const isTeamMember = Boolean(
    currentUser?.role === 'TM' ||
    (currentUser as any)?.systemRole === 'TM' ||
    isTM ||
    (!canManageAllocations && !hasSupervisoryOversight && !isTeamLeader)
  );
  const [onlyAssignedToMe, setOnlyAssignedToMe] = useState<boolean>(isIndividualContributor);

  // Deletion Modal State
  const [recordToDelete, setRecordToDelete] = useState<InternalOperationRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState<boolean>(false);

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setIsDeletingRecord(true);
    try {
      await deleteInternalOperation(recordToDelete.id);
      setRecords(prev => prev.filter(r => r.id !== recordToDelete.id));
      setToastMessage({
        type: 'success',
        text: `Service allocation "${recordToDelete.Service_Scheme || 'Record'}" deleted successfully.`
      });
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err?.message || 'Failed to delete service allocation.'
      });
    } finally {
      setIsDeletingRecord(false);
      setRecordToDelete(null);
    }
  };

  // Load and merge all existing employees across storage, RBAC, and live API
  const [allExistingEmployees, setAllExistingEmployees] = useState<NormalizedStaff[]>(() => {
    const list = getAllEmployeesList(availableUsers);
    const seen = new Set<string>();
    const res: NormalizedStaff[] = [];
    list.forEach(item => {
      const norm = normalizeStaffRecord(item);
      const key = (norm.id || norm.name).toLowerCase();
      if (!seen.has(key) && norm.name && norm.name !== 'Employee' && !/^\d{15,}$/.test(norm.name)) {
        seen.add(key);
        res.push(norm);
      }
    });
    res.sort((a, b) => a.name.localeCompare(b.name));
    return res;
  });

  useEffect(() => {
    let isMounted = true;

    const loadAndMergeEmployees = async () => {
      try {
        const stored = localStorage.getItem('be_employees');
        let localItems: any[] = [];
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) localItems = parsed;
          } catch (_) {}
        }

        const salesStored = localStorage.getItem('be_sales_employees');
        if (salesStored) {
          try {
            const parsedSales = JSON.parse(salesStored);
            if (Array.isArray(parsedSales)) localItems.push(...parsedSales);
          } catch (_) {}
        }

        let liveZoho: any[] = [];
        try {
          const res = await fetchZohoEmployees();
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            liveZoho = res.data;
          }
        } catch (apiErr) {
          console.warn('[Internal Ops Table] Live Zoho employee fetch failed:', apiErr);
        }

        let liveSales: any[] = [];
        try {
          const sRes = await fetchSalesEmployees();
          if (sRes.success && Array.isArray(sRes.data) && sRes.data.length > 0) {
            liveSales = sRes.data;
          }
        } catch (_) {}

        const combined = [
          ...availableUsers,
          ...localItems,
          ...liveZoho,
          ...liveSales
        ];

        const merged: NormalizedStaff[] = [];

        combined.forEach(raw => {
          const norm = normalizeStaffRecord(raw);
          if (!norm.name || norm.name === 'Employee' || /^\d{15,}$/.test(norm.name)) return;

          const key = (norm.id || norm.name).toLowerCase();
          const emailKey = (norm.email || '').toLowerCase();

          // Find existing by ID, Email, or robust fuzzy name match
          const existing = merged.find(m => 
            (key && (m.id.toLowerCase() === key || m.name.toLowerCase() === key)) ||
            (emailKey && m.email && m.email.toLowerCase() === emailKey) ||
            isMatchingName(m.name, norm.name)
          );

          if (existing) {
            // Keep the longer / more complete name (e.g. "Simran Haresh Lakhpati" over "simran lakhpati")
            if (norm.name.length > existing.name.length) {
              existing.name = norm.name;
            }
            if (!existing.email && norm.email) existing.email = norm.email;
            if ((!existing.id || existing.id === existing.name) && norm.id) existing.id = norm.id;
            if (!existing.dept && norm.dept) existing.dept = norm.dept;
          } else {
            merged.push(norm);
          }
        });

        if (isMounted && merged.length > 0) {
          merged.sort((a, b) => a.name.localeCompare(b.name));
          setAllExistingEmployees(merged);
        }
      } catch (err) {
        console.warn('[Internal Ops Table] Error loading employees:', err);
      }
    };

    loadAndMergeEmployees();

    const handleEmployeeUpdate = () => {
      loadAndMergeEmployees();
    };

    window.addEventListener('be_employees_updated', handleEmployeeUpdate);
    window.addEventListener('storage', handleEmployeeUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('be_employees_updated', handleEmployeeUpdate);
      window.removeEventListener('storage', handleEmployeeUpdate);
    };
  }, [availableUsers]);

  // 1. Strictly Team Leaders (TL) list — ONLY Team Leaders
  const allTeamLeaders = useMemo(() => {
    return allExistingEmployees.filter(u => u.isTL);
  }, [allExistingEmployees]);

  // 2. Strictly Team Members (TM) list — ONLY Team Members
  const allTeamMembers = useMemo(() => {
    return allExistingEmployees.filter(u => u.isTM);
  }, [allExistingEmployees]);

  // Helper to resolve currently selected ID by ID or Name (handles fuzzy/middle-name match)
  const resolveSelectedId = (targetId?: string, targetName?: string): string => {
    if (targetId) {
      const foundById = allExistingEmployees.find(u => u.id.toLowerCase() === targetId.toLowerCase());
      if (foundById) return foundById.id;
    }
    if (targetName) {
      const exact = allExistingEmployees.find(u => u.name.toLowerCase() === targetName.toLowerCase());
      if (exact) return exact.id;
      const fuzzy = allExistingEmployees.find(u => isMatchingName(u.name, targetName));
      if (fuzzy) return fuzzy.id;
    }
    return targetId || '';
  };

  // Load and subscribe to Internal Operations records
  const loadRecords = async () => {
    setLoading(true);
    try {
      const dealId = deal ? String(deal.id || deal.zohoId || '') : undefined;
      const data = await fetchInternalOperations({ dealId });

      // If in deal mode and no records found yet, auto-generate idempotently from deal's legal subform
      if (mode === 'deal' && deal && data.length === 0) {
        const genResult = generateServiceAllocationsForDeal(deal);
        const filtered = genResult.all.filter(r => String(r.Deal_ID || '').toLowerCase() === String(deal.id || deal.zohoId || '').toLowerCase());
        setRecords(filtered);
      } else {
        setRecords(data);
      }
    } catch (err) {
      console.warn('[Internal Ops Table] Error loading records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();

    const handleUpdate = () => {
      const all = getStoredInternalOperations();
      if (mode === 'deal' && deal) {
        const dId = String(deal.id || deal.zohoId || '').toLowerCase();
        setRecords(all.filter(r => String(r.Deal_ID || '').toLowerCase() === dId));
      } else {
        setRecords(all);
      }
    };

    window.addEventListener('be_internal_operations_updated', handleUpdate);
    return () => {
      window.removeEventListener('be_internal_operations_updated', handleUpdate);
    };
  }, [deal?.id, deal?.zohoId, mode]);

  // Sync / Refresh allocations for the current Deal
  const handleSyncFromDeal = () => {
    if (!deal) return;
    setSyncingId('deal-sync');
    try {
      const res = generateServiceAllocationsForDeal(deal);
      const dId = String(deal.id || deal.zohoId || '').toLowerCase();
      const updatedForDeal = res.all.filter(r => String(r.Deal_ID || '').toLowerCase() === dId);
      setRecords(updatedForDeal);
      setToastMessage({
        type: 'success',
        text: `Synchronized ${updatedForDeal.length} service allocation record(s) from Legal Details Subform.`
      });
    } catch (e: any) {
      setToastMessage({ type: 'error', text: e?.message || 'Failed to sync service allocations' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Sync all records directly to Zoho CRM module Operation_Internal_CRM
  const handleSyncAllToZoho = async () => {
    setSyncingId('sync-all-zoho');
    try {
      const list = getStoredInternalOperations();
      if (list.length === 0) {
        setToastMessage({ type: 'error', text: 'No service allocation records to sync.' });
        return;
      }
      const res = await fetch('/api/zoho/internal-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: list })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage({
          type: 'success',
          text: `Successfully synchronized ${list.length} record(s) to Zoho CRM Operation Internal module!`
        });
        await loadRecords();
      } else {
        setToastMessage({
          type: 'error',
          text: data?.message || 'Failed to sync with Zoho CRM'
        });
      }
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err?.message || 'Sync request failed' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Inline TL Change
  const handleInlineTlChange = async (record: InternalOperationRecord, newTlId: string) => {
    setSyncingId(record.id);
    try {
      const matchedUser = allExistingEmployees.find(u => 
        u.id.toLowerCase() === newTlId.toLowerCase() || 
        (u.empId && u.empId.toLowerCase() === newTlId.toLowerCase()) ||
        (u.zohoId && u.zohoId.toLowerCase() === newTlId.toLowerCase()) ||
        u.name.toLowerCase() === newTlId.toLowerCase() ||
        isMatchingName(u.name, newTlId)
      );
      const effectiveId = matchedUser?.zohoId || (/^\d{15,}$/.test(String(matchedUser?.id || '')) ? matchedUser?.id : '') || matchedUser?.id || newTlId;
      const tlPayload = matchedUser ? { id: effectiveId, name: matchedUser.name, email: matchedUser.email, empId: matchedUser.empId || matchedUser.id } : null;
      const updated = await assignStaffToOperation(
        record.id,
        tlPayload,
        record.Team_Member || null,
        { id: currentUser.id, name: currentUser.name }
      );
      if (updated) {
        setRecords(prev => prev.map(r => r.id === record.id ? updated : r));
        setToastMessage({
          type: 'success',
          text: `TL updated to ${matchedUser?.name || 'Unassigned'} for ${record.Service_Scheme}.`
        });
      }
    } catch (e: any) {
      setToastMessage({ type: 'error', text: e?.message || 'Failed to update Team Leader' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Inline TM Change
  const handleInlineTmChange = async (record: InternalOperationRecord, newTmId: string) => {
    setSyncingId(record.id);
    try {
      const matchedUser = allExistingEmployees.find(u => 
        u.id.toLowerCase() === newTmId.toLowerCase() || 
        (u.empId && u.empId.toLowerCase() === newTmId.toLowerCase()) ||
        (u.zohoId && u.zohoId.toLowerCase() === newTmId.toLowerCase()) ||
        u.name.toLowerCase() === newTmId.toLowerCase() ||
        isMatchingName(u.name, newTmId)
      );
      const effectiveId = matchedUser?.zohoId || (/^\d{15,}$/.test(String(matchedUser?.id || '')) ? matchedUser?.id : '') || matchedUser?.id || newTmId;
      const tmPayload = matchedUser ? { id: effectiveId, name: matchedUser.name, email: matchedUser.email, empId: matchedUser.empId || matchedUser.id } : null;
      const updated = await assignStaffToOperation(
        record.id,
        record.Team_Leader || null,
        tmPayload,
        { id: currentUser.id, name: currentUser.name }
      );
      if (updated) {
        setRecords(prev => prev.map(r => r.id === record.id ? updated : r));
        setToastMessage({
          type: 'success',
          text: `TM updated to ${matchedUser?.name || 'Unassigned'} for ${record.Service_Scheme}.`
        });
      }
    } catch (e: any) {
      setToastMessage({ type: 'error', text: e?.message || 'Failed to update Team Member' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Open Modal for Assignment
  const openAssignModal = (rec: InternalOperationRecord) => {
    setAssigningRecord(rec);
    setModalSelectedTl(resolveSelectedId(rec.Team_Leader?.id || rec.Team_Leader_ID, rec.Team_Leader?.name || rec.Team_Leader_Name));
    setModalSelectedTm(resolveSelectedId(rec.Team_Member?.id || rec.Team_Member_ID, rec.Team_Member?.name || rec.Team_Member_Name));
  };

  const handleSaveModalAssignment = async () => {
    if (!assigningRecord) return;
    setSyncingId(assigningRecord.id);
    try {
      const tlUser = allExistingEmployees.find(u => 
        u.id.toLowerCase() === modalSelectedTl.toLowerCase() || 
        (u.empId && u.empId.toLowerCase() === modalSelectedTl.toLowerCase()) ||
        (u.zohoId && u.zohoId.toLowerCase() === modalSelectedTl.toLowerCase()) ||
        u.name.toLowerCase() === modalSelectedTl.toLowerCase() ||
        isMatchingName(u.name, modalSelectedTl)
      );
      const tmUser = allExistingEmployees.find(u => 
        u.id.toLowerCase() === modalSelectedTm.toLowerCase() || 
        (u.empId && u.empId.toLowerCase() === modalSelectedTm.toLowerCase()) ||
        (u.zohoId && u.zohoId.toLowerCase() === modalSelectedTm.toLowerCase()) ||
        u.name.toLowerCase() === modalSelectedTm.toLowerCase() ||
        isMatchingName(u.name, modalSelectedTm)
      );

      const effectiveTlId = tlUser?.zohoId || (/^\d{15,}$/.test(String(tlUser?.id || '')) ? tlUser?.id : '') || tlUser?.id || modalSelectedTl;
      const effectiveTmId = tmUser?.zohoId || (/^\d{15,}$/.test(String(tmUser?.id || '')) ? tmUser?.id : '') || tmUser?.id || modalSelectedTm;

      const updated = await assignStaffToOperation(
        assigningRecord.id,
        tlUser ? { id: effectiveTlId, name: tlUser.name, email: tlUser.email, empId: tlUser.empId || tlUser.id } : null,
        tmUser ? { id: effectiveTmId, name: tmUser.name, email: tmUser.email, empId: tmUser.empId || tmUser.id } : null,
        { id: currentUser.id, name: currentUser.name }
      );

      if (updated) {
        setRecords(prev => prev.map(r => r.id === assigningRecord.id ? updated : r));
        setToastMessage({
          type: 'success',
          text: `Allocation saved for ${assigningRecord.Service_Scheme}.`
        });
      }
      setAssigningRecord(null);
    } catch (e: any) {
      setToastMessage({ type: 'error', text: e?.message || 'Failed to assign staff' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Inline Stage Change
  const handleInlineStageChange = async (record: InternalOperationRecord, newStage: OperationStage) => {
    setSyncingId(record.id);
    try {
      const updatedRecord: InternalOperationRecord = {
        ...record,
        Stage: newStage,
        Modified_Time: new Date().toISOString()
      };
      await saveInternalOperation(updatedRecord);
      setRecords(prev => prev.map(r => r.id === record.id ? updatedRecord : r));
      setToastMessage({
        type: 'success',
        text: `Stage set to "${newStage}" for ${record.Service_Scheme}.`
      });
    } catch (e: any) {
      setToastMessage({ type: 'error', text: e?.message || 'Failed to update Stage' });
    } finally {
      setSyncingId(null);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Filtered Records based on search, team type, stage, assigned-to-me, and allocation status
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 1. Strict Team Member isolation: Team Members must ONLY see child records assigned to them
      if (isTeamMember) {
        if (!checkRecordAssignedToUser(r, currentUser)) {
          return false;
        }
      } else if (onlyAssignedToMe) {
        if (!checkRecordAssignedToUser(r, currentUser)) {
          return false;
        }
      }

      // 2. Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const sMatch = (r.Service_Scheme || '').toLowerCase().includes(q);
        const dMatch = (r.Deal_Name || '').toLowerCase().includes(q);
        const cMatch = (r.Client_Name || '').toLowerCase().includes(q);
        const tMatch = (r.Internal_Team_Type || '').toLowerCase().includes(q);
        const tlMatch = (r.Team_Leader?.name || r.Team_Leader_TL?.name || r.Team_Leader_Name || '').toLowerCase().includes(q);
        const tmMatch = (r.Team_Member?.name || r.Team_Member_TM?.name || r.Team_Member_Name || '').toLowerCase().includes(q);
        const stgMatch = (r.Stage || 'Doc collection').toLowerCase().includes(q);
        const ca1Match = (r.CA_CS1 || '').toLowerCase().includes(q);
        const ca2Match = (r.CA_CS2 || '').toLowerCase().includes(q);
        if (!sMatch && !dMatch && !cMatch && !tMatch && !tlMatch && !tmMatch && !stgMatch && !ca1Match && !ca2Match) {
          return false;
        }
      }

      // 3. Team type filter
      if (selectedTeamType !== 'all') {
        const itemNorm = normalizeTeamType(r.Internal_Team_Type).toLowerCase();
        const filterNorm = normalizeTeamType(selectedTeamType).toLowerCase();
        if (itemNorm !== filterNorm && (r.Internal_Team_Type || '').toLowerCase() !== selectedTeamType.toLowerCase()) {
          return false;
        }
      }

      // 4. Stage filter
      if (selectedStage !== 'all') {
        const defaultStage = getOperationStagesForTeamType(r.Internal_Team_Type)[0] || 'Document pending from client';
        const recStage = (r.Stage || defaultStage).toLowerCase();
        const normRec = recStage.replace(/inelligible/g, 'ineligible');
        const normFilter = selectedStage.toLowerCase().replace(/inelligible/g, 'ineligible');
        if (normRec !== normFilter) {
          return false;
        }
      }

      // 5. Status filter
      if (selectedStatus !== 'all') {
        if ((r.Allocation_Status || '').toLowerCase() !== selectedStatus.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [records, searchTerm, selectedTeamType, selectedStage, selectedStatus, onlyAssignedToMe, currentUser, isTeamMember]);

  // Statistics (Role-aware: computes both Department totals and Individual Contributor personal metrics)
  const stats = useMemo(() => {
    const total = records.length;
    const allocated = records.filter(r => r.Allocation_Status === 'Allocated').length;
    const pending = total - allocated;
    const uniqueDeals = new Set(records.map(r => r.Deal_ID)).size;

    // Scoped for the current user (TL or TM)
    const myAssignedRecords = records.filter(r => checkRecordAssignedToUser(r, currentUser));
    const myTotal = myAssignedRecords.length;
    const myDocCollection = myAssignedRecords.filter(r => !r.Stage || r.Stage === 'Doc collection' || r.Stage === 'Document pending from client').length;
    const myInProgress = myAssignedRecords.filter(r => 
      r.Stage === 'Name Application' || r.Stage === 'Name application filing' ||
      r.Stage === 'DSC Creation' || r.Stage === 'DSC creation' ||
      r.Stage === 'Incorporation pending' || r.Stage === 'Incorporation pending from client' ||
      r.Stage === 'DSC work in progress' || r.Stage === 'Draft work in progress' ||
      r.Stage === 'Draft in review to client' || r.Stage === 'Draft approved from client' ||
      r.Stage === 'Payment pending from client' ||
      r.Stage === 'Document work in progress' || r.Stage === 'Document in review to client' ||
      r.Stage === 'Document approved from client' || r.Stage === 'Payment pending from client end' ||
      r.Stage === 'Mapping issue'
    ).length;
    const myFinalFiling = myAssignedRecords.filter(r => 
      r.Stage === 'Final Filing' || r.Stage === 'Board Resolution' || r.Stage === 'Board resolution preparation' ||
      r.Stage === 'Z-share certificate' || r.Stage === 'MSME' || r.Stage === 'ADT-1 Filing' ||
      r.Stage === 'INC 20-A filing' || r.Stage === 'Process Completed' ||
      r.Stage === 'Application submitted' || r.Stage === 'Application resubmitted' ||
      r.Stage === 'Application Resubmission' || r.Stage === 'Selected' || r.Stage === 'Application Selected'
    ).length;

    return { total, allocated, pending, uniqueDeals, myTotal, myDocCollection, myInProgress, myFinalFiling };
  }, [records, currentUser]);

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between border shadow-sm transition-all ${
          toastMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header & Stats Banner */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        {/* Shown in Deal mode or when hideCardHeader is false */}
        {!hideCardHeader && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-be-orange flex items-center justify-center font-bold">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>Internal Operations</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      Service Allocations
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500 font-medium">
                    {mode === 'deal'
                      ? 'Sub-child service allocations generated from the Legal Details Subform for this Deal'
                      : 'Operations Department HOD delegation hub for delegating service lines to Team Leaders & Members'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
              {/* Supervisory Badge for Legal HOD */}
              {hasSupervisoryOversight && !canManageAllocations && (
                <span className="text-xs px-3 py-1.5 rounded-xl font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-indigo-600" />
                  Legal HOD Supervisory View
                </span>
              )}

              {/* Sync from Deal button in Deal mode */}
              {mode === 'deal' && canManageAllocations && (
                <button
                  type="button"
                  onClick={handleSyncFromDeal}
                  disabled={syncingId === 'deal-sync'}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Refresh and sync allocations from Legal Details Subform"
                >
                  <RefreshCw size={14} className={syncingId === 'deal-sync' ? 'animate-spin' : ''} />
                  <span>Sync from Subform</span>
                </button>
              )}

              {/* Proceed to Operations Executors action button if Deal is fully allocated */}
              {mode === 'deal' && canProceedToExecutors && onProceedToExecutors && (
                <button
                  type="button"
                  onClick={onProceedToExecutors}
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Send to Operations Executors</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Metric Cards (Role-Aware: Contributor vs Allocator/HOD) */}
        {isIndividualContributor ? (
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${!hideCardHeader ? 'mt-4' : 'mt-1'}`}>
            <div className="p-3.5 bg-orange-50/70 rounded-xl border border-orange-100/80 shadow-2xs">
              <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider block flex items-center gap-1.5">
                <Briefcase size={12} className="text-orange-500" />
                My Assigned Services
              </span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">{stats.myTotal}</span>
            </div>
            <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-100/80 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block flex items-center gap-1.5">
                <FolderOpen size={12} className="text-blue-500" />
                Doc Collection
              </span>
              <span className="text-2xl font-black text-blue-800 mt-1 block">{stats.myDocCollection}</span>
            </div>
            <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-100/80 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block flex items-center gap-1.5">
                <Clock size={12} className="text-amber-500" />
                In Execution
              </span>
              <span className="text-2xl font-black text-amber-800 mt-1 block">{stats.myInProgress}</span>
            </div>
            <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-100/80 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                Final Filing & BR
              </span>
              <span className="text-2xl font-black text-emerald-800 mt-1 block">{stats.myFinalFiling}</span>
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${!hideCardHeader ? 'mt-4' : 'mt-1'}`}>
            <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-100 shadow-2xs">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Services</span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">{stats.total}</span>
            </div>
            <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-100 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block flex items-center gap-1.5">
                <Clock size={12} className="text-amber-500" />
                Pending Allocation
              </span>
              <span className="text-2xl font-black text-amber-800 mt-1 block">{stats.pending}</span>
            </div>
            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                Allocated
              </span>
              <span className="text-2xl font-black text-emerald-800 mt-1 block">{stats.allocated}</span>
            </div>
            {mode === 'global' ? (
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 shadow-2xs">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block flex items-center gap-1.5">
                  <Tag size={12} className="text-blue-500" />
                  Active Deals
                </span>
                <span className="text-2xl font-black text-blue-800 mt-1 block">{stats.uniqueDeals}</span>
              </div>
            ) : (
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 shadow-2xs">
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-indigo-500" />
                  Allocated Status
                </span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full inline-block mt-1 ${
                  stats.pending === 0 && stats.total > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {stats.pending === 0 && stats.total > 0 ? 'Ready for Executors' : 'Action Required'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Filter Controls (Global Mode) */}
        {mode === 'global' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search deal, client, service..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 focus:border-orange-500 rounded-xl text-xs font-medium outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Filter size={14} className="text-gray-400 shrink-0" />
                <span className="hidden sm:inline">Filters:</span>
              </div>
              <select
                value={selectedTeamType}
                onChange={(e) => {
                  const newTeam = e.target.value;
                  setSelectedTeamType(newTeam);
                  if (selectedStage !== 'all') {
                    const validStages = newTeam !== 'all' ? getOperationStagesForTeamType(newTeam) : ALL_OPERATION_STAGES;
                    if (!validStages.includes(selectedStage as any)) {
                      setSelectedStage('all');
                    }
                  }
                }}
                className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-700 outline-none cursor-pointer"
              >
                <option value="all">All Teams</option>
                {INTERNAL_TEAM_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-700 outline-none cursor-pointer"
              >
                <option value="all">All Stages</option>
                {(selectedTeamType !== 'all' ? getOperationStagesForTeamType(selectedTeamType) : ALL_OPERATION_STAGES).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-700 outline-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="Pending Allocation">Pending Allocation</option>
                <option value="Allocated">Allocated</option>
                <option value="In Progress">In Progress</option>
              </select>

              {isTeamMember ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 shadow-2xs">
                  <UserCheck size={13} className="text-emerald-600" />
                  <span className="whitespace-nowrap">My Assigned Records</span>
                </div>
              ) : (
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={onlyAssignedToMe}
                    onChange={(e) => setOnlyAssignedToMe(e.target.checked)}
                    className="rounded text-be-orange focus:ring-orange-500 cursor-pointer"
                  />
                  <span className="whitespace-nowrap">My Assigned</span>
                </label>
              )}

              {canManageAllocations && (
                <button
                  type="button"
                  onClick={handleSyncAllToZoho}
                  disabled={syncingId === 'sync-all-zoho'}
                  className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-be-orange border border-orange-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Synchronize all service allocations directly to Zoho CRM Operation Internal module"
                >
                  <RefreshCw size={13} className={syncingId === 'sync-all-zoho' ? 'animate-spin' : ''} />
                  <span>Sync to Zoho</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center">
            <Loader2 size={28} className="animate-spin text-be-orange mb-2" />
            <p className="text-sm font-semibold">Loading service allocations...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <Briefcase size={24} />
            </div>
            <h3 className="text-sm font-bold text-gray-800">
              {isTeamMember ? 'No Assigned Child Records' : 'No Service Allocations Found'}
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {isTeamMember
                ? (mode === 'deal'
                    ? 'You do not have any child records assigned to you for this deal. When the Operations HOD assigns service records to you, they will appear here.'
                    : 'You currently do not have any child records assigned to you. When the Operations HOD assigns service records to you, they will appear here.')
                : mode === 'deal'
                ? 'No sub-child service records found for this deal yet. Click "Sync from Subform" to generate allocations from the Legal Details Subform.'
                : 'Deals transitioning from Legal to Operations Allocator will automatically instantiate service records here.'}
            </p>
            {mode === 'deal' && canManageAllocations && (
              <button
                type="button"
                onClick={handleSyncFromDeal}
                className="mt-4 px-4 py-2 bg-be-orange hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Generate Service Allocations</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50/80 text-gray-600 font-semibold text-xs border-b border-gray-100 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 min-w-[210px]">Service / Scheme</th>
                  <th className="px-4 py-3 min-w-[160px]">Internal Team</th>
                  {mode === 'global' && <th className="px-4 py-3 min-w-[200px]">Parent Deal</th>}
                  <th className="px-4 py-3 min-w-[180px]">Stage</th>
                  <th className="px-4 py-3 min-w-[200px]">Assigned TL (Team Leader)</th>
                  <th className="px-4 py-3 min-w-[200px]">Assigned TM (Team Member)</th>
                  <th className="px-4 py-3 min-w-[210px]">Status & Legal Info</th>
                  <th className="px-4 py-3 text-right min-w-[160px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                {filteredRecords.map((item, idx) => {
                  const isAllocated = item.Allocation_Status === 'Allocated';
                  const isSyncing = syncingId === item.id;
                  const itemNormTeam = normalizeTeamType(item.Internal_Team_Type);

                  return (
                    <tr key={item.id || idx} className="hover:bg-orange-50/15 transition-colors">
                      {/* 1. Service / Scheme Name */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedRecordForDetails(item)}
                              className="font-bold text-gray-900 block text-xs hover:text-be-orange transition-colors text-left cursor-pointer group"
                            >
                              <span className="group-hover:underline">{item.Service_Scheme || 'Service'}</span>
                            </button>
                            {item.Tenure_of_Service && (
                              <span className="text-[10px] text-gray-400 block">
                                Tenure: {item.Tenure_of_Service}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Internal Team Type */}
                      <td className="px-4 py-3.5 align-middle">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Users size={12} className="text-indigo-500" />
                          {itemNormTeam}
                        </span>
                      </td>

                      {/* Parent Deal & Client (Shown in global mode) */}
                      {mode === 'global' && (
                        <td className="px-4 py-3.5 align-middle">
                          <div
                            onClick={() => navigate(`/crm/deals/${item.Deal_ID}`)}
                            className="cursor-pointer group"
                          >
                            <span className="font-bold text-xs text-gray-900 group-hover:text-be-orange flex items-center gap-1">
                              {item.Deal_Name || `Deal #${item.Deal_ID}`}
                              <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-be-orange transition-opacity" />
                            </span>
                            {item.Client_Name && (
                              <span className="text-[11px] text-gray-500 block truncate max-w-[180px]">
                                {item.Client_Name}
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* 3. Stage Dropdown */}
                      <td className="px-4 py-3.5 align-middle">
                        {(() => {
                          const rowStages = getOperationStagesForTeamType(item.Internal_Team_Type);
                          const currentStage = item.Stage || rowStages[0] || 'Doc collection';
                          const options = rowStages.includes(currentStage as any)
                            ? rowStages
                            : [currentStage, ...rowStages];
                          return (
                            <select
                              value={currentStage}
                              onChange={(e) => handleInlineStageChange(item, e.target.value as OperationStage)}
                              disabled={isSyncing}
                              className="px-2.5 py-1.5 bg-blue-50/60 hover:bg-white focus:bg-white border border-blue-200 hover:border-blue-300 focus:border-blue-500 rounded-lg text-xs font-bold text-blue-900 outline-none transition-all cursor-pointer shadow-2xs w-full min-w-[160px] max-w-[220px]"
                            >
                              {options.map((stg) => (
                                <option key={stg} value={stg}>
                                  {stg}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>

                      {/* 4. Assigned TL (Team Leader) */}
                      <td className="px-4 py-3.5 align-middle">
                        {canManageAllocations ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={resolveSelectedId(item.Team_Leader?.id || item.Team_Leader_TL?.id || (typeof item.Team_Leader_TL === 'string' ? item.Team_Leader_TL : '') || item.Team_Leader_ID, item.Team_Leader?.name || item.Team_Leader_TL?.name || item.Team_Leader_Name)}
                              onChange={(e) => handleInlineTlChange(item, e.target.value)}
                              disabled={isSyncing}
                              className="px-2.5 py-1.5 bg-amber-50/40 hover:bg-white focus:bg-white border border-amber-200 hover:border-amber-300 focus:border-amber-500 rounded-lg text-xs font-semibold text-gray-800 outline-none transition-all cursor-pointer w-full max-w-[210px]"
                            >
                              <option value="">Select Team Leader (TL)...</option>
                              {allTeamLeaders.map(tl => (
                                <option key={`tl_${tl.id}`} value={tl.id}>
                                  {tl.name} ({tl.dept} - TL)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {item.Team_Leader?.name || item.Team_Leader_TL?.name || item.Team_Leader_Name ? (
                              <span className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                {item.Team_Leader?.name || item.Team_Leader_TL?.name || item.Team_Leader_Name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Not Assigned</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. Assigned TM (Team Member) */}
                      <td className="px-4 py-3.5 align-middle">
                        {(canManageAllocations || canAssignTM) ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={resolveSelectedId(item.Team_Member?.id || item.Team_Member_TM?.id || (typeof item.Team_Member_TM === 'string' ? item.Team_Member_TM : '') || item.Team_Member_ID, item.Team_Member?.name || item.Team_Member_TM?.name || item.Team_Member_Name)}
                              onChange={(e) => handleInlineTmChange(item, e.target.value)}
                              disabled={isSyncing}
                              className="px-2.5 py-1.5 bg-emerald-50/40 hover:bg-white focus:bg-white border border-emerald-200 hover:border-emerald-300 focus:border-emerald-500 rounded-lg text-xs font-semibold text-gray-800 outline-none transition-all cursor-pointer w-full max-w-[210px]"
                            >
                              <option value="">Select Team Member (TM)...</option>
                              {allTeamMembers.map(tm => (
                                <option key={`tm_${tm.id}`} value={tm.id}>
                                  {tm.name} ({tm.dept} - TM)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {item.Team_Member?.name || item.Team_Member_TM?.name || item.Team_Member_Name ? (
                              <span className="text-xs font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                {item.Team_Member?.name || item.Team_Member_TM?.name || item.Team_Member_Name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Not Assigned</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 6. Status & Legal Info */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              isAllocated
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}>
                              {item.Allocation_Status || 'Pending Allocation'}
                            </span>
                            {item.Internal_Legal_Status && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                {item.Internal_Legal_Status}
                              </span>
                            )}
                          </div>
                          {(item.CA_CS1 || item.CA_CS2) && (
                            <div className="text-[10px] font-semibold text-purple-700 bg-purple-50 rounded px-1.5 py-0.5 inline-block border border-purple-200">
                              CA/CS: {[item.CA_CS1, item.CA_CS2].filter(Boolean).join(' • ')}
                            </div>
                          )}
                          {(item.Types_of_Legal_Documents || item.Agreement_Terms) && (
                            <div className="text-[11px] text-gray-500">
                              {item.Types_of_Legal_Documents} • {item.Agreement_Terms}
                            </div>
                          )}
                          {item.Remark && (
                            <div className="text-[11px] text-gray-500 italic truncate max-w-[200px]" title={item.Remark}>
                              &quot;{item.Remark}&quot;
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 7. Action Column */}
                      <td className="px-4 py-3.5 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedRecordForDetails(item)}
                            className="px-3 py-1.5 bg-orange-50 hover:bg-be-orange hover:text-white text-be-orange border border-orange-200 hover:border-orange-500 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Open Details & Execution Form"
                          >
                            <FolderOpen size={13} />
                            <span>Details</span>
                          </button>
                          {canManageAllocations && (
                            <button
                              type="button"
                              onClick={() => openAssignModal(item)}
                              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                              title="Edit Staff Allocation"
                            >
                              <Edit3 size={13} />
                              <span>Assign</span>
                            </button>
                          )}
                          {canDeleteAllocations && (
                            <button
                              type="button"
                              onClick={() => setRecordToDelete(item)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Allocation"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Assignment Modal */}
      {assigningRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-orange-50/40">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-be-orange font-bold">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Assign Operations Staff</h3>
                  <p className="text-xs text-gray-500">{assigningRecord.Service_Scheme} • {assigningRecord.Internal_Team_Type}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssigningRecord(null)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Service & Deal Summary */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Service / Scheme:</span>
                  <span className="font-bold text-gray-900">{assigningRecord.Service_Scheme}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Internal Team:</span>
                  <span className="font-bold text-indigo-700">{assigningRecord.Internal_Team_Type}</span>
                </div>
                {assigningRecord.Deal_Name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Deal Name:</span>
                    <span className="font-semibold text-gray-800">{assigningRecord.Deal_Name}</span>
                  </div>
                )}
                {assigningRecord.Remark && (
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span className="text-gray-500 font-medium">Legal Remark:</span>
                    <span className="italic text-gray-700 truncate max-w-[220px]">{assigningRecord.Remark}</span>
                  </div>
                )}
              </div>

              {/* 1. Select Team Leader (TL) */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Assign Team Leader (TL)
                </label>
                <select
                  value={modalSelectedTl}
                  onChange={(e) => setModalSelectedTl(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select Team Leader (TL)...</option>
                  {allTeamLeaders.map(tl => (
                    <option key={`modal_tl_${tl.id}`} value={tl.id}>
                      {tl.name} ({tl.dept} - TL)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Supervises the execution and milestone delivery for this service line.</p>
              </div>

              {/* 2. Select Team Member (TM) */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Assign Team Member (TM)
                </label>
                <select
                  value={modalSelectedTm}
                  onChange={(e) => setModalSelectedTm(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select Team Member (TM)...</option>
                  {allTeamMembers.map(tm => (
                    <option key={`modal_tm_${tm.id}`} value={tm.id}>
                      {tm.name} ({tm.dept} - TM)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Primary executor responsible for drafting, application filing, and client follow-up.</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 p-4 bg-gray-50/80 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAssigningRecord(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalAssignment}
                disabled={syncingId === assigningRecord.id}
                className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {syncingId === assigningRecord.id ? (
                  <Loader2 size={14} className="animate-spin text-white" />
                ) : (
                  <Save size={14} className="text-white" />
                )}
                <span>Save Allocation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child Record Detail & Execution Modal */}
      {selectedRecordForDetails && (
        <InternalOperationDetailModal
          record={selectedRecordForDetails}
          onClose={() => setSelectedRecordForDetails(null)}
          onSaved={(updated) => {
            setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
            setSelectedRecordForDetails(updated);
          }}
          onDelete={async (rec) => {
            setSelectedRecordForDetails(null);
            await deleteInternalOperation(rec.id);
            setRecords(prev => prev.filter(r => r.id !== rec.id));
            setToastMessage({
              type: 'success',
              text: `Service allocation "${rec.Service_Scheme || 'Record'}" deleted successfully.`
            });
          }}
          allStaff={allExistingEmployees}
          allTeamLeaders={allTeamLeaders}
          allTeamMembers={allTeamMembers}
          canManage={canManageAllocations || hasSupervisoryOversight}
          canAssignTM={canAssignTM}
          canDelete={canDeleteAllocations}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(recordToDelete)}
        onClose={() => !isDeletingRecord && setRecordToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Service Allocation"
        itemName={recordToDelete?.Service_Scheme || 'Service Allocation'}
        message={`Are you sure you want to delete the service allocation "${recordToDelete?.Service_Scheme || ''}"? This will remove the record from internal operations.`}
        isDeleting={isDeletingRecord}
      />
    </div>
  );
};
