import { useState, useEffect, useMemo } from 'react';
import { 
  Book, Plus, Trash2, Edit, Download, Paperclip, Info, 
  Search, CheckCircle2, AlertCircle, X, Tag as TagIcon, Mail, Building2, Eye, 
  FileText, ShieldCheck, Globe, Loader2, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveDocument, getDocument, deleteDocument } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import { 
  saveOrUpdateZohoPolicy, 
  deleteZohoPolicy, 
  insertZohoPolicyWithAttachment, 
  uploadZohoAttachmentToPolicy,
  fetchZohoPolicies 
} from '../../services/zohoService';
import { DeleteConfirmModal } from '../../components/ui/DeleteConfirmModal';

export interface Policy {
  id: string;
  title: string;
  content: string;
  department: string;
  email?: string;
  secondaryEmail?: string;
  tag?: string;
  emailOptOut?: boolean;
  createdBy?: string;
  modifiedBy?: string;
  lastUpdated: string;
  fileId?: string;
  fileName?: string;
  zohoId?: string;
  zohoStatus?: 'synced' | 'pending' | 'failed';
  zohoSyncedAt?: string;
  zohoError?: string;
}

const DEPARTMENTS = [
  'All',
  'HR',
  'Sales',
  'Account',
  'Legal',
  'Operation',
  'Quality',
  'Marketing',
  'IT',
  'Management'
];

