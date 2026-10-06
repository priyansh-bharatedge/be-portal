import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Filter, FileText, Download, Trash2, Eye, UploadCloud, X, Calendar, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllDocuments, deleteDocument, saveDocument } from '../../lib/db';
import { DeleteConfirmModal } from '../../components/ui/DeleteConfirmModal';

interface DocItem {
  id: string;
  file: File;
  name: string;
  size: string;
  type: string;
  date: string;
}

export const Documents = () => {
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; doc: DocItem | null; isDeleting: boolean }>({
    isOpen: false,
    doc: null,
    isDeleting: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const allDocs = await getAllDocuments();
      const formatted = allDocs.map(doc => ({
        id: doc.id,
        file: doc.file,
        name: doc.file.name,
        size: (doc.file.size / (1024 * 1024)).toFixed(2) + ' MB',
        type: doc.file.type || 'Unknown Type',
        date: new Date(doc.file.lastModified).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      })).reverse(); // Show newest first
      setDocuments(formatted);
    } catch (e) {
      console.error("Failed to load documents", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDownload = (doc: DocItem) => {
    const url = URL.createObjectURL(doc.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = (doc: DocItem) => {
    setDeleteTarget({ isOpen: true, doc, isDeleting: false });
  };

  const confirmDeleteDoc = async () => {
    const doc = deleteTarget.doc;
    if (!doc) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));
    try {
      await deleteDocument(doc.id);
      await fetchDocuments();
    } catch (e) {
      console.error("Failed to delete document", e);
    } finally {
      setDeleteTarget({ isOpen: false, doc: null, isDeleting: false });
    }
  };

  const handleFiles = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Generate a global ID for general documents, or prefix with GLOBAL
      const id = `GLOBAL_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      await saveDocument(id, file);
    }
    fetchDocuments();
    setIsUploadModalOpen(false);
  };

  const filteredDocs = documents.filter(d => 
    (d.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-500 text-sm mt-1">Manage and access all uploaded files across your CRM.</p>
        </div>
        <button 
          onClick={() => setIsUploadModalOpen(true)}
          className="bg-be-orange hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium flex items-center transition-colors shadow-sm"
        >
          <UploadCloud size={18} className="mr-2" />
          Upload Document
        </button>
      </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-transparent mt-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search documents by name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange transition-all shadow-sm"
            />
          </div>
          <button className="flex items-center px-4 py-2.5 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap w-full sm:w-auto justify-center shadow-sm">
            <Filter size={18} className="mr-2 text-gray-400" />
            Filter
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading documents...</div>
        ) : (
          <div className="bg-transparent overflow-hidden mt-6">
            <div className="overflow-x-auto pb-6">
              <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
                <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-3">Document Name</th>
                    <th className="px-6 py-3">Size</th>
                    <th className="px-6 py-3">Date Modified</th>
                    <th className="px-6 py-3">Context / Ref ID</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                {filteredDocs.map((doc) => {
                  const isDealDoc = doc.id.startsWith('DL-');
                  const contextText = isDealDoc ? `Deal: ${(doc.id ?? '').split('_')[0]}` : 'Global Upload';
                  return (
                    <tr key={doc.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                      <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center mr-3 border border-orange-200 shrink-0 shadow-sm">
                            <FileText size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 truncate max-w-[200px]" title={doc.name}>{doc.name}</div>
                            <div className="text-gray-500 text-xs font-medium truncate max-w-[200px]">{doc.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-bold text-gray-600">
                        {doc.size}
                      </td>
                      <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 text-gray-600 font-medium">
                        <div className="flex items-center">
                          <Calendar size={14} className="mr-2 text-gray-400" />
                          {doc.date}
                        </div>
                      </td>
                      <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold shadow-sm ${isDealDoc ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {contextText}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                        <div className="flex items-center justify-end space-x-2 transition-opacity">
                          <button onClick={() => handleDownload(doc)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Download & View">
                            <Download size={16} />
                          </button>
                          <button onClick={() => handleDelete(doc)} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-gray-500">
                      <Database size={48} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-lg font-medium text-gray-900">No documents found</p>
                      <p className="max-w-sm mx-auto mt-1">Upload a document directly here, or attach documents to Deals to see them populate in this central repository.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

      {/* Centered Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsUploadModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden w-full max-w-lg relative"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
                <h2 className="text-xl font-bold text-gray-900">Upload Documents</h2>
                <button type="button" onClick={() => setIsUploadModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
                    dragActive ? 'border-be-orange bg-orange-50/50' : 'border-gray-300 hover:border-gray-400 bg-gray-50/30'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={48} className={`mb-4 ${dragActive ? 'text-be-orange' : 'text-gray-400'}`} />
                  <p className="text-sm font-medium text-gray-900 mb-1">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-500">PDF, DOCX, JPG, PNG (max. 10MB)</p>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  />
                </div>
              </div>

              <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button 
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)} 
                  className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
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
        itemName={deleteTarget.doc?.name}
        message={deleteTarget.doc ? `Are you sure you want to delete document "${deleteTarget.doc.name}"?` : undefined}
        isDeleting={deleteTarget.isDeleting}
      />
    </div>
  );
};
