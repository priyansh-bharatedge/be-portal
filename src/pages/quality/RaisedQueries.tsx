import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  MoreHorizontal,
  X,
  MessageSquarePlus,
  Check,
  UploadCloud,
  Paperclip,
  Edit,
  Trash2,
  Download,
  Eye,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Cloud
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { saveDocument, getDocument, deleteDocument } from "../../lib/db";
import { fetchZohoQueries, saveOrUpdateZohoQuery, deleteZohoQuery } from "../../services/zohoService";
import { useAuth } from "../../context/AuthContext";
import { DeleteConfirmModal } from "../../components/ui/DeleteConfirmModal";

interface Query {
  id: string;
  client: string;
  company: string;
  service: string;
  query: string;
  description: string;
  priority: string;
  assignee: string;
  status: string;
  date: string;
  fileId?: string;
  fileName?: string;
  zohoId?: string;
}

export const RaisedQueries = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { currentUser, filterRecords } = useAuth();
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [queries, setQueries] = useState<Query[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; query: Query | null; isDeleting: boolean }>({
    isOpen: false,
    query: null,
    isDeleting: false
  });

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || location.state?.search || '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || location.state?.status || 'All');

  useEffect(() => {
    const s = searchParams.get('status') || location.state?.status;
    if (s) setStatusFilter(s);
    const q = searchParams.get('search') || location.state?.search;
    if (q) setSearchQuery(q);
  }, [searchParams, location.state]);

  const rbacQueries = useMemo(() => filterRecords(queries, 'Raised_Queries'), [queries, filterRecords, currentUser]);

  const filteredQueries = useMemo(() => {
    return rbacQueries.filter((item: any) => {
      if (statusFilter && statusFilter !== 'All') {
        const s = String(item.status || '').toLowerCase();
        if (!s.includes(statusFilter.toLowerCase())) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const match = (item.id && String(item.id).toLowerCase().includes(q)) ||
               (item.zohoId && String(item.zohoId).toLowerCase().includes(q)) ||
               (item.client && String(item.client).toLowerCase().includes(q)) ||
               (item.company && String(item.company).toLowerCase().includes(q)) ||
               (item.service && String(item.service).toLowerCase().includes(q)) ||
               (item.query && String(item.query).toLowerCase().includes(q)) ||
               (item.description && String(item.description).toLowerCase().includes(q)) ||
               (item.assignee && String(item.assignee).toLowerCase().includes(q)) ||
               (item.status && String(item.status).toLowerCase().includes(q)) ||
               (item.priority && String(item.priority).toLowerCase().includes(q)) ||
               (item.salesEmployee && String(item.salesEmployee).toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [rbacQueries, searchQuery, statusFilter]);

  const [formData, setFormData] = useState({
    salesEmployee: "",
    client: "",
    company: "",
    service: "",
    query: "",
    description: "",
    priority: "High",
    assignee: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const allServices = [
    "Private Limited Company",
    "One Person Company Registration",
    "Limited Liability Partnership",
    "Partnership Firm Registration (ROF)",
    "Section 8 Company",
    "12A and 80G Registration",
    "NGO Darpan",
    "Trademark Registration",
    "Patent",
    "Copyright Registration",
    "Shram Suvidha Registration",
    "START-UP India Certificate",
    "GeM Registration",
    "Tax Exemption Certificate",
    "ZED Certificate",
    "ISO Certificate",
    "GST Registration & Certificate",
    "FSSAI Certificate",
    "IEC Certificate",
    "Udhyam Registration",
    "Psara Certificate",
    "Surge Growth Fund",
    "Global Innovation Fund",
    "Seed Support Scheme",
    "Agri Preneurs",
    "MSME Design",
    "Gujarat Innovators",
    "iStart Rajasthan",
    "Animal Husbandry (AHIDF)",
    "Credit Guarantee (CGSS)",
    "Gujarat Samriddhi Yojana",
    "Venture Capital",
    "Working Capital (CGTMSE Loan)",
    "NAIFF",
    "PMEGP LOAN",
    "MUDRA LOAN",
    "PMFME",
    "Maha Udyog Yojana (CMEGP)",
    "Rajasthan Investment Promotion Scheme",
    "Rajasthan MSME Policy 2024",
    "RIICO Scheme",
    "MSME Innovation & Loan Scheme (RSFC)",
    "IPO Consulting Services",
    "Bhaskar ID",
    "Financial Model",
    "Company Valuation",
    "Detailed Project Report (DPR)",
    "Investor deck",
    "Performance PPC",
    "High-Impact SEO",
    "Content Strategy",
    "Website Development",
    "CRM Solutions",
    "Logo Designing",
    "Graphic Designing",
    "AI Agents",
    "Annual Based Compliance for Pvt Ltd",
    "Event Based Compliance for Pvt Ltd",
    "Annual Based Compliance for Sec 8",
    "Event Based Compliance for Sec 8",
    "Annual Based Compliance for LLP",
    "Event Based Compliance for LLP",
  ].sort();

  const handleFetchZohoQueries = async (showNotification = true) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoQueries();
      if (res.success && Array.isArray(res.data)) {
        const fetchedList: Query[] = res.data.map((c: any) => ({
          id: c.Case_Number ? `Q-${c.Case_Number}` : `Q-${String(c.id).slice(-4)}`,
          client: c.Client_Name || c.Contact_Name?.name || 'Client',
          company: c.Account_Name?.name || c.Company_Name || 'BharatEdge Client',
          service: c.Service_Type || 'Consulting & Legal',
          query: c.Subject || 'Client Query',
          description: c.Description || '',
          priority: c.Priority || 'Medium',
          assignee: c.Case_Owner?.name || 'Quality Team',
          status: c.Status || 'Open',
          date: c.Created_Time ? new Date(c.Created_Time).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
          zohoId: String(c.id),
        }));

        setQueries(prev => {
          const seenZoho = new Set(prev.map(q => q.zohoId).filter(Boolean));
          const newOnly = fetchedList.filter(q => q.zohoId && !seenZoho.has(q.zohoId));
          const merged = [...newOnly, ...prev];
          localStorage.setItem("be_queries", JSON.stringify(merged));
          return merged;
        });

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Fetched ${res.data.length} Queries Successfully`,
            submessage: 'Quality queries synchronized with live database'
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'error',
          message: 'Failed to fetch queries',
          submessage: res.message || 'Check network connection or server status'
        });
      }
    } catch (e: any) {
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Error connecting to server',
          submessage: e.message || 'Network communication error'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("be_queries");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQueries(parsed);
        }
      } catch (e) {}
    }

    const savedDeals = localStorage.getItem("be_deals");
    if (savedDeals) {
      try {
        setDeals(JSON.parse(savedDeals));
      } catch (e) {}
    }

    // Auto-fetch live queries from Zoho CRM on mount
    handleFetchZohoQueries(false);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveToStorage = (data: Query[]) => {
    setQueries(data);
    localStorage.setItem("be_queries", JSON.stringify(data));
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "Critical":
        return "bg-red-100 text-red-700 border border-red-200";
      case "High":
        return "bg-orange-100 text-orange-700 border border-orange-200";
      case "Medium":
        return "bg-blue-100 text-blue-700 border border-blue-200";
      case "Low":
        return "bg-gray-100 text-gray-700 border border-gray-200";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "Open":
        return "bg-red-50 text-red-600";
      case "In Progress":
        return "bg-blue-50 text-blue-600";
      case "Resolved":
        return "bg-emerald-50 text-emerald-600";
      case "Closed":
        return "bg-gray-100 text-gray-600";
      default:
        return "bg-gray-50 text-gray-600";
    }
  };

  const handleRaiseQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryId = editingId || `Q-${Math.floor(Math.random() * 9000) + 1000}`;
    const existing = editingId ? queries.find((q) => q.id === editingId) : null;

    let fileId = undefined;
    let fileName = undefined;

    if (selectedFile) {
      fileId = `query_file_${queryId}_${Date.now()}`;
      fileName = selectedFile.name;
      await saveDocument(fileId, selectedFile);
    } else if (existing) {
      fileId = existing.fileId;
      fileName = existing.fileName;
    }

    const newQuery: Query = {
      id: queryId,
      ...formData,
      status: existing?.status || "Open",
      date: existing?.date || new Date().toLocaleDateString("en-GB"),
      fileId,
      fileName,
      zohoId: existing?.zohoId,
    };

    // Sync with Zoho CRM Cases
    try {
      const zRes = await saveOrUpdateZohoQuery(newQuery);
      if (zRes.success && zRes.zohoId) {
        newQuery.zohoId = zRes.zohoId;
        setToast({
          type: 'success',
          message: editingId ? 'Query Updated Successfully' : 'Query Raised Successfully',
          submessage: `Case Record #${zRes.zohoId}`
        });
      }
    } catch (zErr) {
      console.warn('[Zoho CRM] Query sync warning:', zErr);
    }

    if (editingId) {
      saveToStorage(queries.map((q) => (q.id === editingId ? newQuery : q)));
    } else {
      saveToStorage([newQuery, ...queries]);
    }

    closeModal();
  };

  const closeModal = () => {
    setIsRaiseModalOpen(false);
    setEditingId(null);
    setFormData({
      salesEmployee: "",
      client: "",
      company: "",
      service: "",
      query: "",
      description: "",
      priority: "High",
      assignee: "",
    });
    setSelectedFile(null);
  };

  const handleDelete = (query: Query) => {
    setDeleteTarget({ isOpen: true, query, isDeleting: false });
  };

  const confirmDeleteQuery = async () => {
    const query = deleteTarget.query;
    if (!query) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));

    try {
      if (query.fileId) await deleteDocument(query.fileId);
      saveToStorage(queries.filter((q) => q.id !== query.id));

      if (query.zohoId) {
        try {
          await deleteZohoQuery(query.zohoId);
          setToast({
            type: 'success',
            message: 'Query Deleted Successfully',
            submessage: `Case #${query.zohoId} removed`
          });
        } catch (e) {}
      } else {
        setToast({
          type: 'success',
          message: 'Query Deleted Successfully',
          submessage: 'Record removed locally'
        });
      }
    } finally {
      setDeleteTarget({ isOpen: false, query: null, isDeleting: false });
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    const file = await getDocument(fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else alert("Document not found");
  };

  const handleView = async (fileId: string) => {
    const file = await getDocument(fileId);
    if (file) {
      window.open(URL.createObjectURL(file), "_blank");
    } else alert("Document not found");
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[999] max-w-md p-4 rounded-xl shadow-2xl border flex items-start space-x-3 backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-white border-emerald-500/30'
                : toast.type === 'error'
                  ? 'bg-rose-950/90 text-white border-rose-500/30'
                  : 'bg-slate-900/90 text-white border-slate-700'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <Cloud className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <p className="font-semibold text-white">{toast.message}</p>
              {toast.submessage && (
                <p className="text-xs text-gray-300 mt-1 font-mono break-all">{toast.submessage}</p>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raised Queries</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and track client issues, quality queries, and support cases.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none shadow-sm transition-shadow w-60"
            />
          </div>
          <button
            onClick={() => handleFetchZohoQueries(true)}
            disabled={isFetchingZoho}
            className="w-10 h-10 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg flex items-center justify-center shadow-sm transition-all disabled:opacity-60 shrink-0"
            title="Refresh & Sync"
          >
            <RefreshCw size={16} className={`text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
                salesEmployee: "",
                client: "",
                company: "",
                service: "",
                query: "",
                description: "",
                priority: "High",
                assignee: "",
              });
              setSelectedFile(null);
              setIsRaiseModalOpen(true);
            }}
            className="flex items-center px-4 py-2 bg-be-orange text-white rounded-lg text-sm font-medium hover:bg-be-orangeHover transition-colors shadow-sm"
          >
            <MessageSquarePlus size={16} className="mr-2" />
            Raise Query
          </button>
        </div>
      </div>

      {/* Active Filters Bar */}
      {(searchQuery || (statusFilter && statusFilter !== 'All')) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-orange-50/80 border border-orange-200/80 rounded-2xl mt-4 mb-2 text-xs shadow-xs">
          <span className="font-bold text-gray-700 flex items-center mr-1">
            <Filter size={13} className="text-be-orange mr-1.5" />
            Active Filter:
          </span>
          {statusFilter && statusFilter !== 'All' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-blue-300 text-blue-800 font-extrabold shadow-xs">
              Status: {statusFilter}
              <button onClick={() => setStatusFilter('All')} className="ml-1.5 hover:text-gray-900 transition-colors"><X size={12} /></button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-purple-300 text-purple-800 font-extrabold shadow-xs">
              Search: "{searchQuery}"
              <button onClick={() => setSearchQuery('')} className="ml-1.5 hover:text-gray-900 transition-colors"><X size={12} /></button>
            </span>
          )}
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('All');
              navigate('/quality/queries', { replace: true, state: {} });
            }}
            className="ml-auto text-xs font-bold text-gray-500 hover:text-rose-600 underline transition-colors px-2 py-0.5"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Queries Table */}
      <div className="bg-transparent overflow-hidden mt-4">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Query ID</th>
                <th className="px-6 py-3">Client / Company</th>
                <th className="px-6 py-3">Service</th>
                <th className="px-6 py-3">Query</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Assigned To</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredQueries.map((q) => (
                <tr
                  key={q.id}
                  className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm cursor-pointer"
                >
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">
                    {q.id}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <div className="font-bold text-gray-900">{q.client}</div>
                    <div className="text-xs text-gray-500 font-medium">{q.company}</div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">{q.service}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <div className="truncate max-w-[150px] font-medium text-gray-800" title={q.query}>
                      {q.query}
                    </div>
                    {q.fileName && (
                      <div className="text-[10px] text-blue-500 flex items-center mt-1 font-bold">
                        <Paperclip size={10} className="mr-1" /> Attachment
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getPriorityBadge(q.priority)}`}
                    >
                      {q.priority}
                    </span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">{q.assignee}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getStatusBadge(q.status)}`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2 transition-opacity">
                    {q.fileId && (
                      <>
                        <button
                          onClick={() => handleView(q.fileId!)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="View Attachment"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDownload(q.fileId!, q.fileName!)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="Download Attachment"
                        >
                          <Download size={16} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setEditingId(q.id);
                        setFormData({
                          salesEmployee: (q as any).salesEmployee || "",
                          client: q.client,
                          company: q.company,
                          service: q.service,
                          query: q.query,
                          description: q.description,
                          priority: q.priority,
                          assignee: q.assignee,
                        });
                        setSelectedFile(null);
                        setIsRaiseModalOpen(true);
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit Query"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(q)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete Query"
                    >
                      <Trash2 size={16} />
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rbacQueries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    {isFetchingZoho ? (
                      <div className="flex flex-col items-center justify-center py-4">
                        <Loader2 className="w-7 h-7 animate-spin text-be-orange mb-2" />
                        <p className="text-sm font-semibold text-gray-800">Fetching live queries...</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-lg font-medium text-gray-900">No raised queries</p>
                        <p className="text-xs text-gray-400 mt-1">Raise a new query or refresh live records.</p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raise Query Modal */}
      <AnimatePresence>
        {isRaiseModalOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsRaiseModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingId ? "Edit Query" : "Raise New Query"}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form
                  id="raise-query-form"
                  onSubmit={handleRaiseQuery}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sales Employee *
                      </label>
                      <select
                        required
                        value={formData.salesEmployee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            salesEmployee: e.target.value,
                            client: "",
                            company: "",
                            service: "",
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none bg-white"
                      >
                        <option value="">Select Sales Employee...</option>
                        {Array.from(
                          new Set(deals.map((d) => d.owner).filter(Boolean)),
                        ).map((owner) => (
                          <option key={owner as string} value={owner as string}>
                            {owner as string}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client *
                      </label>
                      <select
                        required
                        value={formData.client}
                        onChange={(e) => {
                          const clientVal = e.target.value;
                          const deal = deals.find(
                            (d) =>
                              d.owner === formData.salesEmployee &&
                              d.client === clientVal,
                          );
                          setFormData({
                            ...formData,
                            client: clientVal,
                            company: deal?.company || "",
                            service:
                              deal?.servicesData?.length === 1
                                ? deal.servicesData[0].name
                                : "",
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none bg-white"
                        disabled={!formData.salesEmployee}
                      >
                        <option value="">Select Client...</option>
                        {Array.from(
                          new Set(
                            deals
                              .filter((d) => d.owner === formData.salesEmployee)
                              .map((d) => d.client),
                          ),
                        ).map((c) => (
                          <option key={c as string} value={c as string}>
                            {c as string}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company
                      </label>
                      <input
                        readOnly
                        placeholder="Auto-fetched company"
                        value={formData.company}
                        className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-600 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Service *
                      </label>
                      <select
                        required
                        value={formData.service}
                        onChange={(e) =>
                          setFormData({ ...formData, service: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none bg-white"
                        disabled={!formData.client}
                      >
                        <option value="">Select Service...</option>
                        {deals
                          .find(
                            (d) =>
                              d.owner === formData.salesEmployee &&
                              d.client === formData.client,
                          )
                          ?.servicesData?.map((s: any) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          )) ||
                          allServices.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Query Subject *
                      </label>
                      <input
                        required
                        value={formData.query}
                        onChange={(e) =>
                          setFormData({ ...formData, query: e.target.value })
                        }
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none"
                        placeholder="Brief subject of the query"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detailed Reason / Description *
                      </label>
                      <textarea
                        required
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none"
                        placeholder="Provide detailed explanation..."
                      ></textarea>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={formData.priority}
                        onChange={(e) =>
                          setFormData({ ...formData, priority: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange outline-none bg-white"
                      >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                        <option>Critical</option>
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Attachments
                      </label>
                      <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors cursor-pointer">
                        <input
                          type="file"
                          onChange={(e) =>
                            setSelectedFile(
                              e.target.files ? e.target.files[0] : null,
                            )
                          }
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <UploadCloud
                          className={`w-8 h-8 mx-auto mb-2 ${selectedFile ? "text-be-orange" : "text-gray-400"}`}
                        />
                        <p className="text-gray-600 text-sm">
                          {selectedFile ? (
                            <span className="font-medium text-be-orange">
                              {selectedFile.name}
                            </span>
                          ) : (
                            "Click or drag files to attach"
                          )}
                        </p>
                        {editingId &&
                          queries.find((q) => q.id === editingId)?.fileName &&
                          !selectedFile && (
                            <p className="text-xs text-blue-500 mt-2">
                              Currently attached:{" "}
                              {
                                queries.find((q) => q.id === editingId)
                                  ?.fileName
                              }
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="raise-query-form"
                  className="px-6 py-2 bg-be-dark text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors flex items-center shadow-md hover:shadow-lg"
                >
                  {editingId ? "Save Changes" : "Raise Query"}{" "}
                  <Check size={16} className="ml-2" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget.isOpen}
        onClose={() => !deleteTarget.isDeleting && setDeleteTarget({ isOpen: false, query: null, isDeleting: false })}
        onConfirm={confirmDeleteQuery}
        title="Delete Query"
        itemName={deleteTarget.query ? `${deleteTarget.query.query || deleteTarget.query.client || deleteTarget.query.id}` : undefined}
        message={deleteTarget.query ? `Are you sure you want to delete query "${deleteTarget.query.query || deleteTarget.query.client || deleteTarget.query.id}"?` : undefined}
        isDeleting={deleteTarget.isDeleting}
      />
    </div>
  );
};
