import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Filter, X, UploadCloud, ChevronRight, Check, Trash2, ChevronDown, Eye, Edit, Download, Send, Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Loader2, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { saveDocument } from '../../lib/db';
import { insertZohoQuotation, updateZohoQuotation, saveOrUpdateZohoQuotation, testZohoConnection, uploadZohoAttachment, deleteZohoRecord, saveOrUpdateZohoCompany, saveOrUpdateZohoClient, saveOrUpdateZohoDeal, fetchZohoQuotations } from '../../services/zohoService';
import { downloadQuotationPDF, downloadQuotationHTML, printQuotation, generateQuotationPDFBlob } from '../../utils/quotationTemplate';
import { Pagination } from '../../components/ui/Pagination';
import { DeleteConfirmModal } from '../../components/ui/DeleteConfirmModal';

interface DealService {
  id: string;
  name: string;
  totalAmount?: string;
  baseAmount?: string;
}

export const Quotations = () => {
  const navigate = useNavigate();
  const { currentUser, filterRecords } = useAuth();
  const [activeTab, setActiveTab] = useState('All Quotations');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Zoho & Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);
  const [isTestingZoho, setIsTestingZoho] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; quotation: any | null; isDeleting: boolean }>({
    isOpen: false,
    quotation: null,
    isDeleting: false
  });

  const [formData, setFormData] = useState({
    clientName: '', mobile: '', email: '', gender: 'Male',
    panCard: '', aadhaarCard: '', city: '', state: '',
    companyName: '', businessType: '', doi: '', gstNumber: '',
    companyPan: '', sector: 'IT', industry: 'Software'
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [quotationServices, setQuotationServices] = useState<DealService[]>([]);
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

    if (deal && deal.id && deal.id.startsWith('QT-')) {
      setEditingQuotationId(deal.id);
      setFormData(deal.formData || {
        clientName: deal.client || '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        companyName: deal.company || '', businessType: '', doi: '', gstNumber: ''
      });
      setQuotationServices((deal.servicesData || []).map((s: any) => {
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
      setEditingQuotationId(null);
      setFormData({
        clientName: '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        companyName: '', businessType: '', doi: '', gstNumber: '',
        companyPan: '', sector: 'IT', industry: 'Software'
      });
      setQuotationServices([]);
      setAmountReceived('');
      setPaymentScreenshotName('');
      setPaymentScreenshotFile(null);
    }
  };

  const handleCloseModal = () => {

    setIsCreateModalOpen(false);
    setTimeout(() => {
      setCurrentStep(1);
      setEditingQuotationId(null);
      setFormData({
        clientName: '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        companyName: '', businessType: '', doi: '', gstNumber: '',
        companyPan: '', sector: 'IT', industry: 'Software'
      });
      setFormErrors({});
      setQuotationServices([]);
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
      if (quotationServices.length === 0) errors.services = 'Add at least one service';
      if (quotationServices.some(s => !s.totalAmount && !s.baseAmount)) errors.totalAmount = 'Enter total amounts for all selected services';
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
    const exists = quotationServices.find(s => s.name === serviceName);
    if (exists) {
      setQuotationServices(quotationServices.filter(s => s.name !== serviceName));
    } else {
      setQuotationServices([
        ...quotationServices,
        { id: Math.random().toString(), name: serviceName, totalAmount: '', baseAmount: '' }
      ]);
    }
  };

  const clearServices = () => {
    setQuotationServices([]);
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
    setQuotationServices(quotationServices.map(s => {
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
    setQuotationServices(quotationServices.filter(s => s.id !== id));
  };

  const addBlankService = () => {
    setQuotationServices([
      ...quotationServices,
      { id: Math.random().toString(), name: '', totalAmount: '', baseAmount: '' }
    ]);
  };

  const grandTotal = Number(quotationServices.reduce((sum, s) => {
    const total = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) / 0.82).toFixed(2)) : 0);
    return sum + total;
  }, 0).toFixed(2));

  const totalGst = Number(quotationServices.reduce((sum, s) => {
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
      const extension = (file.name ?? '').split('.').pop()?.toLowerCase();
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

  const [quotations, setQuotations] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_quotations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { }
    return [];
  });

  // Auto-migrate any unassigned local quotations so they are linked to current user
  useEffect(() => {
    if (currentUser?.name) {
      try {
        const saved = localStorage.getItem('be_quotations');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            let changed = false;
            const updated = parsed.map((q: any) => {
              if ((!q.owner || q.owner === 'Admin') && (!q.Employee || !q.employeeName)) {
                changed = true;
                return {
                  ...q,
                  owner: currentUser.name,
                  employeeName: currentUser.name,
                  empName: currentUser.name,
                  employeeId: currentUser.empId || currentUser.id,
                  empId: currentUser.empId || currentUser.id,
                  employeeZohoId: currentUser.zohoId || '',
                  employeeEmail: currentUser.email || '',
                  salesEmployee: currentUser.name,
                  department: currentUser.department || 'Sales',
                  Employee: {
                    id: currentUser.zohoId || currentUser.empId || currentUser.id,
                    name: currentUser.name
                  }
                };
              }
              return q;
            });
            if (changed) {
              setQuotations(updated);
              localStorage.setItem('be_quotations', JSON.stringify(updated));
            }
          }
        }
      } catch (e) { }
    }
  }, [currentUser]);

  const rbacQuotations = useMemo(() => {
    return filterRecords ? filterRecords(quotations, 'Quotations') : quotations;
  }, [quotations, filterRecords, currentUser]);

  const filteredQuotations = useMemo(() => {
    return rbacQuotations.filter((deal: any) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchClient = deal.client && String(deal.client).toLowerCase().includes(q);
        const matchCompany = deal.company && String(deal.company).toLowerCase().includes(q);
        const matchService = deal.service && String(deal.service).toLowerCase().includes(q);
        const matchId = deal.id && String(deal.id).toLowerCase().includes(q);
        const matchZohoId = deal.zohoId && String(deal.zohoId).toLowerCase().includes(q);
        const matchAmount = (deal.amount || deal.received || deal.pending) && String(deal.amount || deal.received || deal.pending).toLowerCase().includes(q);
        const matchStatus = deal.status && String(deal.status).toLowerCase().includes(q);
        const matchOwner = (deal.owner || deal.employeeName || deal.salesEmployee) && String(deal.owner || deal.employeeName || deal.salesEmployee).toLowerCase().includes(q);
        const matchEmail = deal.formData?.email && String(deal.formData.email).toLowerCase().includes(q);
        const matchMobile = deal.formData?.mobile && String(deal.formData.mobile).includes(q);

        if (!matchClient && !matchCompany && !matchService && !matchId && !matchZohoId && !matchAmount && !matchStatus && !matchOwner && !matchEmail && !matchMobile) return false;
      }
      return true;
    });
  }, [rbacQuotations, searchQuery]);

  const totalQuotationsCount = filteredQuotations.length;
  const paginatedQuotations = useMemo(() => {
    return filteredQuotations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredQuotations, currentPage, itemsPerPage]);

  const handleFetchFromZoho = async (showNotification = true) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoQuotations();
      if (res.success && Array.isArray(res.data)) {
        if (res.data.length === 0) {
          if (showNotification) {
            setToast({
              type: 'info',
              message: 'No Quotations Found',
              submessage: 'Quotations module returned 0 records'
            });
          }
          return;
        }

        const fetchedQuotations = res.data.map((z: any) => ({
          id: z.Name?.match(/QT-\d+/)?.[0] || `QT-${String(z.id).slice(-4)}`,
          client: z.Name ? z.Name.split(' - ')[1] || z.Name : 'Client',
          company: z.Company_Name || z.Name?.split(' - ')[0] || 'N/A',
          amount: z.Grand_Total || (z.Subtotal ? `₹${Number(z.Subtotal).toLocaleString()}` : '₹0'),
          status: 'Sent',
          date: z.Created_Time ? new Date(z.Created_Time).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
          zohoId: String(z.id),
          zohoStatus: 'synced',
          owner: z.Owner?.name || z.Created_By?.name || (typeof z.Employee === 'object' ? z.Employee?.name : null) || z.Sales_Representative || currentUser?.name || 'Admin',
          Employee: z.Employee,
          employeeId: typeof z.Employee === 'object' ? z.Employee?.id : (z.Employee || z.Employee_ID || ''),
          employeeZohoId: typeof z.Employee === 'object' ? z.Employee?.id : (z.Employee || ''),
          employeeName: typeof z.Employee === 'object' ? z.Employee?.name : (z.Employee_Name || z.Sales_Representative || z.Owner?.name || currentUser?.name || ''),
          salesEmployee: typeof z.Employee === 'object' ? z.Employee?.name : (z.Sales_Representative || z.Owner?.name || currentUser?.name || ''),
          Owner: z.Owner,
          Created_By: z.Created_By,
          formData: {
            clientName: z.Name ? z.Name.split(' - ')[1] || z.Name : '',
            companyName: z.Company_Name || '',
            email: z.Email || '',
            mobile: z.Mobile_Number || '',
            gender: z.Gender || 'Male',
            city: z.City || '',
            state: z.State || '',
            panCard: z.PAN_Card || '',
            aadhaarCard: z.Aadhaar_Card || '',
            businessType: z.Company_Type || '',
            doi: z.Date_of_Incorporation || '',
            gstNumber: z.GST_Number || '',
            companyPan: z.Company_PAN_Number || '',
            sector: z.Sector || '',
            industry: z.Industry || '',
            employeeName: typeof z.Employee === 'object' ? z.Employee?.name : (z.Employee_Name || ''),
            employeeZohoId: typeof z.Employee === 'object' ? z.Employee?.id : (z.Employee || ''),
          },
          servicesData: Array.isArray(z.Services_And_Pricing) ? z.Services_And_Pricing.map((s: any, idx: number) => ({
            id: String(idx + 1),
            name: s.Service || 'Service',
            totalAmount: s.Total ? String(s.Total).replace(/[^0-9.]/g, '') : '',
            baseAmount: s.Base ? String(s.Base).replace(/[^0-9.]/g, '') : '',
          })) : [],
          totals: {
            subtotal: z.Subtotal ? Number(String(z.Subtotal).replace(/[^0-9.]/g, '')) : 0,
            totalGst: z.Total_GST ? Number(String(z.Total_GST).replace(/[^0-9.]/g, '')) : 0,
            grandTotal: z.Grand_Total ? Number(String(z.Grand_Total).replace(/[^0-9.]/g, '')) : 0,
          }
        }));

        setQuotations(prev => {
          const seenZohoIds = new Set<string>();
          const merged = [...fetchedQuotations];
          for (const f of fetchedQuotations) {
            if (f.zohoId) seenZohoIds.add(f.zohoId);
          }
          for (const p of prev) {
            if (p.zohoId && seenZohoIds.has(p.zohoId)) continue;
            merged.push(p);
          }
          localStorage.setItem('be_quotations', JSON.stringify(merged));
          return merged;
        });

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Fetched ${res.data.length} Quotation(s) Successfully!`,
            submessage: 'Quotations synchronized successfully'
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'error',
          message: 'Failed to fetch quotations',
          submessage: res.message || 'Check network connection or server limits'
        });
      }
    } catch (err: any) {
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Error connecting to server',
          submessage: err.message || 'Network communication error'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  // Auto-fetch live quotations from Zoho CRM on mount
  useEffect(() => {
    handleFetchFromZoho(false);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Accepted': return 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm';
      case 'Sent': return 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm';
      case 'Draft': return 'bg-gray-50 text-gray-700 border border-gray-200 shadow-sm';
      case 'Rejected': return 'bg-red-50 text-red-700 border border-red-200 shadow-sm';
      default: return 'bg-gray-50 text-gray-700 border border-gray-200 shadow-sm';
    }
  };

  // Toast Auto-Dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Handle Testing Zoho Connection
  const handleTestZohoConnection = async () => {
    setIsTestingZoho(true);
    try {
      const res = await testZohoConnection();
      if (res.success) {
        setToast({
          type: 'success',
          message: 'Connected Successfully!',
          submessage: 'OAuth token generated and verified for .in domain'
        });
      } else {
        setToast({
          type: 'error',
          message: 'Connection Failed',
          submessage: res.message
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Connection Error',
        submessage: err?.message || 'Check network or credentials in .env'
      });
    } finally {
      setIsTestingZoho(false);
    }
  };

  // Manual Sync for a single quotation
  const handleSyncToZoho = async (quotation: any) => {
    setSyncingId(quotation.id);
    try {
      const res = await insertZohoQuotation(quotation);
      if (res.success && res.zohoId) {
        // 1. Generate the Quotation PDF and attach it to the Zoho CRM record
        try {
          const pdfBlob = await generateQuotationPDFBlob(quotation);
          await uploadZohoAttachment(
            res.zohoId,
            pdfBlob,
            `Quotation_${quotation.id}.pdf`,
            'Quotations'
          );
        } catch (attErr) {
          console.warn('[Zoho CRM] Quotation PDF attachment failed during sync:', attErr);
        }

        const updatedList = quotations.map((q: any) => {
          if (q.id === quotation.id) {
            return {
              ...q,
              zohoId: res.zohoId,
              zohoStatus: 'synced',
              zohoSyncedAt: new Date().toISOString(),
              zohoError: undefined,
            };
          }
          return q;
        });
        setQuotations(updatedList);
        localStorage.setItem('be_quotations', JSON.stringify(updatedList));
        setToast({
          type: 'success',
          message: `Quotation ${quotation.id} Saved Successfully!`,
          submessage: `Record #${res.zohoId} with Quotation_${quotation.id}.pdf attached`
        });
      } else {
        const updatedList = quotations.map((q: any) => {
          if (q.id === quotation.id) {
            return {
              ...q,
              zohoStatus: 'failed',
              zohoError: res.message,
            };
          }
          return q;
        });
        setQuotations(updatedList);
        localStorage.setItem('be_quotations', JSON.stringify(updatedList));
        setToast({
          type: 'error',
          message: `Sync Failed for ${quotation.id}`,
          submessage: res.message || 'Please check API field names and token validity.'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Sync Error for ${quotation.id}`,
        submessage: err?.message || 'Network communication error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleCreateDeal = async () => {
    setIsSubmitting(true);
    const quotationId = editingQuotationId || `QT-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // Save actual files to IndexedDB
      const docsToSave: any[] = [];

      if (paymentScreenshotFile) {
        const docId = `${quotationId || 'ID'}_payment_${paymentScreenshotFile.name}`;
        try {
          await saveDocument(docId, paymentScreenshotFile);
        } catch (e) {
          console.error('Failed to save payment screenshot', e);
        }
      }
      for (const d of documents) {
        const docId = `${quotationId}_${d.name}`;
        try {
          await saveDocument(docId, d);
          docsToSave.push({ id: docId, name: d.name, size: d.size, type: d.type });
        } catch (e) {
          console.error('Failed to save document to IndexedDB', e);
          // Fallback for demo
          docsToSave.push({ id: docId, name: d.name, size: d.size, type: d.type });
        }
      }

      const isEditing = Boolean(editingQuotationId);
      const existingQuotation = isEditing ? quotations.find((q: any) => q.id === editingQuotationId) : null;

      const quotationData: any = {
        id: quotationId,
        client: formData.clientName,
        company: formData.companyName,
        service: quotationServices.length === 1 ? quotationServices[0].name : quotationServices.length > 1 ? `${quotationServices.length} Services` : 'Custom Services',
        amount: `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        received: `₹${(Number(amountReceived) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        pending: `₹${pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        status: existingQuotation?.status || 'Draft',
        owner: existingQuotation?.owner || currentUser?.name || 'Admin',
        date: existingQuotation?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        // RBAC & Ownership
        employeeName: existingQuotation?.employeeName || currentUser?.name || '',
        empName: existingQuotation?.empName || currentUser?.name || '',
        employeeId: existingQuotation?.employeeId || currentUser?.empId || currentUser?.id || '',
        empId: existingQuotation?.empId || currentUser?.empId || currentUser?.id || '',
        employeeZohoId: existingQuotation?.employeeZohoId || currentUser?.zohoId || '',
        employeeEmail: existingQuotation?.employeeEmail || currentUser?.email || currentUser?.workEmail || '',
        salesEmployee: existingQuotation?.salesEmployee || currentUser?.name || '',
        department: existingQuotation?.department || currentUser?.department || 'Sales',
        Employee: existingQuotation?.Employee || (currentUser ? {
          id: currentUser.zohoId || currentUser.empId || currentUser.id,
          name: currentUser.name
        } : undefined),
        // Full details
        formData: {
          ...formData,
          employeeName: existingQuotation?.formData?.employeeName || currentUser?.name,
          employeeEmail: existingQuotation?.formData?.employeeEmail || currentUser?.email,
          empId: existingQuotation?.formData?.empId || currentUser?.empId || currentUser?.id,
          employeeZohoId: existingQuotation?.formData?.employeeZohoId || currentUser?.zohoId
        },
        servicesData: quotationServices.map(s => {
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
        zohoId: existingQuotation?.zohoId || undefined,
        zohoStatus: existingQuotation?.zohoStatus || 'pending',
      };

      // Call Zoho CRM REST API to insert or update record in Quotations module
      try {
        const zohoRes = await saveOrUpdateZohoQuotation(quotationData);
        const finalZohoId = zohoRes.zohoId || quotationData.zohoId;

        if (zohoRes.success && finalZohoId) {
          quotationData.zohoId = finalZohoId;
          quotationData.zohoStatus = 'synced';
          quotationData.zohoSyncedAt = new Date().toISOString();

          // 1. Generate the updated Quotation PDF with new services/prices and attach it to the Zoho CRM record
          try {
            const quotationPdfBlob = await generateQuotationPDFBlob(quotationData);
            await uploadZohoAttachment(
              finalZohoId,
              quotationPdfBlob,
              `Quotation_${quotationId}.pdf`,
              'Quotations'
            );
          } catch (pdfErr) {
            console.warn('[Zoho CRM] Failed to attach updated Quotation PDF:', pdfErr);
          }

          // 2. Upload newly attached payment screenshot & documents to Zoho CRM record if any
          if (paymentScreenshotFile) {
            try {
              await uploadZohoAttachment(finalZohoId, paymentScreenshotFile, paymentScreenshotFile.name, 'Quotations');
            } catch (attErr) {
              console.warn('[Zoho CRM] Payment screenshot attachment failed:', attErr);
            }
          }
          for (const docFile of documents) {
            try {
              await uploadZohoAttachment(finalZohoId, docFile, docFile.name, 'Quotations');
            } catch (attErr) {
              console.warn('[Zoho CRM] Document attachment failed:', attErr);
            }
          }

          setToast({
            type: 'success',
            message: isEditing ? 'Quotation Updated Successfully!' : 'Quotation Created Successfully!',
            submessage: `${isEditing ? 'Updated' : 'Created'} in Quotations (ID: #${finalZohoId}) with updated Quotation_${quotationId}.pdf attached`
          });
        } else {
          quotationData.zohoStatus = 'failed';
          quotationData.zohoError = zohoRes.message;
          setToast({
            type: 'error',
            message: `Quotation Saved Locally (Sync Failed)`,
            submessage: zohoRes.message || 'Check field requirements'
          });
        }
      } catch (zErr: any) {
        console.error('Zoho CRM sync error:', zErr);
        quotationData.zohoStatus = 'failed';
        quotationData.zohoError = zErr?.message || 'Sync failed';
        setToast({
          type: 'error',
          message: `Quotation Saved Locally (Sync Error)`,
          submessage: zErr?.message || 'Failed to communicate with server'
        });
      }

      let newQuotationsList;
      if (editingQuotationId) {
        // Retain old status/date/owner if editing
        newQuotationsList = quotations.map((d: any) => {
          if (d.id === editingQuotationId) {
            return {
              ...quotationData,
              status: d.status,
              owner: d.owner,
              date: d.date,
              zohoId: quotationData.zohoId || d.zohoId,
              zohoStatus: quotationData.zohoStatus || d.zohoStatus
            };
          }
          return d;
        });
      } else {
        newQuotationsList = [quotationData, ...quotations];
      }

      setQuotations(newQuotationsList);
      try {
        localStorage.setItem('be_quotations', JSON.stringify(newQuotationsList));
      } catch (e) {
        console.warn('LocalStorage save error for quotations:', e);
      }

      handleCloseModal();
    } catch (qErr) {
      console.error('Quotation save error:', qErr);
    } finally {
      setIsSubmitting(false);
      handleCloseModal();
    }
  };


  const handleDownload = (q: any) => {
    downloadQuotationPDF(q);
  };

  const handleDeleteQuotation = (deal: any) => {
    setDeleteTarget({ isOpen: true, quotation: deal, isDeleting: false });
  };

  const confirmDeleteQuotation = async () => {
    const deal = deleteTarget.quotation;
    if (!deal) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));
    const qName = deal.formData?.clientName || deal.client || deal.id;

    try {
      const newQuotationsList = quotations.filter((d: any) => d.id !== deal.id);
      setQuotations(newQuotationsList);
      localStorage.setItem('be_quotations', JSON.stringify(newQuotationsList));

      if (deal.zohoId) {
        try {
          const zohoRes = await deleteZohoRecord('Quotations', deal.zohoId);
          if (zohoRes.success) {
            setToast({
              type: 'success',
              message: `Quotation "${qName}" Deleted`,
              submessage: `Record has been deleted successfully (ID: #${deal.zohoId})`
            });
          } else {
            setToast({
              type: 'error',
              message: `Quotation Deleted Locally (Delete Failed)`,
              submessage: zohoRes.message || 'Failed to delete record'
            });
          }
        } catch (zErr: any) {
          console.error('[Zoho CRM] Delete error:', zErr);
          setToast({
            type: 'error',
            message: `Quotation Deleted Locally (Delete Error)`,
            submessage: zErr?.message || 'Failed to communicate with server'
          });
        }
      } else {
        setToast({
          type: 'success',
          message: `Quotation "${qName}" Deleted`,
          submessage: 'Record has been deleted successfully'
        });
      }
    } finally {
      setDeleteTarget({ isOpen: false, quotation: null, isDeleting: false });
    }
  };

  const handleManualSyncQuotation = async (quotation: any) => {
    setSyncingId(quotation.id);
    try {
      const zohoRes = await saveOrUpdateZohoQuotation(quotation);
      if (zohoRes.success && zohoRes.zohoId) {
        const updatedList = quotations.map((q: any) => 
          q.id === quotation.id ? { ...q, zohoId: zohoRes.zohoId, zohoStatus: 'synced', zohoSyncedAt: new Date().toISOString(), zohoError: undefined } : q
        );
        setQuotations(updatedList);
        localStorage.setItem('be_quotations', JSON.stringify(updatedList));
        setToast({
          type: 'success',
          message: `Quotation Synced Successfully!`,
          submessage: `Record ID: #${zohoRes.zohoId}`
        });
      } else {
        const updatedList = quotations.map((q: any) => 
          q.id === quotation.id ? { ...q, zohoStatus: 'failed', zohoError: zohoRes.message } : q
        );
        setQuotations(updatedList);
        localStorage.setItem('be_quotations', JSON.stringify(updatedList));
        setToast({
          type: 'error',
          message: `Quotation Sync Failed`,
          submessage: zohoRes.message || 'Please check field formats or credentials'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Quotation Sync Error`,
        submessage: err?.message || 'Failed to communicate with server'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleStatusChange = async (quotationId: string, newStatus: string) => {
    const qToConvert = quotations.find((q: any) => q.id === quotationId);

    // Update local quotation status
    const updatedQuotations = quotations.map((q: any) => q.id === quotationId ? { ...q, status: newStatus } : q);
    setQuotations(updatedQuotations);
    localStorage.setItem('be_quotations', JSON.stringify(updatedQuotations));

    if (newStatus === 'Sent' && qToConvert) {
      let companyZohoId: string | undefined = undefined;
      let clientZohoId: string | undefined = undefined;

      // 1. Auto-create & Sync Company if present
      const companyName = qToConvert.formData?.companyName || qToConvert.company;
      if (companyName && companyName.trim() && companyName !== 'N/A') {
        try {
          const companiesStr = localStorage.getItem('be_companies');
          let companies = companiesStr ? JSON.parse(companiesStr) : [];
          const existingComp = companies.find((c: any) => c.name?.toLowerCase() === companyName.trim().toLowerCase());

          const companyToSave: any = {
            id: existingComp?.id || `CMP-${Math.floor(1000 + Math.random() * 9000)}`,
            name: companyName.trim(),
            type: qToConvert.formData?.businessType || existingComp?.type || 'Private Limited',
            gstNumber: qToConvert.formData?.gstNumber ? qToConvert.formData.gstNumber.toUpperCase() : (existingComp?.gstNumber || ''),
            doi: qToConvert.formData?.doi || existingComp?.doi || '',
            email: qToConvert.formData?.email || existingComp?.email || '',
            status: 'Active',
            source: existingComp?.source || 'From Deals',
            addedOn: existingComp?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            zohoId: existingComp?.zohoId,
            zohoStatus: existingComp?.zohoStatus || 'pending',
            employeeZohoId: qToConvert.employeeZohoId || currentUser?.zohoId,
            employeeName: qToConvert.employeeName || currentUser?.name,
            employeeEmail: qToConvert.employeeEmail || currentUser?.email,
            empId: qToConvert.empId || currentUser?.empId || currentUser?.id,
            salesEmployee: qToConvert.salesEmployee || currentUser?.name,
          };

          if (!companyToSave.zohoId) {
            try {
              const compRes = await saveOrUpdateZohoCompany(companyToSave);
              if (compRes.success && compRes.zohoId) {
                companyToSave.zohoId = compRes.zohoId;
                companyToSave.zohoStatus = 'synced';
                companyToSave.zohoSyncedAt = new Date().toISOString();
              }
            } catch (cErr) {
              console.warn('[Zoho CRM] Company sync from Send to Deals failed:', cErr);
            }
          }

          companyZohoId = companyToSave.zohoId;

          const updatedCompaniesList = existingComp 
            ? companies.map((c: any) => c.id === existingComp.id ? { ...c, ...companyToSave } : c)
            : [companyToSave, ...companies];
          localStorage.setItem('be_companies', JSON.stringify(updatedCompaniesList));
        } catch (compErr) {
          console.warn('Auto-saving company during Send to Deals failed:', compErr);
        }
      }

      // 2. Auto-create & Sync Client if present
      const clientName = qToConvert.formData?.clientName || qToConvert.client;
      if (clientName && clientName.trim() && clientName !== 'Client') {
        try {
          const clientsStr = localStorage.getItem('be_clients');
          let clients = clientsStr ? JSON.parse(clientsStr) : [];
          const phone = qToConvert.formData?.mobile ? qToConvert.formData.mobile.replace(/[^0-9]/g, '') : '';
          const email = qToConvert.formData?.email ? qToConvert.formData.email.trim() : '';
          const company = companyName ? companyName.trim() : 'Individual';

          const existingClient = clients.find((c: any) => 
            (phone && c.phone === phone) || 
            (email && c.email?.toLowerCase() === email.toLowerCase()) || 
            (c.name?.toLowerCase() === clientName.trim().toLowerCase())
          );

          const clientToSave: any = {
            id: existingClient?.id || `CL-${Math.floor(1000 + Math.random() * 9000)}`,
            name: clientName.trim(),
            company: company,
            email: email,
            phone: phone,
            status: 'Active',
            source: existingClient?.source || 'From Deals',
            addedOn: existingClient?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            zohoId: existingClient?.zohoId,
            zohoStatus: existingClient?.zohoStatus || 'pending',
            employeeZohoId: qToConvert.employeeZohoId || currentUser?.zohoId,
            employeeName: qToConvert.employeeName || currentUser?.name,
            employeeEmail: qToConvert.employeeEmail || currentUser?.email,
            empId: qToConvert.empId || currentUser?.empId || currentUser?.id,
            salesEmployee: qToConvert.salesEmployee || currentUser?.name,
          };

          if (!clientToSave.zohoId) {
            try {
              const clRes = await saveOrUpdateZohoClient(clientToSave);
              if (clRes.success && clRes.zohoId) {
                clientToSave.zohoId = clRes.zohoId;
                clientToSave.zohoStatus = 'synced';
                clientToSave.zohoSyncedAt = new Date().toISOString();
              }
            } catch (clErr) {
              console.warn('[Zoho CRM] Client sync from Send to Deals failed:', clErr);
            }
          }

          clientZohoId = clientToSave.zohoId;

          const updatedClientsList = existingClient
            ? clients.map((cl: any) => cl.id === existingClient.id ? { ...cl, ...clientToSave } : cl)
            : [clientToSave, ...clients];
          localStorage.setItem('be_clients', JSON.stringify(updatedClientsList));
        } catch (clientErr) {
          console.warn('Auto-saving client during Send to Deals failed:', clientErr);
        }
      }

      // 3. Convert to Deal & Sync to Zoho CRM Deals
      const dealsStr = localStorage.getItem('be_deals');
      let deals = dealsStr ? JSON.parse(dealsStr) : [];
      if (!Array.isArray(deals)) deals = [];
      const dealId = qToConvert.id.replace('QT-', 'DL-');

      const existingDeal = deals.find((d: any) => d.id === dealId || d.quotationId === qToConvert.id);

      const dealData: any = {
        ...(existingDeal || qToConvert),
        id: existingDeal?.id || dealId,
        client: clientName,
        company: companyName,
        companyZohoId: companyZohoId || existingDeal?.companyZohoId,
        clientZohoId: clientZohoId || existingDeal?.clientZohoId,
        quotationZohoId: qToConvert.zohoId || existingDeal?.quotationZohoId,
        employeeZohoId: qToConvert.employeeZohoId || existingDeal?.employeeZohoId || currentUser?.zohoId,
        employeeName: qToConvert.employeeName || qToConvert.salesEmployee || existingDeal?.employeeName || currentUser?.name,
        employeeEmail: qToConvert.employeeEmail || existingDeal?.employeeEmail || currentUser?.email,
        empId: qToConvert.empId || existingDeal?.empId || currentUser?.empId || currentUser?.id,
        salesEmployee: qToConvert.salesEmployee || qToConvert.employeeName || existingDeal?.salesEmployee || currentUser?.name,
        status: existingDeal?.status || 'New',
        stage: existingDeal?.stage || 'Sales',
        source: 'Quotation',
        quotationId: qToConvert.id,
        formData: {
          ...(qToConvert.formData || {}),
          companyZohoId,
          clientZohoId,
          quotationZohoId: qToConvert.zohoId,
          employeeZohoId: qToConvert.employeeZohoId || existingDeal?.employeeZohoId || currentUser?.zohoId,
          employeeName: qToConvert.employeeName || qToConvert.salesEmployee || existingDeal?.employeeName || currentUser?.name,
          employeeEmail: qToConvert.employeeEmail || existingDeal?.employeeEmail || currentUser?.email,
          empId: qToConvert.empId || existingDeal?.empId || currentUser?.empId || currentUser?.id,
          salesEmployee: qToConvert.salesEmployee || qToConvert.employeeName || existingDeal?.salesEmployee || currentUser?.name,
        },
        servicesData: qToConvert.servicesData || [],
        totals: qToConvert.totals || {},
        amount: qToConvert.amount || (qToConvert.totals?.grandTotal ? `₹${Number(qToConvert.totals.grandTotal).toLocaleString()}` : '₹0'),
        received: existingDeal?.received || '₹0',
        pending: existingDeal?.pending || qToConvert.amount || (qToConvert.totals?.grandTotal ? `₹${Number(qToConvert.totals.grandTotal).toLocaleString()}` : '₹0'),
        date: existingDeal?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        owner: qToConvert.owner || 'Admin',
        zohoId: existingDeal?.zohoId,
        zohoStatus: existingDeal?.zohoStatus || 'pending'
      };

      try {
        const dealZohoRes = await saveOrUpdateZohoDeal(dealData);
        if (dealZohoRes.success && dealZohoRes.zohoId) {
          dealData.zohoId = dealZohoRes.zohoId;
          dealData.zohoStatus = 'synced';
          dealData.zohoSyncedAt = new Date().toISOString();
        }
      } catch (dErr) {
        console.warn('[Zoho CRM] Deal sync from Quotation failed:', dErr);
      }

      const updatedDealsList = existingDeal
        ? deals.map((d: any) => d.id === existingDeal.id ? { ...d, ...dealData } : d)
        : [dealData, ...deals];
      localStorage.setItem('be_deals', JSON.stringify(updatedDealsList));

      // Navigate to deals
      navigate('/crm/deals');
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
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Quotations
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-2 font-medium">Create, manage, and track quotations efficiently.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search quotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none shadow-sm transition-shadow w-64"
            />
          </div>
          <button
            onClick={() => handleFetchFromZoho(true)}
            disabled={isFetchingZoho}
            className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm hover:shadow disabled:opacity-60 shrink-0"
            title="Refresh & Sync"
          >
            <RefreshCw size={16} className={`text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-be-orange to-rose-500 text-white rounded-lg text-sm font-semibold hover:from-be-orangeHover hover:to-rose-600 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            <Plus size={16} className="mr-2" />
            Create Quotation
          </button>
        </div>
      </div>

      <div className="bg-transparent overflow-hidden mt-6">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Quotation ID</th>
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Service</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Received</th>
                <th className="px-6 py-3">Pending</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Owner</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {paginatedQuotations.map((deal: any) => (
                <tr key={deal.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 font-bold text-gray-900 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">{deal.id}</td>
                  <td className="px-6 py-5 font-medium border-t border-b border-gray-100 group-hover:border-orange-100">{deal.client}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className="bg-gray-50 text-gray-600 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 group-hover:bg-white transition-colors">{deal.company}</span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">{deal.service}</td>
                  <td className="px-6 py-5 font-bold text-gray-900 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.amount}</td>
                  <td className="px-6 py-5 font-bold text-emerald-600 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.received}</td>
                  <td className="px-6 py-5 font-bold text-orange-600 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.pending}</td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <select
                      value={deal.status}
                      onChange={(e) => handleStatusChange(deal.id, e.target.value)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium outline-none cursor-pointer border-0 appearance-none text-center ${getStatusColor(deal.status)}`}
                      style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                    >
                      <option value="Draft" className="bg-white text-gray-900 text-sm">Draft</option>
                      <option value="Sent" className="bg-white text-gray-900 text-sm">Sent</option>
                    </select>
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
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                        title="Send to Deals"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusChange(deal.id, 'Sent');
                        }}
                      >
                        <Send size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Download Quotation (PDF)"
                        onClick={(e) => { e.stopPropagation(); handleDownload(deal); }}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                        title="Print / Save PDF"
                        onClick={(e) => { e.stopPropagation(); printQuotation(deal); }}
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        title="View Quotation"
                        onClick={(e) => { e.stopPropagation(); navigate(`/crm/quotations/${deal.id}`); }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Quotation"
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(deal); }}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete Quotation"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuotation(deal);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredQuotations.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    {isFetchingZoho ? (
                      <div className="flex flex-col items-center justify-center py-4">
                        <Loader2 className="w-7 h-7 animate-spin text-be-orange mb-2" />
                        <p className="text-sm font-semibold text-gray-800">Fetching live quotation records...</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-lg font-medium text-gray-900">No quotations found</p>
                        <p className="text-xs text-gray-400 mt-1">Create a new quotation or sync live records.</p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalQuotationsCount > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={totalQuotationsCount}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            itemLabel="quotations"
          />
        )}
      </div>

      {/* Create Quotation Modal Drawer */}
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
                <h2 className="text-xl font-bold text-gray-900">{editingQuotationId ? `Edit Quotation (${editingQuotationId})` : 'Create New Quotation'}</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100">
                  <X size={20} />
                </button>
              </div>

              {/* Stepper */}
              <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  {['Client Info', 'Company Details', 'Services'].map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center relative w-1/3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm mb-2 z-10 
                        ${currentStep > idx + 1 ? 'bg-emerald-500 text-white' : currentStep === idx + 1 ? 'bg-be-orange text-white ring-4 ring-orange-100' : 'bg-gray-200 text-gray-500'}`}>
                        {currentStep > idx + 1 ? <Check size={16} /> : idx + 1}
                      </div>
                      <span className={`text-xs font-medium text-center ${currentStep >= idx + 1 ? 'text-gray-900' : 'text-gray-400'}`}>{step}</span>
                      {idx < 2 && (
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
                          {quotationServices.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                No services added. Click "Add Service" to begin.
                              </td>
                            </tr>
                          )}
                          {quotationServices.map((service) => {
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
                    </div>
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
                {currentStep < 3 ? (
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
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-colors flex items-center shadow-md hover:shadow-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        <span>Saving Quotation...</span>
                      </>
                    ) : (
                      <>
                        <span>{editingQuotationId ? 'Update Quotation' : 'Create Quotation'}</span>
                        <Check size={16} className="ml-2" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget.isOpen}
        onClose={() => !deleteTarget.isDeleting && setDeleteTarget({ isOpen: false, quotation: null, isDeleting: false })}
        onConfirm={confirmDeleteQuotation}
        title="Delete Quotation"
        itemName={deleteTarget.quotation ? (deleteTarget.quotation.formData?.clientName || deleteTarget.quotation.client || deleteTarget.quotation.id) : undefined}
        message={deleteTarget.quotation ? `Are you sure you want to delete quotation "${deleteTarget.quotation.formData?.clientName || deleteTarget.quotation.client || deleteTarget.quotation.id}"?` : undefined}
        isDeleting={deleteTarget.isDeleting}
      />
    </div>
  );
};
