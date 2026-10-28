import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type {
  InternalOperationRecord,
  OperationStage,
  StandardExecutionStatus,
  CompanyType,
  UploadedFileMeta
} from '../../types/operations';
import {
  OPERATION_STAGES,
  STANDARD_EXECUTION_STATUSES,
  STATUSES_WITH_REJECTED,
  NAME_APPLICATION_STATUSES,
  DSC_CREATION_STATUSES,
  FINAL_FILING_STATUSES,
  BOARD_RESOLUTION_STATUSES,
  SHARE_CERTIFICATE_STATUSES,
  POST_INCORPORATION_STATUSES,
  CERT_DOC_COLLECTION_STATUSES,
  CERT_FINAL_APP_STATUSES,
  FUNDING_DPR_STATUSES,
  FUNDING_FINANCE_STATUSES,
  FUNDING_APP_SUBMISSION_STATUSES,
  DIRECTOR_ITR_STATUSES,
  COMPANY_TYPES,
  getOperationStagesForTeamType
} from '../../types/operations';
import {
  normalizeTeamType,
  saveInternalOperation,
  syncTeamTypeToLegalSubform
} from '../../services/internalOperationsService';
import { uploadZohoAttachment, fetchZohoAttachments } from '../../services/zohoService';
import { FileUploadWidget as BaseFileUploadWidget } from './FileUploadWidget';
import type { NormalizedStaff } from './InternalOperationsAllocationTable';
import {
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Briefcase,
  Users,
  ShieldCheck,
  FileText,
  Clock,
  Layers,
  Award,
  Share2,
  Building,
  RefreshCw,
  FolderOpen,
  Calendar,
  Key,
  Hash,
  AlertTriangle,
  PlusCircle,
  UserCheck,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import { DeleteConfirmModal } from '../ui/DeleteConfirmModal';
import { isMatchingName } from '../../utils/employeeUtils';

export interface OperationsStaffContextType {
  operationsStaff: NormalizedStaff[];
  operationsTLs: NormalizedStaff[];
  operationsTMs: NormalizedStaff[];
  recordId?: string;
}

export const OperationsStaffContext = createContext<OperationsStaffContextType>({
  operationsStaff: [],
  operationsTLs: [],
  operationsTMs: []
});

export const useOperationsStaff = () => useContext(OperationsStaffContext);

export const FileUploadWidget: React.FC<React.ComponentProps<typeof BaseFileUploadWidget>> = (props) => {
  const staffCtx = useContext(OperationsStaffContext);
  return <BaseFileUploadWidget recordId={props.recordId || staffCtx.recordId} {...props} />;
};

export const StaffNameSelect: React.FC<{
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  badge?: string;
}> = ({
  label = 'Name',
  value,
  onChange,
  placeholder = 'Select Operations staff...',
  badge
}) => {
  const context = useContext(OperationsStaffContext);
  const [isCustom, setIsCustom] = useState<boolean>(false);

  // Fallback to localStorage if context not yet populated
  const { staffList, tlList, tmList } = useMemo(() => {
    let staff = (context && context.operationsStaff && context.operationsStaff.length > 0)
      ? context.operationsStaff
      : [];

    if (staff.length === 0) {
      try {
        const stored = localStorage.getItem('be_employees');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            staff = parsed
              .map((e: any) => {
                const firstName = e.Name || e.First_Name || e.firstName || '';
                const middleName = e.Middle_Name || e.middleName || '';
                const lastName = e.Last_Name || e.lastName || '';
                const composite = [firstName, middleName, lastName].filter(Boolean).join(' ');
                const name = String(e.name || composite || e.Employee_Name || e.fullName || '').trim();
                const dept = String(e.dept || e.department || e.Department || e.formData?.dept || 'Operations').trim();
                const rawRole = String(e.systemRole || e.System_Role || e.role || e.Designation_Job_Title || e.designation || 'TM').trim();
                const isTL = rawRole.toLowerCase().includes('tl') || rawRole.toLowerCase().includes('leader');
                return {
                  id: String(e.id || e.empId || e.zohoId || name),
                  name,
                  role: isTL ? 'TL' : 'TM',
                  systemRole: isTL ? 'TL' : 'TM',
                  dept,
                  email: String(e.email || ''),
                  isTL,
                  isTM: !isTL
                };
              })
              .filter((s: NormalizedStaff) => s.name && s.name !== 'Employee' && !/^\d{15,}$/.test(s.name));
          }
        }
      } catch (_) {}
    }

    const seen = new Set<string>();
    const filteredOps: NormalizedStaff[] = [];
    staff.forEach(s => {
      if (!s.name || s.name === 'Employee' || /^\d{15,}$/.test(s.name)) return;
      const dept = (s.dept || '').toLowerCase();
      const isOps = dept.includes('operat') || (!dept.includes('sale') && !dept.includes('legal') && !dept.includes('hr') && !dept.includes('account'));
      if (isOps) {
        const key = s.name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          filteredOps.push(s);
        }
      }
    });
    filteredOps.sort((a, b) => a.name.localeCompare(b.name));

    return {
      staffList: filteredOps,
      tlList: filteredOps.filter(s => s.isTL),
      tmList: filteredOps.filter(s => !s.isTL)
    };
  }, [context.operationsStaff]);

  const hasCurrentInList = value && staffList.some(s => s.name.toLowerCase() === value.trim().toLowerCase());

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
          <span>{label}</span>
          {badge && (
            <span className="text-[9px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={() => setIsCustom(!isCustom)}
          className="text-[10px] font-semibold text-be-orange hover:text-orange-700 transition-colors cursor-pointer"
        >
          {isCustom ? 'Choose from list' : '+ Custom name'}
        </button>
      </div>

      {isCustom ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type responsible name..."
          className="w-full px-3 py-2 bg-white border border-be-orange/40 focus:border-be-orange rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
        />
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setIsCustom(true);
            } else {
              onChange(e.target.value);
            }
          }}
          className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 focus:border-be-orange rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {value && !hasCurrentInList && (
            <option value={value}>{value} (Current)</option>
          )}
          {tlList.length > 0 && (
            <optgroup label="Operations Team Leaders (TL)">
              {tlList.map(tl => (
                <option key={`op_tl_${tl.id}_${tl.name}`} value={tl.name}>
                  {tl.name} (TL)
                </option>
              ))}
            </optgroup>
          )}
          {tmList.length > 0 && (
            <optgroup label="Operations Employees / Team Members (TM)">
              {tmList.map(tm => (
                <option key={`op_tm_${tm.id}_${tm.name}`} value={tm.name}>
                  {tm.name} (Operations)
                </option>
              ))}
            </optgroup>
          )}
          <option value="__custom__">+ Enter custom name...</option>
        </select>
      )}
    </div>
  );
};

export const AUDITOR_OPTIONS = [
  'Dipen shah',
  'Pooja Shah',
  'Komal thakkar'
];

export const AuditorNameSelect: React.FC<{
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({
  label = 'Auditor Name',
  value,
  onChange,
  placeholder = 'Select Auditor...'
}) => {
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const hasCurrentInList = value && AUDITOR_OPTIONS.some(
    opt => opt.toLowerCase() === value.trim().toLowerCase()
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
          <span>{label}</span>
        </label>
        <button
          type="button"
          onClick={() => setIsCustom(!isCustom)}
          className="text-[10px] font-semibold text-be-orange hover:text-orange-700 transition-colors cursor-pointer"
        >
          {isCustom ? 'Choose from list' : '+ Custom name'}
        </button>
      </div>

      {isCustom ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type auditor name..."
          className="w-full px-3 py-2 bg-white border border-be-orange/40 focus:border-be-orange rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
        />
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setIsCustom(true);
            } else {
              onChange(e.target.value);
            }
          }}
          className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 focus:border-be-orange rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {value && !hasCurrentInList && (
            <option value={value}>{value} (Current)</option>
          )}
          {AUDITOR_OPTIONS.map((auditor) => (
            <option key={auditor} value={auditor}>
              {auditor}
            </option>
          ))}
          <option value="__custom__">+ Enter custom auditor...</option>
        </select>
      )}
    </div>
  );
};

export const SECTION_ATTACHMENT_CONFIG: Record<string, { tag: string; label: string; fileKey: string }> = {
  docCollection: { tag: 'Doc Collection', label: 'Doc Collection', fileKey: 'Doc_collection_File_Upload' },
  compDocCollection: { tag: 'Doc Collection', label: 'Doc Collection', fileKey: 'Doc_collection_File_Upload' },
  certDocCollection: { tag: 'Doc Collection', label: 'Doc Collection', fileKey: 'Doc_collection_File_Upload' },
  nameApp: { tag: 'Name Application', label: 'Name Application', fileKey: 'Name_Application_File_Upload' },
  accounting: { tag: 'Name Application', label: 'Accounting', fileKey: 'Name_Application_File_Upload' },
  dscCreation: { tag: 'DSC Creation', label: 'DSC Creation', fileKey: 'DSC_Creation_File_Upload' },
  finalFiling: { tag: 'Final Filing', label: 'Final Filing', fileKey: 'Final_Filing_File_Upload' },
  boardResolution: { tag: 'Board Resolution', label: 'Board Resolution', fileKey: 'Board_Resolution_File_Upload' },
  audit: { tag: 'Board Resolution', label: 'Audit', fileKey: 'Board_Resolution_File_Upload' },
  shareCertificate: { tag: 'Share Certificate', label: 'Share Certificate', fileKey: 'Share_Certificate_File_Upload' },
  mgt7: { tag: 'Share Certificate', label: 'MGT-7', fileKey: 'Share_Certificate_File_Upload' },
  msmeCertificate: { tag: 'MSME', label: 'MSME Certificate', fileKey: 'MSME_Certificate_File_Upload' },
  msmeCertificateLlp: { tag: 'MSME', label: 'MSME Certificate', fileKey: 'MSME_Certificate_File_Upload' },
  aoc4: { tag: 'AOC-4', label: 'AOC-4', fileKey: 'AOC_4_File_Upload' },
  adt1: { tag: 'ADT-1', label: 'ADT-1', fileKey: 'ADT_1_File_Upload' },
  compAdt1: { tag: 'ADT-1', label: 'ADT-1', fileKey: 'ADT_1_File_Upload' },
  inc20A: { tag: 'INC-20A', label: 'INC-20A', fileKey: 'INC_20_A_File_Upload' },
  dpt3: { tag: 'INC-20A', label: 'DPT-3', fileKey: 'INC_20_A_File_Upload' },
  form3: { tag: 'Finance', label: 'Finance / Projected Financials', fileKey: 'Finance_Projected_Financials_File_Upload' },
  compForm3: { tag: 'Finance', label: 'Finance / Projected Financials', fileKey: 'Finance_Projected_Financials_File_Upload' },
  fundingFinance: { tag: 'Finance', label: 'Finance / Projected Financials', fileKey: 'Finance_Projected_Financials_File_Upload' },
  appSubmission: { tag: 'Application Submission', label: 'Application Submission', fileKey: 'Application_submission_File_Upload' },
  llpAgreement: { tag: 'Application Submission', label: 'LLP Agreement', fileKey: 'Application_submission_File_Upload' },
  certFinalApp: { tag: 'Application Submission', label: 'Application Submission', fileKey: 'Application_submission_File_Upload' },
  directorItr: { tag: 'Director / Company ITR', label: 'Director ITR', fileKey: 'Director_ITR_Company_ITR_File_Upload' },
  companyItr: { tag: 'Director / Company ITR', label: 'Company ITR', fileKey: 'Director_ITR_Company_ITR_File_Upload' },
  dprCreation: { tag: 'DPR', label: 'DPR / Pitch Deck Creation', fileKey: 'DPR_Pitch_deck_creation_File_Upload' },
  compInc: { tag: 'DPR', label: 'Incorporation', fileKey: 'DPR_Pitch_deck_creation_File_Upload' },
  inc: { tag: 'DPR', label: 'Incorporation', fileKey: 'DPR_Pitch_deck_creation_File_Upload' },
  form8: { tag: 'Form 8', label: 'Form 8', fileKey: 'Form_8_File_Upload' },
  form11: { tag: 'Form 11', label: 'Form 11', fileKey: 'Form_11_File_Upload' }
};

export function mergeAttachmentsIntoSections(
  sections: Record<string, any>,
  attachments: any[],
  currentRecordId?: string
): Record<string, any> {
  if (!Array.isArray(attachments) || attachments.length === 0) return sections;

  const nextSections = { ...sections };

  attachments.forEach((att) => {
    const rawName = String(att.File_Name || att.name || 'Document');
    const attId = String(att.id || att.attachmentId || att.$file_id || '');
    const attSize = Number(att.Size || att.size || 0);
    const createdTime = att.Created_Time || att.uploadedAt || new Date().toISOString();

    const tagMatch = rawName.match(/^\[(.*?)\]\s*(.*)$/);
    let targetSectionKey = '';
    let cleanName = rawName;

    if (tagMatch) {
      const tagContent = tagMatch[1].trim().toLowerCase();
      cleanName = tagMatch[2].trim() || rawName;

      for (const [secKey, cfg] of Object.entries(SECTION_ATTACHMENT_CONFIG)) {
        if (
          cfg.tag.toLowerCase() === tagContent ||
          cfg.label.toLowerCase() === tagContent ||
          secKey.toLowerCase() === tagContent ||
          cfg.fileKey.toLowerCase() === tagContent
        ) {
          targetSectionKey = secKey;
          break;
        }
      }
    }

    if (!targetSectionKey) {
      for (const secKey of Object.keys(nextSections)) {
        const secFiles = nextSections[secKey]?.files;
        if (Array.isArray(secFiles)) {
          const found = secFiles.some((f: any) =>
            f.id === attId ||
            f.attachmentId === attId ||
            f.name === rawName ||
            f.name === cleanName
          );
          if (found) {
            targetSectionKey = secKey;
            break;
          }
        }
      }
    }

    if (!targetSectionKey) {
      const lower = rawName.toLowerCase();
      if (lower.includes('dpr') || lower.includes('pitch')) targetSectionKey = 'dprCreation';
      else if (lower.includes('finance') || lower.includes('projected')) targetSectionKey = 'fundingFinance';
      else if (lower.includes('doc_coll') || lower.includes('collection') || lower.includes('pan') || lower.includes('aadhar')) targetSectionKey = 'docCollection';
      else if (lower.includes('name_app') || lower.includes('nameapp')) targetSectionKey = 'nameApp';
      else if (lower.includes('board_res') || lower.includes('resolution')) targetSectionKey = 'boardResolution';
      else if (lower.includes('share_cert') || lower.includes('certificate')) targetSectionKey = 'shareCertificate';
      else if (lower.includes('msme') || lower.includes('udyam')) targetSectionKey = 'msmeCertificate';
      else if (lower.includes('aoc') || lower.includes('aoc-4')) targetSectionKey = 'aoc4';
      else if (lower.includes('adt') || lower.includes('adt-1')) targetSectionKey = 'adt1';
      else if (lower.includes('inc_20') || lower.includes('inc20') || lower.includes('dpt3')) targetSectionKey = 'inc20A';
      else if (lower.includes('submission') || lower.includes('portal') || lower.includes('ack')) targetSectionKey = 'appSubmission';
      else if (lower.includes('itr') || lower.includes('tax')) targetSectionKey = 'directorItr';
      else if (lower.includes('form_8') || lower.includes('form8')) targetSectionKey = 'form8';
      else if (lower.includes('form_11') || lower.includes('form11')) targetSectionKey = 'form11';
      else targetSectionKey = 'docCollection';
    }

    if (!nextSections[targetSectionKey]) {
      nextSections[targetSectionKey] = {};
    }
    const currentList: UploadedFileMeta[] = Array.isArray(nextSections[targetSectionKey].files)
      ? [...nextSections[targetSectionKey].files]
      : [];

    const existingIdx = currentList.findIndex(
      (f) => f.id === attId || f.attachmentId === attId || f.name === cleanName || f.name === rawName
    );

    const fileMeta: UploadedFileMeta = {
      id: attId || `att_${Date.now()}`,
      attachmentId: attId,
      fileId: attId,
      name: cleanName,
      size: attSize,
      type: 'application/octet-stream',
      uploadedAt: createdTime,
      recordId: currentRecordId,
      url: undefined,
      rawFile: undefined
    };

    if (existingIdx >= 0) {
      currentList[existingIdx] = {
        ...currentList[existingIdx],
        ...fileMeta,
        attachmentId: attId,
        id: attId,
        url: undefined,
        rawFile: undefined
      };
    } else {
      currentList.push(fileMeta);
    }

    nextSections[targetSectionKey] = {
      ...nextSections[targetSectionKey],
      files: currentList
    };
  });

  return nextSections;
}

interface InternalOperationDetailModalProps {
  record: InternalOperationRecord;
  onClose: () => void;
  onSaved?: (updatedRecord: InternalOperationRecord) => void;
  onDelete?: (record: InternalOperationRecord) => void | Promise<void>;
  allStaff?: NormalizedStaff[];
  allTeamLeaders?: NormalizedStaff[];
  allTeamMembers?: NormalizedStaff[];
  canManage?: boolean;
  canAssignTM?: boolean;
  canDelete?: boolean;
}

