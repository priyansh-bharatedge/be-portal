import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Filter, Edit, Trash2, Building2, FileText, Calendar, CheckCircle2, X, Cloud, CloudOff, RefreshCw, AlertCircle, Loader2, Mail } from 'lucide-react';
import { saveOrUpdateZohoCompany, deleteZohoCompany, insertZohoCompany, fetchZohoCompanies } from '../../services/zohoService';

export interface Company {
  id: string;
  name: string;
  type: string;
  gstNumber: string;
  doi: string; // Date of Incorporation
  email?: string;
  secondaryEmail?: string;
  status: 'Active' | 'Inactive';
  source?: string;
  addedOn: string;
  zohoId?: string;
  zohoStatus?: 'synced' | 'pending' | 'failed';
  zohoSyncedAt?: string;
  zohoError?: string;
}

export const Companies = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All Companies');
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);

  // Form State
  const initialFormData = {
    name: '',
    type: 'Private Limited',
    gstNumber: '',
    doi: '',
    email: '',
    secondaryEmail: '',
    status: 'Active' as 'Active' | 'Inactive'
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem('be_companies');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCompanies(parsed);
        }
      } catch (e) {}
    }

    // Auto-fetch live companies from Zoho CRM
    fetchZohoCompanies().then(res => {
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const fetchedCompanies: Company[] = res.data.map((r: any) => ({
          id: `CMP-${r.id ? String(r.id).slice(-4) : Math.floor(1000 + Math.random() * 9000)}`,
          name: r.Name || 'Unnamed Company',
          type: r.Business_Type || 'Private Limited',
          gstNumber: r.GST_Number || '',
          doi: r.Date_of_Incorporation || '',
          email: r.Email || '',
          secondaryEmail: r.Secondary_Email || '',
          status: (r.Status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
          source: 'Zoho CRM',
          addedOn: r.Created_Time ? new Date(r.Created_Time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB'),
          zohoId: String(r.id),
          zohoStatus: 'synced',
          zohoSyncedAt: new Date().toISOString(),
        }));

        setCompanies(prev => {
          const existingZohoIds = new Set(prev.map(c => c.zohoId).filter(Boolean));
          const newOnly = fetchedCompanies.filter(c => c.zohoId && !existingZohoIds.has(c.zohoId));
          const updated = [...newOnly, ...prev];
          localStorage.setItem('be_companies', JSON.stringify(updated));
          return updated;
        });
      }
    }).catch(err => console.warn('[Zoho CRM] Auto-fetch companies error:', err));
  }, []);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveToStorage = (newCompanies: Company[]) => {
    setCompanies(newCompanies);
    localStorage.setItem('be_companies', JSON.stringify(newCompanies));
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Company Name is required';
    
    if (formData.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(formData.gstNumber.replace(/[^a-zA-Z0-9]/g, ''))) {
      errors.gstNumber = 'Enter a valid GSTIN format (e.g., 24ABCDE1234F1Z5)';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (formData.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.secondaryEmail.trim())) {
      errors.secondaryEmail = 'Enter a valid secondary email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    const companyId = editingCompany ? editingCompany.id : `CMP-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const companyData: Company = {
      id: companyId,
      ...formData,
      gstNumber: formData.gstNumber ? formData.gstNumber.toUpperCase() : '',
      source: editingCompany ? (editingCompany.source || 'Manual') : 'Manual',
      addedOn: editingCompany ? editingCompany.addedOn : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      zohoId: editingCompany?.zohoId,
      zohoStatus: editingCompany?.zohoStatus || 'pending',
    };

    // Sync to Zoho CRM Companies Module
    try {
      const zohoRes = await saveOrUpdateZohoCompany(companyData);
      const finalZohoId = zohoRes.zohoId || companyData.zohoId;

      if (zohoRes.success && finalZohoId) {
        companyData.zohoId = finalZohoId;
        companyData.zohoStatus = 'synced';
        companyData.zohoSyncedAt = new Date().toISOString();
        companyData.zohoError = undefined;

        setToast({
          type: 'success',
          message: editingCompany ? 'Company Updated & Synced to Zoho CRM!' : 'Company Created & Synced to Zoho CRM!',
          submessage: `${editingCompany ? 'Updated' : 'Inserted'} in Zoho Companies module (ID: #${finalZohoId})`
        });
      } else {
        companyData.zohoStatus = 'failed';
        companyData.zohoError = zohoRes.message;
        setToast({
          type: 'error',
          message: `Company Saved Locally (Zoho ${editingCompany ? 'Update' : 'Sync'} Failed)`,
          submessage: zohoRes.message || 'Check Zoho CRM credentials or module permissions'
        });
      }
    } catch (zErr: any) {
      console.error('[Zoho CRM] Company sync exception:', zErr);
      companyData.zohoStatus = 'failed';
      companyData.zohoError = zErr?.message || 'Sync failed';
      setToast({
        type: 'error',
        message: `Company Saved Locally (Zoho ${editingCompany ? 'Update' : 'Sync'} Error)`,
        submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
      });
    } finally {
      setIsSubmitting(false);
    }

    let updatedCompanies: Company[];
    if (editingCompany) {
      updatedCompanies = companies.map(c => c.id === editingCompany.id ? companyData : c);
    } else {
      updatedCompanies = [companyData, ...companies];
    }
    
    saveToStorage(updatedCompanies);
    closeModal();
  };

  const handleSyncToZoho = async (company: Company) => {
    setSyncingId(company.id);
    try {
      const res = await saveOrUpdateZohoCompany(company);
      if (res.success && res.zohoId) {
        const updatedList = companies.map(c => {
          if (c.id === company.id) {
            return {
              ...c,
              zohoId: res.zohoId,
              zohoStatus: 'synced' as const,
              zohoSyncedAt: new Date().toISOString(),
              zohoError: undefined,
            };
          }
          return c;
        });
        saveToStorage(updatedList);
        setToast({
          type: 'success',
          message: `Company "${company.name}" Synced to Zoho CRM!`,
          submessage: `Zoho CRM Record #${res.zohoId}`
        });
      } else {
        const updatedList = companies.map(c => {
          if (c.id === company.id) {
            return {
              ...c,
              zohoStatus: 'failed' as const,
              zohoError: res.message,
            };
          }
          return c;
        });
        saveToStorage(updatedList);
        setToast({
          type: 'error',
          message: `Zoho Sync Failed for "${company.name}"`,
          submessage: res.message || 'Check Zoho CRM field requirements'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Zoho Sync Error for "${company.name}"`,
        submessage: err?.message || 'Network communication error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleFetchZohoCompanies = async () => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoCompanies();
      if (res.success && Array.isArray(res.data)) {
        if (res.data.length === 0) {
          setToast({
            type: 'info',
            message: 'No Live Companies Found in Zoho CRM',
            submessage: 'Companies module returned 0 records'
          });
          return;
        }

        // Map live Zoho records into our company interface
        const fetchedCompanies: Company[] = res.data.map((r: any) => ({
          id: `CMP-${r.id ? String(r.id).slice(-4) : Math.floor(1000 + Math.random() * 9000)}`,
          name: r.Name || 'Unnamed Company',
          type: r.Business_Type || 'Private Limited',
          gstNumber: r.GST_Number || '',
          doi: r.Date_of_Incorporation || '',
          email: r.Email || '',
          secondaryEmail: r.Secondary_Email || '',
          status: (r.Status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
          source: 'Zoho CRM',
          addedOn: r.Created_Time ? new Date(r.Created_Time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB'),
          zohoId: String(r.id),
          zohoStatus: 'synced',
          zohoSyncedAt: new Date().toISOString(),
        }));

        // Merge with existing companies avoiding duplicates
        const existingZohoIds = new Set(companies.map(c => c.zohoId).filter(Boolean));
        const newOnly = fetchedCompanies.filter(c => c.zohoId && !existingZohoIds.has(c.zohoId));

        const updated = [...newOnly, ...companies];
        saveToStorage(updated);

        setToast({
          type: 'success',
          message: `Fetched ${res.data.length} Companies from Zoho CRM!`,
          submessage: `${newOnly.length} new records imported successfully`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Failed to fetch companies from Zoho CRM',
          submessage: res.message
        });
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: 'Error connecting to Zoho CRM',
        submessage: e.message
      });
    } finally {
      setIsFetchingZoho(false);
    }
  };

  const handleDelete = async (company: Company) => {
    if (!confirm(`Are you sure you want to delete company "${company.name}"?`)) return;

    saveToStorage(companies.filter(c => c.id !== company.id));

    if (company.zohoId) {
      try {
        const zohoRes = await deleteZohoCompany(company.zohoId);
        if (zohoRes.success) {
          setToast({
            type: 'success',
            message: `Company "${company.name}" Deleted`,
            submessage: `Record #${company.zohoId} deleted from Zoho CRM`
          });
        } else {
          setToast({
            type: 'error',
            message: `Company Deleted Locally (Zoho Delete Failed)`,
            submessage: zohoRes.message || 'Check Zoho CRM record status'
          });
        }
      } catch (zErr: any) {
        console.error('[Zoho CRM] Company delete exception:', zErr);
        setToast({
          type: 'error',
          message: `Company Deleted Locally (Zoho Delete Error)`,
          submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
        });
      }
    } else {
      setToast({
        type: 'success',
        message: `Company "${company.name}" Deleted`,
        submessage: 'Record has been removed locally'
      });
    }
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormData({ 
      name: company.name, 
      type: company.type || 'Private Limited', 
      gstNumber: company.gstNumber || '', 
      doi: company.doi || '', 
      email: company.email || '',
      secondaryEmail: company.secondaryEmail || '',
      status: company.status || 'Active'
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCompany(null);
    setFormData(initialFormData);
    setFormErrors({});
  };

  const filteredCompanies = companies.filter(c => {
    const source = c.source || 'Manual';
    if (activeTab === 'Manual Companies' && source !== 'Manual') return false;
    if (activeTab === 'From Deals' && source !== 'From Deals') return false;
    if (activeTab === 'Zoho CRM' && source !== 'Zoho CRM') return false;
    
    return c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (c.gstNumber && c.gstNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
           (c.type && c.type.toLowerCase().includes(searchQuery.toLowerCase())) ||
           (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));
  });

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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
            <span className="px-2.5 py-0.5 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
              {companies.length} Total
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">Manage corporate entities, GST, and Zoho CRM Companies records.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleFetchZohoCompanies}
            disabled={isFetchingZoho}
            className="px-3.5 py-2.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center shadow-sm transition-all disabled:opacity-60"
            title="Fetch live records from Zoho CRM Companies module"
          >
            <RefreshCw size={16} className={`mr-2 text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
            {isFetchingZoho ? 'Fetching Zoho...' : 'Fetch Zoho CRM'}
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-be-orange hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium flex items-center transition-colors shadow-sm"
          >
            <Plus size={18} className="mr-2" />
            Add Company
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {['All Companies', 'Manual Companies', 'From Deals', 'Zoho CRM'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium text-sm transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-be-orange' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div layoutId="activeCompanyTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-be-orange" />
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search by company name, type, email, or GST..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange transition-all text-sm"
            />
          </div>
          <button className="flex items-center px-4 py-2.5 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap w-full sm:w-auto justify-center text-sm font-medium">
            <Filter size={18} className="mr-2 text-gray-400" />
            Filter
          </button>
        </div>
      </div>

      <div className="bg-transparent overflow-hidden mt-6">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Company Name</th>
                <th className="px-6 py-3">Business Type</th>
                <th className="px-6 py-3">Tax & Contact Info</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Zoho CRM Sync</th>
                <th className="px-6 py-3">Added On</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center font-bold mr-3 border border-orange-200 shrink-0 shadow-sm">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{company.name}</div>
                        <div className="text-gray-500 text-xs font-medium">{company.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 shadow-sm">
                      {company.type}
                    </span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <div className="flex flex-col space-y-1">
                      {company.gstNumber ? (
                        <div className="flex items-center text-gray-700 font-medium">
                          <FileText size={14} className="mr-2 text-gray-400 shrink-0" />
                          <span className="uppercase font-mono text-xs">{company.gstNumber}</span>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-xs italic font-medium">No GST Provided</div>
                      )}
                      {company.email && (
                        <div className="flex items-center text-gray-600 text-xs font-medium">
                          <Mail size={12} className="mr-1.5 text-gray-400 shrink-0" />
                          <span>{company.email}</span>
                        </div>
                      )}
                      {company.doi && (
                        <div className="flex items-center text-gray-500 text-xs font-medium">
                          <Calendar size={12} className="mr-1.5 shrink-0" />
                          Inc: {new Date(company.doi).toLocaleDateString('en-GB')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center w-max shadow-sm ${
                      company.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-700 border border-gray-200'
                    }`}>
                      {company.status === 'Active' && <CheckCircle2 size={12} className="mr-1" />}
                      {company.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    {company.zohoStatus === 'synced' || company.zohoId ? (
                      <span 
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm"
                        title={`Zoho Record ID: ${company.zohoId}`}
                      >
                        <Cloud size={13} className="mr-1.5 text-emerald-600" />
                        <span>Zoho #{String(company.zohoId || '').slice(-6)}</span>
                      </span>
                    ) : company.zohoStatus === 'failed' ? (
                      <span 
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm"
                        title={company.zohoError || 'Sync failed'}
                      >
                        <CloudOff size={13} className="mr-1.5 text-rose-600" />
                        <span>Sync Failed</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                        <CloudOff size={13} className="mr-1.5 text-amber-600" />
                        <span>Local Only</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-gray-600 font-medium whitespace-nowrap border-t border-b border-gray-100 group-hover:border-orange-100">
                    {company.addedOn}
                  </td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleSyncToZoho(company)}
                        disabled={syncingId === company.id}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-50"
                        title={company.zohoId ? 'Re-sync to Zoho CRM' : 'Sync to Zoho CRM Companies Module'}
                      >
                        {syncingId === company.id ? <Loader2 size={16} className="animate-spin text-be-orange" /> : <RefreshCw size={16} />}
                      </button>
                      <button onClick={() => openEditModal(company)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(company)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCompanies.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-lg font-medium text-gray-900">No companies found</p>
                    <p className="text-sm">Try adjusting your search query, fetch from Zoho CRM, or add a new company.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Centered Modal for Add/Edit Company */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden w-full max-w-lg relative max-h-[90vh]"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{editingCompany ? 'Edit Company' : 'Add New Company'}</h2>
                    <p className="text-xs text-gray-500">Synced directly to Zoho CRM Companies module</p>
                  </div>
                </div>
                <button type="button" onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                <form id="company-form" onSubmit={handleSaveCompany} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name *</label>
                    <input 
                      type="text" 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                      className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all ${formErrors.name ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                      placeholder="e.g. Acme Innovations Pvt Ltd" 
                    />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Business Type *</label>
                    <select 
                      value={formData.type} 
                      onChange={e => setFormData({...formData, type: e.target.value})} 
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none bg-white transition-all text-sm"
                    >
                      <option value="Private Limited">Private Limited</option>
                      <option value="LLP">LLP</option>
                      <option value="Proprietorship">Proprietorship</option>
                      <option value="Partnership">Partnership</option>
                      <option value="One Person Company">One Person Company</option>
                      <option value="Section 8 Company">Section 8 Company</option>
                      <option value="Public Limited">Public Limited</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">GST Number <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <input 
                      type="text" 
                      value={formData.gstNumber} 
                      onChange={e => setFormData({...formData, gstNumber: e.target.value.toUpperCase()})} 
                      className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none uppercase font-mono transition-all ${formErrors.gstNumber ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                      placeholder="24ABCDE1234F1Z5" 
                    />
                    {formErrors.gstNumber && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.gstNumber}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Primary Email <span className="text-gray-400 font-normal">(Optional)</span></label>
                      <input 
                        type="email" 
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none text-sm transition-all ${formErrors.email ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                        placeholder="contact@company.com" 
                      />
                      {formErrors.email && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Secondary Email <span className="text-gray-400 font-normal">(Optional)</span></label>
                      <input 
                        type="email" 
                        value={formData.secondaryEmail} 
                        onChange={e => setFormData({...formData, secondaryEmail: e.target.value})} 
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none text-sm transition-all ${formErrors.secondaryEmail ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                        placeholder="billing@company.com" 
                      />
                      {formErrors.secondaryEmail && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.secondaryEmail}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Date of Incorporation <span className="text-gray-400 font-normal">(Optional)</span></label>
                      <input 
                        type="date" 
                        value={formData.doi} 
                        onChange={e => setFormData({...formData, doi: e.target.value})} 
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none bg-white transition-all text-sm" 
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                      <select 
                        value={formData.status} 
                        onChange={e => setFormData({...formData, status: e.target.value as 'Active' | 'Inactive'})} 
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none bg-white transition-all text-sm"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-5 border-t border-gray-100 bg-white flex gap-3">
                <button 
                  type="button"
                  onClick={closeModal} 
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  form="company-form"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-be-orange hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50 text-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Syncing to Zoho...</span>
                    </>
                  ) : (
                    <span>{editingCompany ? 'Save Changes' : 'Create & Sync to Zoho'}</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

