import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Filter, X, UploadCloud, ChevronRight, Check, Trash2, ChevronDown, Eye, Edit, RefreshCw, Cloud, CheckCircle2, AlertCircle, Loader2, ExternalLink, Users, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { saveDocument, saveAllDealsToIndexedDB, saveDealToIndexedDB, getAllDealsFromIndexedDB, bulkUpsertDealsToIndexedDB } from '../../lib/db';
import {
  saveOrUpdateZohoDeal,
  deleteZohoDeal,
  fetchZohoDeals,
  fetchZohoDealById,
  enrichDealFromZohoRecord,
  fetchAllZohoRecordsInBatches,
  uploadZohoAttachment,
  saveOrUpdateZohoCompany,
  saveOrUpdateZohoClient,
  deleteZohoRecord,
  fetchZohoEmployees,
  fetchSalesEmployees
} from '../../services/zohoService';
import { Pagination } from '../../components/ui/Pagination';
import { Layers, DownloadCloud } from 'lucide-react';

interface DealService {
  id: string;
  name: string;
  totalAmount?: string;
  baseAmount?: string;
}

export const Deals = () => {
  const navigate = useNavigate();
  const { currentUser, filterRecords } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState('All Deals');
  const [searchQuery, setSearchQuery] = useState('');

  // Zoho CRM states
  const [deals, setDeals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [];
  });

  const rbacDeals = useMemo(() => {
    return filterRecords ? filterRecords(deals, 'Deals') : deals;
  }, [deals, filterRecords, currentUser]);

  const parseZohoNum = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const findFirstPositive = (...vals: any[]): number => {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const num = parseZohoNum(v);
      if (num > 0) return num;
    }
    return 0;
  };

  const getDealReceived = (d: any): number => {
    if (!d) return 0;
    if (d.rawReceived && d.rawReceived > 0) return d.rawReceived;
    if (d.totals?.receivedAmount && Number(d.totals.receivedAmount) > 0) return Number(d.totals.receivedAmount);
    if (d.received && d.received !== '₹0') {
      const parsed = parseZohoNum(d.received);
      if (parsed > 0) return parsed;
    }
    if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
      const sRec = d.servicesData.reduce((sum: number, sf: any) => sum + parseZohoNum(sf.receivedAmount || sf.Received_amount || sf.Received), 0);
      if (sRec > 0) return sRec;
    }
    if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
      const sRec = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => sum + parseZohoNum(sf.Received_amount || sf.Received), 0);
      if (sRec > 0) return sRec;
    }
    if (d.rawZohoDeal) {
      const zRec = findFirstPositive(
        d.rawZohoDeal.Total_Received_Amount,
        d.rawZohoDeal.Deal_Received_Amount,
        d.rawZohoDeal.Received_amount,
        d.rawZohoDeal.Received_Amount,
        d.rawZohoDeal.Received,
        d.rawZohoDeal.Amount_After_disbursement
      );
      if (zRec > 0) return zRec;
    }
    return 0;
  };

  const getDealPending = (d: any): number => {
    if (!d) return 0;
    if (d.rawPending && d.rawPending > 0) return d.rawPending;
    if (d.totals?.pendingAmount && Number(d.totals.pendingAmount) > 0) return Number(d.totals.pendingAmount);
    if (d.pending && d.pending !== '₹0') {
      const parsed = parseZohoNum(d.pending);
      if (parsed > 0) return parsed;
    }
    if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
      const sPend = d.servicesData.reduce((sum: number, sf: any) => sum + parseZohoNum(sf.pendingAmount || sf.Pending_amount || sf.Pending), 0);
      if (sPend > 0) return sPend;
    }
    if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
      const sPend = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => sum + parseZohoNum(sf.Pending_amount || sf.Pending), 0);
      if (sPend > 0) return sPend;
    }
    if (d.rawZohoDeal) {
      const zPend = findFirstPositive(
        d.rawZohoDeal.Total_Pending_Amount,
        d.rawZohoDeal.Deal_Pending_Amount,
        d.rawZohoDeal.Pending_amount,
        d.rawZohoDeal.Pending_Amount,
        d.rawZohoDeal.Pending
      );
      if (zPend > 0) return zPend;
    }
    return 0;
  };

  const getDealAmount = (d: any): number => {
    if (!d) return 0;
    if (d.rawAmount && d.rawAmount > 0) return d.rawAmount;
    if (d.totals?.grandTotal && Number(d.totals.grandTotal) > 0) return Number(d.totals.grandTotal);
    if (d.amount && d.amount !== '₹0') {
      const parsed = parseZohoNum(d.amount);
      if (parsed > 0) return parsed;
    }
    if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
      const sTotal = d.servicesData.reduce((sum: number, sf: any) => {
        const a = parseZohoNum(sf.totalAmount || sf.Agreement_amount || sf.Total_amount || sf.Total || sf.Amount);
        const b = parseZohoNum(sf.baseAmount || sf.Without_GST || sf.Base);
        const itemTotal = a || (b > 0 ? Number((b / 0.82).toFixed(2)) : 0);
        return sum + itemTotal;
      }, 0);
      if (sTotal > 0) return sTotal;
    }
    if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
      const sTotal = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => {
        const a = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount);
        const b = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base);
        const itemTotal = a || (b > 0 ? Number((b / 0.82).toFixed(2)) : 0);
        return sum + itemTotal;
      }, 0);
      if (sTotal > 0) return sTotal;
    }
    if (d.rawZohoDeal) {
      const zAmt = findFirstPositive(
        d.rawZohoDeal.Total_deal_amount_inclusive_of_gst,
        d.rawZohoDeal.Amount,
        d.rawZohoDeal.Deal_Amount,
        d.rawZohoDeal.Grand_Total,
        d.rawZohoDeal.Grand_total,
        d.rawZohoDeal.GrandTotal,
        d.rawZohoDeal.Total_amount,
        d.rawZohoDeal.Total_Amount,
        d.rawZohoDeal.total_amount,
        d.rawZohoDeal.Agreement_amount,
        d.rawZohoDeal.Agreement_Amount,
        d.rawZohoDeal.Amount_Without_GST ? parseZohoNum(d.rawZohoDeal.Amount_Without_GST) / 0.82 : 0,
        d.rawZohoDeal.Deal_Amount_Without_GST ? parseZohoNum(d.rawZohoDeal.Deal_Amount_Without_GST) / 0.82 : 0,
        d.rawZohoDeal.Subtotal ? parseZohoNum(d.rawZohoDeal.Subtotal) * 1.18 : 0,
        d.rawZohoDeal.Amount_After_disbursement,
        d.rawZohoDeal.amount_if_you_have_kindly_put_0
      );
      if (zAmt > 0) return zAmt;
    }
    if (d.totals?.baseAmount && Number(d.totals.baseAmount) > 0) {
      return Number((Number(d.totals.baseAmount) / 0.82).toFixed(2));
    }
    const rec = getDealReceived(d);
    const pend = getDealPending(d);
    if (rec + pend > 0) return rec + pend;
    return 0;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);
  // Pagination & Batch Sync states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMoreZohoRecords, setHasMoreZohoRecords] = useState(false);
  const [isFetchingBatch, setIsFetchingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ loaded: number; batch: number; percent?: number } | null>(null);

  // Sales Employees & Partner BDM states
  const [salesEmployees, setSalesEmployees] = useState<any[]>([]);
  const [isLoadingSalesEmployees, setIsLoadingSalesEmployees] = useState<boolean>(false);
  const [hasPartnerBdm, setHasPartnerBdm] = useState<boolean>(false);
  const [partnerBdmId, setPartnerBdmId] = useState<string>('');
  const [partnerBdmName, setPartnerBdmName] = useState<string>('');

  const loadSalesEmployees = useCallback(async () => {
    setIsLoadingSalesEmployees(true);
    try {
      // 1. Fetch live sales employees & BDMs directly from Zoho CRM
      const res = await fetchSalesEmployees();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setSalesEmployees(res.data);
        localStorage.setItem('be_sales_employees', JSON.stringify(res.data));
        return;
      }

      // Fallback 1: check cached sales employees
      const cached = localStorage.getItem('be_sales_employees');
      if (cached) {
        setSalesEmployees(JSON.parse(cached));
        return;
      }

      // Fallback 2: check Zoho Employees endpoint
      const empRes = await fetchZohoEmployees();
      if (empRes.success && Array.isArray(empRes.data) && empRes.data.length > 0) {
        const mapped = empRes.data.map((z: any) => ({
          id: String(z.id || z.Employment_ID),
          zohoId: String(z.id),
          name: [z.Name, z.Middle_Name, z.Last_Name].filter(Boolean).join(' ') || z.Name || 'Sales Employee',
          email: z.Email || z.Personal_Email_Address || '',
          dept: z.Department || 'Sales',
          role: z.Designation_Job_Title || z.System_Role || 'Sales',
          empId: z.Employment_ID || String(z.id),
          status: 'Active'
        }));
        setSalesEmployees(mapped);
        return;
      }

      // Fallback 3: check be_employees in localStorage
      const local = localStorage.getItem('be_employees');
      const emps = local ? JSON.parse(local) : [];
      if (Array.isArray(emps) && emps.length > 0) {
        const filtered = emps.filter((e: any) => {
          const dept = (e.dept || e.Department || '').toLowerCase();
          const role = (e.role || e.Designation || '').toLowerCase();
          return dept.includes('sales') || dept.includes('bdm') || role.includes('sales') || role.includes('bdm') || role.includes('business development');
        });
        if (filtered.length > 0) {
          setSalesEmployees(filtered);
        }
      }
    } catch (e) {
      console.warn('Failed to load sales employees for Partner BDM dropdown:', e);
    } finally {
      setIsLoadingSalesEmployees(false);
    }
  }, []);

  useEffect(() => {
    loadSalesEmployees();
  }, [loadSalesEmployees]);

  // Filter only active employees from the Sales department, excluding primary BDM
  const eligiblePartnerBdms = useMemo(() => {
    return salesEmployees.filter((emp: any) => {
      // 1. Status must be Active (if present)
      const status = (emp.status || emp.Status || emp.formData?.status || 'Active').toLowerCase();
      if (status === 'inactive') return false;

      // 2. Exclude primary BDM (deal owner or current user if multiple sales employees exist)
      const empId = String(emp.id || emp.zohoId || emp.empId || '').toLowerCase().trim();
      const empName = String(emp.name || emp.Name || '').toLowerCase().trim();
      const empEmail = String(emp.email || emp.Email || emp.workEmail || '').toLowerCase().trim();

      if (editingDealId) {
        const editingDeal = deals.find(d => d.id === editingDealId || d.zohoId === editingDealId);
        const ownerName = String(editingDeal?.owner || editingDeal?.bdmName || '').toLowerCase().trim();
        if (ownerName && empName === ownerName) return false;
      } else if (currentUser && salesEmployees.length > 1) {
        if (currentUser.id && empId && empId === currentUser.id.toLowerCase()) return false;
        if (currentUser.name && empName === currentUser.name.toLowerCase().trim()) return false;
        if (currentUser.email && empEmail && empEmail === currentUser.email.toLowerCase().trim()) return false;
      }

      return true;
    });
  }, [salesEmployees, currentUser, editingDealId, deals]);

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

  // Real-time calculation: Pre-GST Received Amount = Received Amount / 1.18, Partner BDM Amount = Pre-GST / 2
  const partnerBdmAmount = useMemo(() => {
    if (!hasPartnerBdm) return 0;
    const rec = Number(amountReceived) || 0;
    if (rec <= 0 || isNaN(rec)) return 0;
    const preGst = rec / 1.18;
    const split = preGst / 2;
    return Math.round(split * 100) / 100;
  }, [hasPartnerBdm, amountReceived]);

  const handleOpenModal = (deal?: any) => {
    setIsCreateModalOpen(true);
    setCurrentStep(1);
    setFormErrors({});
    setFileError('');
    setDocuments([]);
    loadSalesEmployees();

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
      setAmountReceived(deal.totals?.amountReceived || (deal.received ? deal.received.replace(/[^0-9.]/g, '') : ''));
      setPaymentScreenshotName(deal.paymentScreenshotName || '');
      setPaymentScreenshotFile(null);
      setHasPartnerBdm(Boolean(deal.hasPartnerBdm || deal.has_partner_bdm || deal.formData?.hasPartnerBdm || deal.formData?.has_partner_bdm));
      setPartnerBdmId(deal.partnerBdmId || deal.partner_bdm_id || deal.formData?.partnerBdmId || deal.formData?.partner_bdm_id || '');
      setPartnerBdmName(deal.partnerBdmName || deal.partner_bdm_name || deal.formData?.partnerBdmName || deal.formData?.partner_bdm_name || '');
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
      setHasPartnerBdm(false);
      setPartnerBdmId('');
      setPartnerBdmName('');
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
      setHasPartnerBdm(false);
      setPartnerBdmId('');
      setPartnerBdmName('');
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
      if (hasPartnerBdm && (!partnerBdmId || !partnerBdmName)) {
        errors.partnerBdm = 'Please select a Partner BDM from the Sales department.';
      }
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


  // Load complete 10,000+ dataset from IndexedDB on mount, then fetch latest or auto-stream
  useEffect(() => {
    let isMounted = true;
    const loadDeals = async () => {
      let count = 0;
      let hasZeroAmounts = false;
      try {
        const idbDeals = await getAllDealsFromIndexedDB();
        if (isMounted && Array.isArray(idbDeals) && idbDeals.length > 0) {
          const hydrated = idbDeals.map((d: any) => {
            const a = getDealAmount(d);
            const r = getDealReceived(d);
            const p = getDealPending(d);
            return {
              ...d,
              amount: a > 0 ? `₹${a.toLocaleString('en-IN')}` : (d.amount || '₹0'),
              received: r > 0 ? `₹${r.toLocaleString('en-IN')}` : (d.received || '₹0'),
              pending: p > 0 ? `₹${p.toLocaleString('en-IN')}` : (d.pending || '₹0'),
              rawAmount: a,
              rawReceived: r,
              rawPending: p,
            };
          });
          setDeals(hydrated);
          count = hydrated.length;
          // Check if cached deals have old ₹0 amounts
          const sample = hydrated.slice(0, 30);
          hasZeroAmounts = sample.length > 0 && sample.some((d: any) => d.amount === '₹0' || !d.amount || d.amount === 0);
        }
      } catch (err) {
        console.warn('IndexedDB initial load error:', err);
      }
      if (isMounted) {
        if (count < 10480 || hasZeroAmounts) {
          // If fresh, incomplete (< 10,480), or cached with ₹0, automatically stream fresh records with real amounts
          handleFetchAllBatchesFromZoho(false, count < 10480 || hasZeroAmounts);
        } else {
          // Otherwise fetch latest updates for page 1
          handleFetchFromZoho(false);
        }
      }
    };
    loadDeals();
    return () => { isMounted = false; };
  }, []);

  // Listen for real-time live deal updates from DealDetails view
  useEffect(() => {
    const handleDealUpdate = (e: any) => {
      const updated = e.detail;
      if (!updated) return;
      setDeals(prevDeals => {
        const idx = prevDeals.findIndex(d => 
          d.id === updated.id || 
          d.zohoId === updated.zohoId || 
          d.id === updated.zohoId || 
          d.zohoId === updated.id ||
          (d.id && updated.id && String(d.id).includes(String(updated.id))) ||
          (d.id && updated.zohoId && String(d.id).includes(String(updated.zohoId)))
        );
        if (idx >= 0) {
          const copy = [...prevDeals];
          copy[idx] = { ...copy[idx], ...updated };
          return copy;
        }
        return [updated, ...prevDeals];
      });
    };
    window.addEventListener('be_deals_updated', handleDealUpdate);
    return () => window.removeEventListener('be_deals_updated', handleDealUpdate);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  // Set of deals currently being enriched or already enriched in this session
  const enrichingDealsRef = useRef<Set<string>>(new Set());

  // 1. Auto-enrich visible deals on the active page that have ₹0 amounts
  useEffect(() => {
    // Filter deals based on activeTab and searchQuery to get active page slice
    const filtered = deals.filter(deal => {
      if (activeTab === 'Manual Deals' && deal.source === 'Zoho CRM') return false;
      if (activeTab === 'From Quotations' && deal.source !== 'Quotation' && !deal.quotationId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchClient = deal.client && (deal.client ?? '').toLowerCase().includes(q);
        const matchCompany = deal.company && (deal.company ?? '').toLowerCase().includes(q);
        const matchService = deal.service && (deal.service ?? '').toLowerCase().includes(q);
        const matchId = deal.id && (deal.id ?? '').toLowerCase().includes(q);
        if (!matchClient && !matchCompany && !matchService && !matchId) return false;
      }
      return true;
    });

    const pageSlice = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const dealsToEnrich = pageSlice.filter(
      (d: any) => (getDealAmount(d) === 0 || !d.servicesData || d.servicesData.length === 0) &&
                  (d.zohoId || (d.id && String(d.id).length > 8)) &&
                  !enrichingDealsRef.current.has(String(d.zohoId || d.id))
    );

    if (dealsToEnrich.length === 0) return;

    let isCancelled = false;

    dealsToEnrich.forEach((d: any) => {
      const targetId = String(d.zohoId || d.id);
      enrichingDealsRef.current.add(targetId);

      fetchZohoDealById(targetId).then(res => {
        if (isCancelled) return;
        if (res.success && res.data) {
          const enriched = enrichDealFromZohoRecord(res.data, d);
          if (enriched) {
            setDeals(prevDeals => {
              const idx = prevDeals.findIndex(p => p.id === d.id || p.zohoId === d.zohoId || p.id === d.zohoId || p.zohoId === d.id);
              if (idx >= 0) {
                const copy = [...prevDeals];
                copy[idx] = { ...copy[idx], ...enriched };
                return copy;
              }
              return prevDeals;
            });
            saveDealToIndexedDB(enriched).catch(() => {});
          }
        }
      }).catch(() => {});
    });

    return () => {
      isCancelled = true;
    };
  }, [deals, currentPage, itemsPerPage, activeTab, searchQuery]);

  // 2. Progressive background repair worker for historical deals in IndexedDB
  useEffect(() => {
    let isCancelled = false;
    const runBackgroundRepair = async () => {
      // Delay to let main UI finish initial rendering
      await new Promise(r => setTimeout(r, 2500));
      if (isCancelled) return;

      try {
        const allDeals = await getAllDealsFromIndexedDB();
        const unEnriched = allDeals.filter(
          (d: any) => (getDealAmount(d) === 0 || !d.servicesData || d.servicesData.length === 0) &&
                      (d.zohoId || (d.id && String(d.id).length > 8)) &&
                      !enrichingDealsRef.current.has(String(d.zohoId || d.id))
        );

        if (unEnriched.length === 0) return;

        console.log(`[Deal Repair Worker] Starting background repair for ${unEnriched.length} deals`);

        // Process in chunks of 10 concurrent requests
        const chunkSize = 10;
        for (let i = 0; i < unEnriched.length; i += chunkSize) {
          if (isCancelled) break;
          const chunk = unEnriched.slice(i, i + chunkSize);
          
          await Promise.allSettled(chunk.map(async (d: any) => {
            const targetId = String(d.zohoId || d.id);
            enrichingDealsRef.current.add(targetId);
            try {
              const res = await fetchZohoDealById(targetId);
              if (res.success && res.data) {
                const enriched = enrichDealFromZohoRecord(res.data, d);
                if (enriched) {
                  await saveDealToIndexedDB(enriched);
                  setDeals(prevDeals => {
                    const idx = prevDeals.findIndex(p => p.id === d.id || p.zohoId === d.zohoId || p.id === d.zohoId || p.zohoId === d.id);
                    if (idx >= 0) {
                      const copy = [...prevDeals];
                      copy[idx] = { ...copy[idx], ...enriched };
                      return copy;
                    }
                    return prevDeals;
                  });
                }
              }
            } catch (err) {}
          }));

          // Responsive breathing pause between batches
          await new Promise(r => setTimeout(r, 400));
        }
      } catch (err) {
        console.warn('Background repair error:', err);
      }
    };

    runBackgroundRepair();
    return () => { isCancelled = true; };
  }, []);


  const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('won') || s.includes('execut')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s.includes('lost')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (s.includes('negotiat') || s.includes('allocat')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (s.includes('propos') || s.includes('legal')) return 'bg-orange-100 text-orange-700 border-orange-200';
    if (s.includes('qualif') || s.includes('account')) return 'bg-purple-100 text-purple-700 border-purple-200';
    if (s.includes('sale')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const safeSaveDealsToStorage = (dealsList: any[]) => {
    // 1. Save complete 10,000+ dataset to IndexedDB
    saveAllDealsToIndexedDB(dealsList).catch(err => console.warn('IndexedDB save warning:', err));

    // 2. Save 2,000 deals to localStorage as sync cache fallback
    try {
      const trimmed = dealsList.slice(0, 2000);
      localStorage.setItem('be_deals', JSON.stringify(trimmed));
    } catch (err) {
      try {
        const trimmed = dealsList.slice(0, 500);
        localStorage.setItem('be_deals', JSON.stringify(trimmed));
      } catch (e) {
        console.warn('LocalStorage unavailable for caching deals:', e);
      }
    }
  };

  const handleCreateDeal = async () => {
    setIsSubmitting(true);
    try {
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

          // Save to be_companies in localStorage safely
          const updatedCompaniesList = existingComp 
            ? existingCompanies.map((c: any) => c.id === existingComp.id ? { ...c, ...companySavedLocally } : c)
            : [companySavedLocally, ...existingCompanies];
          try {
            localStorage.setItem('be_companies', JSON.stringify(updatedCompaniesList));
          } catch (e) {
            console.warn('LocalStorage save error for companies:', e);
          }
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
            (cl.email && formData.email && (cl.email ?? '').toLowerCase() === (formData.email ?? '').trim().toLowerCase()) ||
            (cl.phone && formData.mobile && cl.phone === formData.mobile.replace(/[^0-9]/g, '')) ||
            (cl.name?.toLowerCase() === formData.clientName.trim().toLowerCase())
          );

          clientSavedLocally = {
            id: existingClient?.id || `CL-${Math.floor(1000 + Math.random() * 9000)}`,
            name: formData.clientName.trim(),
            company: formData.companyName ? formData.companyName.trim() : (existingClient?.company || 'Individual'),
            email: formData.email ? (formData.email ?? '').trim() : (existingClient?.email || ''),
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

          // Save to be_clients in localStorage safely
          const updatedClientsList = existingClient
            ? existingClients.map((cl: any) => cl.id === existingClient.id ? { ...cl, ...clientSavedLocally } : cl)
            : [clientSavedLocally, ...existingClients];
          try {
            localStorage.setItem('be_clients', JSON.stringify(updatedClientsList));
          } catch (e) {
            console.warn('LocalStorage save error for clients:', e);
          }
        } catch (clErr) {
          console.warn('Auto-saving client failed:', clErr);
        }
      }

      // 4. Build Deal Object with Linked Company, Client, and Partner BDM details
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
        owner: existingDeal?.owner || currentUser?.name || 'Admin',
        employeeZohoId: existingDeal?.employeeZohoId || currentUser?.zohoId,
        employeeName: existingDeal?.employeeName || currentUser?.name,
        employeeEmail: existingDeal?.employeeEmail || currentUser?.email,
        empId: existingDeal?.empId || currentUser?.empId || currentUser?.id,
        salesEmployee: existingDeal?.salesEmployee || currentUser?.name,
        date: existingDeal?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        source: existingDeal?.source || 'Manual',
        // Partner BDM split details
        hasPartnerBdm: hasPartnerBdm,
        has_partner_bdm: hasPartnerBdm,
        partnerBdmId: hasPartnerBdm ? partnerBdmId : '',
        partner_bdm_id: hasPartnerBdm ? partnerBdmId : '',
        partnerBdmName: hasPartnerBdm ? partnerBdmName : '',
        partner_bdm_name: hasPartnerBdm ? partnerBdmName : '',
        partnerBdmAmount: hasPartnerBdm ? partnerBdmAmount : 0,
        partner_bdm_amount: hasPartnerBdm ? partnerBdmAmount : 0,
        // Full details
        formData: {
          ...formData,
          companyZohoId,
          clientZohoId,
          employeeZohoId: existingDeal?.employeeZohoId || currentUser?.zohoId,
          employeeName: existingDeal?.employeeName || currentUser?.name,
          employeeEmail: existingDeal?.employeeEmail || currentUser?.email,
          empId: existingDeal?.empId || currentUser?.empId || currentUser?.id,
          salesEmployee: existingDeal?.salesEmployee || currentUser?.name,
          hasPartnerBdm,
          has_partner_bdm: hasPartnerBdm,
          partnerBdmId: hasPartnerBdm ? partnerBdmId : '',
          partner_bdm_id: hasPartnerBdm ? partnerBdmId : '',
          partnerBdmName: hasPartnerBdm ? partnerBdmName : '',
          partner_bdm_name: hasPartnerBdm ? partnerBdmName : '',
          partnerBdmAmount: hasPartnerBdm ? partnerBdmAmount : 0,
          partner_bdm_amount: hasPartnerBdm ? partnerBdmAmount : 0,
        },
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
      saveDealToIndexedDB(dealData).catch(e => console.warn('Single deal IDB save error:', e));
      safeSaveDealsToStorage(newDealsList);
    } catch (createErr: any) {
      console.error('Deal creation error:', createErr);
      setToast({
        type: 'error',
        message: 'Failed to complete deal creation',
        submessage: createErr?.message || 'An unexpected error occurred'
      });
    } finally {
      setIsSubmitting(false);
      handleCloseModal();
    }
  };

  const handleDeleteDeal = async (deal: any) => {
    const dealName = deal.formData?.clientName || deal.client || deal.id;
    if (confirm(`Are you sure you want to delete deal "${dealName}"?`)) {
      const newDealsList = deals.filter((d: any) => d.id !== deal.id);
      setDeals(newDealsList);
      safeSaveDealsToStorage(newDealsList);

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
        try {
          localStorage.setItem('be_companies', JSON.stringify(updatedCompaniesList));
        } catch (e) {}
      }

      // 2. Ensure Client is created and synced if present
      let clientZohoId = deal.clientZohoId || deal.formData?.clientZohoId;
      const clientName = deal.client || deal.formData?.clientName;
      if (clientName && clientName !== 'Client' && !clientZohoId) {
        const rawClients = localStorage.getItem('be_clients');
        const existingClients = rawClients ? JSON.parse(rawClients) : [];
        const existingClient = existingClients.find((cl: any) => 
          (cl.name?.toLowerCase() === clientName.trim().toLowerCase()) ||
          (cl.email && deal.formData?.email && (cl.email ?? '').toLowerCase() === deal.formData.email.trim().toLowerCase())
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
        try {
          localStorage.setItem('be_clients', JSON.stringify(updatedClientsList));
        } catch (e) {}
      }

      // 3. Save or update the deal in Zoho CRM
      const dealWithLookups = {
        ...deal,
        companyZohoId: companyZohoId || deal.companyZohoId,
        clientZohoId: clientZohoId || deal.clientZohoId,
        employeeZohoId: deal.employeeZohoId || deal.formData?.employeeZohoId || currentUser?.zohoId,
        employeeName: deal.employeeName || deal.formData?.employeeName || deal.salesEmployee || deal.owner || currentUser?.name,
        employeeEmail: deal.employeeEmail || deal.formData?.employeeEmail || currentUser?.email,
        empId: deal.empId || deal.formData?.empId || currentUser?.empId || currentUser?.id,
        salesEmployee: deal.salesEmployee || deal.employeeName || currentUser?.name,
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
        safeSaveDealsToStorage(updatedList);
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
        safeSaveDealsToStorage(updatedList);
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

  const cancelSyncRef = useRef(false);

  const processZohoDealsBatch = (rawDeals: any[], currentDeals: any[]) => {
    const updatedDeals = [...currentDeals];
    let newCount = 0;
    let updatedCount = 0;

    // Fast O(1) lookup index maps
    const dealIndexByZohoId = new Map<string, number>();
    const dealIndexById = new Map<string, number>();
    updatedDeals.forEach((d, idx) => {
      if (d.zohoId) {
        dealIndexByZohoId.set(String(d.zohoId), idx);
      }
      if (d.id) {
        dealIndexById.set(String(d.id), idx);
      }
    });

    // Batch cache for companies and clients
    let localCompanies: any[] = [];
    let localClients: any[] = [];
    try {
      const rawComp = localStorage.getItem('be_companies');
      if (rawComp) localCompanies = JSON.parse(rawComp);
    } catch (e) {}
    try {
      const rawCl = localStorage.getItem('be_clients');
      if (rawCl) localClients = JSON.parse(rawCl);
    } catch (e) {}

    const knownCompanyNames = new Set(localCompanies.map((c: any) => (c.name || '').toLowerCase().trim()));
    const knownClientNames = new Set(localClients.map((c: any) => (c.name || '').toLowerCase().trim()));
    let companiesChanged = false;
    let clientsChanged = false;

    rawDeals.forEach((zDeal: any) => {
      const zIdStr = String(zDeal.id || '');
      let existingIdx = -1;
      if (zIdStr && dealIndexByZohoId.has(zIdStr)) {
        existingIdx = dealIndexByZohoId.get(zIdStr)!;
      } else if (zIdStr && dealIndexById.has(zIdStr)) {
        existingIdx = dealIndexById.get(zIdStr)!;
      }

      // 1. Clean Client Name & Company Name
      let resolvedClientName = '';
      if (zDeal.Client_Name && typeof zDeal.Client_Name === 'string' && !/^\(\d+\)$/.test(zDeal.Client_Name.trim())) {
        resolvedClientName = zDeal.Client_Name.trim();
      } else if (zDeal.Clients && typeof zDeal.Clients === 'object' && zDeal.Clients.name && !/^\(\d+\)$/.test(zDeal.Clients.name.trim())) {
        resolvedClientName = zDeal.Clients.name.trim();
      } else if (zDeal.Contact_Name && typeof zDeal.Contact_Name === 'object' && zDeal.Contact_Name.name) {
        resolvedClientName = zDeal.Contact_Name.name.trim();
      } else if (zDeal.Company_name && !/^\(\d+\)$/.test(zDeal.Company_name.trim())) {
        resolvedClientName = zDeal.Company_name.trim();
      } else if (zDeal.Company_name_bp && !/^\(\d+\)$/.test(zDeal.Company_name_bp.trim())) {
        resolvedClientName = zDeal.Company_name_bp.trim();
      } else if (zDeal.Company_name_cs && !/^\(\d+\)$/.test(zDeal.Company_name_cs.trim())) {
        resolvedClientName = zDeal.Company_name_cs.trim();
      } else if (zDeal.Company && typeof zDeal.Company === 'object' && zDeal.Company.name && !/^\(\d+\)$/.test(zDeal.Company.name.trim())) {
        resolvedClientName = zDeal.Company.name.trim();
      } else if (zDeal.Deal_Name) {
        const parts = zDeal.Deal_Name.split(' - ');
        const candidate = parts[0]?.replace(/^\(|\)$/g, '').trim();
        resolvedClientName = candidate && !/^\d+$/.test(candidate) ? candidate : 'Client';
      } else {
        resolvedClientName = 'Client';
      }

      const resolvedCompanyName = 
        (zDeal.Company_name && !/^\(\d+\)$/.test(zDeal.Company_name.trim()) ? zDeal.Company_name.trim() : '') ||
        (zDeal.Company_name_bp && !/^\(\d+\)$/.test(zDeal.Company_name_bp.trim()) ? zDeal.Company_name_bp.trim() : '') ||
        (zDeal.Company_name_cs && !/^\(\d+\)$/.test(zDeal.Company_name_cs.trim()) ? zDeal.Company_name_cs.trim() : '') ||
        (zDeal.Company_name_st && !/^\(\d+\)$/.test(zDeal.Company_name_st.trim()) ? zDeal.Company_name_st.trim() : '') ||
        (zDeal.Company && typeof zDeal.Company === 'object' && zDeal.Company.name && !/^\(\d+\)$/.test(zDeal.Company.name.trim()) ? zDeal.Company.name.trim() : '') ||
        (zDeal.Account_Name && typeof zDeal.Account_Name === 'object' && zDeal.Account_Name.name && !/^\(\d+\)$/.test(zDeal.Account_Name.name.trim()) ? zDeal.Account_Name.name.trim() : '') ||
        (zDeal.Company_Name && !/^\(\d+\)$/.test(zDeal.Company_Name.trim()) ? zDeal.Company_Name.trim() : '') ||
        (resolvedClientName && resolvedClientName !== 'Client' ? resolvedClientName : 'Individual');

      // 2. Financials
      const parseZohoNum = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };

      const formatRupee = (val: number): string => {
        if (!val || isNaN(val) || val <= 0) return '₹0';
        return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
      };

      const findFirstPositive = (...vals: any[]): number => {
        for (const v of vals) {
          if (v === null || v === undefined) continue;
          const num = parseZohoNum(v);
          if (num > 0) return num;
        }
        return 0;
      };

      // Sum Subform_1 service line items if available
      let subformTotal = 0;
      let subformWithoutGst = 0;
      let subformReceived = 0;
      let subformPending = 0;
      if (Array.isArray(zDeal.Subform_1) && zDeal.Subform_1.length > 0) {
        zDeal.Subform_1.forEach((sf: any) => {
          const a = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount);
          const bg = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base);
          const r = parseZohoNum(sf.Received_amount || sf.Received);
          const p = parseZohoNum(sf.Pending_amount || sf.Pending);
          subformTotal += a || (bg > 0 ? Number((bg / 0.82).toFixed(2)) : 0);
          subformWithoutGst += bg || (a > 0 ? Number((a * 0.82).toFixed(2)) : 0);
          subformReceived += r;
          subformPending += p;
        });
      }

      const totalAmountNum = findFirstPositive(
        zDeal.Total_deal_amount_inclusive_of_gst,
        zDeal.Amount,
        zDeal.Deal_Amount,
        zDeal.Grand_Total,
        zDeal.Grand_total,
        zDeal.GrandTotal,
        zDeal.Total_amount,
        zDeal.Total_Amount,
        zDeal.total_amount,
        zDeal.Agreement_amount,
        zDeal.Agreement_Amount,
        zDeal.Amount_Without_GST ? parseZohoNum(zDeal.Amount_Without_GST) / 0.82 : 0,
        zDeal.Deal_Amount_Without_GST ? parseZohoNum(zDeal.Deal_Amount_Without_GST) / 0.82 : 0,
        zDeal.Subtotal ? parseZohoNum(zDeal.Subtotal) * 1.18 : 0,
        zDeal.Amount_After_disbursement,
        subformTotal,
        zDeal.Total_Received_Amount,
        zDeal.Deal_Received_Amount,
        zDeal.Received_amount,
        zDeal.Received,
        zDeal.amount_if_you_have_kindly_put_0,
        existingIdx >= 0 ? parseZohoNum(updatedDeals[existingIdx]?.rawAmount || updatedDeals[existingIdx]?.amount || updatedDeals[existingIdx]?.totals?.grandTotal) : 0
      );

      const withoutGstNum = findFirstPositive(
        zDeal.Amount_Without_GST,
        zDeal.Deal_Amount_Without_GST,
        subformWithoutGst,
        totalAmountNum > 0 ? Number((totalAmountNum * 0.82).toFixed(2)) : 0
      );

      const gstAmountNum = findFirstPositive(
        zDeal.GST_Amount,
        zDeal.Deal_GST_Amount,
        totalAmountNum > withoutGstNum ? Number((totalAmountNum - withoutGstNum).toFixed(2)) : 0
      );

      const receivedAmountNum = findFirstPositive(
        zDeal.Total_Received_Amount,
        zDeal.Deal_Received_Amount,
        zDeal.Received_amount,
        zDeal.Received_Amount,
        zDeal.Received,
        zDeal.Amount_After_disbursement,
        subformReceived,
        existingIdx >= 0 ? parseZohoNum(updatedDeals[existingIdx]?.rawReceived || updatedDeals[existingIdx]?.received || updatedDeals[existingIdx]?.totals?.receivedAmount) : 0
      );

      const pendingAmountNum = findFirstPositive(
        zDeal.Total_Pending_Amount,
        zDeal.Deal_Pending_Amount,
        zDeal.Pending_amount,
        zDeal.Pending_Amount,
        zDeal.Pending,
        subformPending,
        totalAmountNum > receivedAmountNum ? Number((totalAmountNum - receivedAmountNum).toFixed(2)) : 0,
        existingIdx >= 0 ? parseZohoNum(updatedDeals[existingIdx]?.rawPending || updatedDeals[existingIdx]?.pending || updatedDeals[existingIdx]?.totals?.pendingAmount) : 0
      );

      // 3. Contact & Tax info
      const contactPhone = zDeal.Client_contact_detail || zDeal.Client_contact_detail_cs || zDeal.Client_contact_detail_bp || zDeal.Client_contact_detail_fnf || zDeal.client_contact_detail_st || zDeal.Client_s_alternate_contact_detail || zDeal.Client_s_alternate_contact_detail_bp || zDeal.Mobile || zDeal.Phone || '';
      const contactEmail = zDeal.Client_Email_address || zDeal.Client_Email_address_cs || zDeal.Client_Email_address_fnf || zDeal.Client_Email_address_bp || zDeal.client_email_address_st || zDeal.Email || '';
      const gstNum = zDeal.Gst_number || zDeal.GST_Number || zDeal.GSTIN || '';
      const panNum = zDeal.Pan_number || zDeal.PAN_Number || zDeal.PAN_Card || zDeal.PAN || '';
      const aadhaarNum = zDeal.Aadhaar_Card || zDeal.Aadhaar_number || zDeal.Aadhaar_Number || zDeal.Aadhar_Card || '';
      const billAddress = zDeal.Billing_address || zDeal.Company_address || '';
      const stateName = zDeal.State || (billAddress ? billAddress.split(',').pop()?.trim() : '') || '';

      // 4. Subform_1 (Choose Services)
      let servicesFromSubform: any[] = [];
      if (Array.isArray(zDeal.Subform_1) && zDeal.Subform_1.length > 0) {
        servicesFromSubform = zDeal.Subform_1.map((sf: any, i: number) => {
          const agreementAmount = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || 0);
          const withoutGst = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? Number((agreementAmount * 0.82).toFixed(2)) : 0));
          const totalAmt = agreementAmount || (withoutGst > 0 ? Number((withoutGst / 0.82).toFixed(2)) : 0);
          return {
            id: String(sf.id || i + 1),
            name: sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || 'Service',
            totalAmount: String(totalAmt || ''),
            baseAmount: String(withoutGst || 0),
            receivedAmount: sf.Received_amount || sf.Received || '',
            pendingAmount: sf.Pending_amount || sf.Pending || '',
            paymentStages: sf.Payment_stages || '',
            paymentType: sf.Payment_type || '',
            paymentDate: sf.Payment_received_date || '',
            qualityProvided: sf.Quality_provided || '',
            successFees: sf.Success_fees || '',
          };
        });
      } else {
        let inferredServiceName = '';
        if (zDeal.Service_Name) {
          inferredServiceName = zDeal.Service_Name;
        } else if (zDeal.Choose_Wisely && zDeal.Choose_Wisely !== 'New Case Booking') {
          inferredServiceName = zDeal.Choose_Wisely;
        } else if (zDeal.Deal_Name && zDeal.Deal_Name.includes(' - ')) {
          const afterHyphen = zDeal.Deal_Name.split(' - ').slice(1).join(' - ').trim();
          if (afterHyphen && !/^\(\d+\)$/.test(afterHyphen)) {
            inferredServiceName = afterHyphen;
          }
        }
        if (!inferredServiceName) {
          inferredServiceName = zDeal.Choose_Wisely || (existingIdx >= 0 ? updatedDeals[existingIdx]?.service : 'Services') || 'Services';
        }

        servicesFromSubform = [{
          id: '1',
          name: inferredServiceName || 'Services',
          totalAmount: String(totalAmountNum || ''),
          baseAmount: String(withoutGstNum || ''),
          receivedAmount: String(receivedAmountNum || ''),
          pendingAmount: String(pendingAmountNum || ''),
        }];
      }

      const serviceTitle = servicesFromSubform.length === 1 
        ? servicesFromSubform[0].name 
        : servicesFromSubform.length > 1 
          ? `${servicesFromSubform.length} Services` 
          : 'Services';

      // 5. Legal Subform
      const legalSubform = Array.isArray(zDeal.Legal) && zDeal.Legal.length > 0
        ? zDeal.Legal.map((lg: any, i: number) => ({
            id: String(lg.id || i + 1),
            schema: lg.Legal_Schemas || lg.Schemas || '',
            tenure: lg.Tenure_of_Service || '',
            docTypes: lg.Types_of_legal_documents || '',
            terms1: lg.Agreement_Terms_I || '',
            terms2: lg.Agreement_Terms_II || '',
            dataChecker: lg.Data_checker_name_subform?.name || lg.Data_checker_name_subform || '',
            dateCheckedDate: lg.Date_checked_date || '',
            dateCheckerStatus: lg.Date_checker_status || '',
            dprStatus: lg.DPR_status || '',
            dateOfDprStatusChange: lg.Date_of_DPR_status_change || '',
            dprTl: lg.Operation_team_leader?.name || lg.Operation_team_leader || '',
            dprMember: lg.Operation_team_member?.name || lg.Operation_team_member || '',
            financeStatus: lg.Finance_status || '',
            dateOfFinanceStatusChange: lg.Date_of_finance_status_change || '',
            financeTl: lg.Finance_team_leader?.name || lg.Finance_team_leader || '',
            financeMember: lg.Finance_team_member?.name || lg.Finance_team_member || '',
            legalStatus: lg.Internal_legal_status || '',
            internalTeamType: lg.Internal_team_type || '',
            qualityProvided: lg.Quality_provided || '',
            distributionPaid: lg.Distribution_of_amount_paid_by_the_S || lg.Distribution_of_amount_paid_by_ || '',
            remark: lg.Remark || ''
          }))
        : [];

      const stageName = zDeal.Stage || 'Sales';
      let statusName = 'New';
      if (stageName === 'Closed Won' || stageName === 'Won' || stageName.includes('Won') || stageName === 'Operations executors') {
        statusName = 'Won';
      } else if (stageName === 'Closed Lost' || stageName === 'Lost' || stageName.includes('Lost')) {
        statusName = 'Lost';
      } else if (stageName.includes('Negotiat')) {
        statusName = 'Negotiation';
      } else if (stageName.includes('Propos')) {
        statusName = 'Proposal';
      } else if (stageName.includes('Qualif')) {
        statusName = 'Qualified';
      } else {
        statusName = stageName;
      }

      const resolvedDealId = existingIdx >= 0 
        ? updatedDeals[existingIdx]?.id 
        : (zDeal.id ? String(zDeal.id) : `DL-${Math.floor(1000 + Math.random() * 9000)}`);

      // Resolve Partner BDM details from Zoho CRM Deal
      const hasPartnerBdm = Boolean(
        zDeal.Has_Partner_BDM || 
        zDeal.has_partner_bdm || 
        zDeal.Partner_BDM || 
        zDeal.Partner_BDM_Name || 
        zDeal.Partner_BDM_name || 
        zDeal.Partner_BDM_Names || 
        zDeal.Partner_BDM_amount ||
        (existingIdx >= 0 && updatedDeals[existingIdx]?.hasPartnerBdm)
      );

      const partnerBdmName = 
        zDeal.Partner_BDM_Name || 
        zDeal.Partner_BDM_name || 
        zDeal.Partner_BDM_Names || 
        zDeal.Partner_BDM_Names_bp || 
        zDeal.Partner_BDM_Names_st || 
        zDeal.partner_bdm_name ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.partnerBdmName : '') || 
        '';

      const partnerBdmId = 
        zDeal.Partner_BDM_ID || 
        zDeal.partner_bdm_id || 
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.partnerBdmId : '') || 
        '';

      let partnerBdmAmount = Number(zDeal.Partner_BDM_Amount || zDeal.Partner_BDM_amount || zDeal.partner_bdm_amount || 0);
      if (hasPartnerBdm && (!partnerBdmAmount || partnerBdmAmount === 0) && receivedAmountNum > 0) {
        partnerBdmAmount = Number(((receivedAmountNum / 1.18) / 2).toFixed(2));
      } else if (!partnerBdmAmount && existingIdx >= 0 && updatedDeals[existingIdx]?.partnerBdmAmount) {
        partnerBdmAmount = updatedDeals[existingIdx].partnerBdmAmount;
      }

      const dealObj: any = {
        id: resolvedDealId,
        client: resolvedClientName,
        company: resolvedCompanyName,
        service: serviceTitle,
        amount: formatRupee(totalAmountNum),
        received: formatRupee(receivedAmountNum),
        pending: formatRupee(pendingAmountNum),
        status: statusName,
        stage: stageName,
        owner: zDeal.Owner?.name || (existingIdx >= 0 ? updatedDeals[existingIdx]?.owner : 'Admin') || 'Admin',
        date: zDeal.Closing_Date ? new Date(zDeal.Closing_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (zDeal.Booking_Date ? new Date(zDeal.Booking_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (existingIdx >= 0 ? updatedDeals[existingIdx]?.date : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))),
        source: (existingIdx >= 0 ? updatedDeals[existingIdx]?.source : 'Zoho CRM') || 'Zoho CRM',
        hasPartnerBdm,
        has_partner_bdm: hasPartnerBdm,
        partnerBdmId,
        partner_bdm_id: partnerBdmId,
        partnerBdmName,
        partner_bdm_name: partnerBdmName,
        partnerBdmAmount,
        partner_bdm_amount: partnerBdmAmount,
        zohoId: zDeal.id,
        zohoStatus: 'synced',
        zohoSyncedAt: new Date().toISOString(),
        formData: {
          clientName: resolvedClientName,
          companyName: resolvedCompanyName,
          email: contactEmail,
          mobile: contactPhone,
          gstNumber: gstNum,
          panCard: panNum,
          billingAddress: billAddress,
          city: zDeal.City || '',
          state: stateName,
          businessType: zDeal.Company_Type || zDeal.Choose_Wisely || 'Private Limited',
          hasPartnerBdm,
          has_partner_bdm: hasPartnerBdm,
          partnerBdmId,
          partner_bdm_id: partnerBdmId,
          partnerBdmName,
          partner_bdm_name: partnerBdmName,
          partnerBdmAmount,
          partner_bdm_amount: partnerBdmAmount,
          ...(existingIdx >= 0 ? updatedDeals[existingIdx]?.formData : {})
        },
        servicesData: servicesFromSubform,
        legalData: legalSubform,
        totals: {
          grandTotal: totalAmountNum,
          baseAmount: withoutGstNum,
          totalGst: gstAmountNum,
          receivedAmount: receivedAmountNum,
          pendingAmount: pendingAmountNum,
          partnerBdmAmount: partnerBdmAmount,
        },
        rawAmount: totalAmountNum,
        rawReceived: receivedAmountNum,
        rawPending: pendingAmountNum,
        rawZohoDeal: zDeal,
      };

      if (existingIdx >= 0) {
        updatedDeals[existingIdx] = { ...updatedDeals[existingIdx], ...dealObj };
        updatedCount++;
      } else {
        const newIdx = updatedDeals.length;
        updatedDeals.push(dealObj);
        if (dealObj.zohoId) dealIndexByZohoId.set(String(dealObj.zohoId), newIdx);
        if (dealObj.id) dealIndexById.set(String(dealObj.id), newIdx);
        newCount++;
      }

      // Auto-populate companies and clients in batch memory
      const compKey = (dealObj.company || '').toLowerCase().trim();
      if (dealObj.company && dealObj.company !== 'N/A' && !knownCompanyNames.has(compKey)) {
        knownCompanyNames.add(compKey);
        localCompanies.unshift({
          id: `CMP-${Math.floor(1000 + Math.random() * 9000)}`,
          name: dealObj.company,
          type: 'Private Limited',
          gstNumber: zDeal.Gst_number || '',
          doi: '',
          email: contactEmail,
          status: 'Active',
          source: 'From Deals (Zoho)',
          addedOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoStatus: 'synced'
        });
        companiesChanged = true;
      }

      const clientKey = (dealObj.client || '').toLowerCase().trim();
      if (dealObj.client && dealObj.client !== 'Client' && !knownClientNames.has(clientKey)) {
        knownClientNames.add(clientKey);
        localClients.unshift({
          id: `CL-${Math.floor(1000 + Math.random() * 9000)}`,
          name: dealObj.client,
          company: dealObj.company || 'Individual',
          email: contactEmail,
          phone: contactPhone,
          status: 'Active',
          source: 'From Deals (Zoho)',
          addedOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoStatus: 'synced'
        });
        clientsChanged = true;
      }
    });

    // Save companies & clients to localStorage once per batch
    if (companiesChanged) {
      try {
        localStorage.setItem('be_companies', JSON.stringify(localCompanies.slice(0, 2000)));
      } catch (e) {}
    }
    if (clientsChanged) {
      try {
        localStorage.setItem('be_clients', JSON.stringify(localClients.slice(0, 2000)));
      } catch (e) {}
    }

    return { updatedDeals, newCount, updatedCount };
  };

  const handleStopSync = () => {
    cancelSyncRef.current = true;
    setIsFetchingBatch(false);
    setIsFetchingZoho(false);
    setToast({
      type: 'info',
      message: 'Sync Paused',
      submessage: `Stopped sync with ${deals.length.toLocaleString()} deals loaded in portal.`
    });
  };

  const handleFetchAllBatchesFromZoho = async (showToast = true, startFresh = false) => {
    setIsFetchingBatch(true);
    cancelSyncRef.current = false;

    // Load full IndexedDB dataset first so nothing is lost
    const existingIdb = await getAllDealsFromIndexedDB();
    let currentDeals = startFresh ? [] : (existingIdb.length >= deals.length ? existingIdb : [...deals]);
    let pageToken: string | undefined = undefined;
    let pageNumber = 1;
    let hasMore = true;
    let batchCount = 0;
    const totalExpected = 10483;

    setBatchProgress({
      loaded: currentDeals.length,
      batch: 0,
      percent: Math.min(100, Math.round((currentDeals.length / totalExpected) * 100))
    });

    try {
      while (hasMore && !cancelSyncRef.current && currentDeals.length < 50000) {
        batchCount++;
        let res: any = null;
        let retries = 3;

        while (retries > 0 && !cancelSyncRef.current) {
          try {
            res = await fetchZohoDeals({
              per_page: 200,
              page_token: pageToken,
              page: pageToken ? undefined : pageNumber
            });
            if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
              break;
            }
          } catch (fetchErr) {
            console.warn(`[Zoho Sync] Retry ${4 - retries}/3 for batch ${batchCount}:`, fetchErr);
          }
          retries--;
          if (retries > 0 && !cancelSyncRef.current) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        if (!res || !res.success || !Array.isArray(res.data) || res.data.length === 0) {
          break;
        }

        const { updatedDeals } = processZohoDealsBatch(res.data, currentDeals);
        currentDeals = updatedDeals;

        // Real-time UI stream update
        setDeals([...currentDeals]);
        const percent = Math.min(100, Math.round((currentDeals.length / totalExpected) * 100));
        setBatchProgress({ loaded: currentDeals.length, batch: batchCount, percent });

        hasMore = Boolean(res.info?.more_records && res.info?.next_page_token);
        pageToken = res.info?.next_page_token || undefined;
        pageNumber++;

        // Save progress every 2 batches or when finished
        if (batchCount % 2 === 0 || !hasMore) {
          safeSaveDealsToStorage(currentDeals);
        }

        if (!hasMore || cancelSyncRef.current) break;
      }

      safeSaveDealsToStorage(currentDeals);
      setHasMoreZohoRecords(false);
      if (showToast && !cancelSyncRef.current) {
        setToast({
          type: 'success',
          message: `All Zoho Deals Synced (${currentDeals.length.toLocaleString()} records)`,
          submessage: `Total ${currentDeals.length.toLocaleString()} deals are now stored in local IndexedDB with instant search and pagination.`
        });
      }
    } catch (e: any) {
      if (showToast) {
        setToast({
          type: 'error',
          message: 'Sync Interrupted',
          submessage: e?.message || 'Failed to sync all records from Zoho CRM'
        });
      }
    } finally {
      setIsFetchingBatch(false);
      setBatchProgress(null);
    }
  };

  const handleFetchFromZoho = async (showNotification = true, tokenToFetch?: string) => {
    setIsFetchingZoho(true);
    try {
      const result = await fetchZohoDeals({ per_page: 200, page_token: tokenToFetch });
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) {
          if (showNotification) {
            setToast({
              type: 'info',
              message: 'No Deals in Zoho CRM',
              submessage: 'Zoho Deals endpoint returned 0 records'
            });
          }
          return;
        }

        // Always read current IndexedDB to merge into full 10,000+ dataset
        const idbDeals = await getAllDealsFromIndexedDB();
        const baseDeals = idbDeals.length >= deals.length ? idbDeals : deals;

        const { updatedDeals } = processZohoDealsBatch(result.data, baseDeals);
        setDeals(updatedDeals);
        safeSaveDealsToStorage(updatedDeals);

        const hasMore = Boolean(result.info?.more_records && result.info?.next_page_token);
        setHasMoreZohoRecords(hasMore);
        setNextPageToken(result.info?.next_page_token || null);

        if (showNotification) {
          setToast({
            type: 'success',
            message: 'Zoho Deals Synchronized',
            submessage: `Fetched latest ${result.data.length} records from Zoho CRM (Total in portal: ${updatedDeals.length.toLocaleString()})`
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'error',
          message: 'Fetch Error',
          submessage: result.message || 'Could not communicate with Zoho CRM endpoint'
        });
      }
    } catch (err: any) {
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Fetch Error',
          submessage: err?.message || 'Could not communicate with Zoho CRM endpoint'
        });
      }
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
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
            <span className="px-2.5 py-0.5 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
              {rbacDeals.length.toLocaleString()} Deals
            </span>
            {hasMoreZohoRecords && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold text-xs rounded-full border border-blue-200 animate-pulse">
                More in Zoho CRM
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">Manage all active deals with live Zoho CRM synchronization and pagination.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none"
            />
          </div>

          <button
            onClick={() => handleFetchFromZoho(true)}
            disabled={isFetchingZoho || isFetchingBatch}
            className="flex items-center px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm hover:shadow disabled:opacity-60"
            title="Fetch and sync live deals from Zoho CRM"
          >
            <RefreshCw size={15} className={`mr-2 text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
            {isFetchingZoho ? 'Fetching...' : 'Fetch Zoho CRM'}
          </button>

          <button
            onClick={() => handleFetchAllBatchesFromZoho(true, true)}
            disabled={isFetchingBatch || isFetchingZoho}
            className="flex items-center px-3.5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg text-sm font-semibold hover:from-orange-600 hover:to-amber-600 transition-all shadow-sm hover:shadow disabled:opacity-60"
            title="Sequentially fetch all 10,000+ historical deals from Zoho CRM in batches with real amounts"
          >
            {isFetchingBatch ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                <span>Syncing ({batchProgress?.loaded.toLocaleString() || 0})...</span>
              </>
            ) : (
              <>
                <DownloadCloud size={15} className="mr-2" />
                <span>Sync All Deals</span>
              </>
            )}
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

      {/* Live Sync Progress Banner */}
      {isFetchingBatch && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-100/70 border border-orange-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-be-orange/10 border border-be-orange/20 flex items-center justify-center text-be-orange shrink-0">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-gray-900">
                    Syncing All Deals from Zoho CRM
                  </h4>
                  <span className="px-2.5 py-0.5 bg-be-orange text-white text-xs font-bold rounded-full shadow-xs">
                    {(batchProgress?.loaded || deals.length).toLocaleString()} / 10,483 Loaded ({batchProgress?.percent || Math.min(100, Math.round(((batchProgress?.loaded || deals.length) / 10483) * 100))}%)
                  </span>
                  <span className="text-xs text-gray-500 font-medium">
                    Batch #{batchProgress?.batch || 1} of 53
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  Downloading all 10,483 live records into local IndexedDB storage. You can search, filter, and view deals while sync is in progress.
                </p>
              </div>
            </div>
            <button
              onClick={handleStopSync}
              className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all shrink-0"
            >
              Pause Sync
            </button>
          </div>
          
          {/* Visual Progress Bar */}
          <div className="w-full bg-orange-200/60 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-be-orange to-amber-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${batchProgress?.percent || Math.min(100, Math.max(3, (((batchProgress?.loaded || deals.length) || 0) / 10483) * 100))}%` }}
            />
          </div>
        </motion.div>
      )}

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
      {(() => {
        const filteredDeals = rbacDeals.filter((deal: any) => {
          if (activeTab === 'Manual Deals' && deal.source === 'Quotation') return false;
          if (activeTab === 'From Quotations' && deal.source !== 'Quotation') return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchClient = deal.client && (deal.client ?? '').toLowerCase().includes(q);
            const matchCompany = deal.company && (deal.company ?? '').toLowerCase().includes(q);
            const matchService = deal.service && (deal.service ?? '').toLowerCase().includes(q);
            const matchId = deal.id && (deal.id ?? '').toLowerCase().includes(q);
            if (!matchClient && !matchCompany && !matchService && !matchId) return false;
          }
          return true;
        });

        const totalDealsCount = filteredDeals.length;
        const paginatedDeals = filteredDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
          <div className="bg-transparent overflow-hidden mt-6">
            <div className="overflow-x-auto pb-2">
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
                  {paginatedDeals.map((deal: any) => {
                    const parsedAmt = getDealAmount(deal);
                    const parsedRec = getDealReceived(deal);
                    const parsedPend = getDealPending(deal);

                    const displayAmount = parsedAmt > 0 ? `₹${parsedAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : (deal.amount && deal.amount !== '₹0' ? deal.amount : '₹0');
                    const displayReceived = parsedRec > 0 ? `₹${parsedRec.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : (deal.received && deal.received !== '₹0' ? deal.received : '₹0');
                    const displayPending = parsedPend > 0 ? `₹${parsedPend.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : (deal.pending && deal.pending !== '₹0' ? deal.pending : '₹0');

                    return (
                      <tr 
                        key={deal.id} 
                        onClick={() => navigate(`/crm/deals/${deal.id}`)}
                        className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm cursor-pointer"
                      >
                        <td className="px-6 py-5 font-bold text-gray-900 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">{deal.id}</td>
                        <td className="px-6 py-5 font-medium border-t border-b border-gray-100 group-hover:border-orange-100">{deal.client}</td>
                        <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                          <span className="bg-gray-50 text-gray-600 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 group-hover:bg-white transition-colors">{deal.company}</span>
                        </td>
                        <td className="px-6 py-5 font-medium text-gray-800 border-t border-b border-gray-100 group-hover:border-orange-100">{deal.service}</td>
                        <td className="px-6 py-5 font-bold text-gray-900 border-t border-b border-gray-100 group-hover:border-orange-100">{displayAmount}</td>
                        <td className="px-6 py-5 font-bold text-emerald-600 border-t border-b border-gray-100 group-hover:border-orange-100">{displayReceived}</td>
                        <td className="px-6 py-5 font-bold text-orange-600 border-t border-b border-gray-100 group-hover:border-orange-100">{displayPending}</td>
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
                              Synced {deal.zohoId ? `#${String(deal.zohoId).slice(-4)}` : ''}
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
                      <td className="px-6 py-5 font-medium border-t border-b border-gray-100 group-hover:border-orange-100">
                        <div className="flex items-center space-x-2">
                          <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-gray-200 to-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                            {deal.owner ? deal.owner.charAt(0) : '?'}
                          </div>
                          <span className="font-semibold text-gray-900">{deal.owner || 'Admin'}</span>
                        </div>
                        {(deal.hasPartnerBdm || deal.has_partner_bdm || deal.partnerBdmName || deal.formData?.hasPartnerBdm || deal.formData?.partnerBdmName) && (
                          <div className="mt-1 flex items-center text-[11px] text-orange-600 font-medium">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>
                            Partner: {deal.partnerBdmName || deal.partner_bdm_name || deal.formData?.partnerBdmName} (₹{Number(deal.partnerBdmAmount || deal.partner_bdm_amount || deal.formData?.partnerBdmAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })})
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="View Deal Details"
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
                    );
                  })}
                  {paginatedDeals.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                        {isFetchingZoho ? (
                          <div className="flex flex-col items-center justify-center py-4">
                            <Loader2 className="w-7 h-7 animate-spin text-be-orange mb-2" />
                            <p className="text-sm font-semibold text-gray-800">Fetching live deals from Zoho CRM...</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-lg font-medium text-gray-900">No deals found</p>
                            <p className="text-xs text-gray-400 mt-1">Create a new deal or fetch live records from Zoho CRM.</p>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination component */}
            {totalDealsCount > 0 && (
              <Pagination
                currentPage={currentPage}
                totalItems={totalDealsCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                itemLabel="deals"
                hasMoreOnServer={hasMoreZohoRecords}
                onLoadMoreServer={() => nextPageToken && handleFetchFromZoho(true, nextPageToken)}
                isLoadingMoreServer={isFetchingZoho}
              />
            )}
          </div>
        );
      })()}


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

                      {/* Partner BDM Split Checkbox & Conditional Fields */}
                      <div className="pt-3 border-t border-gray-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={hasPartnerBdm}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setHasPartnerBdm(checked);
                                if (!checked) {
                                  setPartnerBdmId('');
                                  setPartnerBdmName('');
                                }
                              }}
                              className="w-4 h-4 text-be-orange rounded border-gray-300 focus:ring-be-orange accent-be-orange cursor-pointer"
                            />
                            <span className="font-semibold text-gray-800 text-sm">Partner BDM (50/50 Pre-GST Split)</span>
                          </label>
                          {hasPartnerBdm && (
                            <span className="text-xs bg-orange-100 text-orange-800 font-semibold px-2.5 py-0.5 rounded-full border border-orange-200 flex items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5 animate-pulse"></span>
                              Split Active
                            </span>
                          )}
                        </div>

                        {hasPartnerBdm && (
                          <div className="p-4 bg-orange-50/70 border border-orange-100 rounded-xl space-y-3 transition-all">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Partner BDM Name <span className="text-red-500">*</span>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => loadSalesEmployees()}
                                    className="text-[11px] text-be-orange hover:text-orange-700 flex items-center gap-1 font-semibold transition-colors"
                                    title="Refresh Sales BDMs from Zoho CRM"
                                  >
                                    <RefreshCw size={11} className={isLoadingSalesEmployees ? 'animate-spin' : ''} />
                                    {isLoadingSalesEmployees ? 'Syncing...' : 'Sync Zoho'}
                                  </button>
                                </div>
                                <select
                                  value={partnerBdmId}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    setPartnerBdmId(selectedId);
                                    const found = eligiblePartnerBdms.find(emp => (String(emp.id) === selectedId || String(emp.zohoId) === selectedId || String(emp.empId) === selectedId));
                                    setPartnerBdmName(found ? found.name : '');
                                  }}
                                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-be-orange ${formErrors.partnerBdm ? 'border-red-500' : 'border-gray-300'}`}
                                >
                                  <option value="">
                                    {isLoadingSalesEmployees ? 'Syncing Sales BDMs from Zoho CRM...' : 'Select Sales Partner BDM...'}
                                  </option>
                                  {eligiblePartnerBdms.map(emp => (
                                    <option key={emp.id || emp.zohoId || emp.empId} value={emp.id || emp.zohoId || emp.empId}>
                                      {emp.name} ({emp.role || emp.dept || 'Sales'})
                                    </option>
                                  ))}
                                </select>
                                {formErrors.partnerBdm && <p className="text-red-500 text-xs mt-1">{formErrors.partnerBdm}</p>}
                                {!isLoadingSalesEmployees && eligiblePartnerBdms.length === 0 && (
                                  <p className="text-gray-400 text-[11px] mt-1">No active Sales employees found.</p>
                                )}
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                  Partner BDM Amount (₹)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">₹</span>
                                  <input
                                    type="text"
                                    disabled
                                    readOnly
                                    value={partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    className="w-full pl-7 pr-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-bold text-gray-800 cursor-not-allowed select-none"
                                  />
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">
                                  (Pre-GST: ₹{((Number(amountReceived) || 0) / 1.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ÷ 2)
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
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
                          const ext = (file.name ?? '').split('.').pop()?.toUpperCase() || 'FILE';
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