export const Policies = () => {
  const { currentUser, can, isHR, isSuperAdmin } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  
  // Modals & Active states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null);
  const [deleteConfirmPolicy, setDeleteConfirmPolicy] = useState<Policy | null>(null);
  
  // Async states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  
  // Toast notifications
  const [toast, setToast] = useState<{ 
    type: 'success' | 'error' | 'info'; 
    message: string; 
    submessage?: string 
  } | null>(null);

  // Form State
  const initialFormData = {
    title: '',
    content: '',
    department: 'All',
    tag: 'Company Policy',
    email: currentUser?.email || '',
    secondaryEmail: '',
    emailOptOut: false
  };

  const [formData, setFormData] = useState(initialFormData);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const canManage = can('manage_policies') || isHR || isSuperAdmin;

  const syncPoliciesFromZoho = async (showNotification = false) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoPolicies();
      if (res.success && Array.isArray(res.data)) {
        const zohoPolicies: Policy[] = res.data.map((z: any) => ({
          id: `POL-${String(z.id).slice(-4)}`,
          title: z.Name || 'Company Policy',
          content: z.Policy_Content || '',
          department: z.Department || 'All',
          email: z.Email || '',
          secondaryEmail: z.Secondary_Email || '',
          tag: z.Tag || 'Policy',
          emailOptOut: Boolean(z.Email_Opt_Out),
          createdBy: z.Created_By?.name || '',
          modifiedBy: z.Modified_By?.name || '',
          lastUpdated: z.Modified_Time ? new Date(z.Modified_Time).toLocaleDateString('en-GB') : (z.Created_Time ? new Date(z.Created_Time).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')),
          zohoId: String(z.id),
          zohoStatus: 'synced',
          zohoSyncedAt: z.Modified_Time || z.Created_Time || new Date().toISOString()
        }));

        const saved = localStorage.getItem('be_policies');
        const localList: Policy[] = saved ? JSON.parse(saved) : [];

        const seenZohoIds = new Set<string>();
        const mergedList: Policy[] = [];

        for (const zP of zohoPolicies) {
          if (zP.zohoId) seenZohoIds.add(zP.zohoId);
          mergedList.push(zP);
        }

        for (const lP of localList) {
          if (lP.zohoId && seenZohoIds.has(lP.zohoId)) continue;
          mergedList.push(lP);
        }

        setPolicies(mergedList);
        localStorage.setItem('be_policies', JSON.stringify(mergedList));

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Synced ${zohoPolicies.length} Policy/Policies from database`,
            submessage: 'Policy database is updated with live database records'
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'info',
          message: 'No policies returned from database',
          submessage: res.message || 'Check connection or policy records'
        });
      }
    } catch (err: any) {
      console.warn('[Zoho CRM] Policy fetch error:', err);
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Failed to fetch policies from database',
          submessage: err?.message || 'Network error communicating with server'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  // Load Initial Policies from localStorage & sync live Zoho CRM
  useEffect(() => {
    const saved = localStorage.getItem('be_policies');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPolicies(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved policies:', e);
      }
    }
    
    syncPoliciesFromZoho(false);
  }, []);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveToStorage = (data: Policy[]) => {
    setPolicies(data);
    localStorage.setItem('be_policies', JSON.stringify(data));
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = 'Policy Title is required';
    if (!formData.content.trim()) errors.content = 'Policy Content is required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Enter a valid contact email address';
    }
    if (formData.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.secondaryEmail.trim())) {
      errors.secondaryEmail = 'Enter a valid secondary email address';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Open Modal for Create or Edit
  const openModal = (policy?: Policy) => {
    if (policy) {
      setEditingPolicy(policy);
      setFormData({
        title: policy.title,
        content: policy.content,
        department: policy.department || 'All',
        tag: policy.tag || 'Company Policy',
        email: policy.email || currentUser?.email || '',
        secondaryEmail: policy.secondaryEmail || '',
        emailOptOut: Boolean(policy.emailOptOut)
      });
    } else {
      setEditingPolicy(null);
      setFormData({
        title: '',
        content: '',
        department: selectedDept !== 'All' ? selectedDept : 'All',
        tag: 'Company Policy',
        email: currentUser?.email || '',
        secondaryEmail: '',
        emailOptOut: false
      });
    }
    setSelectedFile(null);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPolicy(null);
    setSelectedFile(null);
    setFormErrors({});
  };

  // Handle Save (Create / Update) & Background Sync to Zoho CRM
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    const polId = editingPolicy ? editingPolicy.id : `POL-${Date.now().toString().slice(-6)}`;
    
    let fileIdToSave = editingPolicy?.fileId;
    let fileNameToSave = editingPolicy?.fileName;

    if (selectedFile) {
      fileIdToSave = `file_${polId}_${Date.now()}`;
      fileNameToSave = selectedFile.name;
      try {
        await saveDocument(fileIdToSave, selectedFile);
      } catch (fErr) {
        console.warn('Could not cache file locally in IndexedDB:', fErr);
      }
    }

    const policyData: Policy = {
      id: polId,
      title: (formData.title ?? '').trim(),
      content: formData.content.trim(),
      department: formData.department,
      tag: formData.tag.trim() || 'Company Policy',
      email: (formData.email ?? '').trim(),
      secondaryEmail: formData.secondaryEmail.trim(),
      emailOptOut: formData.emailOptOut,
      createdBy: editingPolicy?.createdBy || currentUser?.name || 'HR Admin',
      modifiedBy: currentUser?.name || 'HR Admin',
      lastUpdated: new Date().toLocaleDateString('en-GB'),
      fileId: fileIdToSave,
      fileName: fileNameToSave,
      zohoId: editingPolicy?.zohoId,
      zohoStatus: editingPolicy?.zohoStatus || 'pending',
    };

    // Background sync to Zoho CRM Company_Policies Module
    try {
      let zohoRes;
      if (selectedFile && !policyData.zohoId) {
        zohoRes = await insertZohoPolicyWithAttachment(policyData, selectedFile, fileNameToSave);
      } else {
        zohoRes = await saveOrUpdateZohoPolicy(policyData);
        if (zohoRes.success && zohoRes.zohoId && selectedFile) {
          try {
            await uploadZohoAttachmentToPolicy(zohoRes.zohoId, selectedFile, fileNameToSave);
          } catch (attErr) {
            console.warn('Zoho attachment upload warning during edit:', attErr);
          }
        }
      }

      const finalZohoId = zohoRes.zohoId || policyData.zohoId;
      if (zohoRes.success && finalZohoId) {
        policyData.zohoId = finalZohoId;
        policyData.zohoStatus = 'synced';
        policyData.zohoSyncedAt = new Date().toISOString();
        policyData.zohoError = undefined;
      } else {
        policyData.zohoStatus = 'failed';
        policyData.zohoError = zohoRes.message;
      }
    } catch (zErr: any) {
      console.error('[Zoho CRM] Policy background sync exception:', zErr);
      policyData.zohoStatus = 'failed';
      policyData.zohoError = zErr?.message || 'Sync error';
    } finally {
      setIsSubmitting(false);
    }

    let updatedList: Policy[];
    if (editingPolicy) {
      updatedList = policies.map(p => p.id === editingPolicy.id ? policyData : p);
    } else {
      updatedList = [policyData, ...policies];
    }
    
    saveToStorage(updatedList);

    setToast({
      type: 'success',
      message: editingPolicy ? 'Policy Updated Successfully!' : 'Policy Created Successfully!',
      submessage: `"${policyData.title}" has been saved.`
    });

    closeModal();
  };

  // Delete Policy locally and in Zoho CRM
  const handleDeletePolicy = async () => {
    if (!deleteConfirmPolicy) return;
    setIsDeleting(true);

    const polToDelete = deleteConfirmPolicy;

    // Delete in Zoho CRM in background if zohoId exists
    if (polToDelete.zohoId) {
      try {
        await deleteZohoPolicy(polToDelete.zohoId);
      } catch (zErr) {
        console.error('Zoho policy deletion error:', zErr);
      }
    }

    // Delete local document if any
    if (polToDelete.fileId) {
      try {
        await deleteDocument(polToDelete.fileId);
      } catch (e) {}
    }

    // Update state
    const remaining = policies.filter(p => p.id !== polToDelete.id);
    saveToStorage(remaining);

    setToast({
      type: 'info',
      message: 'Policy Deleted Successfully',
      submessage: `"${polToDelete.title}" has been removed.`
    });

    setIsDeleting(false);
    setDeleteConfirmPolicy(null);
  };

  // Download Attachment
  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const file = await getDocument(fileId);
      if (file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setToast({
          type: 'error',
          message: 'Document Not Found in Local Cache',
          submessage: 'The file might have been cleared or created in another browser session.'
        });
      }
    } catch (e) {
      setToast({
        type: 'error',
        message: 'Download Failed',
        submessage: 'Could not access document from storage.'
      });
    }
  };

  // Filtered Policies
  const filteredPolicies = useMemo(() => {
    return policies.filter(pol => {
      const matchesDept = selectedDept === 'All' || pol.department === selectedDept || pol.department === 'All';
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || 
        (pol.title ?? '').toLowerCase().includes(q) ||
        (pol.content ?? '').toLowerCase().includes(q) ||
        (pol.tag && (pol.tag ?? '').toLowerCase().includes(q)) ||
        (pol.department && (pol.department ?? '').toLowerCase().includes(q)) ||
        (pol.email && (pol.email ?? '').toLowerCase().includes(q));

      return matchesDept && matchesQuery;
    });
  }, [policies, selectedDept, searchQuery]);

  // KPIs
  const stats = useMemo(() => {
    const total = policies.length;
    const allDeptCount = policies.filter(p => p.department === 'All').length;
    const withDocs = policies.filter(p => Boolean(p.fileName)).length;
    const deptCount = new Set(policies.map(p => p.department).filter(Boolean)).size;

    return { total, allDeptCount, withDocs, deptCount };
  }, [policies]);

  return (
    <div className="space-y-6">
      {/* Toast Notification Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-5 right-5 z-50 p-4 rounded-2xl shadow-xl flex items-start space-x-3 max-w-md border backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-500/95 text-white border-emerald-400 shadow-emerald-500/20'
                : toast.type === 'error'
                ? 'bg-rose-500/95 text-white border-rose-400 shadow-rose-500/20'
                : 'bg-indigo-500/95 text-white border-indigo-400 shadow-indigo-500/20'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={22} className="shrink-0 mt-0.5" />
            ) : toast.type === 'error' ? (
              <AlertCircle size={22} className="shrink-0 mt-0.5" />
            ) : (
              <Info size={22} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1 pr-2">
              <p className="font-bold text-sm">{toast.message}</p>
              {toast.submessage && (
                <p className="text-xs opacity-90 mt-0.5 leading-relaxed">{toast.submessage}</p>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-be-orange">
              <Book size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Company Policies & Guidelines
              </h1>
              <p className="text-gray-500 text-sm">
                {canManage 
                  ? 'Manage, publish, and view official company policies, guidelines, and compliance standards.'
                  : 'Browse, review, and download official organizational policies and guidelines.'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
          <button
            onClick={() => syncPoliciesFromZoho(true)}
            disabled={isFetchingZoho}
            title="Refresh & Sync from database"
            className="w-10 h-10 bg-white hover:bg-orange-50 text-gray-700 hover:text-be-orange border border-gray-200 hover:border-orange-300 rounded-xl flex items-center justify-center shadow-sm hover:shadow active:scale-95 disabled:opacity-50 transition-all shrink-0"
          >
            <RefreshCw size={18} className={`text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
          </button>

          {canManage ? (
            <button
              onClick={() => openModal()}
              className="bg-be-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center shadow-md shadow-orange-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <Plus size={18} className="mr-1.5" /> Add Policy
            </button>
          ) : (
            <div className="text-xs text-gray-500 bg-gray-50 px-3.5 py-2 rounded-xl font-medium border border-gray-200 flex items-center">
              <Info size={14} className="mr-1.5 text-gray-400" /> View-only Mode
            </div>
          )}
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Book size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Policies</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Globe size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Org-Wide Policies</p>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">{stats.allDeptCount}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Departments</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.deptCount}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Paperclip size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">With Attachments</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.withDocs}</p>
          </div>
        </div>
      </div>

      {/* Search & Department Filters */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search policies by title, content, tag..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Department Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {DEPARTMENTS.map(dept => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedDept === dept
                  ? 'bg-be-orange text-white shadow-sm shadow-orange-500/20'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Policy Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPolicies.map(pol => (
          <div
            key={pol.id}
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between relative group hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
          >
            {/* Top Bar: Department & Tag */}
            <div>
              <div className="flex justify-between items-start mb-3.5">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg border border-orange-100 flex items-center gap-1">
                    <Building2 size={12} /> {pol.department || 'All'}
                  </span>
                  {pol.tag && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded-md flex items-center gap-1">
                      <TagIcon size={10} /> {pol.tag}
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Preview Content */}
              <h3 
                onClick={() => setViewingPolicy(pol)}
                className="text-lg font-bold text-gray-900 mb-2 cursor-pointer hover:text-be-orange transition-colors line-clamp-2 leading-snug"
              >
                {pol.title}
              </h3>

              <p 
                onClick={() => setViewingPolicy(pol)}
                className="text-gray-600 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap line-clamp-4 mb-4 cursor-pointer hover:text-gray-800"
              >
                {pol.content}
              </p>
            </div>

            {/* Bottom Details & Actions */}
            <div>
              {/* Attachment Button */}
              {pol.fileName && (
                <div className="mb-3">
                  <button
                    onClick={() => pol.fileId && handleDownload(pol.fileId, pol.fileName!)}
                    className="flex items-center text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors border border-blue-100 max-w-full truncate"
                  >
                    <Paperclip size={13} className="mr-1.5 shrink-0 text-blue-500" />
                    <span className="truncate">{pol.fileName}</span>
                    <Download size={12} className="ml-2 shrink-0 opacity-70" />
                  </button>
                </div>
              )}

              {/* Footer: Metadata + Action Buttons */}
              <div className="flex justify-between items-center pt-3 border-t border-gray-100 text-xs text-gray-400">
                <div>
                  <span>Updated: {pol.lastUpdated}</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setViewingPolicy(pol)}
                    title="View Full Policy"
                    className="p-1.5 text-gray-600 hover:text-be-orange bg-gray-50 hover:bg-orange-50 rounded-lg transition-colors"
                  >
                    <Eye size={15} />
                  </button>

                  {canManage && (
                    <>
                      <button
                        onClick={() => openModal(pol)}
                        title="Edit Policy"
                        className="p-1.5 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmPolicy(pol)}
                        title="Delete Policy"
                        className="p-1.5 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredPolicies.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-gray-200 border-dashed p-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center mx-auto mb-3">
              <Book size={28} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">No Policies Found</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto mt-1 mb-5">
              {searchQuery || selectedDept !== 'All'
                ? 'No policies match your search filters. Try resetting the filters.'
                : 'No company policies have been published yet.'}
            </p>
            <div className="flex justify-center gap-3">
              {(searchQuery || selectedDept !== 'All') && (
                <button
                  onClick={() => { setSearchQuery(''); setSelectedDept('All'); }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-xl transition-colors"
                >
                  Clear Filters
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => openModal()}
                  className="px-4 py-2 bg-be-orange hover:bg-orange-600 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
                >
                  <Plus size={16} className="inline mr-1" /> Add New Policy
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Create or Edit Policy */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 my-8"
            >
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50/50 to-transparent flex justify-between items-center">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 text-be-orange flex items-center justify-center">
                    <Book size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {editingPolicy ? 'Edit Company Policy' : 'Create Company Policy'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      Publish official guidelines and standard operating procedures
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSavePolicy} className="p-6 space-y-4">
                {/* Policy Title */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Policy Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Employee Code of Conduct 2026"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className={`w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-all ${
                      formErrors.title ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/20' : 'border-gray-200 focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange'
                    }`}
                  />
                  {formErrors.title && <p className="text-xs text-rose-500 mt-1">{formErrors.title}</p>}
                </div>

                {/* Department & Tag Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Department <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.department}
                      onChange={e => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange bg-white"
                    >
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d === 'All' ? 'All Departments (Organization-wide)' : d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Policy Tag / Category
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Code of Conduct, HR Rule, Security"
                      value={formData.tag}
                      onChange={e => setFormData({ ...formData, tag: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange"
                    />
                  </div>
                </div>

                {/* Email Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Contact / Author Email
                    </label>
                    <input
                      type="email"
                      placeholder="hr@bharatenterprises.in"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange"
                    />
                    {formErrors.email && <p className="text-xs text-rose-500 mt-1">{formErrors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Secondary Contact Email
                    </label>
                    <input
                      type="email"
                      placeholder="admin@bharatenterprises.in"
                      value={formData.secondaryEmail}
                      onChange={e => setFormData({ ...formData, secondaryEmail: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange"
                    />
                    {formErrors.secondaryEmail && <p className="text-xs text-rose-500 mt-1">{formErrors.secondaryEmail}</p>}
                  </div>
                </div>

                {/* Policy Content Textarea */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Policy Content & Guidelines <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={6}
                    placeholder="Enter detailed guidelines, provisions, compliance standards, eligibility criteria, and instructions..."
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    className={`w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none leading-relaxed transition-all ${
                      formErrors.content ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/20' : 'border-gray-200 focus:ring-2 focus:ring-be-orange/30 focus:border-be-orange'
                    }`}
                  />
                  {formErrors.content && <p className="text-xs text-rose-500 mt-1">{formErrors.content}</p>}
                </div>

                {/* File Attachment */}
                <div className="bg-gray-50/60 p-4 rounded-xl border border-gray-200 border-dashed">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Attach Policy Document (PDF, Image, or Doc)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,image/*,.doc,.docx"
                    onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                  />
                  {editingPolicy && editingPolicy.fileName && !selectedFile && (
                    <div className="flex items-center text-xs text-blue-700 bg-blue-50/80 px-2.5 py-1.5 rounded-lg mt-2 w-max border border-blue-100">
                      <Paperclip size={13} className="mr-1.5" />
                      Currently attached: <span className="font-semibold ml-1">{editingPolicy.fileName}</span>
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-sm font-bold bg-be-orange hover:bg-orange-600 text-white rounded-xl shadow-md shadow-orange-500/20 flex items-center transition-all disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingPolicy ? 'Update Policy' : 'Save Policy'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: View Full Policy Details */}
      <AnimatePresence>
        {viewingPolicy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 my-8 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-orange-50/60 to-transparent flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 bg-be-orange text-white text-xs font-bold rounded-lg">
                      {viewingPolicy.department || 'All Departments'}
                    </span>
                    {viewingPolicy.tag && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                        {viewingPolicy.tag}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{viewingPolicy.title}</h2>
                </div>
                <button
                  onClick={() => setViewingPolicy(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/60">
                  <p className="text-gray-800 text-sm leading-relaxed">{viewingPolicy.content}</p>
                </div>

                {/* Metadata details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                  {viewingPolicy.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span className="text-gray-500">Contact:</span>
                      <span className="font-semibold text-gray-800">{viewingPolicy.email}</span>
                    </div>
                  )}
                  {viewingPolicy.secondaryEmail && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span className="text-gray-500">Secondary:</span>
                      <span className="font-semibold text-gray-800">{viewingPolicy.secondaryEmail}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-gray-400" />
                    <span className="text-gray-500">Last Updated:</span>
                    <span className="font-semibold text-gray-800">{viewingPolicy.lastUpdated}</span>
                  </div>
                  {viewingPolicy.createdBy && (
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="text-gray-400" />
                      <span className="text-gray-500">Author:</span>
                      <span className="font-semibold text-gray-800">{viewingPolicy.createdBy}</span>
                    </div>
                  )}
                </div>

                {/* Attached File Preview */}
                {viewingPolicy.fileName && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-3 truncate">
                      <FileText size={20} className="text-blue-600 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-bold text-gray-800 truncate">{viewingPolicy.fileName}</p>
                        <p className="text-[11px] text-blue-600">Attached Official Document</p>
                      </div>
                    </div>
                    {viewingPolicy.fileId && (
                      <button
                        onClick={() => handleDownload(viewingPolicy.fileId!, viewingPolicy.fileName!)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center shadow-sm shrink-0 transition-colors"
                      >
                        <Download size={13} className="mr-1.5" /> Download
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <div className="text-xs text-gray-400">
                  Ref Code: <span className="font-mono text-gray-600">{viewingPolicy.id}</span>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <button
                      onClick={() => {
                        const target = viewingPolicy;
                        setViewingPolicy(null);
                        openModal(target);
                      }}
                      className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      <Edit size={13} className="inline mr-1" /> Edit Policy
                    </button>
                  )}
                  <button
                    onClick={() => setViewingPolicy(null)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deleteConfirmPolicy)}
        onClose={() => !isDeleting && setDeleteConfirmPolicy(null)}
        onConfirm={handleDeletePolicy}
        title="Delete Company Policy"
        itemName={deleteConfirmPolicy?.title}
        message={deleteConfirmPolicy ? `Are you sure you want to delete policy "${deleteConfirmPolicy.title}"?` : undefined}
        isDeleting={isDeleting}
      />
    </div>
  );
};
