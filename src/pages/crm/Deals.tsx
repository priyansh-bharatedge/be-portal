import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Filter, X, UploadCloud, ChevronRight, Check, Trash2, ChevronDown, Eye, Edit, RefreshCw, Cloud, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveDocument } from '../../lib/db';
import {
  saveOrUpdateZohoDeal,
  deleteZohoDeal,
  fetchZohoDeals,
  uploadZohoAttachment,
  saveOrUpdateZohoCompany,
  saveOrUpdateZohoClient,
  deleteZohoRecord
} from '../../services/zohoService';

interface DealService {
  id: string;
  name: string;
  totalAmount?: string;
  baseAmount?: string;
}

export const Deals = () => {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState('All Deals');

  // Zoho CRM states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [formData, setFormData] = useState({
    clientName: '', mobile: '', email: '', gender: 'Male',
    panCard: '', aadhaarCard: '', city: '', state: '',
    companyName: '', businessType: '', doi: '', gstNumber: '',
    companyPan: '', sector: 'IT', industry: 'Software'
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dealServices, setDealServices] = useState<DealService[]>([]);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [paymentScreenshotName, setPaymentScreenshotName] = useState<string>('');
  const [paymentScreenshotFile, setPaymentScreenshotFile] = useState<File | null>(null);

  // Document Upload State
  const [documents, setDocuments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allServices = [
    'Private Limited Company', 'One Person Company Registration', 'Limited Liability Partnership',
    'Partnership Firm Registration (ROF)', 'Section 8 Company', '12A and 80G Registration', 'NGO Darpan',
    'Trademark Registration', 'Patent', 'Copyright Registration',
    'Shram Suvidha Registration', 'START-UP India Certificate', 'GeM Registration',
    'Tax Exemption Certificate', 'ZED Certificate', 'ISO Certificate',
    'GST Registration & Certificate', 'FSSAI Certificate', 'IEC Certificate',
    'Udhyam Registration', 'Psara Certificate',
    'Surge Growth Fund', 'Global Innovation Fund', 'Seed Support Scheme',
    'Agri Preneurs', 'MSME Design', 'Gujarat Innovators', 'iStart Rajasthan',
    'Animal Husbandry (AHIDF)', 'Credit Guarantee (CGSS)', 'Gujarat Samriddhi Yojana',
    'Venture Capital', 'Working Capital (CGTMSE Loan)', 'NAIFF', 'PMEGP LOAN',
    'MUDRA LOAN', 'PMFME', 'Maha Udyog Yojana (CMEGP)',
    'Rajasthan Investment Promotion Scheme', 'Rajasthan MSME Policy 2024',
    'RIICO Scheme', 'MSME Innovation & Loan Scheme (RSFC)', 'IPO Consulting Services',
    'Bhaskar ID', 'Financial Model', 'Company Valuation', 'Detailed Project Report (DPR)',
    'Investor deck', 'Performance PPC', 'High-Impact SEO', 'Content Strategy',
    'Website Development', 'CRM Solutions', 'Logo Designing', 'Graphic Designing',
    'AI Agents',
    'Annual Based Compliance for Pvt Ltd', 'Event Based Compliance for Pvt Ltd',
    'Annual Based Compliance for Sec 8', 'Event Based Compliance for Sec 8',
    'Annual Based Compliance for LLP', 'Event Based Compliance for LLP'
  ].sort();

  const handleOpenModal = (deal?: any) => {
    setIsCreateModalOpen(true);
    setCurrentStep(1);
    setFormErrors({});
    setFileError('');
    setDocuments([]);

    if (deal && deal.id && deal.id.startsWith('DL-')) {
      setEditingDealId(deal.id);
      setFormData(deal.formData || {
        clientName: deal.client || '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        companyName: deal.company || '', businessType: '', doi: '', gstNumber: ''
      });
      setDealServices((deal.servicesData || []).map((s: any) => {
        const t = s.totalAmount !== undefined 
          ? String(s.totalAmount) 
          : (s.baseAmount ? String(Number((Number(s.baseAmount) / 0.82).toFixed(2))) : '');
        const b = s.baseAmount !== undefined 
          ? String(s.baseAmount) 
          : (t ? String(Number((Number(t) * 0.82).toFixed(2))) : '');
        return {
          id: s.id || Math.random().toString(),
          name: s.name || '',
          totalAmount: t,
          baseAmount: b,
        };
      }));
      setAmountReceived(deal.totals?.amountReceived || (deal.received ? deal.received.replace(/[^0-9]/g, '') : ''));
      setPaymentScreenshotName(deal.paymentScreenshotName || '');
      setPaymentScreenshotFile(null);
    } else {
      setEditingDealId(null);
      setFormData({
        clientName: '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        companyName: '', businessType: '', doi: '', gstNumber: '',
        companyPan: '', sector: 'IT', industry: 'Software'
      });
      setDealServices([]);
      setAmountReceived('');
      setPaymentScreenshotName('');
      setPaymentScreenshotFile(null);
    }
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setTimeout(() => {
      setCurrentStep(1);
      setEditingDealId(null);
      setFormData({
        clientName: '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        companyName: '', businessType: '', doi: '', gstNumber: '',
        companyPan: '', sector: 'IT', industry: 'Software'
      });
      setFormErrors({});
      setDealServices([]);
      setAmountReceived('');
      setDocuments([]);
      setFileError('');
    }, 300);
  };

  const validateStep = (step: number) => {
    const errors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.clientName) errors.clientName = 'Client Name is required';

      if (!formData.mobile) {
        errors.mobile = 'Mobile Number is required';
      } else if (!/^[0-9]{10}$/.test(formData.mobile.replace(/[^0-9]/g, ''))) {
        errors.mobile = 'Enter a valid 10-digit mobile number';
      }

      if (!formData.email) {
        errors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = 'Enter a valid email address';
      }

      if (!formData.panCard) {
        errors.panCard = 'PAN Card is required';
      } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(formData.panCard)) {
        errors.panCard = 'Enter a valid PAN format (e.g., ABCDE1234F)';
      }

      if (formData.aadhaarCard && !/^[0-9]{12}$/.test(formData.aadhaarCard.replace(/[^0-9]/g, ''))) {
        errors.aadhaarCard = 'Aadhaar must be 12 digits';
      }

      if (!formData.city) errors.city = 'City is required';
      if (!formData.state) errors.state = 'State is required';
    } else if (step === 2) {
      if (formData.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(formData.gstNumber.replace(/[^a-zA-Z0-9]/g, ''))) {
        errors.gstNumber = 'Enter a valid GSTIN format';
      }

      if (formData.companyPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(formData.companyPan)) {
        errors.companyPan = 'Enter a valid PAN format (e.g., ABCDE1234F)';
      }
    } else if (step === 3) {
      if (dealServices.length === 0) errors.services = 'Add at least one service';
      if (dealServices.some(s => !s.totalAmount && !s.baseAmount)) errors.totalAmount = 'Enter total amounts for all selected services';
      if (!amountReceived || amountReceived.trim() === '') errors.amountReceived = 'Amount Received is required';
      if (!paymentScreenshotFile && !paymentScreenshotName) errors.paymentScreenshot = 'Payment Screenshot is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const toggleService = (serviceName: string) => {
    const exists = dealServices.find(s => s.name === serviceName);
    if (exists) {
      setDealServices(dealServices.filter(s => s.name !== serviceName));
    } else {
      setDealServices([
        ...dealServices,
        { id: Math.random().toString(), name: serviceName, totalAmount: '', baseAmount: '' }
      ]);
    }
  };

  const clearServices = () => {
    setDealServices([]);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsServiceDropdownOpen(false);
      }
      if (!event.defaultPrevented && !(event.target as Element).closest('.service-dropdown-container')) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateService = (id: string, field: keyof DealService, value: any) => {
    setDealServices(dealServices.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: value };
        if (field === 'totalAmount') {
          const tNum = Number(value) || 0;
          const gstVal = Number((tNum * 0.18).toFixed(2));
          updated.baseAmount = tNum > 0 ? String(Number((tNum - gstVal).toFixed(2))) : '';
        }
        return updated;
      }
      return s;
    }));
  };

  const removeService = (id: string) => {
    setDealServices(dealServices.filter(s => s.id !== id));
  };

  const addBlankService = () => {
    setDealServices([
      ...dealServices,
      { id: Math.random().toString(), name: '', totalAmount: '', baseAmount: '' }
    ]);
  };

  const grandTotal = Number(dealServices.reduce((sum, s) => {
    const total = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) / 0.82).toFixed(2)) : 0);
    return sum + total;
  }, 0).toFixed(2));

  const totalGst = Number(dealServices.reduce((sum, s) => {
    const total = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) / 0.82).toFixed(2)) : 0);
    const gst = total > 0 ? Number((total * 0.18).toFixed(2)) : 0;
    return sum + gst;
  }, 0).toFixed(2));

  const subtotal = Number((grandTotal - totalGst).toFixed(2));
  const pendingAmount = Number((grandTotal - (Number(amountReceived) || 0)).toFixed(2));

  // Document Upload Handlers
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const validateAndAddFiles = (files: FileList | File[]) => {
    setFileError('');
    const newFiles = Array.from(files);
    const validFiles: File[] = [];
    let errorMsg = '';

    for (const file of newFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const isAllowedExt = extension && ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'].includes(extension);

      if (!ALLOWED_TYPES.includes(file.type) && !isAllowedExt) {
        errorMsg = `Unsupported file type for ${file.name}. Allowed: PDF, JPG, PNG, DOC.`;
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        errorMsg = `File ${file.name} is too large. Max size is 10MB.`;
        break;
      }
      // Check for duplicates
      if (documents.some(d => d.name === file.name && d.size === file.size)) {
        continue; // skip duplicate
      }
      validFiles.push(file);
    }

    if (errorMsg) {
      setFileError(errorMsg);
    }

    if (validFiles.length > 0) {
      setDocuments(prev => [...prev, ...validFiles]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  }, [documents]);

  const removeDocument = (index: number) => {
    setDocuments(docs => docs.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handlePreview = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
  };

  const [deals, setDeals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return [];
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Won': return 'bg-emerald-100 text-emerald-700';
      case 'Negotiation': return 'bg-blue-100 text-blue-700';
      case 'Proposal': return 'bg-orange-100 text-orange-700';
      case 'Qualified': return 'bg-purple-100 text-purple-700';
      case 'New': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleCreateDeal = async () => {
    setIsSubmitting(true);
    const dealId = editingDealId || `DL-${Math.floor(1000 + Math.random() * 9000)}`;
    const isEditing = Boolean(editingDealId);
    const existingDeal = deals.find((d: any) => d.id === editingDealId);

    // 1. Save actual files to IndexedDB
    const docsToSave: any[] = existingDeal?.documentsData ? [...existingDeal.documentsData] : [];

    if (paymentScreenshotFile) {
      const docId = `${dealId || 'ID'}_payment_${paymentScreenshotFile.name}`;
      try {
        await saveDocument(docId, paymentScreenshotFile);
      } catch (e) {
        console.error('Failed to save payment screenshot', e);
      }
    }
    for (const d of documents) {
      const docId = `${dealId}_${d.name}`;
      try {
        await saveDocument(docId, d);
        docsToSave.push({ id: docId, name: d.name, size: d.size, type: d.type });
      } catch (e) {
        console.error('Failed to save document to IndexedDB', e);
        docsToSave.push({ id: docId, name: d.name, size: d.size, type: d.type });
      }
    }

    // 2. Automatically Create/Sync Company in local CRM and Zoho CRM
    let companyZohoId: string | undefined = existingDeal?.companyZohoId;
    let companySavedLocally: any = null;

    if (formData.companyName && formData.companyName.trim()) {
      try {
        const rawCompanies = localStorage.getItem('be_companies');
        const existingCompanies = rawCompanies ? JSON.parse(rawCompanies) : [];
        const existingComp = existingCompanies.find((c: any) => c.name?.toLowerCase() === formData.companyName.trim().toLowerCase());

        companySavedLocally = {
          id: existingComp?.id || `CMP-${Math.floor(1000 + Math.random() * 9000)}`,
          name: formData.companyName.trim(),
          type: formData.businessType || existingComp?.type || 'Private Limited',
          gstNumber: formData.gstNumber ? formData.gstNumber.toUpperCase() : (existingComp?.gstNumber || ''),
          doi: formData.doi || existingComp?.doi || '',
          email: formData.email || existingComp?.email || '',
          status: 'Active',
          source: existingComp?.source || 'From Deals',
          addedOn: existingComp?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoId: existingComp?.zohoId,
          zohoStatus: existingComp?.zohoStatus || 'pending'
        };

        // Sync to Zoho CRM if not synced yet
        if (!companySavedLocally.zohoId) {
          try {
            const compZohoRes = await saveOrUpdateZohoCompany(companySavedLocally);
            if (compZohoRes.success && compZohoRes.zohoId) {
              companySavedLocally.zohoId = compZohoRes.zohoId;
              companySavedLocally.zohoStatus = 'synced';
              companySavedLocally.zohoSyncedAt = new Date().toISOString();
            }
          } catch (cErr) {
            console.warn('[Zoho CRM] Company sync during deal creation failed:', cErr);
          }
        }

        companyZohoId = companySavedLocally.zohoId;

        // Save to be_companies in localStorage
        const updatedCompaniesList = existingComp 
          ? existingCompanies.map((c: any) => c.id === existingComp.id ? { ...c, ...companySavedLocally } : c)
          : [companySavedLocally, ...existingCompanies];
        localStorage.setItem('be_companies', JSON.stringify(updatedCompaniesList));
      } catch (compErr) {
        console.warn('Auto-saving company failed:', compErr);
      }
    }

    // 3. Automatically Create/Sync Client in local CRM and Zoho CRM
    let clientZohoId: string | undefined = existingDeal?.clientZohoId;
    let clientSavedLocally: any = null;

    if (formData.clientName && formData.clientName.trim()) {
      try {
        const rawClients = localStorage.getItem('be_clients');
        const existingClients = rawClients ? JSON.parse(rawClients) : [];
        const existingClient = existingClients.find((cl: any) => 
          (cl.email && formData.email && cl.email.toLowerCase() === formData.email.trim().toLowerCase()) ||
          (cl.phone && formData.mobile && cl.phone === formData.mobile.replace(/[^0-9]/g, '')) ||
          (cl.name?.toLowerCase() === formData.clientName.trim().toLowerCase())
        );

        clientSavedLocally = {
          id: existingClient?.id || `CL-${Math.floor(1000 + Math.random() * 9000)}`,
          name: formData.clientName.trim(),
          company: formData.companyName ? formData.companyName.trim() : (existingClient?.company || 'Individual'),
          email: formData.email ? formData.email.trim() : (existingClient?.email || ''),
          phone: formData.mobile ? formData.mobile.replace(/[^0-9]/g, '') : (existingClient?.phone || ''),
          status: 'Active',
          source: existingClient?.source || 'From Deals',
          addedOn: existingClient?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoId: existingClient?.zohoId,
          zohoStatus: existingClient?.zohoStatus || 'pending'
        };

        // Sync to Zoho CRM if not synced yet
        if (!clientSavedLocally.zohoId) {
          try {
            const clientZohoRes = await saveOrUpdateZohoClient(clientSavedLocally);
            if (clientZohoRes.success && clientZohoRes.zohoId) {
              clientSavedLocally.zohoId = clientZohoRes.zohoId;
              clientSavedLocally.zohoStatus = 'synced';
              clientSavedLocally.zohoSyncedAt = new Date().toISOString();
            }
          } catch (clErr) {
            console.warn('[Zoho CRM] Client sync during deal creation failed:', clErr);
          }
        }

        clientZohoId = clientSavedLocally.zohoId;

        // Save to be_clients in localStorage
        const updatedClientsList = existingClient
          ? existingClients.map((cl: any) => cl.id === existingClient.id ? { ...cl, ...clientSavedLocally } : cl)
          : [clientSavedLocally, ...existingClients];
        localStorage.setItem('be_clients', JSON.stringify(updatedClientsList));
      } catch (clErr) {
        console.warn('Auto-saving client failed:', clErr);
      }
    }

    // 4. Build Deal Object with Linked Company and Client Zoho IDs
    const dealData: any = {
      id: dealId,
      client: formData.clientName,
      company: formData.companyName,
      companyZohoId: companyZohoId,
      clientZohoId: clientZohoId,
      service: dealServices.length === 1 ? dealServices[0].name : dealServices.length > 1 ? `${dealServices.length} Services` : 'Custom Services',
      amount: `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      received: `₹${(Number(amountReceived) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      pending: `₹${pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      status: existingDeal?.status || 'New',
      stage: existingDeal?.stage || 'Sales',
      owner: existingDeal?.owner || 'Admin',
      date: existingDeal?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      source: existingDeal?.source || 'Manual',
      // Full details
      formData: { ...formData, companyZohoId, clientZohoId },
      servicesData: dealServices.map(s => {
        const t = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) / 0.82).toFixed(2)) : 0);
        const gstVal = t > 0 ? Number((t * 0.18).toFixed(2)) : 0;
        const b = t > 0 ? Number((t - gstVal).toFixed(2)) : (Number(s.baseAmount) || 0);
        return {
          ...s,
          totalAmount: String(t || s.totalAmount || ''),
          baseAmount: String(b || s.baseAmount || '')
        };
      }),
      totals: { subtotal, totalGst, grandTotal, amountReceived, pendingAmount },
      paymentScreenshotName: paymentScreenshotName,
      documentsData: docsToSave,
      zohoId: existingDeal?.zohoId || undefined,
      zohoStatus: existingDeal?.zohoStatus || 'pending',
    };

    // 5. Call Zoho CRM REST API to insert or update record in Deals module
    try {
      const zohoRes = await saveOrUpdateZohoDeal(dealData);
      const finalZohoId = zohoRes.zohoId || dealData.zohoId;

      if (zohoRes.success && finalZohoId) {
        dealData.zohoId = finalZohoId;
        dealData.zohoStatus = 'synced';
        dealData.zohoSyncedAt = new Date().toISOString();

        // Upload attached payment screenshot & documents to Zoho CRM record if any
        if (paymentScreenshotFile) {
          try {
            await uploadZohoAttachment(finalZohoId, paymentScreenshotFile, paymentScreenshotFile.name, 'Deals');
          } catch (attErr) {
            console.warn('[Zoho CRM] Payment screenshot attachment failed:', attErr);
          }
        }
        for (const docFile of documents) {
          try {
            await uploadZohoAttachment(finalZohoId, docFile, docFile.name, 'Deals');
          } catch (attErr) {
            console.warn('[Zoho CRM] Document attachment failed:', attErr);
          }
        }

        const syncSummary = [
          `Deal #${finalZohoId}`,
          companyZohoId ? `Company #${companyZohoId}` : null,
          clientZohoId ? `Client #${clientZohoId}` : null
        ].filter(Boolean).join(' • ');

        setToast({
          type: 'success',
          message: isEditing ? 'Deal Updated & Synced to Zoho CRM!' : 'Deal, Client & Company Synced to Zoho CRM!',
          submessage: syncSummary
        });
      } else {
        dealData.zohoStatus = 'failed';
        dealData.zohoError = zohoRes.message;
        setToast({
          type: 'error',
          message: `Deal Saved Locally (Zoho ${isEditing ? 'Update' : 'Sync'} Failed)`,
          submessage: zohoRes.message || 'Check Zoho CRM credentials or field requirements'
        });
      }
    } catch (zErr: any) {
      console.error('Zoho CRM sync error:', zErr);
      dealData.zohoStatus = 'failed';
      dealData.zohoError = zErr?.message || 'Sync failed';
      setToast({
        type: 'error',
        message: `Deal Saved Locally (Zoho ${isEditing ? 'Update' : 'Sync'} Error)`,
        submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
      });
    }

    let newDealsList;
    if (editingDealId) {
      // Retain old status/date/owner if editing
      newDealsList = deals.map((d: any) => {
        if (d.id === editingDealId) {
          return {
            ...dealData,
            status: d.status,
            owner: d.owner,
            date: d.date,
            zohoId: dealData.zohoId || d.zohoId,
            zohoStatus: dealData.zohoStatus || d.zohoStatus
          };
        }
        return d;
      });
    } else {
      newDealsList = [dealData, ...deals];
    }

    setDeals(newDealsList);
    localStorage.setItem('be_deals', JSON.stringify(newDealsList));

    setIsSubmitting(false);
    handleCloseModal();
  };

  const handleDeleteDeal = async (deal: any) => {
    const dealName = deal.formData?.clientName || deal.client || deal.id;
    if (confirm(`Are you sure you want to delete deal "${dealName}"?`)) {
      const newDealsList = deals.filter((d: any) => d.id !== deal.id);
      setDeals(newDealsList);
      localStorage.setItem('be_deals', JSON.stringify(newDealsList));

      if (deal.zohoId) {
        try {
          const zohoRes = await deleteZohoDeal(deal.zohoId);
          if (zohoRes.success) {
            setToast({
              type: 'success',
              message: `Deal "${dealName}" Deleted`,
              submessage: `Record has been deleted successfully from Zoho CRM (ID: #${deal.zohoId})`
            });
          } else {
            setToast({
              type: 'error',
              message: `Deal Deleted Locally (Zoho Delete Failed)`,
              submessage: zohoRes.message || 'Failed to delete record from Zoho CRM'
            });
          }
        } catch (zErr: any) {
          console.error('[Zoho CRM] Delete error:', zErr);
          setToast({
            type: 'error',
            message: `Deal Deleted Locally (Zoho Delete Error)`,
            submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
          });
        }
      } else {
        setToast({
          type: 'success',
          message: `Deal "${dealName}" Deleted`,
          submessage: 'Record has been deleted successfully'
        });
      }
    }
  };

  const handleManualSyncDeal = async (deal: any) => {
    setSyncingId(deal.id);
    try {
      // 1. Ensure Company is created and synced if present
      let companyZohoId = deal.companyZohoId || deal.formData?.companyZohoId;
      const compName = deal.company || deal.formData?.companyName;
      if (compName && compName !== 'N/A' && !companyZohoId) {
        const rawCompanies = localStorage.getItem('be_companies');
        const existingCompanies = rawCompanies ? JSON.parse(rawCompanies) : [];
        const existingComp = existingCompanies.find((c: any) => c.name?.toLowerCase() === compName.trim().toLowerCase());
        const companyToSave: any = {
          id: existingComp?.id || `CMP-${Math.floor(1000 + Math.random() * 9000)}`,
          name: compName.trim(),
          type: deal.formData?.businessType || existingComp?.type || 'Private Limited',
          gstNumber: deal.formData?.gstNumber ? deal.formData.gstNumber.toUpperCase() : (existingComp?.gstNumber || ''),
          doi: deal.formData?.doi || existingComp?.doi || '',
          email: deal.formData?.email || existingComp?.email || '',
          status: 'Active',
          source: existingComp?.source || 'From Deals',
          addedOn: existingComp?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoId: existingComp?.zohoId,
          zohoStatus: existingComp?.zohoStatus || 'pending'
        };
        try {
          const cRes = await saveOrUpdateZohoCompany(companyToSave);
          if (cRes.success && cRes.zohoId) {
            companyToSave.zohoId = cRes.zohoId;
            companyToSave.zohoStatus = 'synced';
            companyToSave.zohoSyncedAt = new Date().toISOString();
            companyZohoId = cRes.zohoId;
          }
        } catch (e) {
          console.warn('Company sync during deal manual sync failed:', e);
        }
        const updatedCompaniesList = existingComp 
          ? existingCompanies.map((c: any) => c.id === existingComp.id ? { ...c, ...companyToSave } : c)
          : [companyToSave, ...existingCompanies];
        localStorage.setItem('be_companies', JSON.stringify(updatedCompaniesList));
      }

      // 2. Ensure Client is created and synced if present
      let clientZohoId = deal.clientZohoId || deal.formData?.clientZohoId;
      const clientName = deal.client || deal.formData?.clientName;
      if (clientName && clientName !== 'Client' && !clientZohoId) {
        const rawClients = localStorage.getItem('be_clients');
        const existingClients = rawClients ? JSON.parse(rawClients) : [];
        const existingClient = existingClients.find((cl: any) => 
          (cl.name?.toLowerCase() === clientName.trim().toLowerCase()) ||
          (cl.email && deal.formData?.email && cl.email.toLowerCase() === deal.formData.email.trim().toLowerCase())
        );
        const clientToSave: any = {
          id: existingClient?.id || `CL-${Math.floor(1000 + Math.random() * 9000)}`,
          name: clientName.trim(),
          company: compName ? compName.trim() : (existingClient?.company || 'Individual'),
          email: deal.formData?.email ? deal.formData.email.trim() : (existingClient?.email || ''),
          phone: deal.formData?.mobile ? deal.formData.mobile.replace(/[^0-9]/g, '') : (existingClient?.phone || ''),
          status: 'Active',
          source: existingClient?.source || 'From Deals',
          addedOn: existingClient?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoId: existingClient?.zohoId,
          zohoStatus: existingClient?.zohoStatus || 'pending'
        };
        try {
          const clRes = await saveOrUpdateZohoClient(clientToSave);
          if (clRes.success && clRes.zohoId) {
            clientToSave.zohoId = clRes.zohoId;
            clientToSave.zohoStatus = 'synced';
            clientToSave.zohoSyncedAt = new Date().toISOString();
            clientZohoId = clRes.zohoId;
          }
        } catch (e) {
          console.warn('Client sync during deal manual sync failed:', e);
        }
        const updatedClientsList = existingClient
          ? existingClients.map((cl: any) => cl.id === existingClient.id ? { ...cl, ...clientToSave } : cl)
          : [clientToSave, ...existingClients];
        localStorage.setItem('be_clients', JSON.stringify(updatedClientsList));
      }

      // 3. Save or update the deal in Zoho CRM
      const dealWithLookups = {
        ...deal,
        companyZohoId: companyZohoId || deal.companyZohoId,
        clientZohoId: clientZohoId || deal.clientZohoId,
      };

      const zohoRes = await saveOrUpdateZohoDeal(dealWithLookups);
      if (zohoRes.success && zohoRes.zohoId) {
        const updatedList = deals.map((d: any) => 
          d.id === deal.id ? {
            ...d,
            zohoId: zohoRes.zohoId,
            companyZohoId: companyZohoId || d.companyZohoId,
            clientZohoId: clientZohoId || d.clientZohoId,
            zohoStatus: 'synced',
            zohoSyncedAt: new Date().toISOString(),
            zohoError: undefined
          } : d
        );
        setDeals(updatedList);
        localStorage.setItem('be_deals', JSON.stringify(updatedList));
        setToast({
          type: 'success',
          message: `Deal Synced to Zoho CRM!`,
          submessage: `Zoho Record ID: #${zohoRes.zohoId}`
        });
      } else {
        const updatedList = deals.map((d: any) => 
          d.id === deal.id ? { ...d, zohoStatus: 'failed', zohoError: zohoRes.message } : d
        );
        setDeals(updatedList);
        localStorage.setItem('be_deals', JSON.stringify(updatedList));
        setToast({
          type: 'error',
          message: `Zoho CRM Sync Failed`,
          submessage: zohoRes.message || 'Please check field requirements or authentication'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Zoho CRM Sync Error`,
        submessage: err?.message || 'Failed to communicate with Zoho CRM'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleFetchFromZoho = async () => {
    setIsFetchingZoho(true);
    try {
      const result = await fetchZohoDeals();
      if (result.success && Array.isArray(result.data)) {
        let countAdded = 0;
        let countUpdated = 0;
        const currentDeals = [...deals];

        result.data.forEach((zDeal: any) => {
          const existingIdx = currentDeals.findIndex((d: any) => 
            d.zohoId === zDeal.id || (zDeal.Deal_Name && d.id && zDeal.Deal_Name.includes(d.id))
          );

          const servicesFromSubform = Array.isArray(zDeal.Subform_1) && zDeal.Subform_1.length > 0
            ? zDeal.Subform_1.map((sf: any, i: number) => {
                const agreementAmount = sf.Agreement_amount || 0;
                const withoutGst = sf.Without_GST || (agreementAmount > 0 ? Number((agreementAmount * 0.82).toFixed(2)) : 0);
                const totalAmt = agreementAmount || (withoutGst > 0 ? Number((withoutGst / 0.82).toFixed(2)) : 0);
                return {
                  id: String(sf.id || i + 1),
                  name: sf.Schemas || 'Website Development',
                  totalAmount: String(totalAmt || ''),
                  baseAmount: String(withoutGst || 0),
                };
              })
            : (currentDeals[existingIdx]?.servicesData || []);

          const serviceTitle = servicesFromSubform.length === 1 
            ? servicesFromSubform[0].name 
            : servicesFromSubform.length > 1 
              ? `${servicesFromSubform.length} Services` 
              : (currentDeals[existingIdx]?.service || 'Services');

          const dealObj: any = {
            id: currentDeals[existingIdx]?.id || `DL-${Math.floor(1000 + Math.random() * 9000)}`,
            client: zDeal.Contact_Name || zDeal.Name || currentDeals[existingIdx]?.client || 'Client',
            company: zDeal.Account_Name?.name || zDeal.Company_Name || currentDeals[existingIdx]?.company || 'N/A',
            service: serviceTitle,
            amount: zDeal.Amount ? `₹${Number(zDeal.Amount).toLocaleString()}` : (currentDeals[existingIdx]?.amount || '₹0'),
            received: currentDeals[existingIdx]?.received || (zDeal.Deal_Received_Amount ? `₹${Number(zDeal.Deal_Received_Amount).toLocaleString()}` : '₹0'),
            pending: currentDeals[existingIdx]?.pending || (zDeal.Deal_Pending_Amount ? `₹${Number(zDeal.Deal_Pending_Amount).toLocaleString()}` : zDeal.Amount ? `₹${Number(zDeal.Amount).toLocaleString()}` : '₹0'),
            status: zDeal.Stage === 'Closed Won' ? 'Won' : zDeal.Stage === 'Closed Lost' ? 'Lost' : zDeal.Stage || 'New',
            owner: zDeal.Owner?.name || currentDeals[existingIdx]?.owner || 'Admin',
            date: zDeal.Closing_Date ? new Date(zDeal.Closing_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (currentDeals[existingIdx]?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })),
            source: currentDeals[existingIdx]?.source || 'Zoho CRM',
            zohoId: zDeal.id,
            zohoStatus: 'synced',
            zohoSyncedAt: new Date().toISOString(),
            formData: currentDeals[existingIdx]?.formData || {
              clientName: zDeal.Contact_Name || zDeal.Name || '',
              companyName: zDeal.Account_Name?.name || zDeal.Company_Name || '',
              email: zDeal.Email || '',
              mobile: zDeal.Mobile || '',
            },
            servicesData: servicesFromSubform,
            totals: currentDeals[existingIdx]?.totals || {
              grandTotal: zDeal.Amount || 0,
            }
          };

          if (existingIdx >= 0) {
            currentDeals[existingIdx] = { ...currentDeals[existingIdx], ...dealObj };
            countUpdated++;
          } else {
            currentDeals.unshift(dealObj);
            countAdded++;
          }

          // Also populate local companies and clients if missing
          try {
            if (dealObj.company && dealObj.company !== 'N/A') {
              const rawCompanies = localStorage.getItem('be_companies');
              const localCompanies = rawCompanies ? JSON.parse(rawCompanies) : [];
              if (!localCompanies.some((c: any) => c.name?.toLowerCase() === dealObj.company.toLowerCase())) {
                localCompanies.unshift({
                  id: `CMP-${Math.floor(1000 + Math.random() * 9000)}`,
                  name: dealObj.company,
                  type: 'Private Limited',
                  gstNumber: zDeal.Gst_number || '',
                  doi: '',
                  email: zDeal.Client_Email_address || zDeal.Email || '',
                  status: 'Active',
                  source: 'From Deals (Zoho)',
                  addedOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                  zohoStatus: 'synced'
                });
                localStorage.setItem('be_companies', JSON.stringify(localCompanies));
              }
            }

            if (dealObj.client && dealObj.client !== 'Client') {
              const rawClients = localStorage.getItem('be_clients');
              const localClients = rawClients ? JSON.parse(rawClients) : [];
              if (!localClients.some((cl: any) => cl.name?.toLowerCase() === dealObj.client.toLowerCase())) {
                localClients.unshift({
                  id: `CL-${Math.floor(1000 + Math.random() * 9000)}`,
                  name: dealObj.client,
                  company: dealObj.company || 'Individual',
                  email: zDeal.Client_Email_address || zDeal.Email || '',
                  phone: zDeal.Client_contact_detail || zDeal.Mobile || '',
                  status: 'Active',
                  source: 'From Deals (Zoho)',
                  addedOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                  zohoStatus: 'synced'
                });
                localStorage.setItem('be_clients', JSON.stringify(localClients));
              }
            }
          } catch (populateErr) {
            console.warn('Auto-populating companies/clients from fetched deals failed:', populateErr);
          }
        });

        setDeals(currentDeals);
        localStorage.setItem('be_deals', JSON.stringify(currentDeals));

        setToast({
          type: 'success',
          message: 'Zoho Deals Synchronized',
          submessage: `Fetched ${result.data.length} records from Zoho CRM (${countAdded} new, ${countUpdated} updated)`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Failed to Fetch from Zoho CRM',
          submessage: result.message || 'No records returned or connection error'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Fetch Error',
        submessage: err?.message || 'Could not communicate with Zoho CRM endpoint'
      });
    } finally {
      setIsFetchingZoho(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[999] max-w-md p-4 rounded-xl shadow-2xl border flex items-start space-x-3 backdrop-blur-md ${toast.type === 'success'
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
              <Cloud className="w-5 h-5 text-sky-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-semibold text-sm">{toast.message}</p>
              {toast.submessage && <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{toast.submessage}</p>}
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
          <p className="text-sm text-gray-500 mt-1">Manage all your active and past deals.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search deals..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none"
            />
          </div>
          <button
            onClick={handleFetchFromZoho}
            disabled={isFetchingZoho}
            className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            title="Fetch and sync live deals from Zoho CRM"
          >
            <RefreshCw size={15} className={`mr-2 text-gray-600 ${isFetchingZoho ? 'animate-spin' : ''}`} />
            {isFetchingZoho ? 'Fetching...' : 'Fetch from Zoho'}
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-be-orange text-white rounded-lg text-sm font-medium hover:bg-be-orangeHover transition-colors shadow-sm"
          >
            <Plus size={16} className="mr-2" />
            Create Deal
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {['All Deals', 'Manual Deals', 'From Quotations'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === tab ? 'text-be-orange' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-be-orange" />
            )}
          </button>
        ))}
      </div>

      {/* Deals Table */}
      <div className="bg-transparent overflow-hidden mt-6">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Deal ID</th>
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Service</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Received</th>
                <th className="px-6 py-3">Pending</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Zoho Sync</th>
                <th className="px-6 py-3">Owner</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {deals.filter((deal: any) => {
                if (activeTab === 'Manual Deals') return deal.source !== 'Quotation';
                if (activeTab === 'From Quotations') return deal.source === 'Quotation';
                return true;
              }).map((deal: any) => (
                <tr key={deal.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 font-bold text-gray-900 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">{deal.id}</td>
                  <td className="px-6 py-5 font-medium border-t border-b border-gray-100 group-hover:border-orange-100">{deal.client}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className="bg-gray-50 text-gray-600 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 group-hover:bg-white transition-colors">{deal.company}</span>
                  </td>
                  <td className="px-6 py-5 font-medium text-gray-800 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.service}</td>
                  <td className="px-6 py-5 font-bold text-gray-900 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.amount}</td>
                  <td className="px-6 py-5 font-bold text-emerald-600 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.received}</td>
                  <td className="px-6 py-5 font-bold text-orange-600 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.pending}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(deal.status)}`}>
                      {deal.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center space-x-2">
                      {deal.zohoStatus === 'synced' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Cloud className="w-3 h-3 mr-1 text-emerald-600" />
                          Synced {deal.zohoId ? `#${deal.zohoId.slice(-4)}` : ''}
                        </span>
                      ) : deal.zohoStatus === 'failed' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200" title={deal.zohoError}>
                          <AlertCircle className="w-3 h-3 mr-1 text-rose-600" />
                          Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <Cloud className="w-3 h-3 mr-1 text-amber-600 opacity-60" />
                          Pending
                        </span>
                      )}
                      {deal.zohoStatus !== 'synced' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleManualSyncDeal(deal); }}
                          disabled={syncingId === deal.id}
                          className="p-1 hover:bg-orange-100 text-orange-600 rounded transition-colors"
                          title="Retry sync with Zoho CRM"
                        >
                          <RefreshCw size={12} className={syncingId === deal.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 font-medium border-t border-b border-gray-100 group-hover:border-orange-100 flex items-center space-x-2">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-gray-200 to-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                      {deal.owner ? deal.owner.charAt(0) : '?'}
                    </div>
                    <span>{deal.owner || 'Admin'}</span>
                  </td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        title="View Deal"
                        onClick={(e) => { e.stopPropagation(); navigate(`/crm/deals/${deal.id}`); }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Deal"
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(deal); }}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete Deal"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDeal(deal);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Deal Modal Drawer */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsCreateModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                <h2 className="text-xl font-bold text-gray-900">{editingDealId ? `Edit Deal (${editingDealId})` : 'Create New Deal'}</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100">
                  <X size={20} />
                </button>
              </div>

              {/* Stepper */}
              <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  {['Client Info', 'Company Details', 'Services', 'Documents'].map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center relative w-1/4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm mb-2 z-10 
                        ${currentStep > idx + 1 ? 'bg-emerald-500 text-white' : currentStep === idx + 1 ? 'bg-be-orange text-white ring-4 ring-orange-100' : 'bg-gray-200 text-gray-500'}`}>
                        {currentStep > idx + 1 ? <Check size={16} /> : idx + 1}
                      </div>
                      <span className={`text-xs font-medium text-center ${currentStep >= idx + 1 ? 'text-gray-900' : 'text-gray-400'}`}>{step}</span>
                      {idx < 3 && (
                        <div className={`absolute top-4 left-[50%] w-[100%] h-0.5 -z-0 
                          ${currentStep > idx + 1 ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Content */}
              <div className="flex-1 overflow-y-auto p-8 bg-white">
                {currentStep === 1 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Client Information</h3>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                        <input type="text" value={formData.clientName} onChange={e => setFormData({ ...formData, clientName: e.target.value })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none ${formErrors.clientName ? 'border-red-500' : 'border-gray-300'}`} placeholder="Full Name" />
                        {formErrors.clientName && <p className="text-red-500 text-xs mt-1">{formErrors.clientName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number *</label>
                        <input type="tel" value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none ${formErrors.mobile ? 'border-red-500' : 'border-gray-300'}`} placeholder="+91" />
                        {formErrors.mobile && <p className="text-red-500 text-xs mt-1">{formErrors.mobile}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none ${formErrors.email ? 'border-red-500' : 'border-gray-300'}`} placeholder="email@example.com" />
                        {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                        <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none bg-white">
                          <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">PAN Card *</label>
                        <input type="text" value={formData.panCard} onChange={e => setFormData({ ...formData, panCard: e.target.value.toUpperCase() })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none uppercase ${formErrors.panCard ? 'border-red-500' : 'border-gray-300'}`} placeholder="ABCDE1234F" />
                        {formErrors.panCard && <p className="text-red-500 text-xs mt-1">{formErrors.panCard}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Aadhaar Card <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" value={formData.aadhaarCard} onChange={e => setFormData({ ...formData, aadhaarCard: e.target.value.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ') })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none ${formErrors.aadhaarCard ? 'border-red-500' : 'border-gray-300'}`} placeholder="1234 5678 9012" />
                        {formErrors.aadhaarCard && <p className="text-red-500 text-xs mt-1">{formErrors.aadhaarCard}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                        <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none ${formErrors.city ? 'border-red-500' : 'border-gray-300'}`} placeholder="Ahmedabad" />
                        {formErrors.city && <p className="text-red-500 text-xs mt-1">{formErrors.city}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                        <input type="text" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none ${formErrors.state ? 'border-red-500' : 'border-gray-300'}`} placeholder="Gujarat" />
                        {formErrors.state && <p className="text-red-500 text-xs mt-1">{formErrors.state}</p>}
                      </div>
                    </div>
                  </motion.div>
                )}

                {currentStep === 2 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Details</h3>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange outline-none ${formErrors.companyName ? 'border-red-500' : 'border-gray-300'}`} placeholder="Acme Corp Pvt Ltd" />
                        {formErrors.companyName && <p className="text-red-500 text-xs mt-1">{formErrors.companyName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Type <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <select value={formData.businessType} onChange={e => setFormData({ ...formData, businessType: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange outline-none bg-white">
                          <option value="">Select Company Type</option><option>Private Limited</option><option>LLP</option><option>Proprietorship</option><option>Partnership</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Incorporation <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="date" value={formData.doi} onChange={e => setFormData({ ...formData, doi: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange outline-none bg-white" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GST Number <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" value={formData.gstNumber} onChange={e => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange outline-none uppercase ${formErrors.gstNumber ? 'border-red-500' : 'border-gray-300'}`} placeholder="24XXXXX1234X1Z5" />
                        {formErrors.gstNumber && <p className="text-red-500 text-xs mt-1">{formErrors.gstNumber}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company PAN Number <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" value={formData.companyPan} onChange={e => setFormData({ ...formData, companyPan: e.target.value.toUpperCase() })} className={`w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-be-orange outline-none uppercase ${formErrors.companyPan ? 'border-red-500' : 'border-gray-300'}`} placeholder="ABCDE1234F" />
                        {formErrors.companyPan && <p className="text-red-500 text-xs mt-1">{formErrors.companyPan}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sector</label>
                        <select value={formData.sector} onChange={e => setFormData({ ...formData, sector: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange outline-none bg-white">
                          <option>IT</option><option>Manufacturing</option><option>Finance</option><option>Healthcare</option><option>Retail</option><option>Education</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                        <select value={formData.industry} onChange={e => setFormData({ ...formData, industry: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange outline-none bg-white">
                          <option>Software</option><option>Hardware</option><option>Consulting</option><option>Real Estate</option><option>Automotive</option><option>E-commerce</option><option>Other</option>
                        </select>
                      </div>
                    </div>
                  </motion.div>
                )}

                {currentStep === 3 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Services & Pricing</h3>
                      <button
                        onClick={addBlankService}
                        className="flex items-center px-3 py-1.5 bg-orange-50 text-be-orange rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors"
                      >
                        <Plus size={16} className="mr-1" />
                        Add Service
                      </button>
                    </div>
                    {formErrors.services && <div className="text-red-500 text-sm mb-2">{formErrors.services}</div>}
                    {(formErrors.totalAmount || formErrors.baseAmount) && <div className="text-red-500 text-sm mb-2">{formErrors.totalAmount || formErrors.baseAmount}</div>}

                    <div className="border border-gray-200 rounded-xl overflow-visible pb-12">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-600 font-medium">
                          <tr>
                            <th className="px-4 py-3 min-w-[200px]">Service</th>
                            <th className="px-4 py-3 w-40">Total (₹)</th>
                            <th className="px-4 py-3 text-right">Base (₹)</th>
                            <th className="px-4 py-3 text-right">GST (18%) (₹)</th>
                            <th className="px-4 py-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-800">
                          {dealServices.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                No services added. Click "Add Service" to begin.
                              </td>
                            </tr>
                          )}
                          {dealServices.map((service) => {
                            const totalNum = Number(service.totalAmount) || (Number(service.baseAmount) ? Number((Number(service.baseAmount) / 0.82).toFixed(2)) : 0);
                            const gst = totalNum > 0 ? Number((totalNum * 0.18).toFixed(2)) : 0;
                            const base = totalNum > 0 ? Number((totalNum - gst).toFixed(2)) : 0;

                            return (
                              <tr key={service.id}>
                                <td className="px-4 py-3">
                                  <div className="relative service-dropdown-container">
                                    <button
                                      onClick={() => {
                                        setOpenDropdownId(openDropdownId === service.id ? null : service.id);
                                        setServiceSearchQuery('');
                                      }}
                                      className="w-full px-3 py-1.5 border border-gray-200 rounded flex items-center justify-between focus:border-be-orange outline-none bg-white text-left shadow-sm"
                                    >
                                      <span className={`truncate pr-4 font-medium ${service.name ? 'text-gray-700' : 'text-gray-400'}`}>
                                        {service.name || 'Select a service...'}
                                      </span>
                                      <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                                    </button>

                                    <AnimatePresence>
                                      {openDropdownId === service.id && (
                                        <motion.div
                                          initial={{ opacity: 0, y: -5 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          exit={{ opacity: 0, y: -5 }}
                                          className="absolute top-full left-0 w-[300px] mt-1 bg-white border border-gray-100 rounded-lg shadow-2xl z-[100] flex flex-col"
                                        >
                                          <div className="p-2 border-b border-gray-100 relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                              type="text"
                                              placeholder="Search services..."
                                              value={serviceSearchQuery}
                                              onChange={(e) => setServiceSearchQuery(e.target.value)}
                                              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border-none rounded text-sm focus:ring-1 focus:ring-be-orange outline-none"
                                              autoFocus
                                            />
                                          </div>
                                          <div className="p-1 max-h-60 overflow-y-auto">
                                            {allServices.filter(srv => srv.toLowerCase().includes(serviceSearchQuery.toLowerCase())).map(srv => (
                                              <div
                                                key={srv}
                                                className={`px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${service.name === srv ? 'bg-orange-50 text-be-orange font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                                                onClick={() => {
                                                  updateService(service.id, 'name', srv);
                                                  setOpenDropdownId(null);
                                                }}
                                              >
                                                {srv}
                                              </div>
                                            ))}
                                            {allServices.filter(srv => srv.toLowerCase().includes(serviceSearchQuery.toLowerCase())).length === 0 && (
                                              <div className="px-3 py-3 text-sm text-gray-500 text-center">No services found</div>
                                            )}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={service.totalAmount !== undefined ? service.totalAmount : (service.baseAmount ? String(Number((Number(service.baseAmount) * 1.18).toFixed(2))) : '')}
                                    onChange={(e) => updateService(service.id, 'totalAmount', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none font-medium text-gray-900"
                                  />
                                </td>

                                <td className="px-4 py-3 text-right text-gray-600">₹{base.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right text-gray-500">₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => removeService(service.id)}
                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>


                    <div className="bg-gray-50 p-5 rounded-xl space-y-3 text-sm border border-gray-100">
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span><span className="font-medium">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Total GST</span><span className="font-medium">₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t border-gray-200">
                        <span>Grand Total</span><span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                        <span className="font-medium text-gray-700">Amount Received *</span>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            className={`w-full pl-7 pr-3 py-1.5 border rounded-lg outline-none font-medium text-emerald-700 bg-white ${formErrors.amountReceived ? 'border-red-500 focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'}`}
                          />
                        </div>
                      </div>
                      {formErrors.amountReceived && <div className="text-red-500 text-xs text-right mt-1">{formErrors.amountReceived}</div>}
                      <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                        <span className="font-medium text-gray-700">Payment Screenshot *</span>
                        <div className="relative w-64 flex justify-end">
                          <input
                            type="file"
                            id="paymentScreenshot"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setPaymentScreenshotFile(e.target.files[0]);
                                setPaymentScreenshotName(e.target.files[0].name);
                              }
                            }}
                          />
                          <label
                            htmlFor="paymentScreenshot"
                            className={`cursor-pointer inline-flex items-center px-3 py-1.5 border rounded-lg text-sm font-medium ${formErrors.paymentScreenshot ? 'border-red-500 text-red-600 bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                          >
                            <UploadCloud size={14} className="mr-2" />
                            <span className="truncate max-w-[150px]">{paymentScreenshotName || 'Upload Image/PDF'}</span>
                          </label>
                        </div>
                      </div>
                      {formErrors.paymentScreenshot && <div className="text-red-500 text-xs text-right mt-1">{formErrors.paymentScreenshot}</div>}
                      <div className="flex justify-between text-orange-600 font-semibold items-center">
                        <span>Pending Amount</span>
                        <span className="text-base">₹{pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {currentStep === 4 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Documents</h3>

                    {fileError && (
                      <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100">
                        {fileError}
                      </div>
                    )}

                    <input
                      type="file"
                      multiple
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    />

                    <div
                      className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
                        ${isDragging ? 'border-be-orange bg-orange-50' : 'border-gray-300 hover:bg-gray-50'}`}
                      onDragEnter={handleDragOver}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className={`w-12 h-12 mx-auto mb-4 transition-colors ${isDragging ? 'text-be-orange' : 'text-gray-400'}`} />
                      <p className={`font-medium mb-1 ${isDragging ? 'text-be-orange' : 'text-gray-900'}`}>
                        {isDragging ? 'Drop files here' : 'Drag & drop documents here'}
                      </p>
                      <p className="text-gray-500 text-sm mb-4">PDF, JPG, PNG, DOC up to 10MB</p>
                      <button
                        type="button"
                        className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-all pointer-events-none"
                      >
                        Browse Files
                      </button>
                    </div>

                    {documents.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Files ({documents.length})</h4>
                        {documents.map((file, idx) => {
                          const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
                          const isPdf = ext === 'PDF';
                          const isImg = ['JPG', 'JPEG', 'PNG'].includes(ext);

                          return (
                            <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow transition-shadow">
                              <div className="flex items-center min-w-0 flex-1">
                                <div className={`w-10 h-10 rounded-md flex items-center justify-center font-bold text-xs mr-3 shrink-0
                                  ${isPdf ? 'bg-red-50 text-red-600' : isImg ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
                                >
                                  {ext}
                                </div>
                                <div className="min-w-0 flex-1 mr-4">
                                  <p className="text-sm font-medium text-gray-900 truncate" title={file.name}>{file.name}</p>
                                  <div className="flex items-center mt-0.5">
                                    <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                                    <span className="mx-2 text-gray-300">•</span>
                                    <span className="text-xs text-emerald-600 font-medium">Ready to upload</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 shrink-0">
                                {(isPdf || isImg) && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handlePreview(file); }}
                                    className="text-xs font-medium text-be-orange hover:text-be-orangeHover transition-colors px-2 py-1 bg-orange-50 rounded"
                                  >
                                    Preview
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeDocument(idx); }}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Remove"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between">
                <button
                  onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${currentStep === 1 ? 'invisible' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                >
                  Back
                </button>
                {currentStep < 4 ? (
                  <button
                    onClick={handleNextStep}
                    className="px-6 py-2 bg-be-dark text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors flex items-center shadow-md hover:shadow-lg"
                  >
                    Continue <ChevronRight size={16} className="ml-2" />
                  </button>
                ) : (
                  <button
                    onClick={handleCreateDeal}
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors flex items-center shadow-md hover:shadow-lg disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        {editingDealId ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        {editingDealId ? 'Update Deal' : 'Create Deal'} <Check size={16} className="ml-2" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