export const InternalOperationDetailModal: React.FC<InternalOperationDetailModalProps> = ({
  record,
  onClose,
  onSaved,
  onDelete,
  allStaff = [],
  allTeamLeaders = [],
  allTeamMembers = [],
  canManage = false,
  canAssignTM = false,
  canDelete = false
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const isSuperAdmin = Boolean(
    currentUser?.role === 'Super Admin' ||
    (currentUser as any)?.systemRole === 'Super Admin' ||
    currentUser?.email === 'admin@bharat-edge.com'
  );
  const userDept = (currentUser?.department || (currentUser as any)?.dept || '').toLowerCase();
  const userRole = (currentUser?.role || (currentUser as any)?.systemRole || '').toLowerCase();
  const isLegalUser = userDept.includes('legal') || Boolean((currentUser as any)?.isLegal);
  const isHODUser = userRole.includes('hod') || userRole.includes('head') || userRole.includes('admin');
  const isLegalHOD = isSuperAdmin || (isHODUser && isLegalUser) || (String(currentUser?.role || '') === 'Admin (HOD)' && isLegalUser);

  // Legal HOD, Operations HOD, Super Admin, and managers can edit the Team Type
  const canEditTeamType = Boolean(canManage || isLegalHOD || isSuperAdmin);

  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Normalized Team Type (Incorporation, Compliance, Funding, Certification, Digital Marketing)
  const [teamType, setTeamType] = useState<string>(() => normalizeTeamType(record.Team_Type || record.Internal_Team_Type));

  // Dynamic available stages based on the current Team Type
  const availableStages = useMemo(() => {
    return getOperationStagesForTeamType(teamType);
  }, [teamType]);

  // Common Fields State (Phase 2)
  const [stage, setStage] = useState<OperationStage>(() => {
    if (record.Operation_Stage) return record.Operation_Stage as OperationStage;
    if (record.Stage) return record.Stage;
    const initialStages = getOperationStagesForTeamType(record.Team_Type || record.Internal_Team_Type);
    return initialStages[0] || 'Doc collection';
  });
  const [caCs1, setCaCs1] = useState<string>(record.CA_CS1 || '');
  const [caCs2, setCaCs2] = useState<string>(record.CA_CS2 || '');
  const [isCustomCaCs1, setIsCustomCaCs1] = useState<boolean>(false);
  const [isCustomCaCs2, setIsCustomCaCs2] = useState<boolean>(false);
  const [localEmployees, setLocalEmployees] = useState<NormalizedStaff[]>([]);

  useEffect(() => {
    if (allStaff && allStaff.length > 0) return;
    try {
      const stored = localStorage.getItem('be_employees');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const mapped: NormalizedStaff[] = parsed
            .map((e: any) => {
              const firstName = e.Name || e.First_Name || e.firstName || '';
              const middleName = e.Middle_Name || e.middleName || '';
              const lastName = e.Last_Name || e.lastName || '';
              const compositeName = [firstName, middleName, lastName].filter(Boolean).join(' ');
              const name = String(e.name || compositeName || e.Employee_Name || e.fullName || '').trim();
              const dept = String(e.dept || e.department || e.Department || e.formData?.dept || 'Operations').trim();
              const rawRole = String(e.systemRole || e.System_Role || e.role || e.Designation_Job_Title || e.designation || 'TM').trim();
              const isTL = rawRole.toLowerCase().includes('tl') || rawRole.toLowerCase().includes('leader');
              return {
                id: String(e.id || e.empId || e.zohoId || name),
                name,
                role: isTL ? 'TL' : 'TM',
                systemRole: isTL ? 'TL' : 'TM',
                dept,
                email: String(e.email || ''),
                isTL,
                isTM: !isTL
              };
            })
            .filter((s: NormalizedStaff) => s.name && s.name !== 'Employee' && !/^\d{15,}$/.test(s.name));
          setLocalEmployees(mapped);
        }
      }
    } catch (_) {}
  }, [allStaff]);

  // Operations Department staff: all employees (TM) and Team Leaders (TL) in Operations
  const operationsStaff = useMemo(() => {
    const list = (allStaff && allStaff.length > 0) ? allStaff : localEmployees;
    const seen = new Set<string>();
    const filtered: NormalizedStaff[] = [];

    list.forEach(s => {
      if (!s.name || s.name === 'Employee' || /^\d{15,}$/.test(s.name)) return false;
      const dept = (s.dept || '').toLowerCase();
      // Include if dept mentions operation, or if not in non-ops departments (legal, sales, hr, accounts)
      const isOps = dept.includes('operat') || (!dept.includes('sale') && !dept.includes('legal') && !dept.includes('hr') && !dept.includes('account'));
      if (isOps) {
        const key = s.name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          filtered.push(s);
        }
      }
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [allStaff, localEmployees]);

  const operationsTLs = useMemo(() => {
    return operationsStaff.filter(s => s.isTL);
  }, [operationsStaff]);

  const operationsTMs = useMemo(() => {
    return operationsStaff.filter(s => !s.isTL);
  }, [operationsStaff]);

  const [selectedTlId, setSelectedTlId] = useState<string>(
    record.Team_Leader?.id || record.Team_Leader_TL?.id || (typeof record.Team_Leader_TL === 'string' ? record.Team_Leader_TL : '') || record.Team_Leader_ID || ''
  );
  const [selectedTmId, setSelectedTmId] = useState<string>(
    record.Team_Member?.id || record.Team_Member_TM?.id || (typeof record.Team_Member_TM === 'string' ? record.Team_Member_TM : '') || record.Team_Member_ID || ''
  );

  // Dynamic Sections State Store
  const [sections, setSections] = useState<Record<string, any>>(() => {
    const s = record.sectionsData ? { ...record.sectionsData } : {};

    // Map Zoho CRM Doc collection fields if available on record
    const zohoDocName = record.Doc_collection_name || '';
    const zohoDocDate = record.Doc_collection_Date || '';
    const zohoDocStatus = record.Doc_collection_status || '';
    const zohoDocFiles = Array.isArray(record.Doc_collection_File_Upload) ? record.Doc_collection_File_Upload : [];

    if (!s.docCollection) s.docCollection = {};
    if (!s.docCollection.name && zohoDocName) s.docCollection.name = zohoDocName;
    if (!s.docCollection.date && zohoDocDate) s.docCollection.date = zohoDocDate;
    if (!s.docCollection.status && zohoDocStatus) s.docCollection.status = zohoDocStatus;
    if ((!s.docCollection.files || s.docCollection.files.length === 0) && zohoDocFiles.length > 0) {
      s.docCollection.files = zohoDocFiles;
    }

    if (!s.compDocCollection) s.compDocCollection = {};
    if (!s.compDocCollection.name && zohoDocName) s.compDocCollection.name = zohoDocName;
    if (!s.compDocCollection.date && zohoDocDate) s.compDocCollection.date = zohoDocDate;
    if (!s.compDocCollection.status && zohoDocStatus) s.compDocCollection.status = zohoDocStatus;
    if ((!s.compDocCollection.files || s.compDocCollection.files.length === 0) && zohoDocFiles.length > 0) {
      s.compDocCollection.files = zohoDocFiles;
    }

    if (!s.certDocCollection) s.certDocCollection = {};
    if (!s.certDocCollection.name && zohoDocName) s.certDocCollection.name = zohoDocName;
    if (!s.certDocCollection.date && zohoDocDate) s.certDocCollection.date = zohoDocDate;
    if (!s.certDocCollection.status && zohoDocStatus) s.certDocCollection.status = zohoDocStatus;
    if ((!s.certDocCollection.files || s.certDocCollection.files.length === 0) && zohoDocFiles.length > 0) {
      s.certDocCollection.files = zohoDocFiles;
    }

    // Map Zoho CRM Name Application / Accounting fields if available on record
    const zohoNameAppName = record.Name_Application_name || '';
    const zohoNameAppApprovedName = record.Name_Application_approved_name || '';
    const zohoNameAppDate = record.Name_Application_date || '';
    const zohoNameAppStatus = record.Name_Application_status || '';
    const zohoNameAppFiles = Array.isArray(record.Name_Application_File_Upload) ? record.Name_Application_File_Upload : [];

    if (!s.nameApp) s.nameApp = {};
    if (!s.nameApp.name && zohoNameAppName) s.nameApp.name = zohoNameAppName;
    if (!s.nameApp.approvedName && zohoNameAppApprovedName) s.nameApp.approvedName = zohoNameAppApprovedName;
    if (!s.nameApp.date && zohoNameAppDate) s.nameApp.date = zohoNameAppDate;
    if (!s.nameApp.status && zohoNameAppStatus) s.nameApp.status = zohoNameAppStatus;
    if ((!s.nameApp.files || s.nameApp.files.length === 0) && zohoNameAppFiles.length > 0) {
      s.nameApp.files = zohoNameAppFiles;
    }

    if (!s.accounting) s.accounting = {};
    if (!s.accounting.name && zohoNameAppName) s.accounting.name = zohoNameAppName;
    if (!s.accounting.date && zohoNameAppDate) s.accounting.date = zohoNameAppDate;
    if (!s.accounting.status && zohoNameAppStatus) s.accounting.status = zohoNameAppStatus;
    if ((!s.accounting.files || s.accounting.files.length === 0) && zohoNameAppFiles.length > 0) {
      s.accounting.files = zohoNameAppFiles;
    }

    // Map Zoho CRM DSC Creation fields if available on record
    const zohoDscName = record.DSC_Creation_name || '';
    const zohoDscDate = record.DSC_Creation_Date || '';
    const zohoDscStatus = record.DSC_Creation_status || '';

    if (!s.dscCreation) s.dscCreation = {};
    if (!s.dscCreation.name && zohoDscName) s.dscCreation.name = zohoDscName;
    if (!s.dscCreation.date && zohoDscDate) s.dscCreation.date = zohoDscDate;
    if (!s.dscCreation.status && zohoDscStatus) s.dscCreation.status = zohoDscStatus;

    // Map Zoho CRM Final Filing fields if available on record
    const zohoFinalFilingName = record.Final_Filing_name || '';
    const zohoFinalFilingApprovalName = record.Final_Filing_Final_Approval_Name || '';
    const zohoFinalFilingDate = record.Final_Filing_Date || '';
    const zohoFinalFilingDoiDate = record.Final_Filing_DOI_Date || '';
    const zohoFinalFilingStatus = record.Final_Filing_status || '';

    if (!s.finalFiling) s.finalFiling = {};
    if (!s.finalFiling.name && zohoFinalFilingName) s.finalFiling.name = zohoFinalFilingName;
    if (!s.finalFiling.finalApprovalName && zohoFinalFilingApprovalName) s.finalFiling.finalApprovalName = zohoFinalFilingApprovalName;
    if (!s.finalFiling.date && zohoFinalFilingDate) s.finalFiling.date = zohoFinalFilingDate;
    if (!s.finalFiling.doiDate && zohoFinalFilingDoiDate) s.finalFiling.doiDate = zohoFinalFilingDoiDate;
    if (!s.finalFiling.status && zohoFinalFilingStatus) s.finalFiling.status = zohoFinalFilingStatus;

    // Map Zoho CRM Board Resolution / Audit fields if available on record
    const zohoBrName = record.Board_Resolution_name || '';
    const zohoBrDate = record.Board_Resolution_Date || '';
    const zohoBrStatus = record.Board_Resolution_status || '';
    const zohoBrFiles = Array.isArray(record.Board_Resolution_File_Upload) ? record.Board_Resolution_File_Upload : [];

    if (!s.boardResolution) s.boardResolution = {};
    if (!s.boardResolution.name && zohoBrName) s.boardResolution.name = zohoBrName;
    if (!s.boardResolution.date && zohoBrDate) s.boardResolution.date = zohoBrDate;
    if (!s.boardResolution.status && zohoBrStatus) s.boardResolution.status = zohoBrStatus;
    if ((!s.boardResolution.files || s.boardResolution.files.length === 0) && zohoBrFiles.length > 0) {
      s.boardResolution.files = zohoBrFiles;
    }

    if (!s.audit) s.audit = {};
    if (!s.audit.name && zohoBrName) s.audit.name = zohoBrName;
    if (!s.audit.date && zohoBrDate) s.audit.date = zohoBrDate;
    if (!s.audit.status && zohoBrStatus) s.audit.status = zohoBrStatus;
    if ((!s.audit.files || s.audit.files.length === 0) && zohoBrFiles.length > 0) {
      s.audit.files = zohoBrFiles;
    }

    // Map Zoho CRM 2-Share Certificate / MGT-7 / 7A fields if available on record
    const zohoScName = record.Share_Certificate_name || '';
    const zohoScDate = record.Share_Certificate_Date || '';
    const zohoScStatus = record.Share_Certificate_status || '';
    const zohoScFiles = Array.isArray(record.Share_Certificate_File_Upload) ? record.Share_Certificate_File_Upload : [];

    if (!s.shareCertificate) s.shareCertificate = {};
    if (!s.shareCertificate.name && zohoScName) s.shareCertificate.name = zohoScName;
    if (!s.shareCertificate.date && zohoScDate) s.shareCertificate.date = zohoScDate;
    if (!s.shareCertificate.status && zohoScStatus) s.shareCertificate.status = zohoScStatus;
    if ((!s.shareCertificate.files || s.shareCertificate.files.length === 0) && zohoScFiles.length > 0) {
      s.shareCertificate.files = zohoScFiles;
    }

    if (!s.mgt7) s.mgt7 = {};
    if (!s.mgt7.name && zohoScName) s.mgt7.name = zohoScName;
    if (!s.mgt7.date && zohoScDate) s.mgt7.date = zohoScDate;
    if (!s.mgt7.status && zohoScStatus) s.mgt7.status = zohoScStatus;
    if ((!s.mgt7.files || s.mgt7.files.length === 0) && zohoScFiles.length > 0) {
      s.mgt7.files = zohoScFiles;
    }

    // Map Zoho CRM MSME Certificate fields if available on record
    const zohoMsmeDate = record.MSME_Certificate_Date || '';
    const zohoMsmeStatus = record.MSME_Certificate_status || '';
    const zohoMsmeFileStr = record.MSME_Certificate || '';
    const zohoMsmeFiles = Array.isArray(record.MSME_Certificate_File_Upload)
      ? record.MSME_Certificate_File_Upload
      : (zohoMsmeFileStr ? [{ name: zohoMsmeFileStr, url: zohoMsmeFileStr }] : []);

    if (!s.msmeCertificate) s.msmeCertificate = {};
    if (!s.msmeCertificate.date && zohoMsmeDate) s.msmeCertificate.date = zohoMsmeDate;
    if (!s.msmeCertificate.status && zohoMsmeStatus) s.msmeCertificate.status = zohoMsmeStatus;
    if ((!s.msmeCertificate.files || s.msmeCertificate.files.length === 0) && zohoMsmeFiles.length > 0) {
      s.msmeCertificate.files = zohoMsmeFiles;
    }

    if (!s.msmeCertificateLlp) s.msmeCertificateLlp = {};
    if (!s.msmeCertificateLlp.date && zohoMsmeDate) s.msmeCertificateLlp.date = zohoMsmeDate;
    if (!s.msmeCertificateLlp.status && zohoMsmeStatus) s.msmeCertificateLlp.status = zohoMsmeStatus;
    if ((!s.msmeCertificateLlp.files || s.msmeCertificateLlp.files.length === 0) && zohoMsmeFiles.length > 0) {
      s.msmeCertificateLlp.files = zohoMsmeFiles;
    }

    // Map Zoho CRM AOC-4 fields if available on record
    const zohoAoc4Name = record.AOC_4_name || '';
    const zohoAoc4DirectorAudit = record.AOC_4_Director_Audit_report || '';

    if (!s.aoc4) s.aoc4 = {};
    if (!s.aoc4.name && zohoAoc4Name) s.aoc4.name = zohoAoc4Name;
    if (!s.aoc4.directorAuditReport && zohoAoc4DirectorAudit) s.aoc4.directorAuditReport = zohoAoc4DirectorAudit;
    if (!s.aoc4.date && zohoMsmeDate) s.aoc4.date = zohoMsmeDate;
    if (!s.aoc4.status && zohoMsmeStatus) s.aoc4.status = zohoMsmeStatus;
    if ((!s.aoc4.files || s.aoc4.files.length === 0) && zohoMsmeFiles.length > 0) {
      s.aoc4.files = zohoMsmeFiles;
    }

    // Map Zoho CRM ADT-1 fields if available on record
    const zohoAdt1Name = record.ADT_1_name || '';
    const zohoAdt1Auditor = record.ADT_1_Auditor_name || '';
    const zohoAdt1Date = record.ADT_1_date || '';
    const zohoAdt1Status = record.ADT_1_status || '';
    const zohoAdt1Files = Array.isArray(record.ADT_1_File_Upload) ? record.ADT_1_File_Upload : [];

    if (!s.adt1) s.adt1 = {};
    if (!s.adt1.name && zohoAdt1Name) s.adt1.name = zohoAdt1Name;
    if (!s.adt1.auditorName && zohoAdt1Auditor) s.adt1.auditorName = zohoAdt1Auditor;
    if (!s.adt1.date && zohoAdt1Date) s.adt1.date = zohoAdt1Date;
    if (!s.adt1.status && zohoAdt1Status) s.adt1.status = zohoAdt1Status;
    if ((!s.adt1.files || s.adt1.files.length === 0) && zohoAdt1Files.length > 0) {
      s.adt1.files = zohoAdt1Files;
    }

    if (!s.compAdt1) s.compAdt1 = {};
    if (!s.compAdt1.name && zohoAdt1Name) s.compAdt1.name = zohoAdt1Name;
    if (!s.compAdt1.auditorName && zohoAdt1Auditor) s.compAdt1.auditorName = zohoAdt1Auditor;
    if (!s.compAdt1.date && zohoAdt1Date) s.compAdt1.date = zohoAdt1Date;
    if (!s.compAdt1.status && zohoAdt1Status) s.compAdt1.status = zohoAdt1Status;
    if ((!s.compAdt1.files || s.compAdt1.files.length === 0) && zohoAdt1Files.length > 0) {
      s.compAdt1.files = zohoAdt1Files;
    }

    if (!s.audit) s.audit = {};
    if (!s.audit.auditorName && zohoAdt1Auditor) s.audit.auditorName = zohoAdt1Auditor;

    // Map Zoho CRM INC 20-A / DPT 3 fields if available on record
    const zohoInc20AName = record.INC_20_A_name || '';
    const zohoInc20ADate = record.INC_20_A_Date || '';
    const zohoInc20AStatus = record.INC_20_A_status || '';
    const zohoInc20AFiles = Array.isArray(record.INC_20_A_File_Upload) ? record.INC_20_A_File_Upload : [];

    if (!s.inc20A) s.inc20A = {};
    if (!s.inc20A.name && zohoInc20AName) s.inc20A.name = zohoInc20AName;
    if (!s.inc20A.date && zohoInc20ADate) s.inc20A.date = zohoInc20ADate;
    if (!s.inc20A.status && zohoInc20AStatus) s.inc20A.status = zohoInc20AStatus;
    if ((!s.inc20A.files || s.inc20A.files.length === 0) && zohoInc20AFiles.length > 0) {
      s.inc20A.files = zohoInc20AFiles;
    }

    if (!s.dpt3) s.dpt3 = {};
    if (!s.dpt3.name && zohoInc20AName) s.dpt3.name = zohoInc20AName;
    if (!s.dpt3.date && zohoInc20ADate) s.dpt3.date = zohoInc20ADate;
    if (!s.dpt3.status && zohoInc20AStatus) s.dpt3.status = zohoInc20AStatus;
    if ((!s.dpt3.files || s.dpt3.files.length === 0) && zohoInc20AFiles.length > 0) {
      s.dpt3.files = zohoInc20AFiles;
    }

    // Map Zoho CRM Form 3 (Finance / Projected Financials) fields if available on record
    const zohoForm3Name = record.Finance_Projected_Financials_name || '';
    const zohoForm3Date = record.Finance_Projected_Financials_Date || '';
    const zohoForm3Status = record.Finance_Projected_Financials_Status || '';
    const zohoForm3Files = Array.isArray(record.Finance_Projected_Financials_File_Upload) ? record.Finance_Projected_Financials_File_Upload : [];

    if (!s.form3) s.form3 = {};
    if (!s.form3.name && zohoForm3Name) s.form3.name = zohoForm3Name;
    if (!s.form3.date && zohoForm3Date) s.form3.date = zohoForm3Date;
    if (!s.form3.status && zohoForm3Status) s.form3.status = zohoForm3Status;
    if ((!s.form3.files || s.form3.files.length === 0) && zohoForm3Files.length > 0) {
      s.form3.files = zohoForm3Files;
    }

    if (!s.compForm3) s.compForm3 = {};
    if (!s.compForm3.name && zohoForm3Name) s.compForm3.name = zohoForm3Name;
    if (!s.compForm3.date && zohoForm3Date) s.compForm3.date = zohoForm3Date;
    if (!s.compForm3.status && zohoForm3Status) s.compForm3.status = zohoForm3Status;
    if ((!s.compForm3.files || s.compForm3.files.length === 0) && zohoForm3Files.length > 0) {
      s.compForm3.files = zohoForm3Files;
    }

    if (!s.fundingFinance) s.fundingFinance = {};
    if (!s.fundingFinance.name && zohoForm3Name) s.fundingFinance.name = zohoForm3Name;
    if (!s.fundingFinance.date && zohoForm3Date) s.fundingFinance.date = zohoForm3Date;
    if (!s.fundingFinance.status && zohoForm3Status) s.fundingFinance.status = zohoForm3Status;
    if ((!s.fundingFinance.files || s.fundingFinance.files.length === 0) && zohoForm3Files.length > 0) {
      s.fundingFinance.files = zohoForm3Files;
    }

    // Map Zoho CRM LLP Agreement / Application Submission fields if available on record
    const zohoLlpName = record.Application_submission_name || '';
    const zohoLlpDate = record.Application_submission_Submission_Date || '';
    const zohoLlpStatus = record.Application_submission_status || '';
    const zohoLlpFiles = Array.isArray(record.Application_submission_File_Upload) ? record.Application_submission_File_Upload : [];
    const zohoAppRegNumber = record.Application_registration_number || record.Application_submission || '';
    const zohoAppUserId = record.Application_submission_Portal_User_ID || '';
    const zohoAppPassword = record.Application_submission_Portal_Password || '';

    if (!s.llpAgreement) s.llpAgreement = {};
    if (!s.llpAgreement.name && zohoLlpName) s.llpAgreement.name = zohoLlpName;
    if (!s.llpAgreement.date && zohoLlpDate) s.llpAgreement.date = zohoLlpDate;
    if (!s.llpAgreement.status && zohoLlpStatus) s.llpAgreement.status = zohoLlpStatus;
    if ((!s.llpAgreement.files || s.llpAgreement.files.length === 0) && zohoLlpFiles.length > 0) {
      s.llpAgreement.files = zohoLlpFiles;
    }

    if (!s.appSubmission) s.appSubmission = {};
    if (!s.appSubmission.name && zohoLlpName) s.appSubmission.name = zohoLlpName;
    if (!s.appSubmission.date && zohoLlpDate) s.appSubmission.date = zohoLlpDate;
    if (!s.appSubmission.status && zohoLlpStatus) s.appSubmission.status = zohoLlpStatus;
    if ((!s.appSubmission.files || s.appSubmission.files.length === 0) && zohoLlpFiles.length > 0) {
      s.appSubmission.files = zohoLlpFiles;
    }
    if (!s.appSubmission.portalId && zohoAppUserId) s.appSubmission.portalId = zohoAppUserId;
    if (!s.appSubmission.portalPassword && zohoAppPassword) s.appSubmission.portalPassword = zohoAppPassword;
    if (!s.appSubmission.registrationNumber && zohoAppRegNumber) s.appSubmission.registrationNumber = zohoAppRegNumber;

    if (!s.certFinalApp) s.certFinalApp = {};
    if (!s.certFinalApp.name && zohoLlpName) s.certFinalApp.name = zohoLlpName;
    if (!s.certFinalApp.date && zohoLlpDate) s.certFinalApp.date = zohoLlpDate;
    if (!s.certFinalApp.status && zohoLlpStatus) s.certFinalApp.status = zohoLlpStatus;
    if ((!s.certFinalApp.files || s.certFinalApp.files.length === 0) && zohoLlpFiles.length > 0) {
      s.certFinalApp.files = zohoLlpFiles;
    }
    if (!s.certFinalApp.portalId && !s.certFinalApp.id && zohoAppUserId) {
      s.certFinalApp.portalId = zohoAppUserId;
      s.certFinalApp.id = zohoAppUserId;
    }
    if (!s.certFinalApp.portalPassword && !s.certFinalApp.password && zohoAppPassword) {
      s.certFinalApp.portalPassword = zohoAppPassword;
      s.certFinalApp.password = zohoAppPassword;
    }
    if (!s.certFinalApp.registrationNumber && zohoAppRegNumber) {
      s.certFinalApp.registrationNumber = zohoAppRegNumber;
    }
    if (s.certFinalApp.id && !s.certFinalApp.portalId) s.certFinalApp.portalId = s.certFinalApp.id;
    if (s.certFinalApp.portalId && !s.certFinalApp.id) s.certFinalApp.id = s.certFinalApp.portalId;
    if (s.certFinalApp.password && !s.certFinalApp.portalPassword) s.certFinalApp.portalPassword = s.certFinalApp.password;
    if (s.certFinalApp.portalPassword && !s.certFinalApp.password) s.certFinalApp.password = s.certFinalApp.portalPassword;

    // Map Zoho CRM Director ITR & Company ITR fields if available on record
    const zohoItrName = record.Director_ITR_Company_ITR_name || '';
    const zohoItrDate = record.Director_ITR_Company_ITR_Date || '';
    const zohoItrStatus = record.Director_ITR_Company_ITR_status || '';
    const zohoItrFiles = Array.isArray(record.Director_ITR_Company_ITR_File_Upload) ? record.Director_ITR_Company_ITR_File_Upload : [];
    const zohoItrDocCollection = record.Director_ITR_Doc_collection || '';
    const zohoItrFileRequired = record.Director_ITR_File_required || '';

    if (!s.directorItr) s.directorItr = {};
    if (!s.directorItr.name && zohoItrName) s.directorItr.name = zohoItrName;
    if (!s.directorItr.date && zohoItrDate) s.directorItr.date = zohoItrDate;
    if (!s.directorItr.status && zohoItrStatus) s.directorItr.status = zohoItrStatus;
    if ((!s.directorItr.files || s.directorItr.files.length === 0) && zohoItrFiles.length > 0) {
      s.directorItr.files = zohoItrFiles;
    }
    if (!s.directorItr.docCollection && zohoItrDocCollection) s.directorItr.docCollection = zohoItrDocCollection;
    if (!s.directorItr.fileRequired && zohoItrFileRequired) s.directorItr.fileRequired = zohoItrFileRequired;

    if (!s.companyItr) s.companyItr = {};
    if (!s.companyItr.name && zohoItrName) s.companyItr.name = zohoItrName;
    if (!s.companyItr.date && zohoItrDate) s.companyItr.date = zohoItrDate;
    if (!s.companyItr.status && zohoItrStatus) s.companyItr.status = zohoItrStatus;
    if ((!s.companyItr.files || s.companyItr.files.length === 0) && zohoItrFiles.length > 0) {
      s.companyItr.files = zohoItrFiles;
    }

    // Map Zoho CRM DPR / Pitch deck creation / INC fields if available on record
    const zohoDprName = record.DPR_Pitch_deck_creation_name || '';
    const zohoDprDate = record.DPR_Pitch_deck_creation_Date || '';
    const zohoDprStatus = record.DPR_Pitch_deck_creation_status || '';
    const zohoDprFiles = Array.isArray(record.DPR_Pitch_deck_creation_File_Upload) ? record.DPR_Pitch_deck_creation_File_Upload : [];

    if (!s.dprCreation) s.dprCreation = {};
    if (!s.dprCreation.name && zohoDprName) s.dprCreation.name = zohoDprName;
    if (!s.dprCreation.date && zohoDprDate) s.dprCreation.date = zohoDprDate;
    if (!s.dprCreation.status && zohoDprStatus) s.dprCreation.status = zohoDprStatus;
    if ((!s.dprCreation.files || s.dprCreation.files.length === 0) && zohoDprFiles.length > 0) {
      s.dprCreation.files = zohoDprFiles;
    }

    if (!s.compInc) s.compInc = {};
    if (!s.compInc.name && zohoDprName) s.compInc.name = zohoDprName;
    if (!s.compInc.date && zohoDprDate) s.compInc.date = zohoDprDate;
    if (!s.compInc.status && zohoDprStatus) s.compInc.status = zohoDprStatus;
    if ((!s.compInc.files || s.compInc.files.length === 0) && zohoDprFiles.length > 0) {
      s.compInc.files = zohoDprFiles;
    }

    if (!s.inc) s.inc = {};
    if (!s.inc.name && zohoDprName) s.inc.name = zohoDprName;
    if (!s.inc.date && zohoDprDate) s.inc.date = zohoDprDate;
    if (!s.inc.status && zohoDprStatus) s.inc.status = zohoDprStatus;
    if ((!s.inc.files || s.inc.files.length === 0) && zohoDprFiles.length > 0) {
      s.inc.files = zohoDprFiles;
    }

    return s;
  });

  // Fetch attachments from Zoho CRM for this record and distribute into specific fields
  useEffect(() => {
    const targetId = record.zohoId || record.id;
    if (!targetId || !/^\d{15,}$/.test(String(targetId))) return;

    fetchZohoAttachments('Operation_Internal_CRM', String(targetId))
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setSections((prev) => mergeAttachmentsIntoSections(prev, res.data, String(targetId)));
        }
      })
      .catch((err) => {
        console.warn('[InternalOperationDetailModal] Warning fetching Zoho attachments:', err);
      });
  }, [record.id, record.zohoId]);

  // Company Type & After Allocation
  const [afterAllocation, setAfterAllocation] = useState<'Yes' | 'No'>(() => {
    return (
      (record.After_Allocation_Workflow as 'Yes' | 'No') ||
      record.After_Allocation ||
      (sections.afterAllocation as 'Yes' | 'No') ||
      'No'
    );
  });

  const [companyType, setCompanyType] = useState<CompanyType>(() => {
    return (
      record.Company_Type ||
      (sections.compDocCollection?.companyType as CompanyType) ||
      (sections.docCollection?.companyType as CompanyType) ||
      'PVT LTD'
    );
  });

  // Sync company type changes
  const handleCompanyTypeChange = (newType: CompanyType) => {
    setCompanyType(newType);
    setSections(prev => ({
      ...prev,
      docCollection: {
        ...(prev.docCollection || {}),
        companyType: newType
      },
      compDocCollection: {
        ...(prev.compDocCollection || {}),
        companyType: newType
      }
    }));
  };

  // Helper to update a section
  const updateSection = (sectionKey: string, field: string, value: any) => {
    setSections(prev => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] || {}),
        [field]: value
      }
    }));
  };

  // Helper to update dual-keyed sections for compatibility (e.g. compAdt1 & adt1)
  const updateCompSection = (primaryKey: string, fallbackKey: string, field: string, value: any) => {
    setSections(prev => {
      const mergedCurrent = {
        ...(prev[fallbackKey] || {}),
        ...(prev[primaryKey] || {}),
        [field]: value
      };
      return {
        ...prev,
        [primaryKey]: mergedCurrent,
        [fallbackKey]: mergedCurrent
      };
    });
  };

  // Handle Repeat / Clone for Resubmission when Status = "Rejected"
  const handleRepeatableSectionStatusChange = (
    baseSectionKey: string,
    historyKey: string,
    newStatus: string
  ) => {
    const currentData = sections[baseSectionKey] || {};
    const currentHistory = Array.isArray(sections[historyKey]) ? sections[historyKey] : [];

    if (newStatus === 'Rejected' || newStatus.toLowerCase().includes('reject')) {
      // Archive current rejected attempt into history if not already archived
      const archivedAttempt = {
        ...currentData,
        status: newStatus,
        rejectedAt: new Date().toISOString(),
        attemptNumber: currentHistory.length + 1
      };

      const baseCleanName = (currentData.name || '').replace(/\s*\(Resubmission Round \d+\)/gi, '').trim();
      const nextRound = currentHistory.length + 2;

      const resetStatus = (baseSectionKey === 'certFinalApp' || baseSectionKey === 'appSubmission')
        ? 'Pending'
        : (baseSectionKey === 'nameApp')
          ? 'In-process'
          : 'In process';

      setSections(prev => ({
        ...prev,
        [historyKey]: [...currentHistory, archivedAttempt],
        [baseSectionKey]: {
          ...currentData,
          name: `${baseCleanName ? `${baseCleanName} ` : ''}(Resubmission Round ${nextRound})`,
          approvedName: '',
          finalApprovalName: '',
          date: new Date().toISOString().split('T')[0],
          doiDate: '',
          status: resetStatus,
          files: []
        }
      }));
    } else {
      updateSection(baseSectionKey, 'status', newStatus);
    }
  };

  // Update specific fields of an archived / previous attempt in history
  const updateHistoryItem = (
    historyKey: string,
    index: number,
    field: string,
    value: any
  ) => {
    setSections(prev => {
      const history = Array.isArray(prev[historyKey]) ? [...prev[historyKey]] : [];
      if (history[index]) {
        history[index] = {
          ...history[index],
          [field]: value
        };
      }
      return {
        ...prev,
        [historyKey]: history
      };
    });
  };

  // Remove an archived / previous attempt from history
  const removeHistoryItem = (historyKey: string, index: number) => {
    setSections(prev => {
      const history = Array.isArray(prev[historyKey]) ? [...prev[historyKey]] : [];
      history.splice(index, 1);
      return {
        ...prev,
        [historyKey]: history
      };
    });
  };

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const tlUser = (selectedTlId ? (allStaff.find(u => 
        u.id === selectedTlId || 
        (u.zohoId && u.zohoId === selectedTlId) ||
        (u.empId && u.empId === selectedTlId) ||
        u.name.toLowerCase() === selectedTlId.toLowerCase() ||
        isMatchingName(u.name, selectedTlId)
      ) || (record.Team_Leader?.id === selectedTlId ? record.Team_Leader : null)) : null) || (record.Team_Leader || null);

      const tmUser = (selectedTmId ? (allStaff.find(u => 
        u.id === selectedTmId || 
        (u.zohoId && u.zohoId === selectedTmId) ||
        (u.empId && u.empId === selectedTmId) ||
        u.name.toLowerCase() === selectedTmId.toLowerCase() ||
        isMatchingName(u.name, selectedTmId)
      ) || (record.Team_Member?.id === selectedTmId ? record.Team_Member : null)) : null) || (record.Team_Member || null);

      const isFullyAllocated = Boolean(tlUser && tmUser);
      const isPartiallyAllocated = Boolean(tlUser || tmUser);

      // Target Zoho Record ID for attachment upload
      const targetZohoId = record.zohoId || (/^\d{15,}$/.test(String(record.id)) ? String(record.id) : null);
      const updatedSections: Record<string, any> = { ...sections };

      if (targetZohoId) {
        for (const [secKey, secVal] of Object.entries(updatedSections)) {
          if (secVal && Array.isArray(secVal.files) && secVal.files.length > 0) {
            const tag = SECTION_ATTACHMENT_CONFIG[secKey]?.tag || secKey;
            const updatedFileList: UploadedFileMeta[] = [];

            for (const file of secVal.files) {
              // Already uploaded and linked to an attachment ID in Zoho CRM
              if (file.attachmentId && !file.rawFile && (!file.dataUrl || file.id === file.attachmentId)) {
                updatedFileList.push(file);
                continue;
              }

              // Determine file data to upload
              let fileBlob: File | Blob | null = null;
              const cleanName = (file.name || 'document').replace(/^\[[^\]]+\]\s*/, '');
              const taggedFileName = `[${tag}] ${cleanName}`;

              if (file.rawFile instanceof File) {
                fileBlob = file.rawFile;
              } else if (file.dataUrl && file.dataUrl.startsWith('data:')) {
                try {
                  const parts = file.dataUrl.split(';');
                  const mime = parts[0].split(':')[1] || 'application/octet-stream';
                  const base64Data = parts[1].replace(/^base64,/, '');
                  const byteCharacters = atob(base64Data);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                  }
                  const byteArray = new Uint8Array(byteNumbers);
                  fileBlob = new Blob([byteArray], { type: mime });
                } catch (e) {
                  console.error('Error parsing file dataUrl for upload:', e);
                }
              }

              if (fileBlob) {
                try {
                  const uploadRes = await uploadZohoAttachment(
                    String(targetZohoId),
                    fileBlob,
                    taggedFileName,
                    'Operation_Internal_CRM'
                  );

                  if (uploadRes && uploadRes.success && uploadRes.attachmentId) {
                    const attId = String(uploadRes.attachmentId);
                    updatedFileList.push({
                      ...file,
                      id: attId,
                      attachmentId: attId,
                      fileId: attId,
                      name: cleanName,
                      recordId: String(targetZohoId),
                      rawFile: undefined,
                      dataUrl: undefined,
                      url: undefined
                    });
                    continue;
                  } else {
                    console.warn('[InternalOperationDetailModal] Failed to upload attachment to Zoho:', uploadRes?.message);
                    const { dataUrl, rawFile, ...restFile } = file;
                    updatedFileList.push(restFile);
                    continue;
                  }
                } catch (uploadErr) {
                  console.error('[InternalOperationDetailModal] Exception during attachment upload:', uploadErr);
                  const { dataUrl, rawFile, ...restFile } = file;
                  updatedFileList.push(restFile);
                  continue;
                }
              }

              const { dataUrl, rawFile, ...cleanFile } = file;
              updatedFileList.push(cleanFile);
            }

            updatedSections[secKey] = {
              ...secVal,
              files: updatedFileList
            };
          }
        }

        // Also process repeatable history items if any files were attached
        for (const historyKey of ['nameAppHistory', 'finalFilingHistory', 'certDocCollectionHistory', 'certFinalAppHistory', 'appSubmissionHistory']) {
          if (Array.isArray(updatedSections[historyKey]) && updatedSections[historyKey].length > 0) {
            const historyList = [...updatedSections[historyKey]];
            const tag = historyKey === 'nameAppHistory'
              ? 'Name Application'
              : historyKey === 'finalFilingHistory'
                ? 'Final Filing'
                : historyKey === 'certDocCollectionHistory'
                  ? 'Doc Collection'
                  : 'Application Submission';

            for (let h = 0; h < historyList.length; h++) {
              const histItem = historyList[h];
              if (histItem && Array.isArray(histItem.files) && histItem.files.length > 0) {
                const histUpdatedFiles: UploadedFileMeta[] = [];
                for (const file of histItem.files) {
                  if (file.attachmentId && !file.rawFile && (!file.dataUrl || file.id === file.attachmentId)) {
                    histUpdatedFiles.push(file);
                    continue;
                  }
                  let fileBlob: File | Blob | null = null;
                  const cleanName = (file.name || 'document').replace(/^\[[^\]]+\]\s*/, '');
                  const taggedFileName = `[${tag}] ${cleanName}`;

                  if (file.rawFile instanceof File) {
                    fileBlob = file.rawFile;
                  } else if (file.dataUrl && file.dataUrl.startsWith('data:')) {
                    try {
                      const parts = file.dataUrl.split(';');
                      const mime = parts[0].split(':')[1] || 'application/octet-stream';
                      const base64Data = parts[1].replace(/^base64,/, '');
                      const byteCharacters = atob(base64Data);
                      const byteNumbers = new Array(byteCharacters.length);
                      for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                      }
                      const byteArray = new Uint8Array(byteNumbers);
                      fileBlob = new Blob([byteArray], { type: mime });
                    } catch (e) {
                      console.error('Error parsing history file dataUrl:', e);
                    }
                  }

                  if (fileBlob) {
                    try {
                      const uploadRes = await uploadZohoAttachment(
                        String(targetZohoId),
                        fileBlob,
                        taggedFileName,
                        'Operation_Internal_CRM'
                      );
                      if (uploadRes && uploadRes.success && uploadRes.attachmentId) {
                        const attId = String(uploadRes.attachmentId);
                        histUpdatedFiles.push({
                          ...file,
                          id: attId,
                          attachmentId: attId,
                          fileId: attId,
                          name: cleanName,
                          recordId: String(targetZohoId),
                          rawFile: undefined,
                          dataUrl: undefined
                        });
                        continue;
                      }
                    } catch (err) {
                      console.error('Error uploading history attachment:', err);
                    }
                  }
                  const { dataUrl, rawFile, ...cleanFile } = file;
                  histUpdatedFiles.push(cleanFile);
                }
                historyList[h] = {
                  ...histItem,
                  files: histUpdatedFiles
                };
              }
            }
            updatedSections[historyKey] = historyList;
          }
        }

        setSections(updatedSections);
      }

      // Extract active Doc collection fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const isCompliance = teamType.toLowerCase().includes('compliance');
      const isCertification = teamType.toLowerCase().includes('certification');
      const activeDocCollection = isCertification
        ? updatedSections.certDocCollection
        : isCompliance
          ? updatedSections.compDocCollection
          : updatedSections.docCollection;
      const fallbackDocCollection = isCertification
        ? (updatedSections.compDocCollection || updatedSections.docCollection)
        : isCompliance
          ? updatedSections.docCollection
          : updatedSections.compDocCollection;

      const docName = activeDocCollection?.name !== undefined && activeDocCollection?.name !== ''
        ? activeDocCollection.name
        : (fallbackDocCollection?.name || record.Doc_collection_name || '');
      const docDate = activeDocCollection?.date !== undefined && activeDocCollection?.date !== ''
        ? activeDocCollection.date
        : (fallbackDocCollection?.date || record.Doc_collection_Date || '');
      const docStatus = activeDocCollection?.status !== undefined && activeDocCollection?.status !== ''
        ? activeDocCollection.status
        : (fallbackDocCollection?.status || record.Doc_collection_status || '');
      const docFiles = (activeDocCollection?.files && activeDocCollection.files.length > 0)
        ? activeDocCollection.files
        : (fallbackDocCollection?.files || record.Doc_collection_File_Upload || []);

      // Extract active Name Application / Accounting fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeNameAppAcc = isCompliance ? updatedSections.accounting : updatedSections.nameApp;
      const fallbackNameAppAcc = isCompliance ? updatedSections.nameApp : updatedSections.accounting;

      const nameAppName = activeNameAppAcc?.name !== undefined && activeNameAppAcc?.name !== ''
        ? activeNameAppAcc.name
        : (fallbackNameAppAcc?.name || record.Name_Application_name || '');
      const nameAppApprovedName = updatedSections.nameApp?.approvedName || record.Name_Application_approved_name || '';
      const nameAppDate = activeNameAppAcc?.date !== undefined && activeNameAppAcc?.date !== ''
        ? activeNameAppAcc.date
        : (fallbackNameAppAcc?.date || record.Name_Application_date || '');
      const nameAppStatus = activeNameAppAcc?.status !== undefined && activeNameAppAcc?.status !== ''
        ? activeNameAppAcc.status
        : (fallbackNameAppAcc?.status || record.Name_Application_status || '');
      const nameAppFiles = (activeNameAppAcc?.files && activeNameAppAcc.files.length > 0)
        ? activeNameAppAcc.files
        : (fallbackNameAppAcc?.files || record.Name_Application_File_Upload || []);

      // Extract DSC Creation fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const dscName = updatedSections.dscCreation?.name || record.DSC_Creation_name || '';
      const dscDate = updatedSections.dscCreation?.date || record.DSC_Creation_Date || '';
      const dscStatus = updatedSections.dscCreation?.status || record.DSC_Creation_status || '';

      // Extract Final Filing fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const finalFilingName = updatedSections.finalFiling?.name || record.Final_Filing_name || '';
      const finalFilingApprovalName = updatedSections.finalFiling?.finalApprovalName || record.Final_Filing_Final_Approval_Name || '';
      const finalFilingDate = updatedSections.finalFiling?.date || record.Final_Filing_Date || '';
      const finalFilingDoiDate = updatedSections.finalFiling?.doiDate || record.Final_Filing_DOI_Date || '';
      const finalFilingStatus = updatedSections.finalFiling?.status || record.Final_Filing_status || '';

      // Extract Board Resolution / Audit fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeBrAudit = isCompliance ? updatedSections.audit : updatedSections.boardResolution;
      const fallbackBrAudit = isCompliance ? updatedSections.boardResolution : updatedSections.audit;

      const brName = activeBrAudit?.name !== undefined && activeBrAudit?.name !== ''
        ? activeBrAudit.name
        : (fallbackBrAudit?.name || record.Board_Resolution_name || '');
      const brDate = activeBrAudit?.date !== undefined && activeBrAudit?.date !== ''
        ? activeBrAudit.date
        : (fallbackBrAudit?.date || record.Board_Resolution_Date || '');
      const brStatus = activeBrAudit?.status !== undefined && activeBrAudit?.status !== ''
        ? activeBrAudit.status
        : (fallbackBrAudit?.status || record.Board_Resolution_status || '');
      const brFiles = (activeBrAudit?.files && activeBrAudit.files.length > 0)
        ? activeBrAudit.files
        : (fallbackBrAudit?.files || record.Board_Resolution_File_Upload || []);

      // Extract 2-Share Certificate / MGT-7 / 7A fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeScMgt7 = isCompliance ? updatedSections.mgt7 : updatedSections.shareCertificate;
      const fallbackScMgt7 = isCompliance ? updatedSections.shareCertificate : updatedSections.mgt7;

      const scName = activeScMgt7?.name !== undefined && activeScMgt7?.name !== ''
        ? activeScMgt7.name
        : (fallbackScMgt7?.name || record.Share_Certificate_name || '');
      const scDate = activeScMgt7?.date !== undefined && activeScMgt7?.date !== ''
        ? activeScMgt7.date
        : (fallbackScMgt7?.date || record.Share_Certificate_Date || '');
      const scStatus = activeScMgt7?.status !== undefined && activeScMgt7?.status !== ''
        ? activeScMgt7.status
        : (fallbackScMgt7?.status || record.Share_Certificate_status || '');
      const scFiles = (activeScMgt7?.files && activeScMgt7.files.length > 0)
        ? activeScMgt7.files
        : (fallbackScMgt7?.files || record.Share_Certificate_File_Upload || []);

      // Extract MSME Certificate / AOC-4 fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeMsme = companyType === 'LLP' ? updatedSections.msmeCertificateLlp : updatedSections.msmeCertificate;
      const fallbackMsme = companyType === 'LLP' ? updatedSections.msmeCertificate : updatedSections.msmeCertificateLlp;
      const activeMsmeAoc4 = isCompliance ? updatedSections.aoc4 : activeMsme;
      const fallbackMsmeAoc4 = isCompliance ? activeMsme : updatedSections.aoc4;

      const msmeDate = activeMsmeAoc4?.date !== undefined && activeMsmeAoc4?.date !== ''
        ? activeMsmeAoc4.date
        : (fallbackMsmeAoc4?.date || record.MSME_Certificate_Date || '');
      const msmeStatus = activeMsmeAoc4?.status !== undefined && activeMsmeAoc4?.status !== ''
        ? activeMsmeAoc4.status
        : (fallbackMsmeAoc4?.status || record.MSME_Certificate_status || '');
      const msmeFiles = (activeMsmeAoc4?.files && activeMsmeAoc4.files.length > 0)
        ? activeMsmeAoc4.files
        : (fallbackMsmeAoc4?.files || record.MSME_Certificate_File_Upload || (record.MSME_Certificate ? [{ name: record.MSME_Certificate, url: record.MSME_Certificate }] : []));
      const msmeFileVal = msmeFiles.length > 0
        ? (typeof msmeFiles[0] === 'string' ? msmeFiles[0] : (msmeFiles[0]?.url || msmeFiles[0]?.name || ''))
        : (record.MSME_Certificate || '');

      const aoc4Name = updatedSections.aoc4?.name !== undefined && updatedSections.aoc4?.name !== ''
        ? updatedSections.aoc4.name
        : (record.AOC_4_name || '');
      const aoc4DirectorAudit = updatedSections.aoc4?.directorAuditReport !== undefined && updatedSections.aoc4?.directorAuditReport !== ''
        ? updatedSections.aoc4.directorAuditReport
        : (record.AOC_4_Director_Audit_report || 'Prepared');

      // Extract ADT-1 fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeAdt1 = isCompliance ? (updatedSections.compAdt1 || updatedSections.adt1) : updatedSections.adt1;
      const fallbackAdt1 = isCompliance ? updatedSections.adt1 : (updatedSections.compAdt1 || updatedSections.adt1);

      const adt1Name = activeAdt1?.name !== undefined && activeAdt1?.name !== ''
        ? activeAdt1.name
        : (fallbackAdt1?.name || record.ADT_1_name || '');
      const adt1Auditor = (activeAdt1?.auditorName !== undefined && activeAdt1?.auditorName !== '')
        ? activeAdt1.auditorName
        : (fallbackAdt1?.auditorName || updatedSections.audit?.auditorName || record.ADT_1_Auditor_name || '');
      const adt1Date = activeAdt1?.date !== undefined && activeAdt1?.date !== ''
        ? activeAdt1.date
        : (fallbackAdt1?.date || record.ADT_1_date || '');
      const adt1Status = activeAdt1?.status !== undefined && activeAdt1?.status !== ''
        ? activeAdt1.status
        : (fallbackAdt1?.status || record.ADT_1_status || '');
      const adt1Files = (activeAdt1?.files && activeAdt1.files.length > 0)
        ? activeAdt1.files
        : (fallbackAdt1?.files || record.ADT_1_File_Upload || []);

      // Extract INC 20-A / DPT 3 fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeIncDpt = isCompliance ? updatedSections.dpt3 : updatedSections.inc20A;
      const fallbackIncDpt = isCompliance ? updatedSections.inc20A : updatedSections.dpt3;

      const inc20AName = activeIncDpt?.name !== undefined && activeIncDpt?.name !== ''
        ? activeIncDpt.name
        : (fallbackIncDpt?.name || record.INC_20_A_name || '');
      const inc20ADate = activeIncDpt?.date !== undefined && activeIncDpt?.date !== ''
        ? activeIncDpt.date
        : (fallbackIncDpt?.date || record.INC_20_A_Date || '');
      const inc20AStatus = activeIncDpt?.status !== undefined && activeIncDpt?.status !== ''
        ? activeIncDpt.status
        : (fallbackIncDpt?.status || record.INC_20_A_status || '');
      const inc20AFiles = (activeIncDpt?.files && activeIncDpt.files.length > 0)
        ? activeIncDpt.files
        : (fallbackIncDpt?.files || record.INC_20_A_File_Upload || []);

      // Extract Form 3 (Finance / Projected Financials) fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const isFunding = teamType === 'Funding';
      const activeForm3 = isFunding
        ? updatedSections.fundingFinance
        : isCompliance
          ? (updatedSections.compForm3 || updatedSections.form3)
          : updatedSections.form3;
      const fallbackForm3 = isFunding
        ? (updatedSections.compForm3 || updatedSections.form3)
        : isCompliance
          ? (updatedSections.fundingFinance || updatedSections.form3)
          : (updatedSections.fundingFinance || updatedSections.compForm3);

      const form3Name = activeForm3?.name !== undefined && activeForm3?.name !== ''
        ? activeForm3.name
        : (fallbackForm3?.name || record.Finance_Projected_Financials_name || '');
      const form3Date = activeForm3?.date !== undefined && activeForm3?.date !== ''
        ? activeForm3.date
        : (fallbackForm3?.date || record.Finance_Projected_Financials_Date || '');
      const form3Status = activeForm3?.status !== undefined && activeForm3?.status !== ''
        ? activeForm3.status
        : (fallbackForm3?.status || record.Finance_Projected_Financials_Status || '');
      const form3Files = (activeForm3?.files && activeForm3.files.length > 0)
        ? activeForm3.files
        : (fallbackForm3?.files || record.Finance_Projected_Financials_File_Upload || []);

      // Extract LLP Agreement / Application Submission fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeLlp = isCertification
        ? updatedSections.certFinalApp
        : isFunding
          ? updatedSections.appSubmission
          : updatedSections.llpAgreement;
      const fallbackLlp = isCertification
        ? (updatedSections.appSubmission || updatedSections.llpAgreement)
        : isFunding
          ? updatedSections.llpAgreement
          : updatedSections.appSubmission;

      const llpName = activeLlp?.name !== undefined && activeLlp?.name !== ''
        ? activeLlp.name
        : (fallbackLlp?.name || record.Application_submission_name || '');
      const llpDate = activeLlp?.date !== undefined && activeLlp?.date !== ''
        ? activeLlp.date
        : (fallbackLlp?.date || record.Application_submission_Submission_Date || '');
      const llpStatus = activeLlp?.status !== undefined && activeLlp?.status !== ''
        ? activeLlp.status
        : (fallbackLlp?.status || record.Application_submission_status || '');
      const llpFiles = (activeLlp?.files && activeLlp.files.length > 0)
        ? activeLlp.files
        : (fallbackLlp?.files || record.Application_submission_File_Upload || []);

      const appPortalId = isCertification
        ? (updatedSections.certFinalApp?.id || updatedSections.certFinalApp?.portalId || (record.Application_submission_Portal_User_ID || ''))
        : (updatedSections.appSubmission?.portalId !== undefined && updatedSections.appSubmission?.portalId !== ''
          ? updatedSections.appSubmission.portalId
          : (record.Application_submission_Portal_User_ID || ''));
      const appPortalPwd = isCertification
        ? (updatedSections.certFinalApp?.password || updatedSections.certFinalApp?.portalPassword || (record.Application_submission_Portal_Password || ''))
        : (updatedSections.appSubmission?.portalPassword !== undefined && updatedSections.appSubmission?.portalPassword !== ''
          ? updatedSections.appSubmission.portalPassword
          : (record.Application_submission_Portal_Password || ''));
      const appSubmissionVal = isCertification
        ? (updatedSections.certFinalApp?.registrationNumber !== undefined && updatedSections.certFinalApp?.registrationNumber !== ''
          ? updatedSections.certFinalApp.registrationNumber
          : (record.Application_registration_number || record.Application_submission || ''))
        : (updatedSections.appSubmission?.registrationNumber !== undefined && updatedSections.appSubmission?.registrationNumber !== ''
          ? updatedSections.appSubmission.registrationNumber
          : (updatedSections.appSubmission?.applicationSubmission || record.Application_registration_number || record.Application_submission || ''));

      // Extract Director ITR & Company ITR fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const isCompanyItrService = (record.Service_Scheme || '').toLowerCase().includes('company itr');
      const primaryItr = isCompanyItrService ? updatedSections.companyItr : updatedSections.directorItr;
      const secondaryItr = isCompanyItrService ? updatedSections.directorItr : updatedSections.companyItr;

      const itrName = (primaryItr?.name !== undefined && primaryItr?.name !== '')
        ? primaryItr.name
        : (secondaryItr?.name !== undefined && secondaryItr?.name !== '')
          ? secondaryItr.name
          : (record.Director_ITR_Company_ITR_name || '');
      const itrDate = (primaryItr?.date !== undefined && primaryItr?.date !== '')
        ? primaryItr.date
        : (secondaryItr?.date !== undefined && secondaryItr?.date !== '')
          ? secondaryItr.date
          : (record.Director_ITR_Company_ITR_Date || '');
      const itrStatus = (primaryItr?.status !== undefined && primaryItr?.status !== '')
        ? primaryItr.status
        : (secondaryItr?.status !== undefined && secondaryItr?.status !== '')
          ? secondaryItr.status
          : (record.Director_ITR_Company_ITR_status || '');
      const itrFiles = (primaryItr?.files && primaryItr.files.length > 0)
        ? primaryItr.files
        : (secondaryItr?.files && secondaryItr.files.length > 0)
          ? secondaryItr.files
          : (record.Director_ITR_Company_ITR_File_Upload || []);
      const itrDocCollection = updatedSections.directorItr?.docCollection !== undefined && updatedSections.directorItr?.docCollection !== ''
        ? updatedSections.directorItr.docCollection
        : (record.Director_ITR_Doc_collection || 'Pending');
      const itrFileRequired = updatedSections.directorItr?.fileRequired !== undefined && updatedSections.directorItr?.fileRequired !== ''
        ? updatedSections.directorItr.fileRequired
        : (record.Director_ITR_File_required || 'Yes');

      // Extract DPR / Pitch deck creation / INC fields for Zoho CRM mapping (Module: Operation_Internal_CRM)
      const activeDprInc = isCompliance ? (updatedSections.compInc || updatedSections.inc) : updatedSections.dprCreation;
      const fallbackDprInc = isCompliance ? updatedSections.dprCreation : (updatedSections.compInc || updatedSections.inc);

      const dprName = (activeDprInc?.name !== undefined && activeDprInc?.name !== '')
        ? activeDprInc.name
        : (fallbackDprInc?.name !== undefined && fallbackDprInc?.name !== '')
          ? fallbackDprInc.name
          : (record.DPR_Pitch_deck_creation_name || '');
      const dprDate = (activeDprInc?.date !== undefined && activeDprInc?.date !== '')
        ? activeDprInc.date
        : (fallbackDprInc?.date !== undefined && fallbackDprInc?.date !== '')
          ? fallbackDprInc.date
          : (record.DPR_Pitch_deck_creation_Date || '');
      const dprStatus = (activeDprInc?.status !== undefined && activeDprInc?.status !== '')
        ? activeDprInc.status
        : (fallbackDprInc?.status !== undefined && fallbackDprInc?.status !== '')
          ? fallbackDprInc.status
          : (record.DPR_Pitch_deck_creation_status || '');
      const dprFiles = (activeDprInc?.files && activeDprInc.files.length > 0)
        ? activeDprInc.files
        : (fallbackDprInc?.files && fallbackDprInc.files.length > 0)
          ? fallbackDprInc.files
          : (record.DPR_Pitch_deck_creation_File_Upload || []);

      const updatedRecord: InternalOperationRecord = {
        ...record,
        Internal_Team_Type: teamType,
        Team_Type: teamType,
        Stage: stage,
        Operation_Stage: stage,
        Name: record.Service_Scheme || record.Name || '',
        Service_Scheme: record.Service_Scheme || record.Name || '',
        Parent_Record_Deal: record.Parent_Record_Deal || (record.Deal_ID ? (/^\d{15,}$/.test(String(record.Deal_ID)) ? { id: String(record.Deal_ID), name: record.Deal_Name } : record.Deal_ID) : undefined),
        CA_CS1: caCs1,
        CA_CS2: caCs2,
        After_Allocation: afterAllocation,
        After_Allocation_Workflow: afterAllocation,
        Company_Type: companyType,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Doc collection section)
        Doc_collection_name: docName,
        Doc_collection_Date: docDate,
        Doc_collection_status: docStatus,
        Doc_collection_File_Upload: docFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Name Application / Accounting section)
        Name_Application_name: nameAppName,
        Name_Application_approved_name: nameAppApprovedName,
        Name_Application_date: nameAppDate,
        Name_Application_status: nameAppStatus,
        Name_Application_File_Upload: nameAppFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - DSC Creation section)
        DSC_Creation_name: dscName,
        DSC_Creation_Date: dscDate,
        DSC_Creation_status: dscStatus,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Final Filing section)
        Final_Filing_name: finalFilingName,
        Final_Filing_Final_Approval_Name: finalFilingApprovalName,
        Final_Filing_Date: finalFilingDate,
        Final_Filing_DOI_Date: finalFilingDoiDate,
        Final_Filing_status: finalFilingStatus,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Board Resolution / Audit section)
        Board_Resolution_name: brName,
        Board_Resolution_Date: brDate,
        Board_Resolution_status: brStatus,
        Board_Resolution_File_Upload: brFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - 2-Share Certificate / MGT-7 / 7A section)
        Share_Certificate_name: scName,
        Share_Certificate_Date: scDate,
        Share_Certificate_status: scStatus,
        Share_Certificate_File_Upload: scFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - MSME / AOC-4 section)
        MSME_Certificate: msmeFileVal,
        MSME_Certificate_Date: msmeDate,
        MSME_Certificate_status: msmeStatus,
        MSME_Certificate_File_Upload: msmeFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - AOC-4 section)
        AOC_4_name: aoc4Name,
        AOC_4_Director_Audit_report: aoc4DirectorAudit,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - ADT-1 section)
        ADT_1_name: adt1Name,
        ADT_1_Auditor_name: adt1Auditor,
        ADT_1_date: adt1Date,
        ADT_1_status: adt1Status,
        ADT_1_File_Upload: adt1Files,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - INC 20-A / DPT 3 section)
        INC_20_A_name: inc20AName,
        INC_20_A_Date: inc20ADate,
        INC_20_A_status: inc20AStatus,
        INC_20_A_File_Upload: inc20AFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Form 3 section)
        Finance_Projected_Financials_name: form3Name,
        Finance_Projected_Financials_Date: form3Date,
        Finance_Projected_Financials_Status: form3Status,
        Finance_Projected_Financials_File_Upload: form3Files,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - LLP Agreement / Application Submission section)
        Application_submission_name: llpName,
        Application_submission_Submission_Date: llpDate,
        Application_submission_status: llpStatus,
        Application_submission_File_Upload: llpFiles,
        Application_submission: appSubmissionVal,
        Application_registration_number: appSubmissionVal,
        Application_submission_Portal_User_ID: appPortalId,
        Application_submission_Portal_Password: appPortalPwd,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Director ITR & Company ITR section)
        Director_ITR_Doc_collection: itrDocCollection,
        Director_ITR_File_required: itrFileRequired,
        Director_ITR_Company_ITR_name: itrName,
        Director_ITR_Company_ITR_Date: itrDate,
        Director_ITR_Company_ITR_status: itrStatus,
        Director_ITR_Company_ITR_File_Upload: itrFiles,
        // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - DPR / Pitch deck creation / INC section)
        DPR_Pitch_deck_creation_name: dprName,
        DPR_Pitch_deck_creation_Date: dprDate,
        DPR_Pitch_deck_creation_status: dprStatus,
        DPR_Pitch_deck_creation_File_Upload: dprFiles,
        Team_Leader: tlUser ? { id: (tlUser as any)?.zohoId || tlUser.id, name: tlUser.name, email: tlUser.email, empId: tlUser.empId || tlUser.id } : null,
        Team_Leader_ID: (tlUser as any)?.zohoId || tlUser?.id || '',
        Team_Leader_Name: tlUser?.name || '',
        Team_Leader_TL: tlUser ? { id: (tlUser as any)?.zohoId || (/^\d{15,}$/.test(String(tlUser.id)) ? String(tlUser.id) : tlUser.id), name: tlUser.name } : null,
        Team_Member: tmUser ? { id: (tmUser as any)?.zohoId || tmUser.id, name: tmUser.name, email: tmUser.email, empId: tmUser.empId || tmUser.id } : null,
        Team_Member_ID: (tmUser as any)?.zohoId || tmUser?.id || '',
        Team_Member_Name: tmUser?.name || '',
        Team_Member_TM: tmUser ? { id: (tmUser as any)?.zohoId || (/^\d{15,}$/.test(String(tmUser.id)) ? String(tmUser.id) : tmUser.id), name: tmUser.name } : null,
        Allocation_Status: isFullyAllocated ? 'Allocated' : isPartiallyAllocated ? 'In Progress' : 'Pending Allocation',
        sectionsData: {
          ...updatedSections,
          afterAllocation,
          docCollection: {
            ...(updatedSections.docCollection || {}),
            name: (!isCompliance && !isCertification) ? docName : (updatedSections.docCollection?.name || docName),
            date: (!isCompliance && !isCertification) ? docDate : (updatedSections.docCollection?.date || docDate),
            status: (!isCompliance && !isCertification) ? docStatus : (updatedSections.docCollection?.status || docStatus),
            files: (!isCompliance && !isCertification) ? docFiles : (updatedSections.docCollection?.files || docFiles),
            companyType
          },
          compDocCollection: {
            ...(updatedSections.compDocCollection || {}),
            name: isCompliance ? docName : (updatedSections.compDocCollection?.name || docName),
            date: isCompliance ? docDate : (updatedSections.compDocCollection?.date || docDate),
            status: isCompliance ? docStatus : (updatedSections.compDocCollection?.status || docStatus),
            files: isCompliance ? docFiles : (updatedSections.compDocCollection?.files || docFiles),
            companyType
          },
          certDocCollection: {
            ...(updatedSections.certDocCollection || {}),
            name: isCertification ? docName : (updatedSections.certDocCollection?.name || docName),
            date: isCertification ? docDate : (updatedSections.certDocCollection?.date || docDate),
            status: isCertification ? docStatus : (updatedSections.certDocCollection?.status || docStatus),
            files: isCertification ? docFiles : (updatedSections.certDocCollection?.files || docFiles)
          },
          nameApp: {
            ...(updatedSections.nameApp || {}),
            name: !isCompliance ? nameAppName : (updatedSections.nameApp?.name || nameAppName),
            approvedName: nameAppApprovedName,
            date: !isCompliance ? nameAppDate : (updatedSections.nameApp?.date || nameAppDate),
            status: !isCompliance ? nameAppStatus : (updatedSections.nameApp?.status || nameAppStatus),
            files: !isCompliance ? nameAppFiles : (updatedSections.nameApp?.files || nameAppFiles)
          },
          dscCreation: {
            ...(updatedSections.dscCreation || {}),
            name: dscName,
            date: dscDate,
            status: dscStatus
          },
          finalFiling: {
            ...(updatedSections.finalFiling || {}),
            name: finalFilingName,
            finalApprovalName: finalFilingApprovalName,
            date: finalFilingDate,
            doiDate: finalFilingDoiDate,
            status: finalFilingStatus
          },
          boardResolution: {
            ...(updatedSections.boardResolution || {}),
            name: !isCompliance ? brName : (updatedSections.boardResolution?.name || brName),
            date: !isCompliance ? brDate : (updatedSections.boardResolution?.date || brDate),
            status: !isCompliance ? brStatus : (updatedSections.boardResolution?.status || brStatus),
            files: !isCompliance ? brFiles : (updatedSections.boardResolution?.files || brFiles)
          },
          audit: {
            ...(updatedSections.audit || {}),
            name: isCompliance ? brName : (updatedSections.audit?.name || brName),
            date: isCompliance ? brDate : (updatedSections.audit?.date || brDate),
            status: isCompliance ? brStatus : (updatedSections.audit?.status || brStatus),
            files: isCompliance ? brFiles : (updatedSections.audit?.files || brFiles)
          },
          shareCertificate: {
            ...(updatedSections.shareCertificate || {}),
            name: !isCompliance ? scName : (updatedSections.shareCertificate?.name || scName),
            date: !isCompliance ? scDate : (updatedSections.shareCertificate?.date || scDate),
            status: !isCompliance ? scStatus : (updatedSections.shareCertificate?.status || scStatus),
            files: !isCompliance ? scFiles : (updatedSections.shareCertificate?.files || scFiles)
          },
          mgt7: {
            ...(updatedSections.mgt7 || {}),
            name: isCompliance ? scName : (updatedSections.mgt7?.name || scName),
            date: isCompliance ? scDate : (updatedSections.mgt7?.date || scDate),
            status: isCompliance ? scStatus : (updatedSections.mgt7?.status || scStatus),
            files: isCompliance ? scFiles : (updatedSections.mgt7?.files || scFiles)
          },
          msmeCertificate: {
            ...(updatedSections.msmeCertificate || {}),
            date: !isCompliance ? msmeDate : (updatedSections.msmeCertificate?.date || msmeDate),
            status: !isCompliance ? msmeStatus : (updatedSections.msmeCertificate?.status || msmeStatus),
            files: !isCompliance ? msmeFiles : (updatedSections.msmeCertificate?.files || msmeFiles)
          },
          msmeCertificateLlp: {
            ...(updatedSections.msmeCertificateLlp || {}),
            date: !isCompliance ? msmeDate : (updatedSections.msmeCertificateLlp?.date || msmeDate),
            status: !isCompliance ? msmeStatus : (updatedSections.msmeCertificateLlp?.status || msmeStatus),
            files: !isCompliance ? msmeFiles : (updatedSections.msmeCertificateLlp?.files || msmeFiles)
          },
          adt1: {
            ...(updatedSections.adt1 || {}),
            name: adt1Name,
            auditorName: !isCompliance ? adt1Auditor : (updatedSections.adt1?.auditorName || adt1Auditor),
            date: adt1Date,
            status: adt1Status,
            files: adt1Files
          },
          compAdt1: {
            ...(updatedSections.compAdt1 || {}),
            name: adt1Name,
            auditorName: adt1Auditor,
            date: adt1Date,
            status: adt1Status,
            files: adt1Files
          },
          inc20A: {
            ...(updatedSections.inc20A || {}),
            name: !isCompliance ? inc20AName : (updatedSections.inc20A?.name || inc20AName),
            date: !isCompliance ? inc20ADate : (updatedSections.inc20A?.date || inc20ADate),
            status: !isCompliance ? inc20AStatus : (updatedSections.inc20A?.status || inc20AStatus),
            files: !isCompliance ? inc20AFiles : (updatedSections.inc20A?.files || inc20AFiles)
          },
          dpt3: {
            ...(updatedSections.dpt3 || {}),
            name: isCompliance ? inc20AName : (updatedSections.dpt3?.name || inc20AName),
            date: isCompliance ? inc20ADate : (updatedSections.dpt3?.date || inc20ADate),
            status: isCompliance ? inc20AStatus : (updatedSections.dpt3?.status || inc20AStatus),
            files: isCompliance ? inc20AFiles : (updatedSections.dpt3?.files || inc20AFiles)
          },
          form3: {
            ...(updatedSections.form3 || {}),
            name: form3Name,
            date: form3Date,
            status: form3Status,
            files: form3Files
          },
          compForm3: {
            ...(updatedSections.compForm3 || {}),
            name: form3Name,
            date: form3Date,
            status: form3Status,
            files: form3Files
          },
          fundingFinance: {
            ...(updatedSections.fundingFinance || {}),
            name: form3Name,
            date: form3Date,
            status: form3Status,
            files: form3Files
          },
          llpAgreement: {
            ...(updatedSections.llpAgreement || {}),
            name: llpName,
            date: llpDate,
            status: llpStatus,
            files: llpFiles
          },
          appSubmission: {
            ...(updatedSections.appSubmission || {}),
            name: llpName,
            date: llpDate,
            status: llpStatus,
            files: llpFiles,
            portalId: appPortalId,
            portalPassword: appPortalPwd,
            registrationNumber: appSubmissionVal
          },
          certFinalApp: {
            ...(updatedSections.certFinalApp || {}),
            name: isCertification ? llpName : (updatedSections.certFinalApp?.name || llpName),
            date: isCertification ? llpDate : (updatedSections.certFinalApp?.date || llpDate),
            status: isCertification ? llpStatus : (updatedSections.certFinalApp?.status || llpStatus),
            files: isCertification ? llpFiles : (updatedSections.certFinalApp?.files || llpFiles),
            id: isCertification ? (updatedSections.certFinalApp?.id || updatedSections.certFinalApp?.portalId || appPortalId) : (updatedSections.certFinalApp?.id || appPortalId),
            portalId: isCertification ? (updatedSections.certFinalApp?.portalId || updatedSections.certFinalApp?.id || appPortalId) : (updatedSections.certFinalApp?.portalId || appPortalId),
            password: isCertification ? (updatedSections.certFinalApp?.password || updatedSections.certFinalApp?.portalPassword || appPortalPwd) : (updatedSections.certFinalApp?.password || appPortalPwd),
            portalPassword: isCertification ? (updatedSections.certFinalApp?.portalPassword || updatedSections.certFinalApp?.password || appPortalPwd) : (updatedSections.certFinalApp?.portalPassword || appPortalPwd),
            registrationNumber: isCertification ? (updatedSections.certFinalApp?.registrationNumber || appSubmissionVal) : (updatedSections.certFinalApp?.registrationNumber || appSubmissionVal)
          },
          dprCreation: {
            ...(updatedSections.dprCreation || {}),
            name: !isCompliance ? dprName : (updatedSections.dprCreation?.name || dprName),
            date: !isCompliance ? dprDate : (updatedSections.dprCreation?.date || dprDate),
            status: !isCompliance ? dprStatus : (updatedSections.dprCreation?.status || dprStatus),
            files: !isCompliance ? dprFiles : (updatedSections.dprCreation?.files || dprFiles)
          },
          compInc: {
            ...(updatedSections.compInc || {}),
            name: isCompliance ? dprName : (updatedSections.compInc?.name || dprName),
            date: isCompliance ? dprDate : (updatedSections.compInc?.date || dprDate),
            status: isCompliance ? dprStatus : (updatedSections.compInc?.status || dprStatus),
            files: isCompliance ? dprFiles : (updatedSections.compInc?.files || dprFiles)
          },
          inc: {
            ...(updatedSections.inc || {}),
            name: isCompliance ? dprName : (updatedSections.inc?.name || dprName),
            date: isCompliance ? dprDate : (updatedSections.inc?.date || dprDate),
            status: isCompliance ? dprStatus : (updatedSections.inc?.status || dprStatus),
            files: isCompliance ? dprFiles : (updatedSections.inc?.files || dprFiles)
          },
          ...(isCompliance ? {
            accounting: {
              ...(updatedSections.accounting || {}),
              name: isCompliance ? nameAppName : (updatedSections.accounting?.name || nameAppName),
              date: isCompliance ? nameAppDate : (updatedSections.accounting?.date || nameAppDate),
              status: isCompliance ? nameAppStatus : (updatedSections.accounting?.status || nameAppStatus),
              files: isCompliance ? nameAppFiles : (updatedSections.accounting?.files || nameAppFiles)
            },
            aoc4: {
              ...(updatedSections.aoc4 || {}),
              name: aoc4Name,
              directorAuditReport: aoc4DirectorAudit,
              date: msmeDate,
              status: msmeStatus,
              files: msmeFiles
            },
            directorItr: {
              ...(updatedSections.directorItr || {}),
              name: isCompanyItrService ? (updatedSections.directorItr?.name || itrName) : itrName,
              date: isCompanyItrService ? (updatedSections.directorItr?.date || itrDate) : itrDate,
              status: isCompanyItrService ? (updatedSections.directorItr?.status || itrStatus) : itrStatus,
              files: isCompanyItrService ? (updatedSections.directorItr?.files || itrFiles) : itrFiles,
              docCollection: itrDocCollection,
              fileRequired: itrFileRequired
            },
            companyItr: {
              ...(updatedSections.companyItr || {}),
              name: isCompanyItrService ? itrName : (updatedSections.companyItr?.name || itrName),
              date: isCompanyItrService ? itrDate : (updatedSections.companyItr?.date || itrDate),
              status: isCompanyItrService ? itrStatus : (updatedSections.companyItr?.status || itrStatus),
              files: isCompanyItrService ? itrFiles : (updatedSections.companyItr?.files || itrFiles)
            }
          } : {})
        },
        Modified_Time: new Date().toISOString()
      };

      await saveInternalOperation(updatedRecord);
      // Synchronize team type back to parent Deal's Legal details subform (Zoho CRM & localStorage)
      await syncTeamTypeToLegalSubform(updatedRecord, teamType);

      setToast({ type: 'success', text: 'Internal Operation record saved and files attached to Zoho CRM.' });
      if (onSaved) onSaved(updatedRecord);

      setTimeout(() => {
        setToast(null);
      }, 2500);
    } catch (e: any) {
      setToast({ type: 'error', text: e?.message || 'Failed to save record' });
    } finally {
      setSaving(false);
    }
  };

  // Team Type Badge Color & Icon
  const teamTypeBadge = useMemo(() => {
    switch (teamType) {
      case 'Incorporation':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Building };
      case 'Compliance':
        return { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: ShieldCheck };
      case 'Funding':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: Briefcase };
      case 'Certification':
        return { bg: 'bg-purple-50 text-purple-700 border-purple-200', icon: Award };
      case 'Digital Marketing':
        return { bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: Share2 };
      default:
        return { bg: 'bg-gray-50 text-gray-700 border-gray-200', icon: Layers };
    }
  }, [teamType]);

  const TeamIcon = teamTypeBadge.icon;

  return (
    <OperationsStaffContext.Provider value={{ operationsStaff, operationsTLs, operationsTMs, recordId: String(record.zohoId || record.id || '') }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl my-auto overflow-hidden border border-gray-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 via-white to-orange-50/30 sticky top-0 z-10">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-orange-100 flex items-center justify-center text-be-orange shadow-2xs">
              <TeamIcon size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-gray-900 tracking-tight">
                  {record.Service_Scheme || 'Internal Operation Service'}
                </h2>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${teamTypeBadge.bg}`}>
                  {teamType}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {stage}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-1.5">
                <span>Child Record ID:</span>
                <span className="font-mono text-gray-700 font-bold">{record.id}</span>
                <span>•</span>
                <span>Parent Deal:</span>
                <span className="font-bold text-gray-800">{record.Deal_Name || `Deal #${record.Deal_ID}`}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              <span>{saving ? 'Saving...' : 'Save Record'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-gray-800">

          {/* Toast Banner */}
          {toast && (
            <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between border shadow-2xs transition-all ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              <div className="flex items-center gap-2">
                {toast.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
                <span>{toast.text}</span>
              </div>
              <button onClick={() => setToast(null)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          )}

          {/* PHASE 2: COMMON FIELDS & ROLE ASSIGNMENT CARD */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Users size={16} className="text-be-orange" />
                <span>Common Fields & Role Assignment</span>
              </h3>
              <span className="text-[11px] font-bold text-gray-400">Phase 2 Common Configuration</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Parent Record / Deal (Read-only Lookup View) */}
              <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    Parent Record / Deal (Lookup)
                  </span>
                  <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                    <span>{record.Deal_Name || `Deal #${record.Deal_ID}`}</span>
                  </div>
                  {record.Client_Name && (
                    <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                      Client: {record.Client_Name}
                    </p>
                  )}
                  {record.Company_Name && (
                    <p className="text-[10px] text-gray-400">
                      Company: {record.Company_Name}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/crm/deals/${record.Deal_ID}`)}
                  className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-be-orange hover:text-orange-700 transition-colors cursor-pointer"
                >
                  <span>Open Parent Deal</span>
                  <ExternalLink size={12} />
                </button>
              </div>

              {/* 2. Team Type (Inherited) & Service Name (Inherited) */}
              <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-200/80 space-y-2.5">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-0.5">
                    Service Name (Inherited)
                  </span>
                  <span className="font-bold text-xs text-gray-900 block truncate" title={record.Service_Scheme}>
                    {record.Service_Scheme}
                  </span>
                  {record.Tenure_of_Service && (
                    <span className="text-[10px] text-gray-500 block">Tenure: {record.Tenure_of_Service}</span>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200/60">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-0.5">
                    Team Type (Inherited)
                  </span>
                  {canEditTeamType ? (
                    <select
                      value={teamType}
                      onChange={(e) => {
                        const newTeam = e.target.value;
                        setTeamType(newTeam);
                        const newStages = getOperationStagesForTeamType(newTeam);
                        if (!newStages.includes(stage)) {
                          setStage(newStages[0]);
                        }
                      }}
                      className="w-full px-2.5 py-1 bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-lg text-xs font-bold text-gray-900 outline-none transition-all cursor-pointer shadow-2xs"
                    >
                      <option value="Incorporation">Incorporation</option>
                      <option value="Compliance">Compliance</option>
                      <option value="Funding">Funding</option>
                      <option value="Certification">Certification</option>
                      <option value="Digital Marketing">Digital Marketing</option>
                    </select>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${teamTypeBadge.bg}`}>
                      <TeamIcon size={12} />
                      {teamType}
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Stage Dropdown */}
              <div className="p-3.5 bg-blue-50/30 rounded-xl border border-blue-100 flex flex-col justify-between">
                <div>
                  <label className="text-[10px] font-black uppercase text-blue-900 tracking-wider block mb-1.5 flex items-center gap-1">
                    <Clock size={12} className="text-blue-600" />
                    <span>Operation Stage</span>
                  </label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as OperationStage)}
                    className="w-full px-3 py-2 bg-white border border-blue-200 hover:border-blue-300 focus:border-blue-500 rounded-xl text-xs font-bold text-blue-900 outline-none transition-all cursor-pointer shadow-2xs"
                  >
                    {!availableStages.includes(stage) && (
                      <option value={stage}>
                        {stage}
                      </option>
                    )}
                    {availableStages.map((stg) => (
                      <option key={stg} value={stg}>
                        {stg}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-blue-600 font-medium mt-2">
                  Controls current workflow milestone in Operations.
                </p>
              </div>
            </div>

            {/* CA/CS1 & CA/CS2 (Show ONLY if Team Type is Incorporation or Compliance) */}
            {(teamType === 'Incorporation' || teamType === 'Compliance') && (
              <div className="p-4 bg-purple-50/30 rounded-xl border border-purple-100">
                <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5 mb-3">
                  <ShieldCheck size={14} className="text-purple-600" />
                  <span>Chartered Accountant / Company Secretary Assignment (CA / CS)</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* CA/CS 1 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-gray-700">
                        CA/CS 1 (Primary Consultant)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomCaCs1(!isCustomCaCs1)}
                        className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 transition-colors cursor-pointer"
                      >
                        {isCustomCaCs1 ? 'Choose from list' : '+ Custom name'}
                      </button>
                    </div>
                    {isCustomCaCs1 ? (
                      <input
                        type="text"
                        placeholder="Type CA/CS Name..."
                        value={caCs1}
                        onChange={(e) => setCaCs1(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-purple-300 hover:border-purple-400 focus:border-purple-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
                      />
                    ) : (
                      <select
                        value={caCs1}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomCaCs1(true);
                          } else {
                            setCaCs1(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 focus:border-purple-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs cursor-pointer"
                      >
                        <option value="">Select Operations Staff (TL / Employee)...</option>
                        {caCs1 && !operationsStaff.some(s => s.name === caCs1) && (
                          <option value={caCs1}>{caCs1} (Current)</option>
                        )}
                        {operationsTLs.length > 0 && (
                          <optgroup label="Operations Team Leaders (TL)">
                            {operationsTLs.map(tl => (
                              <option key={`cacs1_tl_${tl.id}`} value={tl.name}>
                                {tl.name} (TL)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {operationsTMs.length > 0 && (
                          <optgroup label="Operations Team Members (TM)">
                            {operationsTMs.map(tm => (
                              <option key={`cacs1_tm_${tm.id}`} value={tm.name}>
                                {tm.name} (Operations)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value="__custom__">+ Enter Custom CA / CS Name...</option>
                      </select>
                    )}
                  </div>

                  {/* CA/CS 2 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-gray-700">
                        CA/CS 2 (Secondary Consultant / Auditor)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomCaCs2(!isCustomCaCs2)}
                        className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 transition-colors cursor-pointer"
                      >
                        {isCustomCaCs2 ? 'Choose from list' : '+ Custom name'}
                      </button>
                    </div>
                    {isCustomCaCs2 ? (
                      <input
                        type="text"
                        placeholder="Type CA/CS Name..."
                        value={caCs2}
                        onChange={(e) => setCaCs2(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-purple-300 hover:border-purple-400 focus:border-purple-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
                      />
                    ) : (
                      <select
                        value={caCs2}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomCaCs2(true);
                          } else {
                            setCaCs2(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 focus:border-purple-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs cursor-pointer"
                      >
                        <option value="">Select Operations Staff (TL / Employee)...</option>
                        {caCs2 && !operationsStaff.some(s => s.name === caCs2) && (
                          <option value={caCs2}>{caCs2} (Current)</option>
                        )}
                        {operationsTLs.length > 0 && (
                          <optgroup label="Operations Team Leaders (TL)">
                            {operationsTLs.map(tl => (
                              <option key={`cacs2_tl_${tl.id}`} value={tl.name}>
                                {tl.name} (TL)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {operationsTMs.length > 0 && (
                          <optgroup label="Operations Team Members (TM)">
                            {operationsTMs.map(tm => (
                              <option key={`cacs2_tm_${tm.id}`} value={tm.name}>
                                {tm.name} (Operations)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value="__custom__">+ Enter Custom CA / CS Name...</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Team Leader (TL) & Team Member (TM) Assignment Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* TL Assignment */}
              <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-200/80">
                <label className="text-xs font-bold text-amber-900 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Team Leader (TL)
                  </span>
                  {record.Team_Leader?.name && (
                    <span className="text-[10px] text-amber-700 font-semibold">Assigned</span>
                  )}
                </label>
                {canManage ? (
                  <select
                    value={selectedTlId}
                    onChange={(e) => setSelectedTlId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 hover:border-amber-300 focus:border-amber-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all cursor-pointer shadow-2xs"
                  >
                    <option value="">Select Team Leader (TL)...</option>
                    {allTeamLeaders.map((tl) => (
                      <option key={`modal_tl_${tl.id}`} value={tl.id}>
                        {tl.name} ({tl.dept} - TL)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-amber-900">
                    {record.Team_Leader?.name || record.Team_Leader_Name || 'Unassigned'}
                  </div>
                )}
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Assigned TL oversees work delivery and milestone reviews.
                </p>
              </div>

              {/* TM Assignment */}
              <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200/80">
                <label className="text-xs font-bold text-emerald-900 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Team Member (TM)
                  </span>
                  {record.Team_Member?.name && (
                    <span className="text-[10px] text-emerald-700 font-semibold">Assigned</span>
                  )}
                </label>
                {(canManage || canAssignTM) ? (
                  <select
                    value={selectedTmId}
                    onChange={(e) => setSelectedTmId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 hover:border-emerald-300 focus:border-emerald-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all cursor-pointer shadow-2xs"
                  >
                    <option value="">Select Team Member (TM)...</option>
                    {allTeamMembers.map((tm) => (
                      <option key={`modal_tm_${tm.id}`} value={tm.id}>
                        {tm.name} ({tm.dept} - TM)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900">
                    {record.Team_Member?.name || record.Team_Member_Name || 'Unassigned'}
                  </div>
                )}
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Primary execution staff responsible for drafting and submission.
                </p>
              </div>
            </div>
          </div>

          {/* PHASE 3 & 4: DYNAMIC SECTIONS BASED ON TEAM TYPE */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Layers size={16} className="text-be-orange" />
                <span>Execution Sections ({teamType})</span>
              </h3>
              <span className="text-[11px] font-bold text-gray-400">Dynamic Section Workflow</span>
            </div>

            {/* 1. TEAM TYPE: INCORPORATION */}
            {teamType === 'Incorporation' && (
              <div className="space-y-4">
                {/* Always Show: Doc collection */}
                <SectionContainer title="Doc collection" badge="Required">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <StaffNameSelect
                      label="Name / Executive"
                      value={sections.docCollection?.name || ''}
                      onChange={(val) => updateSection('docCollection', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <DateInput
                      label="Date"
                      value={sections.docCollection?.date || ''}
                      onChange={(val) => updateSection('docCollection', 'date', val)}
                    />
                    <SelectInput
                      label="Status"
                      value={sections.docCollection?.status || 'Pending'}
                      options={['Pending', 'Received']}
                      onChange={(val) => updateSection('docCollection', 'status', val)}
                    />
                    <SelectInput
                      label="Company Type"
                      value={companyType}
                      options={COMPANY_TYPES}
                      onChange={(val) => handleCompanyTypeChange(val as CompanyType)}
                    />
                  </div>
                  <div className="mt-3">
                    <FileUploadWidget
                      label="File Upload"
                      files={sections.docCollection?.files || []}
                      onChange={(files) => updateSection('docCollection', 'files', files)}
                      multiple={true}
                    />
                  </div>
                </SectionContainer>

                {/* Always Show: Name Application (With Clone on Rejected) */}
                <SectionContainer
                  title="Name Application"
                  badge="Resubmission on Rejection"
                  badgeColor="bg-amber-100 text-amber-800 border-amber-200"
                >
                  {/* Previous Rejected Attempts History */}
                  {Array.isArray(sections.nameAppHistory) && sections.nameAppHistory.length > 0 && (
                    <div className="mb-4 space-y-3 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                          <span>Previous Rejected Submissions / Resubmissions ({sections.nameAppHistory.length})</span>
                        </span>
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Editable Attempt History</span>
                      </div>
                      {sections.nameAppHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-3 bg-white rounded-xl border border-rose-100 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-gray-900">
                                Attempt #{hist.attemptNumber || hIdx + 1}
                              </span>
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md border border-rose-200">
                                {hist.status || 'REJECTED'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHistoryItem('nameAppHistory', hIdx)}
                              className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Delete this attempt"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <StaffNameSelect
                              label="Name"
                              value={hist.name || ''}
                              onChange={(val) => updateHistoryItem('nameAppHistory', hIdx, 'name', val)}
                              placeholder="Select Operations staff..."
                            />
                            <TextInput
                              label="Proposed / Rejected Name"
                              value={hist.approvedName || ''}
                              onChange={(val) => updateHistoryItem('nameAppHistory', hIdx, 'approvedName', val)}
                              placeholder="e.g. Acme Tech Pvt Ltd"
                            />
                            <DateInput
                              label="Date"
                              value={hist.date || ''}
                              onChange={(val) => updateHistoryItem('nameAppHistory', hIdx, 'date', val)}
                            />
                            <SelectInput
                              label="Status"
                              value={(() => {
                                const s = hist.status;
                                if (!s || s === 'In-process' || s === 'In process') return 'In-process';
                                const match = NAME_APPLICATION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                                return match || 'Rejected';
                              })()}
                              options={NAME_APPLICATION_STATUSES}
                              onChange={(val) => updateHistoryItem('nameAppHistory', hIdx, 'status', val)}
                            />
                          </div>

                          <div className="mt-2">
                            <FileUploadWidget
                              label="File Upload (Attempt Files)"
                              files={hist.files || []}
                              onChange={(files) => updateHistoryItem('nameAppHistory', hIdx, 'files', files)}
                              multiple={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(sections.nameAppHistory) && sections.nameAppHistory.length > 0 && (
                    <div className="pt-1 pb-1">
                      <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                        <RefreshCw size={12} className="text-amber-600" />
                        <span>Active Resubmission Round (Round {sections.nameAppHistory.length + 1})</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <StaffNameSelect
                      label="Name"
                      value={sections.nameApp?.name || ''}
                      onChange={(val) => updateSection('nameApp', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <TextInput
                      label="Approved Name"
                      value={sections.nameApp?.approvedName || ''}
                      onChange={(val) => updateSection('nameApp', 'approvedName', val)}
                      placeholder="e.g. Acme Tech Pvt Ltd"
                    />
                    <DateInput
                      label="Date"
                      value={sections.nameApp?.date || ''}
                      onChange={(val) => updateSection('nameApp', 'date', val)}
                    />
                    <SelectInput
                      label="Status"
                      value={(() => {
                        const s = sections.nameApp?.status;
                        if (!s || s === 'In-process' || s === 'In process') return 'In-process';
                        const match = NAME_APPLICATION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                        return match || 'In-process';
                      })()}
                      options={NAME_APPLICATION_STATUSES}
                      onChange={(val) => handleRepeatableSectionStatusChange('nameApp', 'nameAppHistory', val)}
                    />
                  </div>
                  <div className="mt-3">
                    <FileUploadWidget
                      label="File Upload"
                      files={sections.nameApp?.files || []}
                      onChange={(files) => updateSection('nameApp', 'files', files)}
                      multiple={true}
                    />
                  </div>
                </SectionContainer>

                {/* Always Show: DSC Creation */}
                <SectionContainer title="DSC Creation" badge="Milestone">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StaffNameSelect
                      label="Name"
                      value={sections.dscCreation?.name || ''}
                      onChange={(val) => updateSection('dscCreation', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <DateInput
                      label="Date"
                      value={sections.dscCreation?.date || ''}
                      onChange={(val) => updateSection('dscCreation', 'date', val)}
                    />
                    <SelectInput
                      label="Status"
                      value={
                        sections.dscCreation?.status === 'In-process'
                          ? 'In process'
                          : sections.dscCreation?.status || 'In process'
                      }
                      options={DSC_CREATION_STATUSES}
                      onChange={(val) => updateSection('dscCreation', 'status', val)}
                    />
                  </div>
                </SectionContainer>

                {/* Always Show: Final Filing (With Clone on Rejected) */}
                <SectionContainer
                  title="Final Filing"
                  badge="Resubmission on Rejection"
                  badgeColor="bg-amber-100 text-amber-800 border-amber-200"
                >
                  {/* Previous Rejected Attempts History */}
                  {Array.isArray(sections.finalFilingHistory) && sections.finalFilingHistory.length > 0 && (
                    <div className="mb-4 space-y-3 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                          <span>Previous Rejected Final Filings / Resubmissions ({sections.finalFilingHistory.length})</span>
                        </span>
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Editable Attempt History</span>
                      </div>
                      {sections.finalFilingHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-3 bg-white rounded-xl border border-rose-100 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-gray-900">
                                Attempt #{hist.attemptNumber || hIdx + 1}
                              </span>
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md border border-rose-200">
                                {hist.status || 'REJECTED'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHistoryItem('finalFilingHistory', hIdx)}
                              className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Delete this attempt"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <StaffNameSelect
                              label="Name"
                              value={hist.name || ''}
                              onChange={(val) => updateHistoryItem('finalFilingHistory', hIdx, 'name', val)}
                              placeholder="Select Operations staff..."
                            />
                            <TextInput
                              label="Final Approval Name"
                              value={hist.finalApprovalName || ''}
                              onChange={(val) => updateHistoryItem('finalFilingHistory', hIdx, 'finalApprovalName', val)}
                              placeholder="e.g. Acme Tech Pvt Ltd"
                            />
                            <DateInput
                              label="Date"
                              value={hist.date || ''}
                              onChange={(val) => updateHistoryItem('finalFilingHistory', hIdx, 'date', val)}
                            />
                            <DateInput
                              label="DOI Date"
                              value={hist.doiDate || ''}
                              onChange={(val) => updateHistoryItem('finalFilingHistory', hIdx, 'doiDate', val)}
                            />
                            <SelectInput
                              label="Status"
                              value={(() => {
                                const s = hist.status;
                                if (!s) return 'Rejected (resubmission)';
                                if (s === 'In-process' || s === 'In process') return 'In process';
                                const match = FINAL_FILING_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                                return match || 'Rejected (resubmission)';
                              })()}
                              options={FINAL_FILING_STATUSES}
                              onChange={(val) => updateHistoryItem('finalFilingHistory', hIdx, 'status', val)}
                            />
                          </div>
                          <div className="mt-2">
                            <FileUploadWidget
                              label="File Upload (Attempt Files)"
                              files={hist.files || []}
                              onChange={(files) => updateHistoryItem('finalFilingHistory', hIdx, 'files', files)}
                              multiple={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(sections.finalFilingHistory) && sections.finalFilingHistory.length > 0 && (
                    <div className="pt-1 pb-1">
                      <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                        <RefreshCw size={12} className="text-amber-600" />
                        <span>Active Resubmission Round (Round {sections.finalFilingHistory.length + 1})</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <StaffNameSelect
                      label="Name"
                      value={sections.finalFiling?.name || ''}
                      onChange={(val) => updateSection('finalFiling', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <TextInput
                      label="Final Approval Name"
                      value={sections.finalFiling?.finalApprovalName || ''}
                      onChange={(val) => updateSection('finalFiling', 'finalApprovalName', val)}
                      placeholder="e.g. Acme Tech Pvt Ltd"
                    />
                    <DateInput
                      label="Date"
                      value={sections.finalFiling?.date || ''}
                      onChange={(val) => updateSection('finalFiling', 'date', val)}
                    />
                    <DateInput
                      label="DOI Date"
                      value={sections.finalFiling?.doiDate || ''}
                      onChange={(val) => updateSection('finalFiling', 'doiDate', val)}
                    />
                    <SelectInput
                      label="Status"
                      value={(() => {
                        const s = sections.finalFiling?.status;
                        if (!s) return 'In process';
                        if (s === 'In-process') return 'In process';
                        const match = FINAL_FILING_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                        if (match) return match;
                        if (s.toLowerCase().includes('reject')) return 'Rejected (resubmission)';
                        return s;
                      })()}
                      options={(() => {
                        const currentVal = (() => {
                          const s = sections.finalFiling?.status;
                          if (!s) return 'In process';
                          if (s === 'In-process') return 'In process';
                          const match = FINAL_FILING_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                          if (match) return match;
                          if (s.toLowerCase().includes('reject')) return 'Rejected (resubmission)';
                          return s;
                        })();
                        return FINAL_FILING_STATUSES.includes(currentVal)
                          ? FINAL_FILING_STATUSES
                          : [currentVal, ...FINAL_FILING_STATUSES];
                      })()}
                      onChange={(val) => handleRepeatableSectionStatusChange('finalFiling', 'finalFilingHistory', val)}
                    />
                  </div>
                  <div className="mt-3">
                    <FileUploadWidget
                      label="File Upload"
                      files={sections.finalFiling?.files || []}
                      onChange={(files) => updateSection('finalFiling', 'files', files)}
                      multiple={true}
                    />
                  </div>
                </SectionContainer>

                {/* Conditional UI: "After allocation" Dropdown */}
                <div className="p-4 bg-orange-50/40 rounded-2xl border border-orange-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">After Allocation Workflow</h4>
                      <p className="text-xs text-gray-500">
                        Select &quot;Yes&quot; to show post-incorporation compliance documents for{' '}
                        <span className="font-bold text-orange-700">{companyType}</span>.
                      </p>
                    </div>
                    <div className="w-full sm:w-48">
                      <SelectInput
                        label="After allocation"
                        value={afterAllocation}
                        options={['No', 'Yes']}
                        onChange={(val) => setAfterAllocation(val as 'Yes' | 'No')}
                      />
                    </div>
                  </div>

                  {/* If "Yes" AND PVT LTD / Section 8 */}
                  {afterAllocation === 'Yes' && (companyType === 'PVT LTD' || companyType === 'Section 8') && (
                    <div className="space-y-4 pt-2 border-t border-orange-200">
                      <span className="text-xs font-black uppercase text-orange-800 tracking-wider block">
                        Post-Incorporation Deliverables ({companyType})
                      </span>

                      {/* 1. Board Resolution */}
                      <StandardSection
                        title="Board Resolution"
                        data={sections.boardResolution || {}}
                        statusOptions={BOARD_RESOLUTION_STATUSES}
                        onChange={(k, v) => updateSection('boardResolution', k, v)}
                      />

                      {/* 2. 2-Share Certificate */}
                      <StandardSection
                        title="2-Share Certificate"
                        data={sections.shareCertificate || {}}
                        statusOptions={SHARE_CERTIFICATE_STATUSES}
                        onChange={(k, v) => updateSection('shareCertificate', k, v)}
                      />

                      {/* 3. MSME Certificate */}
                      <StandardSection
                        title="MSME Certificate"
                        data={sections.msmeCertificate || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateSection('msmeCertificate', k, v)}
                      />

                      {/* 4. ADT-1 (Includes Auditor Name!) */}
                      <SectionContainer title="ADT-1" badge="Auditor Filing">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <StaffNameSelect
                            label="Name"
                            value={sections.adt1?.name || ''}
                            onChange={(val) => updateSection('adt1', 'name', val)}
                            placeholder="Select Operations staff..."
                          />
                          <AuditorNameSelect
                            label="Auditor Name"
                            value={sections.adt1?.auditorName || ''}
                            onChange={(val) => updateSection('adt1', 'auditorName', val)}
                          />
                          <DateInput
                            label="Date"
                            value={sections.adt1?.date || ''}
                            onChange={(val) => updateSection('adt1', 'date', val)}
                          />
                          <SelectInput
                            label="Status"
                            value={
                              sections.adt1?.status === 'In-process'
                                ? 'In process'
                                : (sections.adt1?.status || 'In process')
                            }
                            options={POST_INCORPORATION_STATUSES}
                            onChange={(val) => updateSection('adt1', 'status', val)}
                          />
                        </div>
                        <div className="mt-3">
                          <FileUploadWidget
                            label="File Upload"
                            files={sections.adt1?.files || []}
                            onChange={(files) => updateSection('adt1', 'files', files)}
                            multiple={true}
                          />
                        </div>
                      </SectionContainer>

                      {/* 5. INC 20-A */}
                      <StandardSection
                        title="INC 20-A"
                        data={sections.inc20A || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateSection('inc20A', k, v)}
                      />
                    </div>
                  )}

                  {/* If "Yes" AND LLP */}
                  {afterAllocation === 'Yes' && companyType === 'LLP' && (
                    <div className="space-y-4 pt-2 border-t border-orange-200">
                      <span className="text-xs font-black uppercase text-orange-800 tracking-wider block">
                        Post-Incorporation Deliverables (LLP)
                      </span>

                      {/* 1. LLP agreement preparation */}
                      <StandardSection
                        title="LLP agreement preparation"
                        data={sections.llpAgreement || {}}
                        onChange={(k, v) => updateSection('llpAgreement', k, v)}
                      />

                      {/* 2. MSME Certificate */}
                      <StandardSection
                        title="MSME Certificate"
                        data={sections.msmeCertificateLlp || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateSection('msmeCertificateLlp', k, v)}
                      />

                      {/* 3. Form 3 */}
                      <StandardSection
                        title="Form 3"
                        data={sections.form3 || {}}
                        onChange={(k, v) => updateSection('form3', k, v)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. TEAM TYPE: COMPLIANCE */}
            {teamType === 'Compliance' && (
              <div className="space-y-4">
                {/* After allocation Dropdown & Post-Allocation Deliverables */}
                <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Compliance Execution Workflow</h4>
                      <p className="text-xs text-gray-500">
                        Select &quot;Yes&quot; to show post-allocation filings (ADT-1 &amp; INC for PVT LTD / Section 8, or Form 3 for LLP) for{' '}
                        <span className="font-bold text-indigo-700">{companyType}</span>.
                      </p>
                    </div>
                    <div className="w-full sm:w-48">
                      <SelectInput
                        label="After allocation"
                        value={afterAllocation}
                        options={['No', 'Yes']}
                        onChange={(val) => setAfterAllocation(val as 'Yes' | 'No')}
                      />
                    </div>
                  </div>

                  {/* If "Yes" AND PVT LTD / Section 8 */}
                  {afterAllocation === 'Yes' && (companyType === 'PVT LTD' || companyType === 'Section 8') && (
                    <div className="space-y-4 pt-3 border-t border-indigo-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-indigo-600" />
                          <span>Post-Allocation Filings ({companyType})</span>
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                          2 Sections Active
                        </span>
                      </div>

                      {/* 1. ADT-1: [Name, Auditor Name, Date, Status, File Upload] */}
                      <SectionContainer
                        title="ADT-1"
                        badge="Auditor Filing"
                        badgeColor="bg-indigo-100 text-indigo-800 border-indigo-200"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <StaffNameSelect
                            label="Name"
                            value={(sections.compAdt1 || sections.adt1)?.name || ''}
                            onChange={(val) => updateCompSection('compAdt1', 'adt1', 'name', val)}
                            placeholder="Select Operations staff..."
                          />
                          <AuditorNameSelect
                            label="Auditor Name"
                            value={(sections.compAdt1 || sections.adt1)?.auditorName || ''}
                            onChange={(val) => updateCompSection('compAdt1', 'adt1', 'auditorName', val)}
                          />
                          <DateInput
                            label="Date"
                            value={(sections.compAdt1 || sections.adt1)?.date || ''}
                            onChange={(val) => updateCompSection('compAdt1', 'adt1', 'date', val)}
                          />
                          <SelectInput
                            label="Status"
                            value={
                              (sections.compAdt1 || sections.adt1)?.status === 'In-process'
                                ? 'In process'
                                : ((sections.compAdt1 || sections.adt1)?.status || 'In process')
                            }
                            options={POST_INCORPORATION_STATUSES}
                            onChange={(val) => updateCompSection('compAdt1', 'adt1', 'status', val)}
                          />
                        </div>
                        <div className="mt-3">
                          <FileUploadWidget
                            label="File Upload"
                            files={(sections.compAdt1 || sections.adt1)?.files || []}
                            onChange={(files) => updateCompSection('compAdt1', 'adt1', 'files', files)}
                            multiple={true}
                          />
                        </div>
                      </SectionContainer>

                      {/* 2. INC: [Name, Date, Status, File Upload] */}
                      <StandardSection
                        title="INC"
                        badge="Commencement / Filing"
                        badgeColor="bg-indigo-100 text-indigo-800 border-indigo-200"
                        data={sections.compInc || sections.inc || sections.inc20A || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateCompSection('compInc', 'inc', k, v)}
                      />
                    </div>
                  )}

                  {/* If "Yes" AND LLP */}
                  {afterAllocation === 'Yes' && companyType === 'LLP' && (
                    <div className="space-y-4 pt-3 border-t border-indigo-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-indigo-600" />
                          <span>Post-Allocation Filings (LLP)</span>
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                          1 Section Active
                        </span>
                      </div>

                      {/* Form 3: [Name, Date, Status, File Upload] */}
                      <StandardSection
                        title="Form 3"
                        badge="LLP Agreement Filing"
                        badgeColor="bg-indigo-100 text-indigo-800 border-indigo-200"
                        data={sections.compForm3 || sections.form3 || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateCompSection('compForm3', 'form3', k, v)}
                      />
                    </div>
                  )}
                </div>

                {/* DEFAULT COMPLIANCE SECTIONS (Shown by default regardless of after allocation selection) */}
                <div className="space-y-4">
                  {/* 1. Doc collection: [Name, Date, Status (Pending, Received), File Upload, Company type] */}
                  <SectionContainer title="Doc collection" badge="Compliance Core">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <StaffNameSelect
                        label="Name"
                        value={sections.compDocCollection?.name || ''}
                        onChange={(val) => updateSection('compDocCollection', 'name', val)}
                        placeholder="Select Operations staff..."
                      />
                      <DateInput
                        label="Date"
                        value={sections.compDocCollection?.date || ''}
                        onChange={(val) => updateSection('compDocCollection', 'date', val)}
                      />
                      <SelectInput
                        label="Status"
                        value={sections.compDocCollection?.status || 'Pending'}
                        options={['Pending', 'Received']}
                        onChange={(val) => updateSection('compDocCollection', 'status', val)}
                      />
                      <SelectInput
                        label="Company Type"
                        value={companyType}
                        options={COMPANY_TYPES}
                        onChange={(val) => handleCompanyTypeChange(val as CompanyType)}
                      />
                    </div>
                    <div className="mt-3">
                      <FileUploadWidget
                        label="File Upload"
                        files={sections.compDocCollection?.files || []}
                        onChange={(files) => updateSection('compDocCollection', 'files', files)}
                        multiple={true}
                      />
                    </div>
                  </SectionContainer>

                  {/* 2. Director ITR: [Name, Date, Status, File Upload, File required (Yes/No), Doc collection (Pending/Completed)] */}
                  <SectionContainer title="Director ITR" badge="Personal Filings">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <StaffNameSelect
                        label="Name"
                        value={sections.directorItr?.name || ''}
                        onChange={(val) => updateSection('directorItr', 'name', val)}
                        placeholder="Select Operations staff..."
                      />
                      <DateInput
                        label="Date"
                        value={sections.directorItr?.date || ''}
                        onChange={(val) => updateSection('directorItr', 'date', val)}
                      />
                      <SelectInput
                        label="Status"
                        value={(() => {
                          const s = sections.directorItr?.status;
                          if (!s || s === 'In-process' || s === 'In process') return 'In Process';
                          const match = DIRECTOR_ITR_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                          return match || s;
                        })()}
                        options={DIRECTOR_ITR_STATUSES}
                        onChange={(val) => updateSection('directorItr', 'status', val)}
                      />
                      <SelectInput
                        label="File required"
                        value={sections.directorItr?.fileRequired || 'Yes'}
                        options={['Yes', 'No']}
                        onChange={(val) => updateSection('directorItr', 'fileRequired', val)}
                      />
                      {(sections.directorItr?.fileRequired || 'Yes') === 'Yes' && (
                        <SelectInput
                          label="Doc collection"
                          value={(() => {
                            const dc = sections.directorItr?.docCollection;
                            if (!dc || dc === 'No') return 'Pending';
                            if (dc === 'Yes') return 'Completed';
                            return dc;
                          })()}
                          options={['Pending', 'Completed']}
                          onChange={(val) => updateSection('directorItr', 'docCollection', val)}
                        />
                      )}
                    </div>
                    {(sections.directorItr?.fileRequired || 'Yes') === 'Yes' && (
                      <div className="mt-3">
                        <FileUploadWidget
                          label="File Upload"
                          files={sections.directorItr?.files || []}
                          onChange={(files) => updateSection('directorItr', 'files', files)}
                          multiple={true}
                        />
                      </div>
                    )}
                  </SectionContainer>

                  {/* 3. Accounting: [Name, Date, Status, File Upload] */}
                  <SectionContainer title="Accounting" badge="Books of Account">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <StaffNameSelect
                        label="Name"
                        value={sections.accounting?.name || ''}
                        onChange={(val) => updateSection('accounting', 'name', val)}
                        placeholder="Select Operations staff..."
                      />
                      <DateInput
                        label="Date"
                        value={sections.accounting?.date || ''}
                        onChange={(val) => updateSection('accounting', 'date', val)}
                      />
                      <SelectInput
                        label="Status"
                        value={(() => {
                          const s = sections.accounting?.status;
                          if (!s || s === 'In-process' || s === 'In process') return 'In process';
                          const match = POST_INCORPORATION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                          return match || s;
                        })()}
                        options={POST_INCORPORATION_STATUSES}
                        onChange={(val) => updateSection('accounting', 'status', val)}
                      />
                    </div>
                    <div className="mt-3">
                      <FileUploadWidget
                        label="File Upload"
                        files={sections.accounting?.files || []}
                        onChange={(files) => updateSection('accounting', 'files', files)}
                        multiple={true}
                      />
                    </div>
                  </SectionContainer>

                  {/* 4. Audit: [Name, Auditor Name, Date, Status, File Upload] */}
                  <SectionContainer title="Audit" badge="Statutory Audit">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <StaffNameSelect
                        label="Name"
                        value={sections.audit?.name || ''}
                        onChange={(val) => updateSection('audit', 'name', val)}
                        placeholder="Select Operations staff..."
                      />
                      <AuditorNameSelect
                        label="Auditor Name"
                        value={sections.audit?.auditorName || ''}
                        onChange={(val) => updateSection('audit', 'auditorName', val)}
                      />
                      <DateInput
                        label="Date"
                        value={sections.audit?.date || ''}
                        onChange={(val) => updateSection('audit', 'date', val)}
                      />
                      <SelectInput
                        label="Status"
                        value={(() => {
                          const s = sections.audit?.status;
                          if (!s || s === 'In-process' || s === 'In process') return 'In process';
                          const match = POST_INCORPORATION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                          return match || s;
                        })()}
                        options={POST_INCORPORATION_STATUSES}
                        onChange={(val) => updateSection('audit', 'status', val)}
                      />
                    </div>
                    <div className="mt-3">
                      <FileUploadWidget
                        label="File Upload"
                        files={sections.audit?.files || []}
                        onChange={(files) => updateSection('audit', 'files', files)}
                        multiple={true}
                      />
                    </div>
                  </SectionContainer>

                  {/* 5. Company ITR: [Name, Date, Status, File Upload] */}
                  <SectionContainer title="Company ITR" badge="Corporate Tax">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <StaffNameSelect
                        label="Name"
                        value={sections.companyItr?.name || ''}
                        onChange={(val) => updateSection('companyItr', 'name', val)}
                        placeholder="Select Operations staff..."
                      />
                      <DateInput
                        label="Date"
                        value={sections.companyItr?.date || ''}
                        onChange={(val) => updateSection('companyItr', 'date', val)}
                      />
                      <SelectInput
                        label="Status"
                        value={(() => {
                          const s = sections.companyItr?.status;
                          if (!s || s === 'In-process' || s === 'In process') return 'In process';
                          const match = POST_INCORPORATION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                          return match || s;
                        })()}
                        options={POST_INCORPORATION_STATUSES}
                        onChange={(val) => updateSection('companyItr', 'status', val)}
                      />
                    </div>
                    <div className="mt-3">
                      <FileUploadWidget
                        label="File Upload"
                        files={sections.companyItr?.files || []}
                        onChange={(files) => updateSection('companyItr', 'files', files)}
                        multiple={true}
                      />
                    </div>
                  </SectionContainer>

                  {/* Conditional based on Company Type for Compliance */}
                  {(companyType === 'PVT LTD' || companyType === 'Section 8') && (
                    <div className="space-y-4 pt-2 border-t border-gray-200">
                      <span className="text-xs font-black uppercase text-indigo-900 tracking-wider block">
                        Entity-Specific Filings ({companyType})
                      </span>

                      {/* DPT 3 Filing */}
                      <StandardSection
                        title="DPT 3 Filing"
                        data={sections.dpt3 || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateSection('dpt3', k, v)}
                      />

                      {/* AOC-4: [Name, Date, Status, File Upload, Director & Audit report (Prepared/Not Prepared)] */}
                      <SectionContainer title="AOC-4" badge="Financial Statements">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <StaffNameSelect
                            label="Name"
                            value={sections.aoc4?.name || ''}
                            onChange={(val) => updateSection('aoc4', 'name', val)}
                            placeholder="Select Operations staff..."
                          />
                          <DateInput
                            label="Date"
                            value={sections.aoc4?.date || ''}
                            onChange={(val) => updateSection('aoc4', 'date', val)}
                          />
                          <SelectInput
                            label="Status"
                            value={(() => {
                              const s = sections.aoc4?.status;
                              if (!s || s === 'In-process' || s === 'In process') return 'In process';
                              const match = POST_INCORPORATION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                              return match || s;
                            })()}
                            options={POST_INCORPORATION_STATUSES}
                            onChange={(val) => updateSection('aoc4', 'status', val)}
                          />
                          <SelectInput
                            label="Director & Audit report"
                            value={sections.aoc4?.directorAuditReport || 'Prepared'}
                            options={['Prepared', 'Not Prepared']}
                            onChange={(val) => updateSection('aoc4', 'directorAuditReport', val)}
                          />
                        </div>
                        <div className="mt-3">
                          <FileUploadWidget
                            label="File Upload"
                            files={sections.aoc4?.files || []}
                            onChange={(files) => updateSection('aoc4', 'files', files)}
                            multiple={true}
                          />
                        </div>
                      </SectionContainer>

                      {/* MGT-7/7A */}
                      <StandardSection
                        title="MGT-7 / 7A (Annual Return)"
                        data={sections.mgt7 || {}}
                        statusOptions={POST_INCORPORATION_STATUSES}
                        onChange={(k, v) => updateSection('mgt7', k, v)}
                      />
                    </div>
                  )}

                  {companyType === 'LLP' && (
                    <div className="space-y-4 pt-2 border-t border-gray-200">
                      <span className="text-xs font-black uppercase text-indigo-900 tracking-wider block">
                        LLP Compliance Filings
                      </span>

                      {/* Form 11 */}
                      <StandardSection
                        title="Form 11 (Annual Return of LLP)"
                        data={sections.form11 || {}}
                        onChange={(k, v) => updateSection('form11', k, v)}
                      />

                      {/* Form 8 (Statement of Account & Solvency) with Audit report (Yes/No) */}
                      <SectionContainer title="Form 8 (Statement of Account & Solvency)" badge="LLP Solvency">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <StaffNameSelect
                            label="Name"
                            value={sections.form8?.name || ''}
                            onChange={(val) => updateSection('form8', 'name', val)}
                            placeholder="Select Operations staff..."
                          />
                          <DateInput
                            label="Date"
                            value={sections.form8?.date || ''}
                            onChange={(val) => updateSection('form8', 'date', val)}
                          />
                          <SelectInput
                            label="Status"
                            value={sections.form8?.status || 'In-process'}
                            options={STANDARD_EXECUTION_STATUSES}
                            onChange={(val) => updateSection('form8', 'status', val)}
                          />
                          <SelectInput
                            label="Audit report"
                            value={sections.form8?.auditReport || 'Yes'}
                            options={['Yes', 'No']}
                            onChange={(val) => updateSection('form8', 'auditReport', val)}
                          />
                        </div>
                        <div className="mt-3">
                          <FileUploadWidget
                            label="File Upload"
                            files={sections.form8?.files || []}
                            onChange={(files) => updateSection('form8', 'files', files)}
                            multiple={true}
                          />
                        </div>
                      </SectionContainer>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. TEAM TYPE: FUNDING */}
            {teamType === 'Funding' && (
              <div className="space-y-4">
                {/* 1. DPR / Pitch deck creation */}
                <StandardSection
                  title="DPR / Pitch deck creation"
                  data={sections.dprCreation || {}}
                  statusOptions={FUNDING_DPR_STATUSES}
                  onChange={(k, v) => updateSection('dprCreation', k, v)}
                />

                {/* 2. Finance */}
                <StandardSection
                  title="Finance / Projected Financials"
                  data={sections.fundingFinance || {}}
                  statusOptions={FUNDING_FINANCE_STATUSES}
                  onChange={(k, v) => updateSection('fundingFinance', k, v)}
                />

                {/* 3. Application submission (With Resubmission on Rejected): [Name, Date, Status, File Upload, ID, Password, Registration number] */}
                <SectionContainer
                  title="Application submission"
                  badge="Resubmission on Rejection"
                  badgeColor="bg-amber-100 text-amber-800 border-amber-200"
                >
                  {/* Previous Rejected Attempts History */}
                  {Array.isArray(sections.appSubmissionHistory) && sections.appSubmissionHistory.length > 0 && (
                    <div className="mb-4 space-y-3 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                          <span>Previous Rejected Submissions / Resubmissions ({sections.appSubmissionHistory.length})</span>
                        </span>
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Editable Attempt History</span>
                      </div>
                      {sections.appSubmissionHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-3 bg-white rounded-xl border border-rose-100 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-gray-900">
                                Attempt #{hist.attemptNumber || hIdx + 1}
                              </span>
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md border border-rose-200">
                                {hist.status || 'REJECTED'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHistoryItem('appSubmissionHistory', hIdx)}
                              className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Delete this attempt"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            <StaffNameSelect
                              label="Applicant / Executive Name"
                              value={hist.name || ''}
                              onChange={(val) => updateHistoryItem('appSubmissionHistory', hIdx, 'name', val)}
                              placeholder="Select Operations staff..."
                            />
                            <DateInput
                              label="Submission Date"
                              value={hist.date || ''}
                              onChange={(val) => updateHistoryItem('appSubmissionHistory', hIdx, 'date', val)}
                            />
                            <SelectInput
                              label="Status"
                              value={(() => {
                                const s = hist.status;
                                if (!s || s === 'In-process' || s === 'In process') return 'Pending';
                                const match = FUNDING_APP_SUBMISSION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                                return match || 'Rejected';
                              })()}
                              options={FUNDING_APP_SUBMISSION_STATUSES}
                              onChange={(val) => updateHistoryItem('appSubmissionHistory', hIdx, 'status', val)}
                            />
                            <TextInput
                              label="Portal User ID"
                              value={hist.portalId || hist.id || ''}
                              onChange={(val) => {
                                updateHistoryItem('appSubmissionHistory', hIdx, 'portalId', val);
                                updateHistoryItem('appSubmissionHistory', hIdx, 'id', val);
                              }}
                              placeholder="e.g. MSME-PORTAL-1029"
                            />
                            <TextInput
                              label="Portal Password"
                              type="password"
                              value={hist.portalPassword || hist.password || ''}
                              onChange={(val) => {
                                updateHistoryItem('appSubmissionHistory', hIdx, 'portalPassword', val);
                                updateHistoryItem('appSubmissionHistory', hIdx, 'password', val);
                              }}
                              placeholder="••••••••"
                            />
                            <TextInput
                              label="Registration Number / ACK"
                              value={hist.registrationNumber || ''}
                              onChange={(val) => updateHistoryItem('appSubmissionHistory', hIdx, 'registrationNumber', val)}
                              placeholder="e.g. ACK-2026-X992"
                            />
                          </div>

                          <div className="mt-2">
                            <FileUploadWidget
                              label="File Upload (Attempt Files)"
                              files={hist.files || []}
                              onChange={(files) => updateHistoryItem('appSubmissionHistory', hIdx, 'files', files)}
                              multiple={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(sections.appSubmissionHistory) && sections.appSubmissionHistory.length > 0 && (
                    <div className="pt-1 pb-1">
                      <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                        <RefreshCw size={12} className="text-amber-600" />
                        <span>Active Resubmission Round (Round {sections.appSubmissionHistory.length + 1})</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <StaffNameSelect
                      label="Applicant / Executive Name"
                      value={sections.appSubmission?.name || ''}
                      onChange={(val) => updateSection('appSubmission', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <DateInput
                      label="Submission Date"
                      value={sections.appSubmission?.date || ''}
                      onChange={(val) => updateSection('appSubmission', 'date', val)}
                    />
                    {(() => {
                      const rawStatus = sections.appSubmission?.status;
                      const currentAppStatus = (() => {
                        if (!rawStatus || rawStatus === 'In-process' || rawStatus === 'In process') {
                          return 'Pending';
                        }
                        const match = FUNDING_APP_SUBMISSION_STATUSES.find(
                          (opt) => opt.toLowerCase() === rawStatus.toLowerCase()
                        );
                        return match || rawStatus;
                      })();
                      const safeAppOptions = FUNDING_APP_SUBMISSION_STATUSES.includes(currentAppStatus)
                        ? FUNDING_APP_SUBMISSION_STATUSES
                        : [currentAppStatus, ...FUNDING_APP_SUBMISSION_STATUSES];

                      return (
                        <SelectInput
                          label="Status"
                          value={currentAppStatus}
                          options={safeAppOptions}
                          onChange={(val) => handleRepeatableSectionStatusChange('appSubmission', 'appSubmissionHistory', val)}
                        />
                      );
                    })()}
                    <TextInput
                      label="Portal User ID"
                      value={sections.appSubmission?.portalId || ''}
                      onChange={(val) => updateSection('appSubmission', 'portalId', val)}
                      placeholder="e.g. MSME-PORTAL-1029"
                    />
                    <TextInput
                      label="Portal Password"
                      type="password"
                      value={sections.appSubmission?.portalPassword || ''}
                      onChange={(val) => updateSection('appSubmission', 'portalPassword', val)}
                      placeholder="••••••••"
                    />
                    <TextInput
                      label="Registration Number / ACK"
                      value={sections.appSubmission?.registrationNumber || ''}
                      onChange={(val) => updateSection('appSubmission', 'registrationNumber', val)}
                      placeholder="e.g. ACK-2026-X992"
                    />
                  </div>
                  <div className="mt-3">
                    <FileUploadWidget
                      label="File Upload"
                      files={sections.appSubmission?.files || []}
                      onChange={(files) => updateSection('appSubmission', 'files', files)}
                      multiple={true}
                    />
                  </div>
                </SectionContainer>
              </div>
            )}

            {/* 4. TEAM TYPE: CERTIFICATION */}
            {teamType === 'Certification' && (
              <div className="space-y-4">
                {/* 1. Doc collection / DSC (With Resubmission on Rejected) */}
                <SectionContainer
                  title="Doc collection / DSC"
                  badge="Resubmission on Rejection"
                  badgeColor="bg-amber-100 text-amber-800 border-amber-200"
                >
                  {/* Previous Rejected Attempts History */}
                  {Array.isArray(sections.certDocCollectionHistory) && sections.certDocCollectionHistory.length > 0 && (
                    <div className="mb-4 space-y-3 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                          <span>Previous Rejected Submissions / Resubmissions ({sections.certDocCollectionHistory.length})</span>
                        </span>
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Editable Attempt History</span>
                      </div>
                      {sections.certDocCollectionHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-3 bg-white rounded-xl border border-rose-100 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-gray-900">
                                Attempt #{hist.attemptNumber || hIdx + 1}
                              </span>
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md border border-rose-200">
                                {hist.status || 'REJECTED'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHistoryItem('certDocCollectionHistory', hIdx)}
                              className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Delete this attempt"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <StaffNameSelect
                              label="Name"
                              value={hist.name || ''}
                              onChange={(val) => updateHistoryItem('certDocCollectionHistory', hIdx, 'name', val)}
                              placeholder="Select Operations staff..."
                            />
                            <DateInput
                              label="Date"
                              value={hist.date || ''}
                              onChange={(val) => updateHistoryItem('certDocCollectionHistory', hIdx, 'date', val)}
                            />
                            <SelectInput
                              label="Status"
                              value={(() => {
                                const s = hist.status;
                                if (!s || s === 'In-process' || s === 'In process') return 'In process';
                                const match = CERT_DOC_COLLECTION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                                return match || 'Rejected';
                              })()}
                              options={CERT_DOC_COLLECTION_STATUSES}
                              onChange={(val) => updateHistoryItem('certDocCollectionHistory', hIdx, 'status', val)}
                            />
                          </div>

                          <div className="mt-2">
                            <FileUploadWidget
                              label="File Upload (Attempt Files)"
                              files={hist.files || []}
                              onChange={(files) => updateHistoryItem('certDocCollectionHistory', hIdx, 'files', files)}
                              multiple={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(sections.certDocCollectionHistory) && sections.certDocCollectionHistory.length > 0 && (
                    <div className="pt-1 pb-1">
                      <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                        <RefreshCw size={12} className="text-amber-600" />
                        <span>Active Resubmission Round (Round {sections.certDocCollectionHistory.length + 1})</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StaffNameSelect
                      label="Name"
                      value={sections.certDocCollection?.name || ''}
                      onChange={(val) => updateSection('certDocCollection', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <DateInput
                      label="Date"
                      value={sections.certDocCollection?.date || ''}
                      onChange={(val) => updateSection('certDocCollection', 'date', val)}
                    />
                    <SelectInput
                      label="Status"
                      value={(() => {
                        const s = sections.certDocCollection?.status;
                        if (!s || s === 'In-process' || s === 'In process') return 'In process';
                        const match = CERT_DOC_COLLECTION_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                        return match || 'In process';
                      })()}
                      options={CERT_DOC_COLLECTION_STATUSES}
                      onChange={(val) => handleRepeatableSectionStatusChange('certDocCollection', 'certDocCollectionHistory', val)}
                    />
                  </div>
                  <div className="mt-3">
                    <FileUploadWidget
                      label="File Upload"
                      files={sections.certDocCollection?.files || []}
                      onChange={(files) => updateSection('certDocCollection', 'files', files)}
                      multiple={true}
                    />
                  </div>
                </SectionContainer>

                {/* 2. Final Application (With Resubmission on Rejected) */}
                <SectionContainer
                  title="Final Application"
                  badge="Resubmission on Rejection"
                  badgeColor="bg-amber-100 text-amber-800 border-amber-200"
                >
                  {/* Previous Rejected Attempts History */}
                  {Array.isArray(sections.certFinalAppHistory) && sections.certFinalAppHistory.length > 0 && (
                    <div className="mb-4 space-y-3 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                          <span>Previous Rejected Submissions / Resubmissions ({sections.certFinalAppHistory.length})</span>
                        </span>
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Editable Attempt History</span>
                      </div>
                      {sections.certFinalAppHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-3 bg-white rounded-xl border border-rose-100 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-gray-900">
                                Attempt #{hist.attemptNumber || hIdx + 1}
                              </span>
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md border border-rose-200">
                                {hist.status || 'REJECTED'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHistoryItem('certFinalAppHistory', hIdx)}
                              className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Delete this attempt"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <StaffNameSelect
                              label="Name"
                              value={hist.name || ''}
                              onChange={(val) => updateHistoryItem('certFinalAppHistory', hIdx, 'name', val)}
                              placeholder="Select Operations staff..."
                            />
                            <DateInput
                              label="Date"
                              value={hist.date || ''}
                              onChange={(val) => updateHistoryItem('certFinalAppHistory', hIdx, 'date', val)}
                            />
                            <SelectInput
                              label="Status"
                              value={(() => {
                                const s = hist.status;
                                if (!s || s === 'In-process' || s === 'In process') return 'Pending';
                                const match = CERT_FINAL_APP_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                                return match || 'Rejected';
                              })()}
                              options={CERT_FINAL_APP_STATUSES}
                              onChange={(val) => updateHistoryItem('certFinalAppHistory', hIdx, 'status', val)}
                            />
                            <TextInput
                              label="ID"
                              value={hist.id || hist.portalId || ''}
                              onChange={(val) => {
                                updateHistoryItem('certFinalAppHistory', hIdx, 'id', val);
                                updateHistoryItem('certFinalAppHistory', hIdx, 'portalId', val);
                              }}
                              placeholder="Enter ID"
                            />
                            <TextInput
                              label="Password"
                              type="password"
                              value={hist.password || hist.portalPassword || ''}
                              onChange={(val) => {
                                updateHistoryItem('certFinalAppHistory', hIdx, 'password', val);
                                updateHistoryItem('certFinalAppHistory', hIdx, 'portalPassword', val);
                              }}
                              placeholder="••••••••"
                            />
                            <TextInput
                              label="Registration Number"
                              value={hist.registrationNumber || ''}
                              onChange={(val) => updateHistoryItem('certFinalAppHistory', hIdx, 'registrationNumber', val)}
                              placeholder="Enter registration number"
                            />
                          </div>

                          <div className="mt-2">
                            <FileUploadWidget
                              label="File Upload (Attempt Files)"
                              files={hist.files || []}
                              onChange={(files) => updateHistoryItem('certFinalAppHistory', hIdx, 'files', files)}
                              multiple={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(sections.certFinalAppHistory) && sections.certFinalAppHistory.length > 0 && (
                    <div className="pt-1 pb-1">
                      <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                        <RefreshCw size={12} className="text-amber-600" />
                        <span>Active Resubmission Round (Round {sections.certFinalAppHistory.length + 1})</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StaffNameSelect
                      label="Name"
                      value={sections.certFinalApp?.name || ''}
                      onChange={(val) => updateSection('certFinalApp', 'name', val)}
                      placeholder="Select Operations staff..."
                    />
                    <DateInput
                      label="Date"
                      value={sections.certFinalApp?.date || ''}
                      onChange={(val) => updateSection('certFinalApp', 'date', val)}
                    />
                    <SelectInput
                      label="Status"
                      value={(() => {
                        const s = sections.certFinalApp?.status;
                        if (!s || s === 'In-process' || s === 'In process') return 'Pending';
                        const match = CERT_FINAL_APP_STATUSES.find(opt => opt.toLowerCase() === s.toLowerCase());
                        return match || 'Pending';
                      })()}
                      options={CERT_FINAL_APP_STATUSES}
                      onChange={(val) => handleRepeatableSectionStatusChange('certFinalApp', 'certFinalAppHistory', val)}
                    />
                    <TextInput
                      label="ID"
                      value={sections.certFinalApp?.id || sections.certFinalApp?.portalId || ''}
                      onChange={(val) => {
                        updateSection('certFinalApp', 'id', val);
                        updateSection('certFinalApp', 'portalId', val);
                      }}
                      placeholder="Enter ID / Portal User ID"
                    />
                    <TextInput
                      label="Password"
                      type="password"
                      value={sections.certFinalApp?.password || sections.certFinalApp?.portalPassword || ''}
                      onChange={(val) => {
                        updateSection('certFinalApp', 'password', val);
                        updateSection('certFinalApp', 'portalPassword', val);
                      }}
                      placeholder="••••••••"
                    />
                    <TextInput
                      label="Registration Number"
                      value={sections.certFinalApp?.registrationNumber || ''}
                      onChange={(val) => updateSection('certFinalApp', 'registrationNumber', val)}
                      placeholder="e.g. REG-2026-X992"
                    />
                  </div>
                  <div className="mt-3">
                    <FileUploadWidget
                      label="File Upload"
                      files={sections.certFinalApp?.files || []}
                      onChange={(files) => updateSection('certFinalApp', 'files', files)}
                      multiple={true}
                    />
                  </div>
                </SectionContainer>
              </div>
            )}

            {/* 5. TEAM TYPE: DIGITAL MARKETING */}
            {teamType === 'Digital Marketing' && (
              <div className="p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <Share2 size={24} />
                </div>
                <h4 className="text-sm font-bold text-gray-900">Digital Marketing Execution</h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                  Requirements will be provided later. Current campaigns and creative assets for this service line are on standby.
                </p>
                <span className="inline-block mt-3 px-3 py-1 bg-gray-200/80 text-gray-700 text-[11px] font-bold rounded-lg">
                  Placeholder State Active
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 bg-gray-50/80 border-t border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving || isDeleting}
                className="px-3.5 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Delete Service Allocation"
              >
                <Trash2 size={13} />
                <span>Delete Allocation</span>
              </button>
            )}
            <div className="text-xs text-gray-400">
              Last Modified: {record.Modified_Time ? new Date(record.Modified_Time).toLocaleString() : 'Just now'}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || isDeleting}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isDeleting}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {canDelete && onDelete && (
        <DeleteConfirmModal
          isOpen={showDeleteConfirm}
          onClose={() => !isDeleting && setShowDeleteConfirm(false)}
          onConfirm={async () => {
            setIsDeleting(true);
            try {
              await onDelete(record);
              setShowDeleteConfirm(false);
              onClose();
            } catch (err: any) {
              setToast({ type: 'error', text: err?.message || 'Failed to delete record' });
            } finally {
              setIsDeleting(false);
            }
          }}
          title="Delete Service Allocation"
          itemName={record.Service_Scheme || 'Service Allocation'}
          message={`Are you sure you want to delete the service allocation "${record.Service_Scheme || ''}"? This will remove the record from internal operations.`}
          isDeleting={isDeleting}
        />
      )}
    </div>
    </OperationsStaffContext.Provider>
  );
};

// Reusable Helper Components

interface SectionContainerProps {
  title: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}

const SectionContainer: React.FC<SectionContainerProps> = ({
  title,
  badge,
  badgeColor = 'bg-gray-100 text-gray-700 border-gray-200',
  children
}) => (
  <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-2xs hover:border-gray-300 transition-colors">
    <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 mb-3">
      <h4 className="text-xs font-black text-gray-900 tracking-wide uppercase flex items-center gap-1.5">
        <FolderOpen size={14} className="text-be-orange" />
        <span>{title}</span>
      </h4>
      {badge && (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
    {children}
  </div>
);

interface StandardSectionProps {
  title: string;
  badge?: string;
  badgeColor?: string;
  data: any;
  onChange: (field: string, value: any) => void;
  statusOptions?: string[];
  children?: React.ReactNode;
}

const StandardSection: React.FC<StandardSectionProps> = ({
  title,
  badge,
  badgeColor,
  data,
  onChange,
  statusOptions = STANDARD_EXECUTION_STATUSES,
  children
}) => {
  const currentStatus = (() => {
    if (!data.status || data.status === 'In-process' || data.status === 'In process') {
      if (statusOptions.includes('In process')) return 'In process';
      if (statusOptions.includes('In-process')) return 'In-process';
      return statusOptions[0] || 'Pending';
    }
    if (data.status === 'In-review' && statusOptions.includes('In Review')) return 'In Review';
    const match = statusOptions.find(opt => opt.toLowerCase() === data.status.toLowerCase());
    if (match) return match;
    return statusOptions.includes(data.status) ? data.status : (statusOptions[0] || data.status);
  })();

  const safeOptions = statusOptions.includes(currentStatus)
    ? statusOptions
    : [currentStatus, ...statusOptions];

  return (
    <SectionContainer title={title} badge={badge} badgeColor={badgeColor}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StaffNameSelect
          label="Name"
          value={data.name || ''}
          onChange={(val) => onChange('name', val)}
          placeholder="Select Operations staff..."
        />
        <DateInput
          label="Date"
          value={data.date || ''}
          onChange={(val) => onChange('date', val)}
        />
        <SelectInput
          label="Status"
          value={currentStatus}
          options={safeOptions}
          onChange={(val) => onChange('status', val)}
        />
        {children}
      </div>
      <div className="mt-3">
        <FileUploadWidget
          label="File Upload"
          files={data.files || []}
          onChange={(files) => onChange('files', files)}
          multiple={true}
        />
      </div>
    </SectionContainer>
  );
};

interface TextInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
}

const TextInput: React.FC<TextInputProps> = ({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text'
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label className="text-[11px] font-bold text-gray-700 block mb-1">{label}</label>
      <div className="relative">
        <input
          type={isPassword ? (showPassword ? 'text' : 'password') : type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-1.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs ${
            isPassword ? 'pr-8' : ''
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

interface DateInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

const DateInput: React.FC<DateInputProps> = ({ label, value, onChange }) => (
  <div>
    <label className="text-[11px] font-bold text-gray-700 block mb-1">{label}</label>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-1.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs cursor-pointer"
    />
  </div>
);

interface SelectInputProps {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}

const SelectInput: React.FC<SelectInputProps> = ({ label, value, options, onChange }) => (
  <div>
    <label className="text-[11px] font-bold text-gray-700 block mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);
