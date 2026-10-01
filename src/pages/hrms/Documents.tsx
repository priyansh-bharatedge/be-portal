import { useState, useEffect } from 'react';
import { FileText, Search, Plus, Trash2, Download, Eye, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveDocument, getDocument, deleteDocument } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import { uploadZohoAttachment } from '../../services/zohoService';

interface EmpDoc {
  id: string;
  empId: string;
  empName: string;
  title: string;
  date: string;
  fileId: string;
  fileName: string;
}

export const Documents = () => {
  const { currentUser, isTM, isHR, isSuperAdmin, can } = useAuth();
  const [documents, setDocuments] = useState<EmpDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ empId: '', title: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const canManage = isHR || isSuperAdmin;
  const isEmployeeSelfOnly = isTM || currentUser.role === 'TM' || !canManage;

  useEffect(() => {
    const saved = localStorage.getItem('be_emp_docs');
    if (saved) setDocuments(JSON.parse(saved));
  }, []);

  const saveToStorage = (data: EmpDoc[]) => {
    setDocuments(data);
    localStorage.setItem('be_emp_docs', JSON.stringify(data));
  };

  const employees = JSON.parse(localStorage.getItem('be_employees') || '[]');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = isEmployeeSelfOnly ? (currentUser.empId || currentUser.id) : formData.empId;
    const emp = employees.find((e: any) => e.id === targetEmpId) || { name: currentUser.name };
    if (!targetEmpId) return alert("Select an employee");
    if (!selectedFile) return alert("Please select a file to upload");

    const fileId = `emp_doc_${Date.now()}`;
    await saveDocument(fileId, selectedFile);

    const newDoc: EmpDoc = {
      id: `DOC-${Date.now()}`,
      empId: targetEmpId,
      empName: emp.name || currentUser.name,
      title: formData.title,
      date: new Date().toLocaleDateString('en-GB'),
      fileId,
      fileName: selectedFile.name
    };

    saveToStorage([newDoc, ...documents]);

    // Attach to Zoho CRM Employee record if synced
    if (emp?.zohoId) {
      try {
        await uploadZohoAttachment(emp.zohoId, selectedFile, `[${formData.title || 'Document'}] ${selectedFile.name}`, 'Employee');
      } catch (zErr) {
        console.warn('[Zoho CRM] Document upload error:', zErr);
      }
    }

    setIsModalOpen(false);
    setFormData({ empId: '', title: '' });
    setSelectedFile(null);
  };

  const handleDownload = async (fileId: string, fileName: string) => {
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
      alert("Document not found in local storage.");
    }
  };

  const handleView = async (fileId: string) => {
    const file = await getDocument(fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    } else {
      alert("Document not found in local storage.");
    }
  };

  const handleDelete = async (doc: EmpDoc) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument(doc.fileId);
      saveToStorage(documents.filter(d => d.id !== doc.id));
    }
  };

  const displayedDocs = documents.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase()) || d.empName.toLowerCase().includes(searchQuery.toLowerCase());
    if (isEmployeeSelfOnly) {
      return matchesSearch && (
        d.empId === currentUser.empId || 
        d.empId === currentUser.id || 
        (currentUser.id && d.empId && String(d.empId).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
        (currentUser.empId && d.empId && String(d.empId).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
        d.empName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()
      );
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEmployeeSelfOnly ? 'My Personal Documents' : 'Personal Documents Management'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isEmployeeSelfOnly 
              ? `Verification documents and files on record for ${currentUser.name}.`
              : 'Manage employee verification, identity, and onboarding documents.'}
          </p>
        </div>

        {canManage ? (
          <button onClick={() => { setFormData({ empId: employees[0]?.id || '', title: '' }); setIsModalOpen(true); }} className="bg-be-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-md shadow-orange-500/20">
            <Plus size={18} className="mr-2" /> Upload Document
          </button>
        ) : (
          <div className="text-xs text-gray-500 bg-gray-50 px-3.5 py-2 rounded-xl font-medium border border-gray-200 flex items-center">
            <Info size={14} className="mr-1.5 text-gray-400" /> Personal Employee View
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" placeholder="Search documents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-be-orange text-sm font-medium"
          />
        </div>
      </div>

      <div className="bg-transparent overflow-hidden">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Document Title</th>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Date Uploaded</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
            {displayedDocs.map((doc) => (
                <tr key={doc.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900 flex items-center">
                    <FileText className="text-be-orange mr-3" size={18}/> {doc.title}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">{doc.empName}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 text-gray-600 font-medium">{doc.date}</td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2 transition-opacity">
                      <button onClick={() => handleView(doc.fileId)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="View Document"><Eye size={16} /></button>
                      <button onClick={() => handleDownload(doc.fileId, doc.fileName)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download Document"><Download size={16} /></button>
                      {canManage && (
                        <button onClick={() => handleDelete(doc)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
            ))}
            {displayedDocs.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">No documents found on record.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-xl font-bold">Upload Employee Document</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Employee</label>
                  <select required value={formData.empId} onChange={e => setFormData({...formData, empId: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-be-orange">
                    <option value="">Select Employee...</option>
                    {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Document Title (e.g. Aadhaar Card)</label>
                  <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-be-orange" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Upload File *</label>
                  <input required type="file" onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)} className="w-full px-3 py-2 border border-dashed rounded-lg focus:ring-1 focus:ring-be-orange outline-none" />
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-be-orange text-white rounded-lg">Save Document</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
