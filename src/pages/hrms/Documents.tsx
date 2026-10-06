import { useState, useEffect } from 'react';
import { FileText, Search, Plus, Trash2, Download, Eye, Info, RefreshCw, CheckCircle2, Cloud, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveDocument, getDocument, deleteDocument } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import { 
  uploadZohoAttachment, 
  fetchZohoAttachments, 
  downloadZohoAttachment, 
  getZohoAttachmentDownloadUrl 
} from '../../services/zohoService';
import { DeleteConfirmModal } from '../../components/ui/DeleteConfirmModal';

interface EmpDoc {
  id: string;
  empId: string;
  empName: string;
  title: string;
  date: string;
  fileId: string;
  fileName: string;
  size?: number | string;
  isZohoAttachment?: boolean;
  zohoAttachmentId?: string;
  empZohoId?: string;
}

export const Documents = () => {
  const { currentUser, isTM, isHR, isSuperAdmin } = useAuth();
  const [documents, setDocuments] = useState<EmpDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ empId: '', title: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; doc: EmpDoc | null; isDeleting: boolean }>({
    isOpen: false,
    doc: null,
    isDeleting: false
  });

  const canManage = isHR || isSuperAdmin;
  const isEmployeeSelfOnly = isTM || currentUser.role === 'TM' || !canManage;

  const employees = JSON.parse(localStorage.getItem('be_employees') || '[]');

  const resolveEmpZohoId = (): string | null => {
    if (currentUser?.zohoId && /^\d{15,}$/.test(String(currentUser.zohoId).trim())) {
      return String(currentUser.zohoId).trim();
    }
    const match = employees.find((e: any) => 
      (e.id && currentUser?.id && String(e.id).toLowerCase() === String(currentUser.id).toLowerCase()) ||
      (e.empId && currentUser?.empId && String(e.empId).toLowerCase() === String(currentUser.empId).toLowerCase()) ||
      (e.email && currentUser?.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (e.name && currentUser?.name && e.name.toLowerCase() === currentUser.name.toLowerCase())
    );
    if (match?.zohoId && /^\d{15,}$/.test(String(match.zohoId).trim())) {
      return String(match.zohoId).trim();
    }
    return null;
  };

  const fetchLiveZohoDocuments = async (showNotification = false) => {
    const empZohoId = resolveEmpZohoId();
    if (!empZohoId) {
      if (showNotification) {
        alert("No linked Employee ID found for your account. Please ensure your profile is active.");
      }
      return;
    }

    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoAttachments('Employee', empZohoId);
      if (res.success && Array.isArray(res.data)) {
        const liveDocs: EmpDoc[] = res.data.map((att: any) => {
          const rawName = att.File_Name || 'Document.pdf';
          let cleanTitle = rawName.replace(/\.[^/.]+$/, '');
          const bracketMatch = rawName.match(/^\[(.*?)\]\s*(.*)$/);
          if (bracketMatch) {
            cleanTitle = bracketMatch[1] || bracketMatch[2] || cleanTitle;
          }

          const createdDate = att.Created_Time 
            ? new Date(att.Created_Time).toLocaleDateString('en-GB')
            : (att.Modified_Time ? new Date(att.Modified_Time).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));

          return {
            id: `ZOHO-ATT-${att.id}`,
            empId: currentUser.empId || currentUser.id || 'EMP',
            empName: currentUser.name || 'Team Member',
            empZohoId: empZohoId,
            title: cleanTitle,
            date: createdDate,
            fileId: String(att.id),
            fileName: rawName,
            size: att.Size,
            isZohoAttachment: true,
            zohoAttachmentId: String(att.id),
          };
        });

        setDocuments(prevDocs => {
          const localOnly = prevDocs.filter(d => !d.isZohoAttachment && !d.id.startsWith('ZOHO-ATT-'));
          const liveFileNames = new Set(liveDocs.map(l => l.fileName.toLowerCase()));
          const filteredLocal = localOnly.filter(d => !liveFileNames.has(d.fileName?.toLowerCase()));
          const merged = [...liveDocs, ...filteredLocal];
          localStorage.setItem('be_emp_docs', JSON.stringify(merged));
          return merged;
        });

        setSyncStatusText(`Synced ${liveDocs.length} live document${liveDocs.length === 1 ? '' : 's'} from database`);
      }
    } catch (err: any) {
      console.warn('[Documents] Failed to fetch live Zoho attachments:', err);
    } finally {
      setIsFetchingZoho(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('be_emp_docs');
    if (saved) {
      try {
        setDocuments(JSON.parse(saved));
      } catch (e) {}
    }
    fetchLiveZohoDocuments(false);
  }, [currentUser?.zohoId, currentUser?.id]);

  const saveToStorage = (data: EmpDoc[]) => {
    setDocuments(data);
    localStorage.setItem('be_emp_docs', JSON.stringify(data));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = isEmployeeSelfOnly ? (currentUser.empId || currentUser.id) : formData.empId;
    const emp = employees.find((e: any) => e.id === targetEmpId || e.empId === targetEmpId) || { name: currentUser.name };
    const empZohoId = emp?.zohoId || currentUser?.zohoId || resolveEmpZohoId();

    if (!targetEmpId) return alert("Select an employee");
    if (!selectedFile) return alert("Please select a file to upload");

    setIsUploading(true);
    try {
      const fileId = `emp_doc_${Date.now()}`;
      await saveDocument(fileId, selectedFile);

      const newDoc: EmpDoc = {
        id: `DOC-${Date.now()}`,
        empId: targetEmpId,
        empName: emp.name || currentUser.name,
        title: formData.title || selectedFile.name.replace(/\.[^/.]+$/, ''),
        date: new Date().toLocaleDateString('en-GB'),
        fileId,
        fileName: selectedFile.name,
        size: selectedFile.size,
        empZohoId: empZohoId || undefined,
      };

      saveToStorage([newDoc, ...documents]);

      // Attach to Zoho CRM Employee record if synced
      if (empZohoId) {
        try {
          const docTitle = formData.title ? `[${formData.title}] ${selectedFile.name}` : selectedFile.name;
          await uploadZohoAttachment(empZohoId, selectedFile, docTitle, 'Employee');
          // Re-fetch live attachments to sync IDs
          await fetchLiveZohoDocuments(false);
        } catch (zErr) {
          console.warn('[Zoho CRM] Document upload error:', zErr);
        }
      }

      setIsModalOpen(false);
      setFormData({ empId: '', title: '' });
      setSelectedFile(null);
    } catch (err: any) {
      alert("Failed to save document: " + (err.message || 'Unknown error'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: EmpDoc) => {
    if (doc.isZohoAttachment && doc.zohoAttachmentId) {
      const empZohoId = doc.empZohoId || resolveEmpZohoId();
      if (empZohoId) {
        try {
          await downloadZohoAttachment('Employee', empZohoId, doc.zohoAttachmentId, doc.fileName || 'document.pdf');
          return;
        } catch (err) {
          console.warn('Download error:', err);
        }
      }
    }
    const file = await getDocument(doc.fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (doc.zohoAttachmentId) {
      const empZohoId = doc.empZohoId || resolveEmpZohoId();
      if (empZohoId) {
        await downloadZohoAttachment('Employee', empZohoId, doc.zohoAttachmentId, doc.fileName || 'document.pdf');
        return;
      }
      alert("Document not found.");
    } else {
      alert("Document not found in local storage.");
    }
  };

  const handleView = async (doc: EmpDoc) => {
    if (doc.isZohoAttachment && doc.zohoAttachmentId) {
      const empZohoId = doc.empZohoId || resolveEmpZohoId();
      if (empZohoId) {
        const url = getZohoAttachmentDownloadUrl('Employee', empZohoId, doc.zohoAttachmentId, true);
        window.open(url, '_blank');
        return;
      }
    }
    const file = await getDocument(doc.fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    } else if (doc.zohoAttachmentId) {
      const empZohoId = doc.empZohoId || resolveEmpZohoId();
      if (empZohoId) {
        const url = getZohoAttachmentDownloadUrl('Employee', empZohoId, doc.zohoAttachmentId, true);
        window.open(url, '_blank');
        return;
      }
      alert("Document not found.");
    } else {
      alert("Document not found in local storage.");
    }
  };

  const handleDelete = (doc: EmpDoc) => {
    setDeleteTarget({ isOpen: true, doc, isDeleting: false });
  };

  const confirmDeleteDoc = async () => {
    const doc = deleteTarget.doc;
    if (!doc) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));
    try {
      if (!doc.isZohoAttachment) {
        await deleteDocument(doc.fileId);
      }
      saveToStorage(documents.filter(d => d.id !== doc.id));
    } finally {
      setDeleteTarget({ isOpen: false, doc: null, isDeleting: false });
    }
  };

  const formatFileSize = (bytes?: number | string) => {
    if (!bytes) return '';
    const num = Number(bytes);
    if (isNaN(num) || num <= 0) return '';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  };

  const displayedDocs = documents.filter(d => {
    const matchesSearch = (d.title ?? '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (d.empName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (d.fileName ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    if (isEmployeeSelfOnly) {
      return matchesSearch && (
        d.empId === currentUser.empId || 
        d.empId === currentUser.id || 
        (currentUser.id && d.empId && String(d.empId).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
        (currentUser.empId && d.empId && String(d.empId).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
        d.empName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase() ||
        d.isZohoAttachment
      );
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {isEmployeeSelfOnly ? 'My Personal Documents' : 'Personal Documents Management'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
              {displayedDocs.length} {displayedDocs.length === 1 ? 'Document' : 'Documents'}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {isEmployeeSelfOnly 
              ? `Verification documents and files on record for ${currentUser.name}.`
              : 'Manage employee verification, identity, and onboarding documents.'}
          </p>
          {syncStatusText && (
            <div className="flex items-center text-xs text-emerald-600 font-semibold mt-2">
              <CheckCircle2 size={13} className="mr-1.5" /> {syncStatusText}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLiveZohoDocuments(true)}
            disabled={isFetchingZoho}
            className="w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-orange-50/50 hover:border-orange-200 text-gray-700 hover:text-be-orange flex items-center justify-center shadow-sm transition-all disabled:opacity-60 shrink-0"
            title="Refresh & Sync from database"
          >
            <RefreshCw size={18} className={`${isFetchingZoho ? 'animate-spin text-be-orange' : 'text-gray-500'}`} />
          </button>

          {canManage ? (
            <button 
              onClick={() => { setFormData({ empId: employees[0]?.id || '', title: '' }); setIsModalOpen(true); }} 
              className="bg-be-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-md shadow-orange-500/20 text-sm transition-all"
            >
              <Plus size={18} className="mr-2" /> Upload Document
            </button>
          ) : (
            <button 
              onClick={() => { setFormData({ empId: currentUser.id || '', title: '' }); setIsModalOpen(true); }} 
              className="bg-be-orange hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center shadow-md shadow-orange-500/20 text-sm transition-all"
            >
              <Plus size={16} className="mr-1.5" /> Upload Document
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search documents..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-be-orange text-sm font-medium"
          />
        </div>

        <div className="text-xs text-gray-500 flex items-center gap-1.5">
          <Cloud size={14} className="text-be-orange" />
          <span>Live attachments synchronized with employee profile</span>
        </div>
      </div>

      <div className="bg-transparent overflow-hidden">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Document Title</th>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">File Size</th>
                <th className="px-6 py-3">Date Uploaded</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {displayedDocs.map((doc) => (
                <tr key={doc.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-orange-50 text-be-orange shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{doc.title}</span>
                          {doc.isZohoAttachment && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                              Zoho Live
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-normal truncate mt-0.5">{doc.fileName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">
                    {doc.empName}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 text-gray-500 font-medium text-xs">
                    {formatFileSize(doc.size) || '--'}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 text-gray-600 font-medium">
                    {doc.date}
                  </td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2 transition-opacity">
                      <button 
                        onClick={() => handleView(doc)} 
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold flex items-center transition-colors shadow-sm" 
                        title="View Document"
                      >
                        <Eye size={14} className="mr-1" /> View
                      </button>
                      <button 
                        onClick={() => handleDownload(doc)} 
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center transition-colors shadow-sm" 
                        title="Download Document"
                      >
                        <Download size={14} className="mr-1" /> Download
                      </button>
                      {canManage && (
                        <button 
                          onClick={() => handleDelete(doc)} 
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {displayedDocs.length === 0 && !isFetchingZoho && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <FileText size={36} className="mx-auto text-gray-300 mb-2" />
                    <p className="font-bold text-gray-700">No documents found on record.</p>
                    <p className="text-xs text-gray-400 mt-1">Upload personal documents or click &quot;Refresh&quot; to load files.</p>
                  </td>
                </tr>
              )}
              {isFetchingZoho && displayedDocs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <Loader2 size={32} className="mx-auto text-be-orange animate-spin mb-2" />
                    <p className="font-bold text-gray-700">Fetching live documents from database...</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50/50 to-white">
                <h2 className="text-lg font-bold text-gray-900">Upload Personal Document</h2>
                <p className="text-xs text-gray-500 mt-0.5">Files will be saved in portal and synced to employee profile.</p>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {canManage && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Employee</label>
                    <select 
                      required 
                      value={formData.empId} 
                      onChange={e => setFormData({...formData, empId: e.target.value})} 
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-be-orange focus:border-be-orange text-sm font-medium"
                    >
                      <option value="">Select Employee...</option>
                      {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Document Title (e.g. Aadhaar Card, Degree Certificate)</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="e.g. Aadhaar Card, PAN Card, Appointment Letter"
                    value={formData.title} 
                    onChange={e => setFormData({...formData, title: e.target.value})} 
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-be-orange focus:border-be-orange text-sm font-medium" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Upload File *</label>
                  <input 
                    required 
                    type="file" 
                    onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)} 
                    className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-xl focus:ring-2 focus:ring-be-orange outline-none text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-be-orange hover:file:bg-orange-100" 
                  />
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)} 
                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isUploading}
                    className="px-5 py-2 bg-be-orange hover:bg-orange-600 text-white rounded-xl text-sm font-bold shadow-md shadow-orange-500/20 flex items-center disabled:opacity-60"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={16} className="animate-spin mr-2" /> Uploading...
                      </>
                    ) : (
                      'Save Document'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget.isOpen}
        onClose={() => !deleteTarget.isDeleting && setDeleteTarget({ isOpen: false, doc: null, isDeleting: false })}
        onConfirm={confirmDeleteDoc}
        title="Delete Document"
        itemName={deleteTarget.doc?.title}
        message={deleteTarget.doc ? `Are you sure you want to delete "${deleteTarget.doc.title}"?` : undefined}
        isDeleting={deleteTarget.isDeleting}
      />
    </div>
  );
};
