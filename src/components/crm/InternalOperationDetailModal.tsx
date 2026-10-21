import React, { useState, useEffect, useMemo } from 'react';
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
  saveInternalOperation
} from '../../services/internalOperationsService';
import { FileUploadWidget } from './FileUploadWidget';
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
  UserCheck
} from 'lucide-react';

interface InternalOperationDetailModalProps {
  record: InternalOperationRecord;
  onClose: () => void;
  onSaved?: (updatedRecord: InternalOperationRecord) => void;
  allStaff?: NormalizedStaff[];
  allTeamLeaders?: NormalizedStaff[];
  allTeamMembers?: NormalizedStaff[];
  canManage?: boolean;
}

export const InternalOperationDetailModal: React.FC<InternalOperationDetailModalProps> = ({
  record,
  onClose,
  onSaved,
  allStaff = [],
  allTeamLeaders = [],
  allTeamMembers = [],
  canManage = false
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Normalized Team Type (Incorporation, Compliance, Funding, Certification, Digital Marketing)
  const [teamType, setTeamType] = useState<string>(() => normalizeTeamType(record.Internal_Team_Type));

  // Dynamic available stages based on the current Team Type
  const availableStages = useMemo(() => {
    return getOperationStagesForTeamType(teamType);
  }, [teamType]);

  // Common Fields State (Phase 2)
  const [stage, setStage] = useState<OperationStage>(() => {
    if (record.Stage) return record.Stage;
    const initialStages = getOperationStagesForTeamType(record.Internal_Team_Type);
    return initialStages[0] || 'Doc collection';
  });
  const [caCs1, setCaCs1] = useState<string>(record.CA_CS1 || '');
  const [caCs2, setCaCs2] = useState<string>(record.CA_CS2 || '');
  const [selectedTlId, setSelectedTlId] = useState<string>(
    record.Team_Leader?.id || record.Team_Leader_ID || ''
  );
  const [selectedTmId, setSelectedTmId] = useState<string>(
    record.Team_Member?.id || record.Team_Member_ID || ''
  );

  // Dynamic Sections State Store
  const [sections, setSections] = useState<Record<string, any>>(() => {
    return record.sectionsData || {};
  });

  // Company Type & After Allocation
  const [afterAllocation, setAfterAllocation] = useState<'Yes' | 'No'>(() => {
    return record.After_Allocation || (sections.afterAllocation as 'Yes' | 'No') || 'No';
  });

  const [companyType, setCompanyType] = useState<CompanyType>(() => {
    return (
      record.Company_Type ||
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

      setSections(prev => ({
        ...prev,
        [historyKey]: [...currentHistory, archivedAttempt],
        [baseSectionKey]: {
          name: `${currentData.name || ''} (Resubmission Round ${currentHistory.length + 2})`,
          approvedName: '',
          finalApprovalName: '',
          date: new Date().toISOString().split('T')[0],
          doiDate: '',
          status: 'In process',
          files: []
        }
      }));
    } else {
      updateSection(baseSectionKey, 'status', newStatus);
    }
  };

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const tlUser = allStaff.find(u => u.id === selectedTlId || u.name.toLowerCase() === selectedTlId.toLowerCase());
      const tmUser = allStaff.find(u => u.id === selectedTmId || u.name.toLowerCase() === selectedTmId.toLowerCase());

      const isFullyAllocated = Boolean(tlUser && tmUser);
      const isPartiallyAllocated = Boolean(tlUser || tmUser);

      const updatedRecord: InternalOperationRecord = {
        ...record,
        Internal_Team_Type: teamType,
        Stage: stage,
        CA_CS1: caCs1,
        CA_CS2: caCs2,
        After_Allocation: afterAllocation,
        Company_Type: companyType,
        Team_Leader: tlUser ? { id: tlUser.id, name: tlUser.name, email: tlUser.email, empId: tlUser.id } : null,
        Team_Leader_ID: tlUser?.id || '',
        Team_Leader_Name: tlUser?.name || '',
        Team_Member: tmUser ? { id: tmUser.id, name: tmUser.name, email: tmUser.email, empId: tmUser.id } : null,
        Team_Member_ID: tmUser?.id || '',
        Team_Member_Name: tmUser?.name || '',
        Allocation_Status: isFullyAllocated ? 'Allocated' : isPartiallyAllocated ? 'In Progress' : 'Pending Allocation',
        sectionsData: {
          ...sections,
          afterAllocation,
          docCollection: {
            ...(sections.docCollection || {}),
            companyType
          }
        },
        Modified_Time: new Date().toISOString()
      };

      await saveInternalOperation(updatedRecord);
      setToast({ type: 'success', text: 'Internal Operation record saved successfully.' });
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
                  {canManage ? (
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
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      CA/CS 1 (Primary Consultant)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CA Ramesh Sharma or select staff..."
                      value={caCs1}
                      onChange={(e) => setCaCs1(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 focus:border-purple-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      CA/CS 2 (Secondary Consultant / Auditor)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CS Priya Patel or external partner..."
                      value={caCs2}
                      onChange={(e) => setCaCs2(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 focus:border-purple-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
                    />
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
                {canManage ? (
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
                    <TextInput
                      label="Name / Executive"
                      value={sections.docCollection?.name || ''}
                      onChange={(val) => updateSection('docCollection', 'name', val)}
                      placeholder="Executive name"
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
                    <div className="mb-4 space-y-2 p-3 bg-rose-50/50 rounded-xl border border-rose-200">
                      <span className="text-xs font-bold text-rose-800 block flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-rose-600" />
                        Previous Rejected Submissions ({sections.nameAppHistory.length})
                      </span>
                      {sections.nameAppHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-2 bg-white rounded-lg border border-rose-100 text-xs flex justify-between items-center">
                          <div>
                            <span className="font-bold text-gray-900 block">Attempt #{hist.attemptNumber || hIdx + 1}: {hist.name || 'Application'}</span>
                            <span className="text-[10px] text-gray-500">Proposed: {hist.approvedName || 'N/A'} • Date: {hist.date || 'N/A'}</span>
                          </div>
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md">
                            REJECTED
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <TextInput
                      label="Name"
                      value={sections.nameApp?.name || ''}
                      onChange={(val) => updateSection('nameApp', 'name', val)}
                      placeholder="Applicant name"
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
                      value={sections.nameApp?.status || 'In-process'}
                      options={STATUSES_WITH_REJECTED}
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
                    <TextInput
                      label="Name"
                      value={sections.dscCreation?.name || ''}
                      onChange={(val) => updateSection('dscCreation', 'name', val)}
                      placeholder="Director/Partner name"
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
                    <div className="mb-4 space-y-2 p-3 bg-rose-50/50 rounded-xl border border-rose-200">
                      <span className="text-xs font-bold text-rose-800 block flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-rose-600" />
                        Previous Rejected Final Filings ({sections.finalFilingHistory.length})
                      </span>
                      {sections.finalFilingHistory.map((hist: any, hIdx: number) => (
                        <div key={hIdx} className="p-2 bg-white rounded-lg border border-rose-100 text-xs flex justify-between items-center">
                          <div>
                            <span className="font-bold text-gray-900 block">Attempt #{hist.attemptNumber || hIdx + 1}: {hist.name || 'Filing'}</span>
                            <span className="text-[10px] text-gray-500">
                              {hist.finalApprovalName ? `Final Approval: ${hist.finalApprovalName} • ` : ''}
                              Date: {hist.date || 'N/A'}
                              {hist.doiDate ? ` • DOI: ${hist.doiDate}` : ''}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md">
                            REJECTED
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <TextInput
                      label="Name"
                      value={sections.finalFiling?.name || ''}
                      onChange={(val) => updateSection('finalFiling', 'name', val)}
                      placeholder="Filing applicant name"
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
                          <TextInput
                            label="Name"
                            value={sections.adt1?.name || ''}
                            onChange={(val) => updateSection('adt1', 'name', val)}
                          />
                          <TextInput
                            label="Auditor Name"
                            value={sections.adt1?.auditorName || ''}
                            onChange={(val) => updateSection('adt1', 'auditorName', val)}
                            placeholder="e.g. M/s Khanna & Co."
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
                {/* After allocation Dropdown */}
                <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Compliance Execution Workflow</h4>
                      <p className="text-xs text-gray-500">
                        Select &quot;Yes&quot; to display the annual compliance filings and audits.
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
                </div>

                {afterAllocation === 'Yes' && (
                  <div className="space-y-4">
                    {/* 1. Doc collection: [Name, Date, Status (Pending, Received), File Upload, Company type] */}
                    <SectionContainer title="Doc collection" badge="Compliance Core">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <TextInput
                          label="Name"
                          value={sections.compDocCollection?.name || ''}
                          onChange={(val) => updateSection('compDocCollection', 'name', val)}
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
                        <TextInput
                          label="Name"
                          value={sections.directorItr?.name || ''}
                          onChange={(val) => updateSection('directorItr', 'name', val)}
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
                        <TextInput
                          label="Name"
                          value={sections.accounting?.name || ''}
                          onChange={(val) => updateSection('accounting', 'name', val)}
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

                    {/* 4. Audit: [Name, Date, Status, File Upload] */}
                    <SectionContainer title="Audit" badge="Statutory Audit">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <TextInput
                          label="Name"
                          value={sections.audit?.name || ''}
                          onChange={(val) => updateSection('audit', 'name', val)}
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
                        <TextInput
                          label="Name"
                          value={sections.companyItr?.name || ''}
                          onChange={(val) => updateSection('companyItr', 'name', val)}
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
                          onChange={(k, v) => updateSection('dpt3', k, v)}
                        />

                        {/* AOC-4: [Name, Date, Status, File Upload, Director & Audit report (Prepared/Not Prepared)] */}
                        <SectionContainer title="AOC-4" badge="Financial Statements">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <TextInput
                              label="Name"
                              value={sections.aoc4?.name || ''}
                              onChange={(val) => updateSection('aoc4', 'name', val)}
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
                            <TextInput
                              label="Name"
                              value={sections.form8?.name || ''}
                              onChange={(val) => updateSection('form8', 'name', val)}
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
                )}
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

                {/* 3. Application submission: [Name, Date, Status, File Upload, ID, Password, Registration number] */}
                <SectionContainer title="Application submission" badge="Scheme Portal Filing">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <TextInput
                      label="Applicant / Executive Name"
                      value={sections.appSubmission?.name || ''}
                      onChange={(val) => updateSection('appSubmission', 'name', val)}
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
                          onChange={(val) => updateSection('appSubmission', 'status', val)}
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
                {/* 1. Doc collection / DSC */}
                <StandardSection
                  title="Doc collection / DSC"
                  data={sections.certDocCollection || {}}
                  statusOptions={CERT_DOC_COLLECTION_STATUSES}
                  onChange={(k, v) => updateSection('certDocCollection', k, v)}
                />

                {/* 2. Final Application */}
                <StandardSection
                  title="Final Application"
                  data={sections.certFinalApp || {}}
                  statusOptions={CERT_FINAL_APP_STATUSES}
                  onChange={(k, v) => updateSection('certFinalApp', k, v)}
                />
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
        <div className="flex items-center justify-between p-4 bg-gray-50/80 border-t border-gray-100">
          <div className="text-xs text-gray-400">
            Last Modified: {record.Modified_Time ? new Date(record.Modified_Time).toLocaleString() : 'Just now'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 rounded-xl transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
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
  data: any;
  onChange: (field: string, value: any) => void;
  statusOptions?: string[];
}

const StandardSection: React.FC<StandardSectionProps> = ({
  title,
  data,
  onChange,
  statusOptions = STANDARD_EXECUTION_STATUSES
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
    return data.status;
  })();

  const safeOptions = statusOptions.includes(currentStatus)
    ? statusOptions
    : [currentStatus, ...statusOptions];

  return (
    <SectionContainer title={title}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextInput
          label="Name"
          value={data.name || ''}
          onChange={(val) => onChange('name', val)}
          placeholder="Responsible name"
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
}) => (
  <div>
    <label className="text-[11px] font-bold text-gray-700 block mb-1">{label}</label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-1.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 hover:border-gray-300 focus:border-orange-500 rounded-xl text-xs font-semibold text-gray-900 outline-none transition-all shadow-2xs"
    />
  </div>
);

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
