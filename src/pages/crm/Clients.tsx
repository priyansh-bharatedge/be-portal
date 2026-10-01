import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Filter, X, UserCircle, Building2, Phone, Mail, Edit, Trash2, Cloud, CloudOff, RefreshCw, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { saveOrUpdateZohoClient, deleteZohoClient, insertZohoClient, fetchZohoClients } from '../../services/zohoService';

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  secondaryEmail?: string;
  status: 'Active' | 'Inactive';
  source?: string;
  addedOn: string;
  zohoId?: string;
  zohoStatus?: 'synced' | 'pending' | 'failed';
  zohoSyncedAt?: string;
  zohoError?: string;
}

export const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All Clients');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);

  // Form State
  const initialFormData = {
    name: '',
    company: '',
    email: '',
    phone: '',
    secondaryEmail: '',
    status: 'Active' as 'Active' | 'Inactive'
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = localStorage.getItem('be_clients');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClients(parsed);
        }
      } catch (e) {}
    }

    // Auto-fetch live clients from Zoho CRM on mount
    handleFetchZohoClients(false);
  }, []);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveToStorage = (newClients: Client[]) => {
    setClients(newClients);
    localStorage.setItem('be_clients', JSON.stringify(newClients));
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Client name is required';
    if (!formData.company.trim()) errors.company = 'Company name is required';
    if (!formData.phone) {
      errors.phone = 'Mobile number is required';
    } else if (!/^[0-9]{10}$/.test(formData.phone.replace(/[^0-9]/g, ''))) {
      errors.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Enter a valid email address';
    }
    if (formData.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.secondaryEmail.trim())) {
      errors.secondaryEmail = 'Enter a valid secondary email address';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    const clientId = editingClient ? editingClient.id : `CL-${Math.floor(1000 + Math.random() * 9000)}`;

    const clientData: Client = {
      id: clientId,
      ...formData,
      source: editingClient ? (editingClient.source || 'Manual') : 'Manual',
      addedOn: editingClient ? editingClient.addedOn : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      zohoId: editingClient?.zohoId,
      zohoStatus: editingClient?.zohoStatus || 'pending',
    };

    // Sync to Zoho CRM Clients Module
    try {
      const zohoRes = await saveOrUpdateZohoClient(clientData);
      const finalZohoId = zohoRes.zohoId || clientData.zohoId;

      if (zohoRes.success && finalZohoId) {
        clientData.zohoId = finalZohoId;
        clientData.zohoStatus = 'synced';
        clientData.zohoSyncedAt = new Date().toISOString();
        clientData.zohoError = undefined;

        setToast({
          type: 'success',
          message: editingClient ? 'Client Updated & Synced to Zoho CRM!' : 'Client Created & Synced to Zoho CRM!',
          submessage: `${editingClient ? 'Updated' : 'Inserted'} in Zoho Clients module (ID: #${finalZohoId})`
        });
      } else {
        clientData.zohoStatus = 'failed';
        clientData.zohoError = zohoRes.message;
        setToast({
          type: 'error',
          message: `Client Saved Locally (Zoho ${editingClient ? 'Update' : 'Sync'} Failed)`,
          submessage: zohoRes.message || 'Check Zoho CRM credentials or module permissions'
        });
      }
    } catch (zErr: any) {
      console.error('[Zoho CRM] Client sync exception:', zErr);
      clientData.zohoStatus = 'failed';
      clientData.zohoError = zErr?.message || 'Sync failed';
      setToast({
        type: 'error',
        message: `Client Saved Locally (Zoho ${editingClient ? 'Update' : 'Sync'} Error)`,
        submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
      });
    } finally {
      setIsSubmitting(false);
    }

    let updatedClients: Client[];
    if (editingClient) {
      updatedClients = clients.map(c => c.id === editingClient.id ? clientData : c);
    } else {
      updatedClients = [clientData, ...clients];
    }
    
    saveToStorage(updatedClients);
    closeModal();
  };

  const handleSyncToZoho = async (client: Client) => {
    setSyncingId(client.id);
    try {
      const res = await saveOrUpdateZohoClient(client);
      if (res.success && res.zohoId) {
        const updatedList = clients.map(c => {
          if (c.id === client.id) {
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
          message: `Client "${client.name}" Synced to Zoho CRM!`,
          submessage: `Zoho CRM Record #${res.zohoId}`
        });
      } else {
        const updatedList = clients.map(c => {
          if (c.id === client.id) {
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
          message: `Zoho Sync Failed for "${client.name}"`,
          submessage: res.message || 'Check Zoho CRM field requirements'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Zoho Sync Error for "${client.name}"`,
        submessage: err?.message || 'Network communication error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleFetchZohoClients = async (showNotification = true) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoClients();
      if (res.success && Array.isArray(res.data)) {
        if (res.data.length === 0) {
          if (showNotification) {
            setToast({
              type: 'info',
              message: 'No Live Clients Found in Zoho CRM',
              submessage: 'Clients module returned 0 records'
            });
          }
          return;
        }

        // Map live Zoho records into our client interface
        const fetchedClients: Client[] = res.data.map((r: any) => ({
          id: `CL-${r.id ? String(r.id).slice(-4) : Math.floor(1000 + Math.random() * 9000)}`,
          name: r.Name || 'Unnamed Client',
          company: r.Company_Name || '',
          email: r.Email || '',
          phone: r.Mobile_Number || '',
          secondaryEmail: r.Secondary_Email || '',
          status: (r.Status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
          source: 'Zoho CRM',
          addedOn: r.Created_Time ? new Date(r.Created_Time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB'),
          zohoId: String(r.id),
          zohoStatus: 'synced',
          zohoSyncedAt: new Date().toISOString(),
        }));

        setClients(prev => {
          const seenZohoIds = new Set<string>();
          const seenIds = new Set<string>();
          const merged: Client[] = [];

          // Live Zoho records take precedence
          for (const fc of fetchedClients) {
            if (fc.zohoId) seenZohoIds.add(fc.zohoId);
            if (fc.id) seenIds.add(fc.id.toLowerCase());
            merged.push(fc);
          }

          // Preserve any local non-synced items
          for (const pc of prev) {
            if (pc.zohoId && seenZohoIds.has(pc.zohoId)) continue;
            if (pc.id && seenIds.has(pc.id.toLowerCase())) continue;
            if (pc.id) seenIds.add(pc.id.toLowerCase());
            if (pc.zohoId) seenZohoIds.add(pc.zohoId);
            merged.push(pc);
          }

          localStorage.setItem('be_clients', JSON.stringify(merged));
          return merged;
        });

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Fetched ${res.data.length} Clients from Zoho CRM!`,
            submessage: `Live CRM data synchronized successfully`
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'error',
          message: 'Failed to fetch clients from Zoho CRM',
          submessage: res.message || 'Check connection or Zoho API rate limits'
        });
      }
    } catch (e: any) {
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Error connecting to Zoho CRM',
          submessage: e.message || 'Network communication error'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Are you sure you want to delete client "${client.name}"?`)) return;

    saveToStorage(clients.filter(c => c.id !== client.id));

    if (client.zohoId) {
      try {
        const zohoRes = await deleteZohoClient(client.zohoId);
        if (zohoRes.success) {
          setToast({
            type: 'success',
            message: `Client "${client.name}" Deleted`,
            submessage: `Record #${client.zohoId} deleted from Zoho CRM`
          });
        } else {
          setToast({
            type: 'error',
            message: `Client Deleted Locally (Zoho Delete Failed)`,
            submessage: zohoRes.message || 'Check Zoho CRM record status'
          });
        }
      } catch (zErr: any) {
        console.error('[Zoho CRM] Client delete exception:', zErr);
        setToast({
          type: 'error',
          message: `Client Deleted Locally (Zoho Delete Error)`,
          submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
        });
      }
    } else {
      setToast({
        type: 'success',
        message: `Client "${client.name}" Deleted`,
        submessage: 'Record has been removed locally'
      });
    }
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setFormData({ 
      name: client.name, 
      company: client.company || '', 
      email: client.email || '', 
      phone: client.phone || '', 
      secondaryEmail: client.secondaryEmail || '',
      status: client.status || 'Active' 
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    setFormData(initialFormData);
    setFormErrors({});
  };

  const filteredClients = clients.filter(c => {
    const source = c.source || 'Manual';
    if (activeTab === 'Manual Clients' && source !== 'Manual') return false;
    if (activeTab === 'From Deals' && source !== 'From Deals') return false;
    if (activeTab === 'Zoho CRM' && source !== 'Zoho CRM') return false;
    
    return c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           c.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
           c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (c.phone && c.phone.includes(searchQuery));
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
            <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
            <span className="px-2.5 py-0.5 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
              {clients.length} Total
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">Manage customer database, contact information, and Zoho CRM sync.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleFetchZohoClients(true)}
            disabled={isFetchingZoho}
            className="px-3.5 py-2.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center shadow-sm transition-all disabled:opacity-60"
            title="Fetch live records from Zoho CRM Clients module"
          >
            <RefreshCw size={16} className={`mr-2 text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
            {isFetchingZoho ? 'Fetching Zoho...' : 'Fetch Zoho CRM'}
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-be-orange hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg font-medium flex items-center transition-colors shadow-sm"
          >
            <Plus size={18} className="mr-2" />
            Add Client
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {['All Clients', 'Manual Clients', 'From Deals', 'Zoho CRM'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium text-sm transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-be-orange' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div layoutId="activeClientTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-be-orange" />
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
              placeholder="Search clients by name, company, mobile, or email..." 
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
                <th className="px-6 py-3">Client Name</th>
                <th className="px-6 py-3">Contact Info</th>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Zoho CRM Sync</th>
                <th className="px-6 py-3">Added On</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredClients.map((client) => (
                <tr key={client.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center font-bold mr-3 border border-orange-200 shrink-0 shadow-sm">
                        {client.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{client.name}</div>
                        <div className="text-gray-500 text-xs font-medium">{client.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center text-gray-700 font-medium">
                        <Mail size={14} className="mr-2 text-gray-400 shrink-0" />
                        <span className="truncate max-w-[170px]" title={client.email}>{client.email}</span>
                      </div>
                      <div className="flex items-center text-gray-700 font-medium">
                        <Phone size={14} className="mr-2 text-gray-400 shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center text-gray-800 font-medium">
                      <Building2 size={16} className="mr-2 text-gray-400" />
                      {client.company}
                    </div>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                      client.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-700 border border-gray-200'
                    }`}>
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    {client.zohoStatus === 'synced' || client.zohoId ? (
                      <span 
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm"
                        title={`Zoho Record ID: ${client.zohoId}`}
                      >
                        <Cloud size={13} className="mr-1.5 text-emerald-600" />
                        <span>Zoho #{String(client.zohoId || '').slice(-6)}</span>
                      </span>
                    ) : client.zohoStatus === 'failed' ? (
                      <span 
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm"
                        title={client.zohoError || 'Sync failed'}
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
                    {client.addedOn}
                  </td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleSyncToZoho(client)}
                        disabled={syncingId === client.id}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-50"
                        title={client.zohoId ? 'Re-sync to Zoho CRM' : 'Sync to Zoho CRM Clients Module'}
                      >
                        {syncingId === client.id ? <Loader2 size={16} className="animate-spin text-be-orange" /> : <RefreshCw size={16} />}
                      </button>
                      <button onClick={() => openEditModal(client)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(client)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    {isFetchingZoho ? (
                      <div className="flex flex-col items-center justify-center py-6">
                        <Loader2 className="w-8 h-8 animate-spin text-be-orange mb-3" />
                        <p className="text-sm font-semibold text-gray-800">Fetching live client records from Zoho CRM...</p>
                        <p className="text-xs text-gray-400 mt-1">Connecting to Zoho CRM API v8</p>
                      </div>
                    ) : (
                      <>
                        <UserCircle size={48} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-lg font-medium text-gray-900">No clients found</p>
                        <p className="text-sm">Try adjusting your search query, fetch from Zoho CRM, or add a new client.</p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Centered Modal for Add/Edit Client */}
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
                    <UserCircle size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
                    <p className="text-xs text-gray-500">Synced directly to Zoho CRM Clients module</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                <form id="client-form" onSubmit={handleSaveClient} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Client Name *</label>
                    <input 
                      type="text" 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                      className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm ${formErrors.name ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                      placeholder="e.g. Rajesh Kumar" 
                    />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name *</label>
                    <input 
                      type="text" 
                      value={formData.company} 
                      onChange={e => setFormData({...formData, company: e.target.value})} 
                      className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm ${formErrors.company ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                      placeholder="e.g. Acme Corp" 
                    />
                    {formErrors.company && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.company}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address *</label>
                      <input 
                        type="email" 
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm ${formErrors.email ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                        placeholder="email@example.com" 
                      />
                      {formErrors.email && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Mobile Number *</label>
                      <input 
                        type="tel" 
                        value={formData.phone} 
                        onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} 
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm ${formErrors.phone ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                        placeholder="9876543210" 
                      />
                      {formErrors.phone && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.phone}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Secondary Email <span className="text-gray-400 font-normal">(Optional)</span></label>
                      <input 
                        type="email" 
                        value={formData.secondaryEmail} 
                        onChange={e => setFormData({...formData, secondaryEmail: e.target.value})} 
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm ${formErrors.secondaryEmail ? 'border-red-500 bg-red-50/20' : 'border-gray-300 bg-white'}`} 
                        placeholder="alt.email@example.com" 
                      />
                      {formErrors.secondaryEmail && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.secondaryEmail}</p>}
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
                  onClick={closeModal} 
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  form="client-form"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-be-orange hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50 text-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Syncing to Zoho...</span>
                    </>
                  ) : (
                    <span>{editingClient ? 'Save Changes' : 'Create & Sync to Zoho'}</span>
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

