import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Search, Plus, Filter, X, UploadCloud, ChevronRight, Check, Trash2, ChevronDown, Eye, Edit, RefreshCw, Cloud, CheckCircle2, AlertCircle, Loader2, ExternalLink, Users, UserCheck, ArrowRight, Clock, Building2, ShieldCheck, CheckCircle, CreditCard, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { saveDocument } from '../../lib/db';
import {
  saveOrUpdateZohoDeal,
  deleteZohoDeal,
  fetchZohoDeals,
  fetchZohoDealsCount,
  fetchZohoDealById,
  enrichDealFromZohoRecord,
  uploadZohoAttachment,
  uploadZohoDealImageField,
  saveOrUpdateZohoCompany,
  saveOrUpdateZohoClient,
  deleteZohoRecord,
  fetchZohoEmployees,
  fetchSalesEmployees,
  transitionZohoDealBlueprint,
  moveDealToAccounts,
  moveDealToLegal,
  moveDealToOperationsAllocator,
  moveDealToOperationsExecutors,
  verifyZohoMilestonePayment,
  updateZohoMilestoneBank,
  verifyZohoMilestoneLegal,
  ZOHO_DEAL_BLUEPRINT_TRANSITIONS
} from '../../services/zohoService';
import { buildZohoRbacCriteria, getAllEmployeesList, filterRecordsByRbac } from '../../services/zohoRbacService';
import { isSubordinateOfTL, isMatchingName, mapZohoRecordToEmployee } from '../../utils/employeeUtils';
import { Pagination } from '../../components/ui/Pagination';
import { DeleteConfirmModal } from '../../components/ui/DeleteConfirmModal';
import { ALL_SERVICES } from '../../utils/servicesList';
import { generateServiceAllocationsForDeal, getStoredInternalOperations } from '../../services/internalOperationsService';
import {
  getDealSplitBreakdown,
  isDealPartnerBdm,
  isDealPaymentVerified,
  getDealTotalAmount,
  getDealReceivedAmount,
  getDealPendingAmount,
  getDealMilestones,
  hasDealRemainingPayments,
  getDealUnverifiedMilestonesCount,
  getDealUnverifiedLegalMilestonesCount,
  getDealVerifiedLegalMilestonesCount,
  isDealLegalReceived,
  isUserPartnerBdm,
  isUserPrimaryBdm,
  isValidServiceName,
  type DealMilestoneItem
} from '../../utils/dealSplitUtils';

interface DealService {
  id: string;
  name: string;
  totalAmount?: string;
  baseAmount?: string;
  notes?: string;
  remarks?: string;
  amountAfterDisbursement?: string;
  successFees?: string;
}

const SUCCESS_FEES_OPTIONS = [
  '0.5',
  '1.0',
  '1.5',
  '2.0',
  '2.5',
  '3.0',
  '3.5',
  '4.0',
  '4.5',
  '5.0'
];

interface DealSubordinateInfo {
  member: any;
  role: string;
  name: string;
}

const isDealOwnedByTL = (d: any, user: any): boolean => {
  if (!d || !user) return false;
  if (isUserPrimaryBdm(d, user) || isUserPartnerBdm(d, user)) return true;
  const ownerName = String(d.owner || d.employeeName || d.salesEmployee || d.Owner?.name || d.rawZohoDeal?.Owner?.name || '').trim();
  if (ownerName && isMatchingName(ownerName, user.name || user.Name || '')) return true;
  const partnerName = String(d.partnerBdmName || d.Partner_BDM_Name || d.Partner_BDM?.name || '').trim();
  if (partnerName && isMatchingName(partnerName, user.name || user.Name || '')) return true;
  return false;
};

const getDealSubordinateMember = (d: any, user: any, employees: any[]): DealSubordinateInfo | null => {
  if (!d || !user || !Array.isArray(employees)) return null;
  const subordinates = employees.filter((e: any) => isSubordinateOfTL(e, user));
  if (subordinates.length === 0) return null;

  for (const sub of subordinates) {
    if (isUserPrimaryBdm(d, sub)) {
      return { member: sub, role: 'Primary BDM', name: sub.name || sub.Name || '' };
    }
  }

  const ownerName = String(d.owner || d.employeeName || d.salesEmployee || d.Owner?.name || d.rawZohoDeal?.Owner?.name || '').trim();
  if (ownerName) {
    for (const sub of subordinates) {
      if (isMatchingName(ownerName, sub.name || sub.Name || '')) {
        return { member: sub, role: 'Owner', name: sub.name || sub.Name || ownerName };
      }
    }
  }

  for (const sub of subordinates) {
    if (isUserPartnerBdm(d, sub)) {
      return { member: sub, role: 'Partner BDM', name: sub.name || sub.Name || '' };
    }
  }

  const partnerName = String(d.partnerBdmName || d.Partner_BDM_Name || d.Partner_BDM?.name || '').trim();
  if (partnerName) {
    for (const sub of subordinates) {
      if (isMatchingName(partnerName, sub.name || sub.Name || '')) {
        return { member: sub, role: 'Partner BDM', name: sub.name || sub.Name || partnerName };
      }
    }
  }

  return null;
};

const isDealOwnedBySubordinate = (d: any, user: any, employees: any[]): boolean => {
  return getDealSubordinateMember(d, user, employees) !== null;
};

export const Deals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, isSuperAdmin, isHR, isHOD, isTL, isAccounts, isLegal, isSales, isOperationsHOD, isLegalHOD, availableUsers, filterRecords } = useAuth();
  const isUserTL = !isSuperAdmin && !isHR && !isHOD && !isAccounts && !isLegal && Boolean(
    isTL ||
    currentUser?.role === 'TL' ||
    (currentUser as any)?.systemRole === 'TL'
  );

  const isSalesScoped = !isSuperAdmin && !isHOD && !isHR && !isAccounts && !isLegal && Boolean(
    isUserTL || currentUser?.role === 'TL' || currentUser?.role === 'TM' || (currentUser as any)?.systemRole === 'TL' || (currentUser as any)?.systemRole === 'TM' || isSales
  );

  const allEmployees = useMemo(() => {
    return getAllEmployeesList(availableUsers);
  }, [availableUsers]);

  const [liveEmployees, setLiveEmployees] = useState<any[]>(() => allEmployees);
  const effectiveEmployees = liveEmployees.length > allEmployees.length ? liveEmployees : allEmployees;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab') || location.state?.tab;
    if ((tabParam === 'Account Queue' || tabParam === 'Account Verified') && !isAccounts && !isSuperAdmin) return 'All Deals';
    if (tabParam === 'Remaining Payments' && !isAccounts && !isLegal && !isSuperAdmin) return 'All Deals';
    if ((tabParam === 'Legal Queue' || tabParam === 'Received') && !isLegal && !isSuperAdmin) return 'All Deals';
    if ((tabParam === 'Manual Deals' || tabParam === 'From Quotations' || tabParam === 'Partner BDM Deals' || tabParam === 'My Team Deals') && (isAccounts || isLegal) && !isSuperAdmin) return 'All Deals';
    if (tabParam === 'From Quotations' || tabParam === 'Manual Deals' || tabParam === 'Partner BDM Deals' || tabParam === 'My Team Deals' || tabParam === 'Account Queue' || tabParam === 'Account Verified' || tabParam === 'Remaining Payments' || tabParam === 'Legal Queue' || tabParam === 'Received' || tabParam === 'All Deals') return tabParam;
    return 'All Deals';
  });
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || location.state?.search || '');
  const [quickFilter, setQuickFilter] = useState<string>(() => searchParams.get('filter') || location.state?.filter || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || location.state?.status || 'all');
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; deal: any | null; isDeleting: boolean }>({
    isOpen: false,
    deal: null,
    isDeleting: false
  });

  // Accounts & Legal Remaining Payments Verification state
  const [milestoneBankSelections, setMilestoneBankSelections] = useState<Record<string, 'BSPL' | 'BSAPL' | ''>>({});
  const [verifyingMilestoneKey, setVerifyingMilestoneKey] = useState<string | null>(null);
  const [verifyingMilestoneLegalKey, setVerifyingMilestoneLegalKey] = useState<string | null>(null);
  const [previewScreenshotModal, setPreviewScreenshotModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  });

  // Sync state with URL params and navigation state
  useEffect(() => {
    const tabParam = searchParams.get('tab') || location.state?.tab;
    if (tabParam) {
      if ((tabParam === 'Account Queue' || tabParam === 'Account Verified') && !isAccounts && !isSuperAdmin) {
        setActiveTab('All Deals');
      } else if (tabParam === 'Remaining Payments' && !isAccounts && !isLegal && !isSuperAdmin) {
        setActiveTab('All Deals');
      } else if ((tabParam === 'Legal Queue' || tabParam === 'Received') && !isLegal && !isSuperAdmin) {
        setActiveTab('All Deals');
      } else if (tabParam === 'Internal Operations') {
        if (!isSales) {
          navigate('/crm/internal-operations', { replace: true });
        } else {
          setActiveTab('All Deals');
        }
        return;
      } else if ((tabParam === 'Manual Deals' || tabParam === 'From Quotations' || tabParam === 'Partner BDM Deals' || tabParam === 'My Team Deals') && (isAccounts || isLegal) && !isSuperAdmin) {
        setActiveTab('All Deals');
      } else {
        setActiveTab(tabParam);
      }
    }
    const searchParam = searchParams.get('search') || location.state?.search;
    if (searchParam !== null && searchParam !== undefined) {
      setSearchQuery(searchParam);
    }
    const filterParam = searchParams.get('filter') || location.state?.filter;
    if (filterParam) {
      setQuickFilter(filterParam);
    }
    const statusParam = searchParams.get('status') || location.state?.status;
    if (statusParam) {
      setStatusFilter(statusParam);
    }
    const perPageParam = searchParams.get('per_page') || location.state?.per_page;
    if (perPageParam) {
      const p = parseInt(String(perPageParam), 10);
      if (!isNaN(p) && p > 0) {
        setItemsPerPage(p);
      }
    } else if ((filterParam && filterParam !== 'all') || searchParam || (tabParam && tabParam !== 'All Deals')) {
      setItemsPerPage(prev => (prev < 200 ? 200 : prev));
    }
  }, [searchParams, location.state]);

  const isDealToday = (d: any): boolean => {
    if (!d) return false;
    const now = new Date();
    const todayYMD = now.toISOString().split('T')[0];
    const todayDMY = now.toLocaleDateString('en-GB');
    const raw = String(d.Payment_Date || d.rawDate || d.date || d.Booking_Date || d.Closing_Date || '');
    if (!raw) return false;
    if (raw.includes(todayYMD) || raw.includes(todayDMY)) return true;
    try {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) {
        return dt.getDate() === now.getDate() && dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
      }
    } catch (e) { }
    return false;
  };

  const isDealThisMonth = (d: any): boolean => {
    if (!d) return false;
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();
    const raw = String(d.Payment_Date || d.rawDate || d.date || d.Booking_Date || d.Closing_Date || '');
    if (!raw) return false;
    try {
      const parts = raw.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (m === currentMonthIdx && (!y || y === currentYear)) return true;
      }
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) {
        return dt.getMonth() === currentMonthIdx && dt.getFullYear() === currentYear;
      }
    } catch (e) { }
    return false;
  };

  const isDealFromQuotation = (d: any): boolean => {
    if (!d) return false;
    return Boolean(
      d.source === 'Quotation' ||
      d.quotationId ||
      (d.id && String(d.id).startsWith('DL-QT')) ||
      d.isConvertedFromQuotation ||
      d.fromQuotation ||
      d.quotationNumber ||
      d.rawZohoDeal?.Quotation_Number ||
      d.rawZohoDeal?.Quotation_Id
    );
  };

  // Zoho CRM states
  const [deals, setDeals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((d: any) => {
            const raw = d.rawZohoDeal || {};
            if (!isValidServiceName(d.service, d.client, d.company, d.id) || d.service === 'Services') {
              let validSvc = '';
              if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
                const validItem = d.servicesData.find((s: any) => isValidServiceName(s.name, d.client, d.company, d.id));
                if (validItem) validSvc = validItem.name;
              }
              if (!validSvc && Array.isArray(d.legalData) && d.legalData.length > 0) {
                const validLegal = d.legalData.find((lg: any) => isValidServiceName(lg.schema || lg.Legal_Schemas || lg.Schemas, d.client, d.company, d.id));
                if (validLegal) validSvc = validLegal.schema || validLegal.Legal_Schemas || validLegal.Schemas;
              }
              if (!validSvc && Array.isArray(raw.Subform_1) && raw.Subform_1.length > 0) {
                const validSf = raw.Subform_1.find((sf: any) => {
                  const n = sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || sf.Item_Name || sf.Product_Name || sf.Service_Scheme || sf.Services;
                  const nameStr = typeof n === 'object' ? n?.name : String(n || '');
                  return isValidServiceName(nameStr, d.client, d.company, d.id);
                });
                if (validSf) {
                  const n = validSf.Schemas || validSf.Schema || validSf.Service_Name || validSf.Service || validSf.Business_plan_selected || validSf.Item_Name || validSf.Product_Name || validSf.Service_Scheme || validSf.Services;
                  validSvc = typeof n === 'object' ? n?.name : String(n || '');
                }
              }
              if (!validSvc) {
                const cand = raw.Service_Name || raw.Services || raw.Service || raw.Service_scheme || raw.Service_Scheme || raw.Legal_Schemas || raw.Schemas || raw.Product_Name || (raw.Choose_Wisely !== 'New Case Booking' ? raw.Choose_Wisely : null) || raw.Business_plan_selected || raw.Item_Name;
                const candStr = typeof cand === 'object' ? cand?.name : String(cand || '');
                if (isValidServiceName(candStr, d.client, d.company, d.id)) {
                  validSvc = candStr;
                }
              }
              if (!validSvc && raw.Deal_Name) {
                const match = ALL_SERVICES.find(s => s && s.length > 2 && String(raw.Deal_Name).toLowerCase().includes(s.toLowerCase()));
                if (match && isValidServiceName(match, d.client, d.company, d.id)) {
                  validSvc = match;
                }
              }

              return {
                ...d,
                service: validSvc || (d.service && d.service !== 'Services' ? d.service : 'Services'),
                servicesData: Array.isArray(d.servicesData) && d.servicesData.length > 0 ? d.servicesData : (validSvc ? [{ id: '1', name: validSvc }] : [])
              };
            }
            return d;
          });
        }
      }
    } catch (e) { }
    return [];
  });

  const rbacDeals = useMemo(() => {
    return filterRecordsByRbac(deals, 'Deals', currentUser, effectiveEmployees);
  }, [deals, currentUser, effectiveEmployees]);

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
    const amt = getDealAmount(d);
    const rec = getDealReceived(d);
    if (amt > 0 && rec >= amt) return 0;
    if (amt > 0 && rec > 0) return Math.max(0, Number((amt - rec).toFixed(2)));
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
        const itemTotal = a || (b > 0 ? Number((b * 1.18).toFixed(2)) : 0);
        return sum + itemTotal;
      }, 0);
      if (sTotal > 0) return sTotal;
    }
    if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
      const sTotal = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => {
        const a = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount);
        const b = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base);
        const itemTotal = a || (b > 0 ? Number((b * 1.18).toFixed(2)) : 0);
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
        d.rawZohoDeal.Amount_Without_GST ? parseZohoNum(d.rawZohoDeal.Amount_Without_GST) * 1.18 : 0,
        d.rawZohoDeal.Deal_Amount_Without_GST ? parseZohoNum(d.rawZohoDeal.Deal_Amount_Without_GST) * 1.18 : 0,
        d.rawZohoDeal.Subtotal ? parseZohoNum(d.rawZohoDeal.Subtotal) * 1.18 : 0,
        d.rawZohoDeal.Amount_After_disbursement,
        d.rawZohoDeal.amount_if_you_have_kindly_put_0
      );
      if (zAmt > 0) return zAmt;
    }
    if (d.totals?.baseAmount && Number(d.totals.baseAmount) > 0) {
      return Number((Number(d.totals.baseAmount) * 1.18).toFixed(2));
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
  // Pagination & Token History states based on reference code
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(() => {
    const tabParam = searchParams.get('tab') || location.state?.tab;
    const searchParam = searchParams.get('search') || location.state?.search;
    const filterParam = searchParams.get('filter') || location.state?.filter;
    const perPageParam = searchParams.get('per_page') || location.state?.per_page;
    if (perPageParam) {
      const p = parseInt(String(perPageParam), 10);
      if (!isNaN(p) && p > 0) return p;
    }
    if ((filterParam && filterParam !== 'all') || searchParam || (tabParam && tabParam !== 'All Deals')) {
      return 200;
    }
    return 25;
  });
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [tokenHistory, setTokenHistory] = useState<(string | null)[]>([null]);
  const [paginationInfo, setPaginationInfo] = useState<any>(null);
  const [totalRecordsCount, setTotalRecordsCount] = useState<number | null>(null);

  // Sales Employees & Partner BDM states
  const [salesEmployees, setSalesEmployees] = useState<any[]>([]);
  const [isLoadingSalesEmployees, setIsLoadingSalesEmployees] = useState<boolean>(false);
  const [hasPartnerBdm, setHasPartnerBdm] = useState<boolean>(false);
  const [partnerBdmId, setPartnerBdmId] = useState<string>('');
  const [partnerBdmName, setPartnerBdmName] = useState<string>('');
  const [remark, setRemark] = useState<string>('');

  const loadSalesEmployees = useCallback(async () => {
    setIsLoadingSalesEmployees(true);
    try {
      const mergedMap = new Map<string, any>();

      // Comprehensive helper to detect if an employee belongs to the Sales department or holds a sales/BDM role
      const isSalesDeptEmployee = (emp: any): boolean => {
        if (!emp) return false;
        const status = String(emp.status || emp.Status || emp.formData?.status || 'Active').toLowerCase().trim();
        if (status === 'inactive' || status === 'terminated' || status === 'deleted') return false;

        const dept = String(
          emp.dept ||
          emp.department ||
          emp.Department ||
          emp.formData?.dept ||
          emp.formData?.department ||
          emp.formData?.Department ||
          ''
        ).toLowerCase().trim();

        const role = String(
          emp.role ||
          emp.designation ||
          emp.Designation ||
          emp.Designation_Job_Title ||
          emp.formData?.role ||
          emp.formData?.designation ||
          emp.System_Role ||
          emp.systemRole ||
          ''
        ).toLowerCase().trim();

        // Check if explicitly developer or marketing or human resources
        if (dept.includes('developer') || role.includes('developer') || dept.includes('human resources') || role.includes('human resources')) {
          return false;
        }

        const salesKeywords = [
          'sales',
          'bdm',
          'bde',
          'business dev',
          'business development',
          'cluster',
          'cluster dev',
          'cluster development',
          'national sales',
          'sales head',
          'sales manager',
          'sales executive',
          'commercial',
          'growth',
          'revenue',
          'nsm',
          'cdm',
          'account executive',
          'client relationship',
          'tm',
          'tl',
          'hod'
        ];

        const hasSalesDept = salesKeywords.some(kw => dept.includes(kw));
        const hasSalesRole = salesKeywords.some(kw => role.includes(kw));

        return hasSalesDept || hasSalesRole || dept === 'sales' || dept === '';
      };

      // Helper to extract clean employee name
      const extractName = (emp: any): string => {
        if (emp.name && String(emp.name).trim() && String(emp.name).trim().toLowerCase() !== 'undefined') {
          return String(emp.name).trim();
        }
        const fName = emp.Name || emp.formData?.firstName || emp.firstName || '';
        const mName = emp.Middle_Name || emp.formData?.middleName || emp.middleName || '';
        const lName = emp.Last_Name || emp.formData?.lastName || emp.lastName || '';
        const combined = [fName, mName, lName].filter(Boolean).join(' ').trim();
        if (combined) return combined;
        if (emp.fullName && String(emp.fullName).trim()) return String(emp.fullName).trim();
        if (emp.email) return String(emp.email).split('@')[0];
        return 'Sales Employee';
      };

      const addEmpIfSales = (emp: any, defaultSource = 'Directory') => {
        if (!emp || !isSalesDeptEmployee(emp)) return;

        const name = extractName(emp);
        if (!name || name.toLowerCase() === 'sales employee') {
          if (!emp.id && !emp.zohoId && !emp.empId) return;
        }

        const id = String(emp.id || emp.empId || emp.Employment_ID || emp.zohoId || '').trim();
        const zohoId = emp.zohoId ? String(emp.zohoId).trim() : (id && /^\d{15,}$/.test(id) ? id : '');
        const email = String(emp.email || emp.Email || emp.workEmail || emp.formData?.email || emp.formData?.workEmail || emp.Personal_Email_Address || '').toLowerCase().trim();
        const empId = String(emp.empId || emp.Employment_ID || id || '').trim();
        const displayRole = emp.role || emp.designation || emp.Designation || emp.formData?.role || emp.Designation_Job_Title || emp.systemRole || 'Sales';
        const displayDept = emp.dept || emp.department || emp.Department || emp.formData?.dept || 'Sales';

        const record = {
          id: id || zohoId || empId || name,
          zohoId: zohoId || id,
          empId: empId || id,
          name: name,
          email: email,
          dept: displayDept,
          role: displayRole,
          status: 'Active',
          source: emp.source || defaultSource
        };

        // Key resolution with priority for zohoId, email, empId, and normalized name
        const key = (zohoId && `zoho_${zohoId}`) || (email && `email_${email}`) || (empId && `empid_${empId.toLowerCase()}`) || `name_${name.toLowerCase()}`;

        if (!mergedMap.has(key)) {
          mergedMap.set(key, record);
        } else {
          const prev = mergedMap.get(key);
          mergedMap.set(key, {
            ...prev,
            ...record,
            zohoId: record.zohoId || prev.zohoId,
            id: record.id || prev.id,
            email: record.email || prev.email,
            role: record.role || prev.role
          });
        }
      };

      // 1. Load from be_employees (Local HRMS Employee Directory)
      try {
        const local = localStorage.getItem('be_employees');
        if (local) {
          const emps = JSON.parse(local);
          if (Array.isArray(emps)) {
            emps.forEach(e => addEmpIfSales(e, 'HRMS Directory'));
          }
        }
      } catch (e) {
        console.warn('Error reading be_employees for Partner BDM dropdown:', e);
      }

      // 2. Load from availableUsers in Auth context (if any)
      if (Array.isArray(availableUsers)) {
        availableUsers.forEach(u => addEmpIfSales(u, 'Auth User'));
      }

      // 3. Load from cached sales employees
      try {
        const cached = localStorage.getItem('be_sales_employees');
        if (cached) {
          const cList = JSON.parse(cached);
          if (Array.isArray(cList)) {
            cList.forEach(c => addEmpIfSales(c, 'Cached Sales'));
          }
        }
      } catch (e) { }

      // Update state immediately from local stores so dropdown is instantly responsive
      const currentList = Array.from(mergedMap.values());
      if (currentList.length > 0) {
        currentList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSalesEmployees(currentList);
      }

      // 4. Fetch live sales employees from backend / Zoho API
      try {
        const res = await fetchSalesEmployees();
        if (res.success && Array.isArray(res.data)) {
          res.data.forEach((z: any) => addEmpIfSales(z, 'Zoho CRM'));
        }
      } catch (apiErr) {
        console.warn('fetchSalesEmployees API error:', apiErr);
      }

      // 5. Fetch all Zoho employees to ensure comprehensive directory coverage
      try {
        const empRes = await fetchZohoEmployees();
        if (empRes.success && Array.isArray(empRes.data)) {
          empRes.data.forEach((z: any) => {
            const fullName = [z.Name, z.Middle_Name, z.Last_Name].filter(Boolean).join(' ') || z.Name || '';
            addEmpIfSales({
              id: String(z.id || z.Employment_ID),
              zohoId: String(z.id),
              name: fullName,
              email: z.Email || z.Personal_Email_Address || '',
              dept: z.Department || 'Sales',
              role: z.Designation_Job_Title || z.System_Role || 'Sales',
              empId: z.Employment_ID || String(z.id),
              status: 'Active'
            }, 'Zoho Employee');
          });
        }
      } catch (empErr) {
        console.warn('fetchZohoEmployees API error:', empErr);
      }

      const finalList = Array.from(mergedMap.values());
      finalList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSalesEmployees(finalList);
      try {
        localStorage.setItem('be_sales_employees', JSON.stringify(finalList));
      } catch (e) { }
    } catch (e) {
      console.warn('Failed to load sales employees for Partner BDM dropdown:', e);
    } finally {
      setIsLoadingSalesEmployees(false);
    }
  }, []);

  useEffect(() => {
    loadSalesEmployees();
    const handleEmployeeUpdate = (e?: StorageEvent | Event) => {
      if (e && 'key' in e && e.key && e.key !== 'be_employees') return;
      loadSalesEmployees();
    };
    window.addEventListener('be_employees_updated', handleEmployeeUpdate);
    window.addEventListener('storage', handleEmployeeUpdate);
    return () => {
      window.removeEventListener('be_employees_updated', handleEmployeeUpdate);
      window.removeEventListener('storage', handleEmployeeUpdate);
    };
  }, [loadSalesEmployees]);

  // Filter all active employees from the Sales department
  const eligiblePartnerBdms = useMemo(() => {
    const filtered = salesEmployees.filter((emp: any) => {
      // 1. Status must not be inactive
      const status = String(emp.status || emp.Status || emp.formData?.status || 'Active').toLowerCase().trim();
      if (status === 'inactive' || status === 'terminated' || status === 'deleted') return false;

      // 2. Exclude primary BDM of the deal to prevent choosing oneself as partner BDM
      const empId = String(emp.id || emp.zohoId || emp.empId || '').toLowerCase().trim();
      const empName = String(emp.name || emp.Name || '').toLowerCase().trim();
      const empEmail = String(emp.email || emp.Email || emp.workEmail || '').toLowerCase().trim();

      if (editingDealId) {
        const editingDeal = deals.find(d => d.id === editingDealId || d.zohoId === editingDealId);
        const ownerName = String(editingDeal?.owner || editingDeal?.bdmName || editingDeal?.employeeName || '').toLowerCase().trim();
        const ownerId = String(editingDeal?.employeeZohoId || editingDeal?.empId || '').toLowerCase().trim();
        if (ownerName && empName && empName === ownerName) return false;
        if (ownerId && empId && (empId === ownerId || (emp.zohoId && String(emp.zohoId).toLowerCase() === ownerId))) return false;
      } else if (currentUser && !isSuperAdmin && !isHR && !isHOD && salesEmployees.length > 1) {
        // For individual BDM creating their own deal, exclude themselves from partner dropdown
        if (currentUser.id && empId && empId === String(currentUser.id).toLowerCase()) return false;
        if (currentUser.empId && empId && empId === String(currentUser.empId).toLowerCase()) return false;
        if (currentUser.zohoId && emp.zohoId && String(emp.zohoId).toLowerCase() === String(currentUser.zohoId).toLowerCase()) return false;
        if (currentUser.name && empName && empName === String(currentUser.name).toLowerCase().trim()) return false;
        if (currentUser.email && empEmail && empEmail === String(currentUser.email).toLowerCase().trim()) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [salesEmployees, currentUser, isSuperAdmin, isHR, isHOD, editingDealId, deals]);

  // Resolves the exact dropdown select value matching the current deal's partner BDM
  const selectedPartnerDropdownVal = useMemo(() => {
    if (!partnerBdmId && !partnerBdmName) return '';
    const match = eligiblePartnerBdms.find(emp =>
      (partnerBdmId && (
        String(emp.id || '').toLowerCase() === String(partnerBdmId).toLowerCase() ||
        String(emp.zohoId || '').toLowerCase() === String(partnerBdmId).toLowerCase() ||
        String(emp.empId || '').toLowerCase() === String(partnerBdmId).toLowerCase()
      )) ||
      (partnerBdmName && (
        String(emp.name || '').toLowerCase().trim() === String(partnerBdmName).toLowerCase().trim() ||
        (partnerBdmName.length >= 3 && String(emp.name || '').toLowerCase().includes(partnerBdmName.toLowerCase()))
      ))
    );
    if (match) {
      return match.zohoId || match.id || match.empId || match.name;
    }
    return partnerBdmId;
  }, [partnerBdmId, partnerBdmName, eligiblePartnerBdms]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [formData, setFormData] = useState({
    clientName: '', mobile: '', email: '', gender: 'Male',
    panCard: '', aadhaarCard: '', city: '', state: '',
    billingAddress: '', Billing_address: '',
    companyName: '', businessType: '', doi: '', gstNumber: '',
    companyPan: '', sector: 'IT', industry: 'Software',
    companyAddress: '', Company_address: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dealServices, setDealServices] = useState<DealService[]>([]);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [paymentScreenshotName, setPaymentScreenshotName] = useState<string>('');
  const [paymentScreenshotFile, setPaymentScreenshotFile] = useState<File | null>(null);
  const [paymentScreenshotFiles, setPaymentScreenshotFiles] = useState<File[]>([]);

  // Document Upload State
  const [documents, setDocuments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allServices = ALL_SERVICES;

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

    if (deal) {
      const dealIdentifier = deal.id || deal.zohoId || '';
      setEditingDealId(dealIdentifier);

      const fd = deal.formData || {};
      const rawZ = deal.rawZohoDeal || {};

      // Match client from localStorage if available
      let localClient: any = null;
      try {
        const storedClients = JSON.parse(localStorage.getItem('be_clients') || '[]');
        localClient = storedClients.find((c: any) => 
          (deal.clientZohoId && c.zohoId && String(c.zohoId) === String(deal.clientZohoId)) ||
          (fd.clientZohoId && c.zohoId && String(c.zohoId) === String(fd.clientZohoId)) ||
          (c.name && deal.client && c.name.trim().toLowerCase() === String(deal.client).trim().toLowerCase()) ||
          (c.name && fd.clientName && c.name.trim().toLowerCase() === String(fd.clientName).trim().toLowerCase())
        );
      } catch (_) {}

      // Match company from localStorage if available
      let localComp: any = null;
      try {
        const storedComps = JSON.parse(localStorage.getItem('be_companies') || '[]');
        localComp = storedComps.find((c: any) => 
          (deal.companyZohoId && c.zohoId && String(c.zohoId) === String(deal.companyZohoId)) ||
          (fd.companyZohoId && c.zohoId && String(c.zohoId) === String(fd.companyZohoId)) ||
          (c.name && deal.company && c.name.trim().toLowerCase() === String(deal.company).trim().toLowerCase()) ||
          (c.name && fd.companyName && c.name.trim().toLowerCase() === String(fd.companyName).trim().toLowerCase())
        );
      } catch (_) {}

      const clientName = fd.clientName || deal.client || localClient?.name || (typeof rawZ.Contact_Name === 'object' ? rawZ.Contact_Name?.name : rawZ.Contact_Name) || rawZ.Client_Name || (typeof rawZ.Clients === 'object' ? rawZ.Clients?.name : '') || '';
      const mobile = fd.mobile || deal.mobile || localClient?.phone || rawZ.Client_contact_detail || rawZ.Mobile || rawZ.Phone || rawZ.Client_contact_detail_cs || rawZ.Client_contact_detail_bp || '';
      const email = fd.email || deal.email || localClient?.email || rawZ.Client_Email_address || rawZ.Email || rawZ.Client_Email_address_cs || rawZ.Client_Email_address_bp || '';
      const gender = fd.gender || deal.gender || localClient?.gender || 'Male';
      const panCard = fd.panCard || deal.panCard || localClient?.panCard || rawZ.Pan_number || rawZ.PAN_Number || rawZ.PAN_Card || rawZ.PAN || '';
      const aadhaarCard = fd.aadhaarCard || deal.aadhaarCard || localClient?.aadhaarCard || rawZ.Aadhaar_Card || rawZ.Aadhaar_number || rawZ.Aadhaar_Number || '';
      const city = fd.city || deal.city || localClient?.city || localComp?.city || rawZ.City || 'Ahmedabad';
      const state = fd.state || deal.state || localClient?.state || localComp?.state || rawZ.State || 'Gujarat';
      const billingAddress = fd.billingAddress || fd.Billing_address || deal.billingAddress || deal.Billing_address || localClient?.billingAddress || rawZ.Billing_address || rawZ.Billing_Address || '';

      const companyName = fd.companyName || deal.company || localComp?.name || (typeof rawZ.Account_Name === 'object' ? rawZ.Account_Name?.name : rawZ.Account_Name) || rawZ.Company_Name || (typeof rawZ.Company === 'object' ? rawZ.Company?.name : '') || (typeof rawZ.Companies === 'object' ? rawZ.Companies?.name : '') || '';
      const businessType = fd.businessType || deal.businessType || localComp?.type || rawZ.Company_Type || rawZ.Choose_Wisely || 'Private Limited';
      const doi = fd.doi || deal.doi || localComp?.doi || rawZ.Date_of_incorporation || rawZ.DOI || '';
      const gstNumber = fd.gstNumber || deal.gstNumber || localComp?.gstNumber || rawZ.Gst_number || rawZ.GST_Number || rawZ.GSTIN || '';
      const companyPan = fd.companyPan || deal.companyPan || localComp?.companyPan || rawZ.Company_PAN_Number || panCard;
      const sector = fd.sector || deal.sector || localComp?.sector || 'IT';
      const industry = fd.industry || deal.industry || localComp?.industry || 'Software';
      const companyAddress = fd.companyAddress || fd.Company_address || deal.companyAddress || deal.Company_address || localComp?.companyAddress || rawZ.Company_address || rawZ.Company_Address || '';

      setFormData({
        clientName,
        mobile,
        email,
        gender,
        panCard,
        aadhaarCard,
        city,
        state,
        billingAddress,
        Billing_address: billingAddress,
        companyName,
        businessType,
        doi,
        gstNumber,
        companyPan,
        sector,
        industry,
        companyAddress,
        Company_address: companyAddress
      });

      let services: DealService[] = [];
      if (Array.isArray(deal.servicesData) && deal.servicesData.length > 0) {
        services = deal.servicesData.map((s: any) => {
          const t = s.totalAmount !== undefined 
            ? String(s.totalAmount) 
            : (s.baseAmount ? String(Number((Number(s.baseAmount) * 1.18).toFixed(2))) : '');
          const b = s.baseAmount !== undefined 
            ? String(s.baseAmount) 
            : (t ? String(Number((Number(t) / 1.18).toFixed(2))) : '');
          return {
            id: s.id || Math.random().toString(),
            name: s.name || s.Schemas || '',
            totalAmount: t,
            baseAmount: b,
            notes: s.notes || s.remarks || '',
            remarks: s.remarks || s.notes || '',
            amountAfterDisbursement: s.amountAfterDisbursement !== undefined && s.amountAfterDisbursement !== null
              ? String(s.amountAfterDisbursement)
              : (s.amount_if_you_have_kindly_put_0 !== undefined && s.amount_if_you_have_kindly_put_0 !== null
                ? String(s.amount_if_you_have_kindly_put_0)
                : (s.Amount_After_disbursement !== undefined && s.Amount_After_disbursement !== null ? String(s.Amount_After_disbursement) : '')),
            successFees: s.successFees || s.Success_fees || '',
          };
        });
      } else if (Array.isArray(rawZ.Subform_1) && rawZ.Subform_1.length > 0) {
        services = rawZ.Subform_1.map((sf: any, i: number) => {
          const agreementAmount = Number(sf.Agreement_amount || sf.totalAmount || sf.Total || 0);
          const withoutGst = Number(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? (agreementAmount / 1.18).toFixed(2) : 0));
          const totalAmt = agreementAmount || (withoutGst > 0 ? Number((withoutGst * 1.18).toFixed(2)) : 0);
          return {
            id: String(sf.id || i + 1),
            name: sf.Schemas || sf.Schema || sf.Service_Name || 'Service',
            totalAmount: String(totalAmt || ''),
            baseAmount: String(withoutGst || ''),
            notes: sf.notes || sf.remarks || sf.Remark || '',
            remarks: sf.remarks || sf.notes || sf.Remark || '',
            amountAfterDisbursement: sf.amount_if_you_have_kindly_put_0 !== undefined && sf.amount_if_you_have_kindly_put_0 !== null
              ? String(sf.amount_if_you_have_kindly_put_0)
              : (sf.Amount_After_disbursement !== undefined && sf.Amount_After_disbursement !== null
                ? String(sf.Amount_After_disbursement)
                : (sf.amountAfterDisbursement !== undefined && sf.amountAfterDisbursement !== null ? String(sf.amountAfterDisbursement) : '')),
            successFees: sf.Success_fees ? String(sf.Success_fees) : (sf.successFees ? String(sf.successFees) : ''),
          };
        });
      } else if (deal.service && deal.service !== 'Services') {
        const rawAmt = Number(String(deal.rawAmount || deal.amount || '').replace(/[^0-9.]/g, '')) || 0;
        const baseAmt = Number(String(deal.totals?.baseAmount || '').replace(/[^0-9.]/g, '')) || (rawAmt > 0 ? Number((rawAmt / 1.18).toFixed(2)) : 0);
        services = [{
          id: '1',
          name: deal.service,
          totalAmount: rawAmt > 0 ? String(rawAmt) : '',
          baseAmount: baseAmt > 0 ? String(baseAmt) : '',
          notes: '',
          remarks: '',
          amountAfterDisbursement: '',
          successFees: '',
        }];
      }
      setDealServices(services);

      const rec = (deal.totals?.amountReceived !== undefined && deal.totals?.amountReceived !== null && String(deal.totals.amountReceived) !== '')
        ? String(deal.totals.amountReceived)
        : (deal.rawReceived !== undefined && deal.rawReceived !== null && String(deal.rawReceived) !== ''
            ? String(deal.rawReceived)
            : (deal.received ? String(deal.received).replace(/[^0-9.]/g, '') : ''));
      setAmountReceived(rec);

      setPaymentScreenshotName(deal.paymentScreenshotName || (Array.isArray(deal.Deal_payment_screenshot) && deal.Deal_payment_screenshot.length > 0 ? `${deal.Deal_payment_screenshot.length} Screenshots` : ''));
      setPaymentScreenshotFile(null);
      setPaymentScreenshotFiles([]);

      const hasPartner = Boolean(deal.hasPartnerBdm || deal.has_partner_bdm || fd.hasPartnerBdm || fd.has_partner_bdm || deal.Partner_BDM || rawZ.Partner_BDM || rawZ.Has_Partner_BDM);
      setHasPartnerBdm(hasPartner);
      const pId = deal.partnerBdmId || deal.partner_bdm_id || fd.partnerBdmId || fd.partner_bdm_id || (typeof deal.Partner_BDM === 'object' ? deal.Partner_BDM?.id : '') || (typeof rawZ.Partner_BDM === 'object' ? rawZ.Partner_BDM?.id : '') || '';
      const pName = deal.partnerBdmName || deal.partner_bdm_name || fd.partnerBdmName || fd.partner_bdm_name || (typeof deal.Partner_BDM === 'object' ? deal.Partner_BDM?.name : '') || (typeof rawZ.Partner_BDM === 'object' ? rawZ.Partner_BDM?.name : '') || '';
      setPartnerBdmId(pId);
      setPartnerBdmName(pName);

      const rem = deal.Q_Notes || deal.q_notes || deal.notes || deal.Notes || deal.remark || deal.Remark || deal.remarks || deal.Description || fd.Q_Notes || fd.q_notes || fd.notes || fd.Notes || fd.remark || fd.Remark || fd.remarks || rawZ.Q_Notes || rawZ.q_notes || rawZ.Notes || rawZ.Remark || rawZ.Description || '';
      setRemark(rem);
    } else {
      setEditingDealId(null);
      setFormData({
        clientName: '', mobile: '', email: '', gender: 'Male',
        panCard: '', aadhaarCard: '', city: '', state: '',
        billingAddress: '', Billing_address: '',
        companyName: '', businessType: '', doi: '', gstNumber: '',
        companyPan: '', sector: 'IT', industry: 'Software',
        companyAddress: '', Company_address: ''
      });
      setDealServices([]);
      setAmountReceived('');
      setPaymentScreenshotName('');
      setPaymentScreenshotFile(null);
      setPaymentScreenshotFiles([]);
      setHasPartnerBdm(false);
      setPartnerBdmId('');
      setPartnerBdmName('');
      setRemark('');
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
        billingAddress: '', Billing_address: '',
        companyName: '', businessType: '', doi: '', gstNumber: '',
        companyPan: '', sector: 'IT', industry: 'Software',
        companyAddress: '', Company_address: ''
      });
      setFormErrors({});
      setDealServices([]);
      setAmountReceived('');
      setDocuments([]);
      setFileError('');
      setHasPartnerBdm(false);
      setPartnerBdmId('');
      setPartnerBdmName('');
      setRemark('');
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
      if (paymentScreenshotFiles.length === 0 && !paymentScreenshotFile && !paymentScreenshotName) errors.paymentScreenshot = 'Payment Screenshot is required';
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
        { id: Math.random().toString(), name: serviceName, totalAmount: '', baseAmount: '', notes: '', remarks: '', amountAfterDisbursement: '', successFees: '' }
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
        if (field === 'notes') {
          updated.remarks = value;
        } else if (field === 'remarks') {
          updated.notes = value;
        }
        if (field === 'totalAmount') {
          const tNum = Number(value) || 0;
          const baseVal = tNum > 0 ? Number((tNum / 1.18).toFixed(2)) : 0;
          updated.baseAmount = tNum > 0 ? String(baseVal) : '';
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
      { id: Math.random().toString(), name: '', totalAmount: '', baseAmount: '', notes: '', remarks: '', amountAfterDisbursement: '', successFees: '' }
    ]);
  };

  const grandTotal = Number(dealServices.reduce((sum, s) => {
    const total = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) * 1.18).toFixed(2)) : 0);
    return sum + total;
  }, 0).toFixed(2));

  const totalGst = Number(dealServices.reduce((sum, s) => {
    const total = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) * 1.18).toFixed(2)) : 0);
    const base = Number(s.baseAmount) || (total > 0 ? Number((total / 1.18).toFixed(2)) : 0);
    const gst = total > 0 ? Number((total - base).toFixed(2)) : 0;
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

  const safeSaveDealsToStorage = (dealsList: any[]) => {
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

    rawDeals.forEach((zDeal: any) => {
      const zIdStr = String(zDeal.id || '');
      let existingIdx = -1;
      if (zIdStr && dealIndexByZohoId.has(zIdStr)) {
        existingIdx = dealIndexByZohoId.get(zIdStr)!;
      } else if (zIdStr && dealIndexById.has(zIdStr)) {
        existingIdx = dealIndexById.get(zIdStr)!;
      } else if (zDeal.Deal_Name) {
        const dlMatch = String(zDeal.Deal_Name).match(/\b(DL-\d+)\b/i);
        if (dlMatch && dealIndexById.has(dlMatch[1].toUpperCase())) {
          existingIdx = dealIndexById.get(dlMatch[1].toUpperCase())!;
        }
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
      const formatRupee = (val: number): string => {
        if (!val || isNaN(val) || val <= 0) return '₹0';
        return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
      };

      // Sum Subform_1 service line items if available
      let subformTotal = 0;
      let subformWithoutGst = 0;
      let subformReceived = 0;
      let subformPending = 0;
      const seenSubformsInDeal = new Set<string>();
      const uniqueSubform1 = Array.isArray(zDeal.Subform_1)
        ? zDeal.Subform_1.filter((sf: any) => {
            const nameKey = (sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || 'website development').trim().toLowerCase();
            if (seenSubformsInDeal.has(nameKey)) return false;
            seenSubformsInDeal.add(nameKey);
            return true;
          })
        : [];

      if (uniqueSubform1.length > 0) {
        uniqueSubform1.forEach((sf: any) => {
          const a = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount);
          const bg = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base);
          const r = parseZohoNum(sf.Received_amount || sf.Received);
          const p = parseZohoNum(sf.Pending_amount || sf.Pending);
          subformTotal += a || (bg > 0 ? Number((bg * 1.18).toFixed(2)) : 0);
          subformWithoutGst += bg || (a > 0 ? Number((a / 1.18).toFixed(2)) : 0);
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
        zDeal.Amount_Without_GST ? parseZohoNum(zDeal.Amount_Without_GST) * 1.18 : 0,
        zDeal.Deal_Amount_Without_GST ? parseZohoNum(zDeal.Deal_Amount_Without_GST) * 1.18 : 0,
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
        totalAmountNum > 0 ? Number((totalAmountNum / 1.18).toFixed(2)) : 0
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

      const pendingAmountNum = (totalAmountNum > 0 && receivedAmountNum >= totalAmountNum)
        ? 0
        : (totalAmountNum > 0 && receivedAmountNum > 0)
        ? Math.max(0, Number((totalAmountNum - receivedAmountNum).toFixed(2)))
        : findFirstPositive(
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

      const existingDeal = existingIdx >= 0 ? updatedDeals[existingIdx] : null;

      // 4. Legal Subform (Parsed first to allow fallback service schema detection)
      const seenLegalRows = new Set<string>();
      const dedupedRawLegal = Array.isArray(zDeal.Legal)
        ? zDeal.Legal.filter((lg: any, i: number) => {
            const sKey = (lg.Legal_Schemas || lg.Schemas || `row_${i}`).trim().toLowerCase();
            if (seenLegalRows.has(sKey)) return false;
            seenLegalRows.add(sKey);
            return true;
          })
        : [];
      const legalSubform = dedupedRawLegal.length > 0
        ? dedupedRawLegal.map((lg: any, i: number) => ({
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

      // 5. Subform_1 (Choose Services)
      let servicesFromSubform: any[] = [];
      if (uniqueSubform1.length > 0) {
        servicesFromSubform = uniqueSubform1.map((sf: any, i: number) => {
          const agreementAmount = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || 0);
          const withoutGst = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? Number((agreementAmount / 1.18).toFixed(2)) : 0));
          const totalAmt = agreementAmount || (withoutGst > 0 ? Number((withoutGst * 1.18).toFixed(2)) : 0);
          const rawSvc = sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || sf.Item_Name || sf.Product_Name || sf.Service_Scheme || sf.Service_scheme || sf.Services || sf.Name || sf.name || sf.Legal_Schemas || 'Service';
          const svcName = typeof rawSvc === 'object' ? (rawSvc?.name || rawSvc?.display_value || 'Service') : String(rawSvc || 'Service');
          return {
            id: String(sf.id || i + 1),
            name: svcName,
            totalAmount: String(totalAmt || ''),
            baseAmount: String(withoutGst || 0),
            receivedAmount: sf.Received_amount || sf.Received || '',
            pendingAmount: sf.Pending_amount || sf.Pending || '',
            paymentStages: typeof sf.Payment_stages === 'object' ? (sf.Payment_stages?.name || '') : String(sf.Payment_stages || ''),
            paymentType: typeof sf.Payment_type === 'object' ? (sf.Payment_type?.name || '') : String(sf.Payment_type || ''),
            paymentDate: typeof sf.Payment_received_date === 'object' ? (sf.Payment_received_date?.name || '') : String(sf.Payment_received_date || ''),
            qualityProvided: typeof sf.Quality_provided === 'object' ? (sf.Quality_provided?.name || '') : String(sf.Quality_provided || ''),
            successFees: sf.Success_fees || sf.successFees || '',
            amountAfterDisbursement: sf.amount_if_you_have_kindly_put_0 !== undefined && sf.amount_if_you_have_kindly_put_0 !== null
              ? String(sf.amount_if_you_have_kindly_put_0)
              : (sf.Amount_After_disbursement !== undefined && sf.Amount_After_disbursement !== null
                ? String(sf.Amount_After_disbursement)
                : (sf.amountAfterDisbursement || '')),
          };
        });
      } else if (
        existingDeal &&
        Array.isArray(existingDeal.servicesData) &&
        existingDeal.servicesData.length > 0 &&
        existingDeal.servicesData.some((s: any) => isValidServiceName(s.name, resolvedClientName, resolvedCompanyName, existingDeal.id))
      ) {
        servicesFromSubform = existingDeal.servicesData.filter((s: any) =>
          isValidServiceName(s.name, resolvedClientName, resolvedCompanyName, existingDeal.id)
        );
      } else if (
        existingDeal &&
        isValidServiceName(existingDeal.service, resolvedClientName, resolvedCompanyName, existingDeal.id)
      ) {
        servicesFromSubform = [{
          id: '1',
          name: existingDeal.service,
          totalAmount: String(totalAmountNum || ''),
          baseAmount: String(withoutGstNum || ''),
          receivedAmount: String(receivedAmountNum || ''),
          pendingAmount: String(pendingAmountNum || ''),
        }];
      } else if (
        dedupedRawLegal.length > 0 &&
        dedupedRawLegal.some((lg: any) => isValidServiceName(lg.Legal_Schemas || lg.Schemas, resolvedClientName, resolvedCompanyName, zDeal.id))
      ) {
        const validLegal = dedupedRawLegal.filter((lg: any) =>
          isValidServiceName(lg.Legal_Schemas || lg.Schemas, resolvedClientName, resolvedCompanyName, zDeal.id)
        );
        servicesFromSubform = validLegal.map((lg: any, i: number) => ({
          id: String(lg.id || i + 1),
          name: typeof lg.Legal_Schemas === 'object' ? (lg.Legal_Schemas?.name || '') : String(lg.Legal_Schemas || lg.Schemas || ''),
          totalAmount: String(totalAmountNum || ''),
          baseAmount: String(withoutGstNum || ''),
          receivedAmount: String(receivedAmountNum || ''),
          pendingAmount: String(pendingAmountNum || ''),
        }));
      } else {
        let inferredServiceName = '';
        const svcCandidates = [
          zDeal.Service_Name,
          zDeal.Services,
          zDeal.Service,
          zDeal.Service_scheme,
          zDeal.Service_Scheme,
          zDeal.Legal_Schemas,
          zDeal.Schemas,
          zDeal.Product_Name,
          zDeal.Choose_Wisely !== 'New Case Booking' ? zDeal.Choose_Wisely : null,
          zDeal.Business_plan_selected,
          zDeal.Item_Name,
        ];
        for (const cand of svcCandidates) {
          if (!cand) continue;
          const candStr = typeof cand === 'object' ? (cand?.name || cand?.display_value || '') : String(cand).trim();
          if (candStr && isValidServiceName(candStr, resolvedClientName, resolvedCompanyName, zDeal.id)) {
            inferredServiceName = candStr;
            break;
          }
        }
        if (!inferredServiceName && zDeal.Deal_Name) {
          const match = ALL_SERVICES.find(s => s && s.length > 2 && String(zDeal.Deal_Name).toLowerCase().includes(s.toLowerCase()));
          if (match && isValidServiceName(match, resolvedClientName, resolvedCompanyName, zDeal.id)) {
            inferredServiceName = match;
          }
        }

        if (inferredServiceName) {
          servicesFromSubform = [{
            id: '1',
            name: inferredServiceName,
            totalAmount: String(totalAmountNum || ''),
            baseAmount: String(withoutGstNum || ''),
            receivedAmount: String(receivedAmountNum || ''),
            pendingAmount: String(pendingAmountNum || ''),
          }];
        } else {
          servicesFromSubform = [];
        }
      }

      let serviceTitle = '';
      if (servicesFromSubform.length === 1 && isValidServiceName(servicesFromSubform[0].name, resolvedClientName, resolvedCompanyName, zDeal.id)) {
        serviceTitle = servicesFromSubform[0].name;
      } else if (servicesFromSubform.length > 1) {
        serviceTitle = `${servicesFromSubform.length} Services`;
      } else if (existingDeal && isValidServiceName(existingDeal.service, resolvedClientName, resolvedCompanyName, existingDeal.id)) {
        serviceTitle = existingDeal.service;
      } else if (servicesFromSubform.length > 0 && servicesFromSubform[0].name && servicesFromSubform[0].name !== 'Service') {
        serviceTitle = servicesFromSubform[0].name;
      } else {
        serviceTitle = 'Services';
      }

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
      const partnerBdmLookup = typeof zDeal.Partner_BDM === 'object' && zDeal.Partner_BDM !== null ? zDeal.Partner_BDM : null;

      const hasPartnerBdm = Boolean(
        partnerBdmLookup?.id ||
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
        partnerBdmLookup?.name ||
        zDeal.Partner_BDM_Name || 
        zDeal.Partner_BDM_name || 
        zDeal.Partner_BDM_Names || 
        zDeal.Partner_BDM_Names_bp || 
        zDeal.Partner_BDM_Names_st || 
        zDeal.partner_bdm_name ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.partnerBdmName : '') || 
        '';

      const partnerBdmId = 
        partnerBdmLookup?.id ? String(partnerBdmLookup.id) : (
        zDeal.Partner_BDM_ID || 
        zDeal.partner_bdm_id || 
        (typeof zDeal.Partner_BDM === 'string' && /^\d+$/.test(zDeal.Partner_BDM) ? zDeal.Partner_BDM : '') ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.partnerBdmId : '') || 
        '');

      let partnerBdmAmount = Number(zDeal.Partner_BDM_Amount || zDeal.Partner_BDM_amount || zDeal.partner_bdm_amount || 0);
      if (hasPartnerBdm && (!partnerBdmAmount || partnerBdmAmount === 0) && receivedAmountNum > 0) {
        partnerBdmAmount = Number(((receivedAmountNum / 1.18) / 2).toFixed(2));
      } else if (!partnerBdmAmount && existingIdx >= 0 && updatedDeals[existingIdx]?.partnerBdmAmount) {
        partnerBdmAmount = updatedDeals[existingIdx].partnerBdmAmount;
      }

      // Resolve Employee lookup details from Zoho CRM Deal
      const employeeName = 
        (zDeal.Employee && typeof zDeal.Employee === 'object' ? zDeal.Employee.name : (typeof zDeal.Employee === 'string' && !/^\d+$/.test(zDeal.Employee) ? zDeal.Employee : '')) ||
        zDeal.employeeName ||
        zDeal.salesEmployee ||
        zDeal.Created_By_Employee ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.employeeName : '') ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.salesEmployee : '') ||
        '';

      const employeeZohoId = 
        (zDeal.Employee && typeof zDeal.Employee === 'object' ? zDeal.Employee.id : (typeof zDeal.Employee === 'string' && /^\d+$/.test(zDeal.Employee) ? zDeal.Employee : null)) ||
        zDeal.employeeZohoId ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.employeeZohoId : '') ||
        '';

      const empCode = zDeal.Employment_ID || zDeal.Employee_Code || (existingIdx >= 0 ? updatedDeals[existingIdx]?.empId : '') || '';

      const compZohoId = (zDeal.Company && typeof zDeal.Company === 'object' ? zDeal.Company.id : (typeof zDeal.Company === 'string' && /^\d+$/.test(zDeal.Company) ? zDeal.Company : undefined)) ||
        (zDeal.Companies && typeof zDeal.Companies === 'object' ? zDeal.Companies.id : (typeof zDeal.Companies === 'string' && /^\d+$/.test(zDeal.Companies) ? zDeal.Companies : undefined)) ||
        (zDeal.Account_Name && typeof zDeal.Account_Name === 'object' ? zDeal.Account_Name.id : undefined) ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.companyZohoId : undefined);

      const clZohoId = (zDeal.Clients && typeof zDeal.Clients === 'object' ? zDeal.Clients.id : (typeof zDeal.Clients === 'string' && /^\d+$/.test(zDeal.Clients) ? zDeal.Clients : undefined)) ||
        (zDeal.Client && typeof zDeal.Client === 'object' ? zDeal.Client.id : (typeof zDeal.Client === 'string' && /^\d+$/.test(zDeal.Client) ? zDeal.Client : undefined)) ||
        (zDeal.Contact_Name && typeof zDeal.Contact_Name === 'object' ? zDeal.Contact_Name.id : undefined) ||
        (existingIdx >= 0 ? updatedDeals[existingIdx]?.clientZohoId : undefined);

      const dealObj: any = {
        id: resolvedDealId,
        client: resolvedClientName,
        company: resolvedCompanyName,
        companyZohoId: compZohoId,
        clientZohoId: clZohoId,
        Company: zDeal.Company || (compZohoId ? { id: compZohoId, name: resolvedCompanyName } : undefined),
        Companies: zDeal.Companies || (compZohoId ? { id: compZohoId, name: resolvedCompanyName } : undefined),
        Clients: zDeal.Clients || (clZohoId ? { id: clZohoId, name: resolvedClientName } : undefined),
        service: serviceTitle,
        amount: formatRupee(totalAmountNum),
        received: formatRupee(receivedAmountNum),
        pending: formatRupee(pendingAmountNum),
        status: statusName,
        stage: stageName,
        owner: zDeal.Owner?.name || (existingIdx >= 0 ? updatedDeals[existingIdx]?.owner : 'Admin') || 'Admin',
        Owner: zDeal.Owner,
        Employee: zDeal.Employee || (employeeZohoId ? { id: employeeZohoId, name: employeeName } : undefined),
        employeeZohoId,
        employeeName,
        salesEmployee: employeeName || (existingIdx >= 0 ? updatedDeals[existingIdx]?.salesEmployee : ''),
        date: zDeal.Payment_Date ? new Date(zDeal.Payment_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (zDeal.Booking_Date ? new Date(zDeal.Booking_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (zDeal.Closing_Date ? new Date(zDeal.Closing_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (existingIdx >= 0 ? updatedDeals[existingIdx]?.date : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })))),
        Payment_Date: zDeal.Payment_Date || zDeal.Payment_received_date || (existingIdx >= 0 ? updatedDeals[existingIdx]?.Payment_Date : undefined),
        paymentDate: zDeal.Payment_Date || zDeal.Payment_received_date || (existingIdx >= 0 ? updatedDeals[existingIdx]?.paymentDate : undefined),
        source: (existingIdx >= 0 ? updatedDeals[existingIdx]?.source : 'Cloud') || 'Cloud',
        Partner_BDM: zDeal.Partner_BDM || (partnerBdmId ? { id: partnerBdmId, name: partnerBdmName } : undefined),
        Partner_BDM_ID: partnerBdmId,
        Partner_BDM_Name: partnerBdmName,
        Partner_BDM_Names: partnerBdmName,
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
        billingAddress: billAddress,
        Billing_address: zDeal.Billing_address || billAddress,
        companyAddress: zDeal.Company_address || '',
        Company_address: zDeal.Company_address || '',
        Payment_verifications: Boolean(
          zDeal.Payment_verifications === true ||
          zDeal.Payment_verifications === 'true' ||
          zDeal.Payment_verifications === 'Verified' ||
          zDeal.Payment_verifications === 'Yes'
        ),
        paymentVerified: Boolean(
          zDeal.Payment_verifications === true ||
          zDeal.Payment_verifications === 'true' ||
          zDeal.Payment_verifications === 'Verified' ||
          zDeal.Payment_verifications === 'Yes'
        ),
        formData: {
          clientName: resolvedClientName,
          companyName: resolvedCompanyName,
          companyZohoId: compZohoId,
          clientZohoId: clZohoId,
          Company: zDeal.Company || (compZohoId ? { id: compZohoId, name: resolvedCompanyName } : undefined),
          Companies: zDeal.Companies || (compZohoId ? { id: compZohoId, name: resolvedCompanyName } : undefined),
          Clients: zDeal.Clients || (clZohoId ? { id: clZohoId, name: resolvedClientName } : undefined),
          email: contactEmail,
          mobile: contactPhone,
          gstNumber: gstNum,
          panCard: panNum,
          billingAddress: billAddress,
          Billing_address: zDeal.Billing_address || billAddress,
          companyAddress: zDeal.Company_address || '',
          Company_address: zDeal.Company_address || '',
          city: zDeal.City || '',
          state: stateName,
          businessType: zDeal.Company_Type || zDeal.Choose_Wisely || 'Private Limited',
          employeeName,
          employeeZohoId,
          salesEmployee: employeeName || (existingIdx >= 0 ? updatedDeals[existingIdx]?.salesEmployee : ''),
          empId: empCode,
          Partner_BDM: zDeal.Partner_BDM || (partnerBdmId ? { id: partnerBdmId, name: partnerBdmName } : undefined),
          Partner_BDM_ID: partnerBdmId,
          Partner_BDM_Name: partnerBdmName,
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
        // Ensure all milestone payment keys (R1-R8) and dates from zDeal are explicitly preserved on dealObj
        ...Object.fromEntries(Object.entries(zDeal).filter(([k]) => /^R[1-8]_/.test(k) || k.includes('status_change'))),
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
    });

    return { updatedDeals, newCount, updatedCount };
  };

  // Fetch Deals based on reference folder implementation
  const fetchDeals = useCallback(
    async (pageToFetch: number, pageTokenToFetch: string | null = null, sizePerPage: number = itemsPerPage, showToast = false) => {
      setIsFetchingZoho(true);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', pageToFetch.toString());
        queryParams.set('per_page', sizePerPage.toString());

        if (pageTokenToFetch) {
          queryParams.set('page_token', pageTokenToFetch);
        }

        // Auto-load employees if directory is not loaded yet or if active user is TL
        let currentEmployeesList = effectiveEmployees;
        if (currentEmployeesList.length <= 2 || (isUserTL && currentEmployeesList.filter((e: any) => isSubordinateOfTL(e, currentUser)).length === 0)) {
          try {
            const empRes = await fetchZohoEmployees();
            if (empRes.success && Array.isArray(empRes.data) && empRes.data.length > 0) {
              currentEmployeesList = empRes.data.map(mapZohoRecordToEmployee);
              try {
                localStorage.setItem('be_employees', JSON.stringify(currentEmployeesList));
                window.dispatchEvent(new Event('be_employees_updated'));
              } catch (e) {}
              setLiveEmployees(currentEmployeesList);
            }
          } catch (empErr) {
            console.warn('Could not auto-fetch employees for deals RBAC:', empErr);
          }
        }

        // Apply RBAC criteria for role-scoped visibility (never apply to Accounts, Legal, Super Admin, or HOD)
        if (currentUser && currentUser.role !== 'Super Admin' && currentUser.role !== 'HOD' && currentUser.role !== 'HR' && !isAccounts && !isLegal && currentUser.email !== 'superadmin@be.com' && currentUser.email !== 'md@bharat-edge.com') {
          const { criteria, isUnfiltered } = buildZohoRbacCriteria('Deals', currentUser, currentEmployeesList);
          if (!isUnfiltered && criteria) {
            queryParams.set('criteria', criteria);
          }
        }

        const res = await fetch(`/api/deals?${queryParams.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.details || data.error || 'Failed to fetch deals');
        }

        const rawList = data.data || [];
        
        let existingDeals: any[] = [];
        try {
          const saved = localStorage.getItem('be_deals');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) existingDeals = parsed;
          }
        } catch (e) {}

        const baseDeals = existingDeals.length > 0 ? existingDeals : deals;
        const { updatedDeals } = processZohoDealsBatch(rawList, baseDeals);

        // Retain local manual/pending deals that are not yet in Zoho or recently created drafts
        const localPending = baseDeals.filter(
          (d: any) => d.id?.startsWith('DL-') && (!d.zohoId || d.zohoStatus !== 'synced')
        );
        const existingIds = new Set(updatedDeals.map((d: any) => d.id));
        const finalDeals = [...updatedDeals];
        localPending.forEach((lp: any) => {
          if (!existingIds.has(lp.id)) {
            finalDeals.unshift(lp);
            existingIds.add(lp.id);
          }
        });

        setDeals(finalDeals);

        const info = data.info || null;
        setPaginationInfo(info);
        if (info?.total_records !== undefined && info.total_records !== null) {
          setTotalRecordsCount(Number(info.total_records));
        } else if (rawList.length > 0) {
          setTotalRecordsCount(rawList.length);
        }

        safeSaveDealsToStorage(finalDeals);

        if (showToast) {
          setToast({
            type: 'success',
            message: 'Deals Synchronized',
            submessage: `Page ${pageToFetch} loaded (${rawList.length} deals on this page, Total: ${(info?.total_records || rawList.length).toLocaleString()})`
          });
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        console.error('[Deals Fetch Error]:', msg);
        if (showToast) {
          setToast({
            type: 'error',
            message: 'Fetch Error',
            submessage: msg
          });
        }
      } finally {
        setIsFetchingZoho(false);
      }
    },
    [itemsPerPage]
  );

  // Navigation handlers based on reference code
  const handlePageChange = (targetPage: number) => {
    if (isFetchingZoho || targetPage === currentPage) return;

    if (targetPage === currentPage + 1) {
      // Next Page
      const nextToken = paginationInfo?.next_page_token || null;
      setTokenHistory(prev => {
        const updated = [...prev];
        updated[targetPage - 1] = nextToken;
        return updated;
      });
      setCurrentPage(targetPage);
      setCurrentToken(nextToken);
      fetchDeals(targetPage, nextToken, itemsPerPage);
    } else if (targetPage === currentPage - 1) {
      // Prev Page
      const prevToken = tokenHistory[targetPage - 1] || null;
      setCurrentPage(targetPage);
      setCurrentToken(prevToken);
      fetchDeals(targetPage, prevToken, itemsPerPage);
    } else {
      // Direct jump (e.g. page 1 or specific page)
      const token = tokenHistory[targetPage - 1] || null;
      setCurrentPage(targetPage);
      setCurrentToken(token);
      fetchDeals(targetPage, token, itemsPerPage);
    }
  };

  const handleItemsPerPageChange = (newPerPage: number) => {
    setItemsPerPage(newPerPage);
    setCurrentPage(1);
    setCurrentToken(null);
    setTokenHistory([null]);
    fetchDeals(1, null, newPerPage);
  };

  const handleRefresh = () => {
    fetchDeals(currentPage, currentToken, itemsPerPage, true);
  };

  // Initial load and perPage change based on reference code
  useEffect(() => {
    setCurrentPage(1);
    setCurrentToken(null);
    setTokenHistory([null]);
    fetchDeals(1, null, itemsPerPage);
  }, [itemsPerPage, fetchDeals]);

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
  }, [activeTab, searchQuery, quickFilter, statusFilter]);

  // Set of deals currently being enriched or already enriched in this session
  const enrichingDealsRef = useRef<Set<string>>(new Set());

  // 1. Auto-enrich visible deals on the active page that have ₹0 amounts
  useEffect(() => {
    // Filter deals based on activeTab, quickFilter, statusFilter and searchQuery to get active page slice
    const filtered = deals.filter(deal => {
      if (isUserTL) {
        if (activeTab === 'My Team Deals') {
          if (!isDealOwnedBySubordinate(deal, currentUser, effectiveEmployees)) return false;
        } else {
          if (!isDealOwnedByTL(deal, currentUser)) return false;
        }
      }
      const isFromQt = isDealFromQuotation(deal);
      if (activeTab === 'Manual Deals' && isFromQt) return false;
      if (activeTab === 'From Quotations' && !isFromQt) return false;
      if (quickFilter === 'today' && !isDealToday(deal)) return false;
      if (quickFilter === 'this_month' && !isDealThisMonth(deal)) return false;
      if (quickFilter === 'pending' && getDealPending(deal) <= 0) return false;
      if (statusFilter && statusFilter !== 'all') {
        const s = String(deal.status || deal.stage || '').toLowerCase();
        if (!s.includes(statusFilter.toLowerCase())) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchClient = deal.client && String(deal.client).toLowerCase().includes(q);
        const matchCompany = deal.company && String(deal.company).toLowerCase().includes(q);
        const matchService = deal.service && String(deal.service).toLowerCase().includes(q);
        const matchId = deal.id && String(deal.id).toLowerCase().includes(q);
        const matchZohoId = deal.zohoId && String(deal.zohoId).toLowerCase().includes(q);
        const matchOwner = deal.owner && String(deal.owner).toLowerCase().includes(q);
        const matchEmpName = (deal.employeeName || deal.salesEmployee) && String(deal.employeeName || deal.salesEmployee).toLowerCase().includes(q);
        const matchStatus = (deal.status || deal.stage) && String(deal.status || deal.stage).toLowerCase().includes(q);
        const matchAmount = (deal.amount || deal.received || deal.pending) && String(deal.amount || deal.received || deal.pending).toLowerCase().includes(q);
        const matchEmpCode = deal.empId && String(deal.empId).toLowerCase().includes(q);
        const subMember = isUserTL ? getDealSubordinateMember(deal, currentUser, allEmployees) : null;
        const matchSubMember = subMember?.name && subMember.name.toLowerCase().includes(q);

        if (!matchClient && !matchCompany && !matchService && !matchId && !matchZohoId && !matchOwner && !matchEmpName && !matchStatus && !matchAmount && !matchEmpCode && !matchSubMember) return false;
      }
      return true;
    });

    const pageSlice = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const dealsToEnrich = pageSlice.filter((d: any) => {
      const hasValidService = isValidServiceName(d.service, d.client, d.company, d.id) &&
        d.service !== 'Services' && d.service !== 'Custom Services' && d.service !== 'General Services';
      const hasValidServicesData = Array.isArray(d.servicesData) && d.servicesData.length > 0 &&
        d.servicesData.some((s: any) => isValidServiceName(s.name, d.client, d.company, d.id));
      const needsServiceEnrichment = !hasValidService || !hasValidServicesData;
      const needsAmountEnrichment = getDealAmount(d) === 0;

      return (needsServiceEnrichment || needsAmountEnrichment) &&
        (d.zohoId || (d.id && String(d.id).length > 8)) &&
        !enrichingDealsRef.current.has(String(d.zohoId || d.id));
    });

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
                safeSaveDealsToStorage(copy);
                return copy;
              }
              return prevDeals;
            });
          }
        }
      }).catch(() => {});
    });

    return () => {
      isCancelled = true;
    };
  }, [deals, currentPage, itemsPerPage, activeTab, searchQuery, isUserTL, currentUser, allEmployees]);

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

  const handleCreateDeal = async () => {
    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingDealId);
      const existingDeal = deals.find((d: any) => d.id === editingDealId || (d.zohoId && String(d.zohoId) === String(editingDealId)));
      const dealId = existingDeal?.id || editingDealId || `DL-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Save actual files to IndexedDB
      const docsToSave: any[] = existingDeal?.documentsData ? [...existingDeal.documentsData] : [];

      if (paymentScreenshotFiles.length > 0) {
        for (let idx = 0; idx < paymentScreenshotFiles.length; idx++) {
          const pFile = paymentScreenshotFiles[idx];
          const docId = `${dealId}_payment_screenshot_${idx}_${pFile.name}`;
          try {
            await saveDocument(docId, pFile);
          } catch (e) {
            console.error('Failed to save payment screenshot', e);
          }
        }
      } else if (paymentScreenshotFile) {
        const docId = `${dealId}_payment_screenshot_0_${paymentScreenshotFile.name}`;
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
            source: existingComp?.source || 'Manual',
            addedOn: existingComp?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            zohoId: existingComp?.zohoId,
            zohoStatus: existingComp?.zohoStatus || 'pending',
            employeeZohoId: existingDeal?.employeeZohoId || currentUser?.zohoId,
            employeeName: existingDeal?.employeeName || currentUser?.name,
            employeeEmail: existingDeal?.employeeEmail || currentUser?.email,
            empId: existingDeal?.empId || currentUser?.empId || currentUser?.id,
            salesEmployee: existingDeal?.salesEmployee || currentUser?.name,
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
            source: existingClient?.source || 'Manual',
            addedOn: existingClient?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            zohoId: existingClient?.zohoId,
            zohoStatus: existingClient?.zohoStatus || 'pending',
            employeeZohoId: existingDeal?.employeeZohoId || currentUser?.zohoId,
            employeeName: existingDeal?.employeeName || currentUser?.name,
            employeeEmail: existingDeal?.employeeEmail || currentUser?.email,
            empId: existingDeal?.empId || currentUser?.empId || currentUser?.id,
            salesEmployee: existingDeal?.salesEmployee || currentUser?.name,
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
        billingAddress: formData.billingAddress || (formData as any).Billing_address || '',
        Billing_address: formData.Billing_address || (formData as any).billingAddress || '',
        companyAddress: formData.companyAddress || (formData as any).Company_address || '',
        Company_address: formData.Company_address || (formData as any).companyAddress || '',
        companyZohoId: companyZohoId,
        clientZohoId: clientZohoId,
        service: dealServices.length === 1 ? dealServices[0].name : dealServices.length > 1 ? `${dealServices.length} Services` : 'Custom Services',
        amount: `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        received: `₹${(Number(amountReceived) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        pending: `₹${pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        status: existingDeal?.status || 'New',
        stage: existingDeal?.stage || 'Sales',
        owner: existingDeal?.owner || currentUser?.name || 'Admin',
        Employee: (existingDeal?.employeeZohoId || currentUser?.zohoId)
          ? { id: existingDeal?.employeeZohoId || currentUser?.zohoId, name: existingDeal?.employeeName || currentUser?.name }
          : undefined,
        employeeZohoId: existingDeal?.employeeZohoId || currentUser?.zohoId,
        employeeName: existingDeal?.employeeName || currentUser?.name,
        employeeEmail: existingDeal?.employeeEmail || currentUser?.email,
        empId: existingDeal?.empId || currentUser?.empId || currentUser?.id,
        salesEmployee: existingDeal?.salesEmployee || currentUser?.name,
        date: existingDeal?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        Payment_Date: existingDeal?.Payment_Date || new Date().toISOString().split('T')[0],
        paymentDate: existingDeal?.Payment_Date || new Date().toISOString().split('T')[0],
        Closing_Date: isEditing ? (existingDeal?.Closing_Date || undefined) : undefined,
        source: existingDeal?.source || 'Manual',
        // Partner BDM split details & Employee Lookup
        Partner_BDM: (hasPartnerBdm && partnerBdmId && /^\d{15,}$/.test(String(partnerBdmId).trim()))
          ? { id: String(partnerBdmId).trim(), name: partnerBdmName }
          : undefined,
        hasPartnerBdm: hasPartnerBdm,
        has_partner_bdm: hasPartnerBdm,
        partnerBdmId: hasPartnerBdm ? partnerBdmId : '',
        partner_bdm_id: hasPartnerBdm ? partnerBdmId : '',
        partnerBdmName: hasPartnerBdm ? partnerBdmName : '',
        partner_bdm_name: hasPartnerBdm ? partnerBdmName : '',
        partnerBdmAmount: hasPartnerBdm ? partnerBdmAmount : 0,
        partner_bdm_amount: hasPartnerBdm ? partnerBdmAmount : 0,
        bookingAmount: Number(amountReceived) || 0,
        remark: remark.trim(),
        Remark: remark.trim(),
        remarks: remark.trim(),
        Description: remark.trim(),
        // Full details
        formData: {
          ...formData,
          remark: remark.trim(),
          Remark: remark.trim(),
          remarks: remark.trim(),
          Description: remark.trim(),
          Payment_Date: existingDeal?.Payment_Date || new Date().toISOString().split('T')[0],
          paymentDate: existingDeal?.Payment_Date || new Date().toISOString().split('T')[0],
          Closing_Date: isEditing ? (existingDeal?.Closing_Date || undefined) : undefined,
          bookingAmount: Number(amountReceived) || 0,
          companyZohoId,
          clientZohoId,
          employeeZohoId: existingDeal?.employeeZohoId || currentUser?.zohoId,
          employeeName: existingDeal?.employeeName || currentUser?.name,
          employeeEmail: existingDeal?.employeeEmail || currentUser?.email,
          empId: existingDeal?.empId || currentUser?.empId || currentUser?.id,
          salesEmployee: existingDeal?.salesEmployee || currentUser?.name,
          Partner_BDM: (hasPartnerBdm && partnerBdmId && /^\d{15,}$/.test(String(partnerBdmId).trim()))
            ? { id: String(partnerBdmId).trim(), name: partnerBdmName }
            : undefined,
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
          const t = Number(s.totalAmount) || (Number(s.baseAmount) ? Number((Number(s.baseAmount) * 1.18).toFixed(2)) : 0);
          const b = Number(s.baseAmount) || (t > 0 ? Number((t / 1.18).toFixed(2)) : 0);
          return {
            ...s,
            totalAmount: String(t || s.totalAmount || ''),
            baseAmount: String(b || s.baseAmount || ''),
            amountAfterDisbursement: s.amountAfterDisbursement !== undefined ? String(s.amountAfterDisbursement) : '',
            successFees: s.successFees || '',
          };
        }),
        totals: { subtotal, totalGst, grandTotal, amountReceived, pendingAmount, bookingAmount: Number(amountReceived) || 0 },
        Payment_verifications: isEditing ? (existingDeal?.Payment_verifications ?? false) : false,
        paymentVerified: isEditing ? (existingDeal?.paymentVerified ?? false) : false,
        paymentScreenshotName: paymentScreenshotFiles.length > 1 ? `${paymentScreenshotFiles.length} Screenshots` : (paymentScreenshotFile?.name || paymentScreenshotName),
        paymentScreenshotNames: paymentScreenshotFiles.map(f => f.name),
        documentsData: docsToSave,
        zohoId: existingDeal?.zohoId || (editingDealId && /^\d{15,}$/.test(String(editingDealId)) ? String(editingDealId) : undefined),
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

          // Upload attached payment screenshot(s) to Zoho CRM Deal Image Upload field: Deal_payment_screenshot
          const screenshotsToUpload = paymentScreenshotFiles.length > 0
            ? paymentScreenshotFiles
            : (paymentScreenshotFile ? [paymentScreenshotFile] : []);

          if (screenshotsToUpload.length > 0) {
            try {
              await uploadZohoDealImageField(finalZohoId, screenshotsToUpload, 'Deal_payment_screenshot');
            } catch (attErr) {
              console.warn('[Zoho CRM] Deal_payment_screenshot upload failed:', attErr);
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
            message: isEditing ? 'Deal Updated Successfully!' : 'Deal, Client & Company Saved Successfully!',
            submessage: syncSummary
          });
        } else {
          dealData.zohoStatus = 'failed';
          dealData.zohoError = zohoRes.message;
          setToast({
            type: 'error',
            message: `Deal Saved Locally (Sync Failed)`,
            submessage: zohoRes.message || 'Check field requirements'
          });
        }
      } catch (zErr: any) {
        console.error('Zoho CRM sync error:', zErr);
        dealData.zohoStatus = 'failed';
        dealData.zohoError = zErr?.message || 'Sync failed';
        setToast({
          type: 'error',
          message: `Deal Saved Locally (Sync Error)`,
          submessage: zErr?.message || 'Failed to communicate with server'
        });
      }

      let newDealsList;
      if (editingDealId) {
        // Retain old status/date/owner if editing
        newDealsList = deals.map((d: any) => {
          if (d.id === editingDealId || (d.zohoId && String(d.zohoId) === String(editingDealId))) {
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

  const handleDeleteDeal = (deal: any) => {
    setDeleteTarget({ isOpen: true, deal, isDeleting: false });
  };

  const confirmDeleteDeal = async () => {
    const deal = deleteTarget.deal;
    if (!deal) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));
    const dealName = deal.formData?.clientName || deal.client || deal.id;

    try {
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
              submessage: `Record has been deleted successfully (ID: #${deal.zohoId})`
            });
          } else {
            setToast({
              type: 'error',
              message: `Deal Deleted Locally (Delete Failed)`,
              submessage: zohoRes.message || 'Failed to delete record'
            });
          }
        } catch (zErr: any) {
          console.error('[Zoho CRM] Delete error:', zErr);
          setToast({
            type: 'error',
            message: `Deal Deleted Locally (Delete Error)`,
            submessage: zErr?.message || 'Failed to communicate with server'
          });
        }
      } else {
        setToast({
          type: 'success',
          message: `Deal "${dealName}" Deleted`,
          submessage: 'Record has been deleted successfully'
        });
      }
    } finally {
      setDeleteTarget({ isOpen: false, deal: null, isDeleting: false });
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
          source: existingComp?.source || 'Manual',
          addedOn: existingComp?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoId: existingComp?.zohoId,
          zohoStatus: existingComp?.zohoStatus || 'pending',
          employeeZohoId: deal.employeeZohoId || deal.formData?.employeeZohoId || currentUser?.zohoId,
          employeeName: deal.employeeName || deal.formData?.employeeName || currentUser?.name,
          employeeEmail: deal.employeeEmail || deal.formData?.employeeEmail || currentUser?.email,
          empId: deal.empId || deal.formData?.empId || currentUser?.empId || currentUser?.id,
          salesEmployee: deal.salesEmployee || currentUser?.name,
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
          source: existingClient?.source || 'Manual',
          addedOn: existingClient?.addedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          zohoId: existingClient?.zohoId,
          zohoStatus: existingClient?.zohoStatus || 'pending',
          employeeZohoId: deal.employeeZohoId || deal.formData?.employeeZohoId || currentUser?.zohoId,
          employeeName: deal.employeeName || deal.formData?.employeeName || currentUser?.name,
          employeeEmail: deal.employeeEmail || deal.formData?.employeeEmail || currentUser?.email,
          empId: deal.empId || deal.formData?.empId || currentUser?.empId || currentUser?.id,
          salesEmployee: deal.salesEmployee || currentUser?.name,
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
        Partner_BDM: (deal.hasPartnerBdm || deal.partnerBdmId) && (deal.partnerBdmId || deal.partner_bdm_id) && /^\d{15,}$/.test(String(deal.partnerBdmId || deal.partner_bdm_id).trim())
          ? { id: String(deal.partnerBdmId || deal.partner_bdm_id).trim(), name: deal.partnerBdmName || deal.partner_bdm_name }
          : undefined,
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
          message: `Deal Synced Successfully!`,
          submessage: `Record ID: #${zohoRes.zohoId}`
        });
      } else {
        const updatedList = deals.map((d: any) => 
          d.id === deal.id ? { ...d, zohoStatus: 'failed', zohoError: zohoRes.message } : d
        );
        setDeals(updatedList);
        safeSaveDealsToStorage(updatedList);
        setToast({
          type: 'error',
          message: `Deal Sync Failed`,
          submessage: zohoRes.message || 'Please check field requirements or authentication'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Deal Sync Error`,
        submessage: err?.message || 'Failed to communicate with server'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const isDealMissingMandatoryDetails = (deal: any): { isMissing: boolean; reason?: string } => {
    if (!deal) return { isMissing: true, reason: 'Deal data not available' };
    const clientName = deal.client || deal.formData?.clientName || deal.rawZohoDeal?.Contact_Name || deal.rawZohoDeal?.Client_Name;
    const companyName = deal.company || deal.formData?.companyName || deal.rawZohoDeal?.Account_Name || deal.rawZohoDeal?.Company_name;
    const totalAmt = getDealAmount(deal);
    const hasContact = Boolean(
      deal.mobile || deal.formData?.mobile || deal.rawZohoDeal?.Mobile || deal.rawZohoDeal?.Phone || deal.rawZohoDeal?.Client_contact_detail ||
      deal.email || deal.formData?.email || deal.rawZohoDeal?.Email || deal.rawZohoDeal?.Client_Email_address
    );
    if (!clientName || clientName === 'Client') return { isMissing: true, reason: 'Client Name is required' };
    if (!companyName || companyName === 'Company') return { isMissing: true, reason: 'Company Name is required' };
    if (!totalAmt || totalAmt <= 0) return { isMissing: true, reason: 'Deal Amount is required' };
    if (!hasContact) return { isMissing: true, reason: 'Contact mobile or email is required' };
    return { isMissing: false };
  };

  const handleSendToAccounts = async (deal: any) => {
    try {
      const validation = isDealMissingMandatoryDetails(deal);
      if (validation.isMissing) {
        setToast({
          type: 'error',
          message: 'Cannot Send to Accounts',
          submessage: validation.reason
        });
        return;
      }

      setSyncingId(deal.id);
      const updatedDeal = {
        ...deal,
        stage: 'Accounts',
        Stage: 'Accounts',
        status: 'Accounts',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Accounts'
        }
      };

      const updatedList = deals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
      setDeals(updatedList);
      safeSaveDealsToStorage(updatedList);

      // Execute Zoho CRM Blueprint Transition: Sales to Account ("1078476000000489153")
      const zohoRes = await moveDealToAccounts(deal.zohoId || deal.id);
      if (zohoRes.success) {
        setToast({
          type: 'success',
          message: 'Sent to Accounts Department',
          submessage: `Deal ${deal.id} stage updated to Accounts via Zoho Blueprint.`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Zoho Blueprint Transition Warning',
          submessage: zohoRes.message || 'Saved locally, but failed to execute Blueprint transition in Zoho CRM'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Error sending deal to Accounts',
        submessage: err?.message || 'Unexpected error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleVerifyPayment = async (deal: any) => {
    try {
      setSyncingId(deal.id);
      const updatedDeal = {
        ...deal,
        Payment_verifications: true,
        paymentVerified: true,
        stage: 'Legal',
        Stage: 'Legal',
        status: 'Legal',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Payment_verifications: true,
          Stage: 'Legal',
          stage: 'Legal',
          status: 'Legal'
        }
      };

      const updatedList = deals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
      setDeals(updatedList);
      safeSaveDealsToStorage(updatedList);

      // 1. Sync updated verification status and stage to Zoho CRM Deal record
      const zohoRes = await saveOrUpdateZohoDeal(updatedDeal);
      
      // 2. Automatically trigger Zoho CRM Blueprint Transition: Account to Legal ("1078476000000492001")
      const blueprintRes = await moveDealToLegal(deal.zohoId || deal.id);

      if (zohoRes.success || blueprintRes.success) {
        setToast({
          type: 'success',
          message: 'Payment Verified & Moved to Legal',
          submessage: `Payment for deal ${deal.id} was verified and the deal has automatically moved to the Legal department queue.`
        });
      } else {
        setToast({
          type: 'info',
          message: 'Payment Verified Locally',
          submessage: `Verified and moved to Legal stage locally. ${zohoRes.message || blueprintRes.message || ''}`
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Error verifying payment',
        submessage: err?.message || 'Unexpected error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSendToLegal = async (deal: any) => {
    try {
      setSyncingId(deal.id);
      const updatedDeal = {
        ...deal,
        stage: 'Legal',
        Stage: 'Legal',
        status: 'Legal',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Legal'
        }
      };

      const updatedList = deals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
      setDeals(updatedList);
      safeSaveDealsToStorage(updatedList);

      // Execute Zoho CRM Blueprint Transition: Account to Legal ("1078476000000492001")
      const zohoRes = await moveDealToLegal(deal.zohoId || deal.id);
      if (zohoRes.success) {
        setToast({
          type: 'success',
          message: 'Sent to Legal Department',
          submessage: `Deal ${deal.id} stage successfully updated to Legal via Zoho Blueprint.`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Zoho Blueprint Transition Warning',
          submessage: zohoRes.message || 'Saved locally, but failed to execute Blueprint transition in Zoho CRM'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Error sending deal to Legal',
        submessage: err?.message || 'Unexpected error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSendToOperationsAllocator = async (deal: any) => {
    try {
      setSyncingId(deal.id);
      let currentZohoId = deal.zohoId;
      const updatedDeal = {
        ...deal,
        stage: 'Operations Allocator',
        Stage: 'Operations Allocator',
        status: 'Operations Allocator',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Operations Allocator'
        }
      };

      // 1. Sync updated deal data to Zoho CRM Deals module first to ensure valid Zoho record ID (preserving current stage & skipping auto-blueprint)
      try {
        const dealZohoRes = await saveOrUpdateZohoDeal({
          ...deal,
          skipBlueprint: true,
        });
        if (dealZohoRes?.success && dealZohoRes?.zohoId) {
          currentZohoId = dealZohoRes.zohoId;
          updatedDeal.zohoId = currentZohoId;
        }
      } catch (saveErr) {
        console.warn('[Deals] Error saving deal to Zoho CRM before blueprint transition:', saveErr);
      }

      const updatedList = deals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
      setDeals(updatedList);
      safeSaveDealsToStorage(updatedList);

      // 2. Automatically generate sub-child service allocation records in Internal Operations module
      try {
        generateServiceAllocationsForDeal(updatedDeal);
      } catch (genErr) {
        console.warn('[Deals] Service allocation creation warning:', genErr);
      }

      // 3. Execute Zoho CRM Blueprint Transition: Legal to Operations Allocator ("1078476000000492099")
      const zohoRes = await moveDealToOperationsAllocator(currentZohoId || deal.zohoId || deal.id);
      if (zohoRes.success) {
        setToast({
          type: 'success',
          message: 'Sent to Operations Allocator',
          submessage: `Deal ${deal.id} stage successfully transitioned to Operations Allocator via Zoho Blueprint.`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Zoho Blueprint Transition Warning',
          submessage: zohoRes.message || 'Saved locally, but failed to execute Blueprint transition in Zoho CRM'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Error sending deal to Operations Allocator',
        submessage: err?.message || 'Unexpected error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSendToOperationsExecutors = async (deal: any) => {
    try {
      setSyncingId(deal.id);
      const updatedDeal = {
        ...deal,
        stage: 'Operations Executors',
        Stage: 'Operations Executors',
        status: 'Operations Executors',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Operations Executors'
        }
      };

      const updatedList = deals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
      setDeals(updatedList);
      safeSaveDealsToStorage(updatedList);

      // 1. Gather child service allocations for this deal from storage or generate them from Legal details
      const allOps = getStoredInternalOperations();
      const targetDealId = String(deal.id || '').toLowerCase();
      const targetZohoId = String(deal.zohoId || '').toLowerCase();
      let dealOps = allOps.filter(r => {
        const dId = String(r.Deal_ID || (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) || '').toLowerCase();
        const zId = String((r as any).zohoDealId || '').toLowerCase();
        return (targetDealId && (dId === targetDealId || zId === targetDealId)) ||
               (targetZohoId && (dId === targetZohoId || zId === targetZohoId));
      });

      if (dealOps.length === 0) {
        const genRes = generateServiceAllocationsForDeal(deal);
        dealOps = genRes.all.filter(r => {
          const dId = String(r.Deal_ID || (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) || '').toLowerCase();
          const zId = String((r as any).zohoDealId || '').toLowerCase();
          return (targetDealId && (dId === targetDealId || zId === targetDealId)) ||
                 (targetZohoId && (dId === targetZohoId || zId === targetZohoId));
        });
      }

      // Ensure each allocation has the deal's zohoId attached
      if (deal.zohoId && /^\d{15,}$/.test(String(deal.zohoId))) {
        dealOps = dealOps.map(op => ({
          ...op,
          zohoDealId: String(deal.zohoId),
          Parent_Record_Deal: { id: String(deal.zohoId), name: deal.name || deal.Deal_Name }
        }));
      }

      // 2. Execute Zoho CRM Blueprint Transition: Operations Allocator to Operations Executors ("1078476000001938757")
      const zohoRes = await moveDealToOperationsExecutors(
        deal.zohoId || deal.id,
        'Sent to Operations Executors via Portal',
        {
          allocations: dealOps,
          dealName: deal.name || deal.Deal_Name,
          Deal_Name: deal.name || deal.Deal_Name,
          dealZohoId: deal.zohoId || deal.id
        }
      );

      // 3. Proactively sync the child service records to Zoho CRM Operation_Internal_CRM module
      if (dealOps.length > 0) {
        try {
          await fetch('/api/zoho/internal-operations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              allocations: dealOps,
              dealZohoId: deal.zohoId || (/^\d{15,}$/.test(String(deal.id)) ? String(deal.id) : undefined),
              dealName: deal.name || deal.Deal_Name
            })
          });
        } catch (syncErr) {
          console.warn('[Deals] Internal operations sync warning:', syncErr);
        }
      }

      if (zohoRes.success) {
        setToast({
          type: 'success',
          message: 'Sent to Operations Executors',
          submessage: `Deal ${deal.id} transitioned to Operations Executors and ${dealOps.length} service allocation(s) synchronized to Zoho CRM.`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Zoho Blueprint Transition Warning',
          submessage: zohoRes.message || 'Saved locally, but failed to execute Blueprint transition in Zoho CRM'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Error sending deal to Operations Executors',
        submessage: err?.message || 'Unexpected error'
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSaveMilestoneBank = async (deal: any, slotIndex: number, bankType: 'BSPL' | 'BSAPL' | string) => {
    const dealZohoId = deal.zohoId || (/^\d{15,}$/.test(String(deal.id)) ? String(deal.id) : null);
    if (!dealZohoId) {
      setToast({
        type: 'error',
        message: 'Cannot save bank details',
        submessage: 'This deal does not have a valid Zoho CRM ID.'
      });
      return;
    }
    const key = `${deal.id}_${slotIndex}`;
    setVerifyingMilestoneKey(key);
    try {
      const res = await updateZohoMilestoneBank(dealZohoId, slotIndex, bankType);
      if (res.success) {
        const patch: any = {};
        patch[`R${slotIndex}_Bank_type`] = bankType;
        if (slotIndex === 1) patch.R1_Bank_details = bankType;
        if (slotIndex === 2) patch.R2_Bank_details = bankType;

        const updatedList = deals.map((d: any) => {
          if (d.id === deal.id || d.zohoId === dealZohoId) {
            return {
              ...d,
              ...patch,
              rawZohoDeal: { ...(d.rawZohoDeal || {}), ...patch }
            };
          }
          return d;
        });

        setDeals(updatedList);
        safeSaveDealsToStorage(updatedList);

        setToast({
          type: 'success',
          message: `R${slotIndex} Bank Details Saved`,
          submessage: `Updated to ${bankType} (Zoho field: R${slotIndex}_Bank_type).`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Failed to update bank details',
          submessage: res.message || 'Zoho CRM rejected the update.'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Error updating bank details',
        submessage: err?.message || 'Failed to update bank details in Zoho CRM.'
      });
    } finally {
      setVerifyingMilestoneKey(null);
    }
  };

  const handleVerifyMilestonePayment = async (deal: any, slotIndex: number, forcedBankType?: 'BSPL' | 'BSAPL' | string) => {
    const dealZohoId = deal.zohoId || (/^\d{15,}$/.test(String(deal.id)) ? String(deal.id) : null);
    if (!dealZohoId) {
      setToast({
        type: 'error',
        message: 'Cannot verify payment',
        submessage: 'This deal does not have a valid Zoho CRM ID.'
      });
      return;
    }

    const key = `${deal.id}_${slotIndex}`;
    const selectedBank = forcedBankType || milestoneBankSelections[key] || deal[`R${slotIndex}_Bank_type`] || deal.rawZohoDeal?.[`R${slotIndex}_Bank_type`] || '';

    setVerifyingMilestoneKey(key);
    try {
      const res = await verifyZohoMilestonePayment(dealZohoId, slotIndex, selectedBank, true);
      if (res.success) {
        // Update local state deals
        const patch: any = {};
        if (slotIndex === 1) {
          patch.R1_Payment_Verification = true;
          patch.R1_Payment_verifications = true;
          patch.R1_Bank_type = selectedBank;
          patch.R1_Bank_details = selectedBank;
        } else if (slotIndex === 2) {
          patch.R2_Payment_Verification = true;
          patch.R2_Payment_verifications = true;
          patch.R2_Bank_type = selectedBank;
          patch.R2_Bank_details = selectedBank;
        } else {
          patch[`R${slotIndex}_Payment_Verification`] = true;
          patch[`R${slotIndex}_Bank_type`] = selectedBank;
        }

        const updatedList = deals.map((d: any) => {
          if (d.id === deal.id || d.zohoId === dealZohoId) {
            return {
              ...d,
              ...patch,
              rawZohoDeal: {
                ...(d.rawZohoDeal || {}),
                ...patch
              }
            };
          }
          return d;
        });

        setDeals(updatedList);
        safeSaveDealsToStorage(updatedList);

        setToast({
          type: 'success',
          message: `R${slotIndex} Payment Verified`,
          submessage: `Payment verified under ${selectedBank} for deal ${deal.id}.`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Payment verification failed',
          submessage: res.message || 'Zoho CRM rejected the verification update.'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Verification Error',
        submessage: err?.message || 'Failed to update payment verification in Zoho CRM.'
      });
    } finally {
      setVerifyingMilestoneKey(null);
    }
  };

  const handleVerifyMilestoneLegal = async (deal: any, slotIndex: number, isVerified: boolean = true) => {
    const dealZohoId = deal.zohoId || (/^\d{15,}$/.test(String(deal.id)) ? String(deal.id) : null);
    if (!dealZohoId) {
      setToast({
        type: 'error',
        message: 'Cannot update legal verification',
        submessage: 'This deal does not have a valid Zoho CRM ID.'
      });
      return;
    }

    const key = `${deal.id}_${slotIndex}`;
    setVerifyingMilestoneLegalKey(key);
    try {
      const res = await verifyZohoMilestoneLegal(dealZohoId, slotIndex, isVerified);
      if (res.success) {
        const patch: any = {};
        patch[`R${slotIndex}_Legal_verification`] = isVerified;

        const updatedList = deals.map((d: any) => {
          if (d.id === deal.id || d.zohoId === dealZohoId) {
            return {
              ...d,
              ...patch,
              rawZohoDeal: {
                ...(d.rawZohoDeal || {}),
                ...patch
              }
            };
          }
          return d;
        });

        setDeals(updatedList);
        safeSaveDealsToStorage(updatedList);

        setToast({
          type: 'success',
          message: `R${slotIndex} Legal Verification ${isVerified ? 'Verified' : 'Updated'}`,
          submessage: isVerified
            ? `Legal verification marked as Verified for deal ${deal.id} in Zoho CRM.`
            : `Legal verification updated for deal ${deal.id} in Zoho CRM.`
        });
      } else {
        setToast({
          type: 'error',
          message: 'Legal verification failed',
          submessage: res.message || 'Zoho CRM rejected the verification update.'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Verification Error',
        submessage: err?.message || 'Failed to update legal verification in Zoho CRM.'
      });
    } finally {
      setVerifyingMilestoneLegalKey(null);
    }
  };

  const handlePreviewScreenshot = async (deal: any, milestone: DealMilestoneItem) => {
    try {
      const { getAllDocuments } = await import('../../lib/db');
      const allDocs = await getAllDocuments();
      if (Array.isArray(allDocs)) {
        const found = allDocs.find((d: any) => 
          (d.id && String(d.id).includes(String(deal.id)) && String(d.id).includes(milestone.tabName)) ||
          (d.name && d.name === milestone.screenshot)
        );
        if (found && found.file) {
          const url = URL.createObjectURL(found.file);
          setPreviewScreenshotModal({
            isOpen: true,
            url,
            title: `${deal.id} - ${milestone.label} Screenshot (${milestone.screenshot || 'File'})`
          });
          return;
        }
      }
    } catch (_) {}

    // 2. Direct or computed authenticated screenshot URL
    const targetUrl = milestone.screenshotUrl || (milestone.screenshot && (milestone.screenshot.startsWith('http') || milestone.screenshot.startsWith('blob:') || milestone.screenshot.startsWith('/api/')) ? milestone.screenshot : '');
    if (targetUrl) {
      setPreviewScreenshotModal({
        isOpen: true,
        url: targetUrl,
        title: `${deal.id} - ${milestone.label} Screenshot (${milestone.screenshot || 'Receipt'})`
      });
      return;
    }

    // 3. Resolve Zoho Field Attachment URL directly from deal/rawZoho
    const targetZohoId = String(deal.zohoId || (deal.id && /^\d+$/.test(deal.id) ? deal.id : '') || '');
    const raw = deal.rawZohoDeal || {};
    const slotField = `R${milestone.index}_Received_Screenshot`;
    const rawSlot = deal[slotField] ?? raw[slotField];

    let attId = '';
    let fileId = '';
    if (rawSlot && typeof rawSlot === 'object') {
      attId = rawSlot.id || rawSlot.fields_attachment_id || '';
      fileId = rawSlot.File_Id__s || rawSlot.file_id || '';
    }
    if (!attId && !fileId && milestone.index === 1) {
      const pss = deal.Deal_payment_screenshot ?? raw.Deal_payment_screenshot ?? deal.paymentScreenshots ?? raw.paymentScreenshots;
      const item = Array.isArray(pss) ? pss[0] : (pss && typeof pss === 'object' ? pss : null);
      if (item) {
        attId = item.id || item.fields_attachment_id || '';
        fileId = item.File_Id__s || item.file_id || '';
      }
    }

    if (fileId || (targetZohoId && attId)) {
      const params = new URLSearchParams();
      params.set('module', 'Deals');
      if (targetZohoId) params.set('recordId', targetZohoId);
      if (attId) params.set('attachmentId', attId);
      if (fileId) params.set('fileId', fileId);
      params.set('preview', 'true');
      const directUrl = `/api/zoho/download-field-attachment?${params.toString()}`;
      setPreviewScreenshotModal({
        isOpen: true,
        url: directUrl,
        title: `${deal.id} - ${milestone.label} Screenshot (${milestone.screenshot || 'Receipt'})`
      });
      return;
    }

    // Otherwise, redirect to deal details where full attachments & files can be inspected
    navigate(`/crm/deals/${deal.id}`);
  };

  const accountQueueCount = useMemo(() => {
    return rbacDeals.filter((d: any) => {
      const st = String(d.stage || d.rawZohoDeal?.Stage || '').toLowerCase();
      const isAcc = st.includes('account');
      const isVerif = isDealPaymentVerified(d);
      return isAcc && !isVerif;
    }).length;
  }, [rbacDeals]);

  const accountVerifiedCount = useMemo(() => {
    return rbacDeals.filter((d: any) => isDealPaymentVerified(d)).length;
  }, [rbacDeals]);

  const legalQueueCount = useMemo(() => {
    return rbacDeals.filter((d: any) => {
      const st = String(d.stage || d.rawZohoDeal?.Stage || '').toLowerCase();
      return st.includes('legal') && !isDealLegalReceived(d);
    }).length;
  }, [rbacDeals]);

  const legalReceivedCount = useMemo(() => {
    return rbacDeals.filter((d: any) => isDealLegalReceived(d)).length;
  }, [rbacDeals]);

  const remainingDealsCount = useMemo(() => {
    return rbacDeals.filter((d: any) => hasDealRemainingPayments(d)).length;
  }, [rbacDeals]);

  const unverifiedRemainingPaymentsCount = useMemo(() => {
    return rbacDeals.reduce((acc: number, d: any) => acc + getDealUnverifiedMilestonesCount(d), 0);
  }, [rbacDeals]);

  const unverifiedLegalRemainingPaymentsCount = useMemo(() => {
    return rbacDeals.reduce((acc: number, d: any) => acc + getDealUnverifiedLegalMilestonesCount(d), 0);
  }, [rbacDeals]);

  const myOwnDealsCount = useMemo(() => {
    if (!isUserTL) return 0;
    return rbacDeals.filter((d: any) => isDealOwnedByTL(d, currentUser)).length;
  }, [rbacDeals, isUserTL, currentUser]);



  const myTeamDealsCount = useMemo(() => {
    if (!isUserTL) return 0;
    return rbacDeals.filter((d: any) => isDealOwnedBySubordinate(d, currentUser, effectiveEmployees)).length;
  }, [rbacDeals, isUserTL, currentUser, effectiveEmployees]);

  const isFiltered = Boolean(
    (quickFilter && quickFilter !== 'all') ||
    Boolean(searchQuery) ||
    (activeTab && activeTab !== 'All Deals') ||
    (statusFilter && statusFilter !== 'all')
  );

  const filteredDeals = useMemo(() => {
    return rbacDeals.filter((deal: any) => {
      // TL Tab Separation:
      // If user is TL:
      // - "My Team Deals" tab: shows ONLY subordinate deals
      // - "All Deals" and other personal tabs: shows ONLY TL's own deals (not team members')
      if (isUserTL) {
        if (activeTab === 'My Team Deals') {
          if (!isDealOwnedBySubordinate(deal, currentUser, effectiveEmployees)) return false;
        } else {
          if (!isDealOwnedByTL(deal, currentUser)) return false;
        }
      }

      const isFromQt = isDealFromQuotation(deal);
      const isPartner = isDealPartnerBdm(deal);
      const isVerified = isDealPaymentVerified(deal);
      const isAccStage = String(deal.stage || deal.rawZohoDeal?.Stage || '').toLowerCase().includes('account');
      const isLegalStage = String(deal.stage || deal.rawZohoDeal?.Stage || '').toLowerCase().includes('legal');
      const isLegalReceived = isDealLegalReceived(deal);

      if (activeTab === 'Manual Deals' && isFromQt) return false;
      if (activeTab === 'From Quotations' && !isFromQt) return false;
      if (activeTab === 'Partner BDM Deals' && !isPartner) return false;
      if (activeTab === 'Account Queue' && (!isAccStage || isVerified)) return false;
      if (activeTab === 'Account Verified' && !isVerified) return false;
      if (activeTab === 'Remaining Payments' && !hasDealRemainingPayments(deal)) return false;
      if (activeTab === 'Legal Queue' && (!isLegalStage || isLegalReceived)) return false;
      if (activeTab === 'Received' && !isLegalReceived) return false;

      if (quickFilter === 'today' && !isDealToday(deal)) return false;
      if (quickFilter === 'this_month' && !isDealThisMonth(deal)) return false;
      if (quickFilter === 'pending' && getDealPending(deal) <= 0) return false;
      if (statusFilter && statusFilter !== 'all') {
        const s = String(deal.status || deal.stage || '').toLowerCase();
        if (!s.includes(statusFilter.toLowerCase())) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchClient = deal.client && String(deal.client).toLowerCase().includes(q);
        const matchCompany = deal.company && String(deal.company).toLowerCase().includes(q);
        const matchService = deal.service && String(deal.service).toLowerCase().includes(q);
        const matchId = deal.id && String(deal.id).toLowerCase().includes(q);
        const matchZohoId = deal.zohoId && String(deal.zohoId).toLowerCase().includes(q);
        const matchOwner = deal.owner && String(deal.owner).toLowerCase().includes(q);
        const matchEmpName = (deal.employeeName || deal.salesEmployee) && String(deal.employeeName || deal.salesEmployee).toLowerCase().includes(q);
        const matchPartnerBdm = (deal.partnerBdmName || deal.partner_bdm_name || deal.Partner_BDM_Name || deal.formData?.partnerBdmName) && String(deal.partnerBdmName || deal.partner_bdm_name || deal.Partner_BDM_Name || deal.formData?.partnerBdmName).toLowerCase().includes(q);
        const matchStatus = (deal.status || deal.stage) && String(deal.status || deal.stage).toLowerCase().includes(q);
        const matchAmount = (deal.amount || deal.received || deal.pending) && String(deal.amount || deal.received || deal.pending).toLowerCase().includes(q);
        const matchEmpCode = deal.empId && String(deal.empId).toLowerCase().includes(q);
        const subMember = isUserTL ? getDealSubordinateMember(deal, currentUser, effectiveEmployees) : null;
        const matchSubMember = subMember?.name && subMember.name.toLowerCase().includes(q);

        if (!matchClient && !matchCompany && !matchService && !matchId && !matchZohoId && !matchOwner && !matchEmpName && !matchPartnerBdm && !matchStatus && !matchAmount && !matchEmpCode && !matchSubMember) return false;
      }
      return true;
    });
  }, [rbacDeals, isUserTL, activeTab, currentUser, effectiveEmployees, quickFilter, statusFilter, searchQuery]);

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
              {((isFiltered || isSalesScoped) ? filteredDeals.length : (totalRecordsCount !== null ? totalRecordsCount : (paginationInfo?.total_records ?? rbacDeals.length))).toLocaleString()} Deals
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Manage all active deals with live synchronization and pagination.</p>
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
            onClick={handleRefresh}
            disabled={isFetchingZoho}
            className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm hover:shadow disabled:opacity-60 shrink-0"
            title="Refresh & Sync"
          >
            <RefreshCw size={16} className={`text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
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

      <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
        {[
          { id: 'All Deals', label: 'All Deals', count: isUserTL ? myOwnDealsCount : null },
          ...(isUserTL ? [
            { id: 'My Team Deals', label: 'My Team Deals', count: myTeamDealsCount, isTeam: true },
          ] : []),
          ...((isAccounts || isSuperAdmin) ? [
            { id: 'Account Queue', label: 'Account Queue', count: accountQueueCount, isQueue: true },
            { id: 'Account Verified', label: 'Account Verified', count: accountVerifiedCount, isVerified: true },
          ] : []),
          ...((isLegal || isSuperAdmin) ? [
            { id: 'Legal Queue', label: 'Legal Queue', count: legalQueueCount, isLegal: true },
          ] : []),
          ...((isAccounts || isLegal || isSuperAdmin) ? [
            { 
              id: 'Remaining Payments', 
              label: 'Remaining Payments', 
              count: isLegal && !isAccounts && !isSuperAdmin ? unverifiedLegalRemainingPaymentsCount : unverifiedRemainingPaymentsCount, 
              isRemaining: true 
            },
          ] : []),
          ...((isLegal || isSuperAdmin) ? [
            {
              id: 'Received',
              label: 'Received',
              count: legalReceivedCount,
              isReceived: true,
            }
          ] : []),

          ...(((!isAccounts && !isLegal) || isSuperAdmin) ? [
            { id: 'Manual Deals', label: 'Manual Deals', count: null },
            { id: 'From Quotations', label: 'From Quotations', count: null },
            { id: 'Partner BDM Deals', label: 'Partner BDM Deals', count: null }
          ] : [])
        ].map(tabItem => (
          <button
            key={tabItem.id}
            onClick={() => {
              setActiveTab(tabItem.id);
              // Clear quick filter if manually switching tabs
              if (quickFilter !== 'all') setQuickFilter('all');
            }}
            className={`px-5 py-3 font-medium text-sm transition-colors relative whitespace-nowrap flex items-center space-x-2 ${activeTab === tabItem.id ? 'text-be-orange font-bold' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span>{tabItem.label}</span>
            {tabItem.count !== null && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                tabItem.isTeam ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                tabItem.isQueue && tabItem.count > 0 ? 'bg-amber-100 text-amber-800' :
                tabItem.isRemaining && tabItem.count > 0 ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                tabItem.isReceived && tabItem.count > 0 ? 'bg-teal-100 text-teal-800 border border-teal-200' :
                tabItem.isVerified ? 'bg-emerald-100 text-emerald-800' :
                tabItem.isLegal ? 'bg-indigo-100 text-indigo-800' :
                'bg-gray-100 text-gray-600'
              }`}>
                {tabItem.count}
              </span>
            )}
            {activeTab === tabItem.id && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-be-orange" />
            )}
          </button>
        ))}
      </div>

      {/* Active Filters Bar */}
      {(activeTab !== 'All Deals' || searchQuery || (quickFilter && quickFilter !== 'all') || (statusFilter && statusFilter !== 'all')) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-orange-50/80 border border-orange-200/80 rounded-2xl mb-4 text-xs shadow-xs">
          <span className="font-bold text-gray-700 flex items-center mr-1">
            <Filter size={13} className="text-be-orange mr-1.5" />
            Active Filter:
          </span>
          {activeTab !== 'All Deals' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-orange-200 text-be-orange font-extrabold shadow-xs">
              Tab: {activeTab}
              <button onClick={() => setActiveTab('All Deals')} className="ml-1.5 hover:text-gray-900 transition-colors"><X size={12} /></button>
            </span>
          )}
          {quickFilter && quickFilter !== 'all' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-amber-300 text-amber-800 font-extrabold shadow-xs">
              {quickFilter === 'today' ? "📅 Today's Booked Deals" : quickFilter === 'this_month' ? "🗓️ This Month's Deals" : quickFilter === 'pending' ? "⏳ Pending Amount Deals" : quickFilter}
              <button onClick={() => setQuickFilter('all')} className="ml-1.5 hover:text-gray-900 transition-colors"><X size={12} /></button>
            </span>
          )}
          {statusFilter && statusFilter !== 'all' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-blue-300 text-blue-800 font-extrabold shadow-xs">
              Status: {statusFilter}
              <button onClick={() => setStatusFilter('all')} className="ml-1.5 hover:text-gray-900 transition-colors"><X size={12} /></button>
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
              setActiveTab('All Deals');
              setSearchQuery('');
              setQuickFilter('all');
              setStatusFilter('all');
              setItemsPerPage(25);
              navigate('/crm/deals', { replace: true, state: {} });
            }}
            className="ml-auto text-xs font-bold text-gray-500 hover:text-rose-600 underline transition-colors px-2 py-0.5"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Deals Table & Accounts Remaining Payments View */}
      {(() => {
        const totalDealsCount = (isFiltered || isSalesScoped) ? filteredDeals.length : (totalRecordsCount !== null ? totalRecordsCount : (paginationInfo?.total_records || filteredDeals.length));
        const paginatedDeals = (isFiltered || isSalesScoped) ? filteredDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) : filteredDeals;



        if (activeTab === 'Remaining Payments') {
          return (
            <div className="space-y-4 mt-6">
              {/* Summary / Stats Header for Accounts & Legal Remaining Payments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Remaining Deals</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{filteredDeals.length}</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                    <CreditCard size={20} />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Accounts Pending</p>
                    <p className="text-xl font-bold text-amber-600 mt-1">{unverifiedRemainingPaymentsCount}</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                    <Clock size={20} />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Legal Pending</p>
                    <p className="text-xl font-bold text-indigo-600 mt-1">{unverifiedLegalRemainingPaymentsCount}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                    <ShieldCheck size={20} />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Mutual Verification</p>
                    <p className="text-xs font-semibold text-gray-600 mt-1">
                      Accounts: <span className="text-be-orange font-bold">BSPL/BSAPL</span> • Legal: <span className="text-indigo-600 font-bold">Verified</span>
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                    <CheckCircle2 size={20} />
                  </div>
                </div>
              </div>

              {/* Cards for each Deal with Remaining Payments */}
              {paginatedDeals.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-500">
                  <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-lg font-bold text-gray-800">No Remaining Payments Recorded</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Deals with recorded milestone payments (R1 to R8) will show up here for Accounts verification.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedDeals.map((deal: any) => {
                    const milestones = getDealMilestones(deal);
                    const recordedMilestones = milestones.filter(m => m.hasPayment);
                    const totalDealAmt = getDealAmount(deal);
                    const recDealAmt = getDealReceived(deal);
                    const pendDealAmt = getDealPending(deal);

                    return (
                      <div key={deal.id} className="bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden">
                        {/* Deal Card Header */}
                        <div className="p-4 bg-gradient-to-r from-gray-50/90 to-white border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span 
                              onClick={() => navigate(`/crm/deals/${deal.id}`)}
                              className="font-extrabold text-gray-900 hover:text-be-orange cursor-pointer transition-colors text-base"
                            >
                              {deal.id}
                            </span>
                            <span className="text-gray-300">|</span>
                            <div>
                              <span className="font-bold text-gray-800 text-sm">{deal.client || 'Client'}</span>
                              {deal.company && (
                                <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {deal.company}
                                </span>
                              )}
                            </div>
                            {deal.service && (
                              <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md font-medium">
                                {deal.service}
                              </span>
                            )}
                            {(() => {
                              const subMember = isUserTL ? getDealSubordinateMember(deal, currentUser, allEmployees) : null;
                              if (!subMember) return null;
                              return (
                                <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                                  <Users size={12} /> {subMember.name} (Team Member)
                                </span>
                              );
                            })()}
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            <div>
                              <span className="text-gray-400">Total: </span>
                              <span className="font-bold text-gray-900">₹{totalDealAmt.toLocaleString('en-IN')}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Received: </span>
                              <span className="font-bold text-emerald-600">₹{recDealAmt.toLocaleString('en-IN')}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Pending: </span>
                              <span className="font-bold text-rose-600">₹{pendDealAmt.toLocaleString('en-IN')}</span>
                            </div>
                            <button
                              onClick={() => navigate(`/crm/deals/${deal.id}`)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-be-orange hover:bg-orange-50 rounded-lg transition-colors border border-gray-200 cursor-pointer"
                            >
                              <Eye size={13} /> View Deal
                            </button>
                          </div>
                        </div>

                        {/* Milestones / Remaining Payments List */}
                        <div className="p-4 divide-y divide-gray-100">
                          {recordedMilestones.length === 0 ? (
                            <p className="text-xs text-gray-400 italic py-2">No remaining payment slots recorded yet for this deal.</p>
                          ) : (
                            recordedMilestones.map((milestone: DealMilestoneItem) => {
                              const itemKey = `${deal.id}_${milestone.index}`;
                              const selectedBank = milestoneBankSelections[itemKey] || milestone.bankType || '';
                              const isVerifying = verifyingMilestoneKey === itemKey;
                              const isVerifyingLegal = verifyingMilestoneLegalKey === itemKey;

                              return (
                                <div key={milestone.index} className="py-3.5 first:pt-0 last:pb-0 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                                  {/* Left: Slot info */}
                                  <div className="flex items-center gap-3 min-w-[220px]">
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                                      milestone.isVerified && milestone.isLegalVerified
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                        : milestone.isVerified || milestone.isLegalVerified
                                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                                    }`}>
                                      {milestone.tabName}
                                    </span>
                                    <div>
                                      <div className="text-sm font-extrabold text-gray-900">
                                        ₹{milestone.amount.toLocaleString('en-IN')}
                                      </div>
                                      <div className="text-[11px] text-gray-500">
                                        {milestone.label}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Center: Date & BDM & Screenshot */}
                                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                                    <div>
                                      <span className="text-gray-400">Date: </span>
                                      <span className="font-semibold text-gray-800">{milestone.date || 'N/A'}</span>
                                    </div>
                                    {milestone.bdm1 && (
                                      <div>
                                        <span className="text-gray-400">BDM 1: </span>
                                        <span className="font-semibold text-gray-800">{milestone.bdm1}</span>
                                      </div>
                                    )}
                                    {milestone.bdm2 && (
                                      <div>
                                        <span className="text-gray-400">BDM 2: </span>
                                        <span className="font-semibold text-purple-700">{milestone.bdm2}</span>
                                      </div>
                                    )}

                                    {/* Screenshot Button */}
                                    <div>
                                      {milestone.screenshot ? (
                                        <button
                                          type="button"
                                          onClick={() => handlePreviewScreenshot(deal, milestone)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-colors cursor-pointer"
                                          title={`View screenshot: ${milestone.screenshot}`}
                                        >
                                          <ImageIcon size={13} />
                                          <span className="max-w-[120px] truncate">{milestone.screenshot}</span>
                                        </button>
                                      ) : (
                                        <span className="text-[11px] text-gray-400 italic flex items-center gap-1">
                                          <ImageIcon size={12} className="opacity-40" /> No screenshot
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right: Department Verification Statuses & Actions (Accounts & Legal) */}
                                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                                    {/* 1. Accounts Department Section */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50/60">
                                      <div className="flex items-center gap-1.5">
                                        <label className="text-[11px] font-bold text-gray-700 uppercase flex items-center gap-1">
                                          <Building2 size={12} className="text-be-orange" />
                                          Accounts:
                                        </label>
                                        {(isAccounts || isSuperAdmin) ? (
                                          <>
                                            <select
                                              value={selectedBank}
                                              disabled={isVerifying}
                                              onChange={(e) => {
                                                const val = e.target.value as 'BSPL' | 'BSAPL' | '';
                                                setMilestoneBankSelections(prev => ({
                                                  ...prev,
                                                  [itemKey]: val
                                                }));
                                              }}
                                              className="px-2 py-0.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 outline-none focus:border-be-orange focus:ring-1 focus:ring-be-orange transition-all shadow-xs"
                                              title={`Zoho CRM Pick List field: R${milestone.index}_Bank_type`}
                                            >
                                              <option value="">None</option>
                                              <option value="BSPL">BSPL</option>
                                              <option value="BSAPL">BSAPL</option>
                                            </select>
                                            {selectedBank !== (milestone.bankType || '') && (
                                              <button
                                                type="button"
                                                onClick={() => handleSaveMilestoneBank(deal, milestone.index, selectedBank)}
                                                disabled={isVerifying}
                                                className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
                                                title={`Save R${milestone.index}_Bank_type as ${selectedBank || 'None'} in Zoho CRM`}
                                              >
                                                Save
                                              </button>
                                            )}
                                          </>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-white border border-gray-200 rounded text-[11px] font-bold text-gray-700">
                                            {milestone.bankType || 'None'}
                                          </span>
                                        )}
                                      </div>

                                      {/* Accounts Action / Status */}
                                      {(isAccounts || isSuperAdmin) ? (
                                        milestone.isVerified ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-xs">
                                              <CheckCircle2 size={13} className="text-emerald-600" />
                                              Verified ({milestone.bankType || selectedBank})
                                            </span>
                                            {selectedBank !== (milestone.bankType || 'BSPL') && (
                                              <button
                                                type="button"
                                                onClick={() => handleVerifyMilestonePayment(deal, milestone.index, selectedBank)}
                                                disabled={isVerifying}
                                                className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                                              >
                                                Re-verify
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleVerifyMilestonePayment(deal, milestone.index, selectedBank)}
                                            disabled={isVerifying}
                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
                                          >
                                            {isVerifying ? (
                                              <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Verifying...
                                              </>
                                            ) : (
                                              <>
                                                <CheckCircle2 size={12} />
                                                Verify Payment
                                              </>
                                            )}
                                          </button>
                                        )
                                      ) : (
                                        milestone.isVerified ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-xs" title="Payment Verified by Accounts">
                                            <CheckCircle2 size={13} className="text-emerald-600" />
                                            Verified
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold border border-amber-200 text-xs" title="Pending Accounts Verification">
                                            <Clock size={13} className="text-amber-500" />
                                            Pending
                                          </span>
                                        )
                                      )}
                                    </div>

                                    {/* 2. Legal Department Section */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50/60">
                                      <span className="text-[11px] font-bold text-gray-700 uppercase flex items-center gap-1">
                                        <ShieldCheck size={12} className="text-indigo-600" />
                                        Legal:
                                      </span>

                                      {(isLegal || isSuperAdmin) ? (
                                        milestone.isLegalVerified ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-xs">
                                              <CheckCircle2 size={13} className="text-indigo-600" />
                                              Verified
                                            </span>
                                            {isSuperAdmin && (
                                              <button
                                                type="button"
                                                onClick={() => handleVerifyMilestoneLegal(deal, milestone.index, false)}
                                                disabled={isVerifyingLegal}
                                                className="text-[10px] text-gray-400 hover:text-rose-600 underline font-medium transition-colors cursor-pointer"
                                                title="Reset Legal verification"
                                              >
                                                Reset
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleVerifyMilestoneLegal(deal, milestone.index, true)}
                                            disabled={isVerifyingLegal}
                                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
                                          >
                                            {isVerifyingLegal ? (
                                              <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Verifying...
                                              </>
                                            ) : (
                                              <>
                                                <ShieldCheck size={12} />
                                                Verify Legal
                                              </>
                                            )}
                                          </button>
                                        )
                                      ) : (
                                        milestone.isLegalVerified ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-xs" title="Verified by Legal Department">
                                            <CheckCircle2 size={13} className="text-indigo-600" />
                                            Verified
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold border border-slate-200 text-xs" title="Pending Legal Verification">
                                            <Clock size={13} className="text-slate-400" />
                                            Pending
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination for Remaining Payments */}
              {totalDealsCount > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalItems={totalDealsCount}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                  itemLabel="deals"
                  hasMoreOnServer={false}
                  isLoadingMoreServer={false}
                />
              )}
            </div>
          );
        }

        return (
          <div className="bg-transparent mt-6">
            <div className="overflow-x-auto overflow-y-auto pb-2 -mx-1 px-1">
              <table className="min-w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
                <thead className="sticky top-0 z-10 bg-white text-gray-500 font-bold uppercase tracking-wider text-xs shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]">
                  <tr>
                    <th className="px-6 py-3">Deal ID</th>
                    <th className="px-6 py-3">Client</th>
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3">Service</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Received</th>
                    <th className="px-6 py-3">Pending</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">{activeTab === 'My Team Deals' ? 'Team Member' : 'Owner'}</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  {paginatedDeals.map((deal: any) => {
                    const breakdown = getDealSplitBreakdown(deal, currentUser, isSuperAdmin || isHOD);
                    const displayAmount = `₹${breakdown.displayAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                    const displayReceived = `₹${breakdown.displayReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                    const displayPending = `₹${breakdown.displayPending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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
                        <td className="px-6 py-5 font-bold text-gray-900 border-t border-b border-gray-100 group-hover:border-orange-100">
                          <div>{displayAmount}</div>
                          {breakdown.splitBadgeText && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              {breakdown.splitBadgeText}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 font-bold border-t border-b border-gray-100 group-hover:border-orange-100">
                          {(() => {
                            const rawStage = (deal.stage || deal.rawZohoDeal?.Stage || deal.status || 'Sales').toLowerCase().trim();
                            const isAccounts = rawStage.includes('account');
                            return (
                              <div className="flex items-center space-x-1.5">
                                <span className={breakdown.isPaymentVerified ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                  {displayReceived}
                                </span>
                                {breakdown.isPaymentVerified ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Payment Verified by Accounts">
                                    <CheckCircle2 size={10} className="mr-0.5 text-emerald-600" /> Verified
                                  </span>
                                ) : isAccounts ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title="Payment Pending Verification">
                                    <Clock size={10} className="mr-0.5 text-rose-500" /> Pending Verif.
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
                          {breakdown.hasPartnerBdm && !isSuperAdmin && !isHOD && (
                            <div className="text-[10px] text-gray-400 font-normal">Pre-GST 50%</div>
                          )}
                        </td>
                        <td className="px-6 py-5 font-bold text-orange-600 border-t border-b border-gray-100 group-hover:border-orange-100">{displayPending}</td>
                      <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(deal.status)}`}>
                            {deal.status}
                          </span>
                          {isDealLegalReceived(deal) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 shadow-xs" title="Internal Legal Status: Received">
                              <CheckCircle2 size={10} className="mr-1 text-teal-600 shrink-0" /> Received
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 font-medium border-t border-b border-gray-100 group-hover:border-orange-100">
                        {(() => {
                          const subMember = isUserTL ? getDealSubordinateMember(deal, currentUser, effectiveEmployees) : null;
                          const displayName = (activeTab === 'My Team Deals' && subMember?.name) ? subMember.name : (breakdown.primaryName || deal.owner || 'Admin');
                          const isTeamMemberDeal = Boolean(subMember);

                          return (
                            <div>
                              <div className="flex items-center space-x-2">
                                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  isTeamMemberDeal ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gradient-to-tr from-gray-200 to-gray-100 text-gray-600'
                                }`}>
                                  {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-semibold text-gray-900">{displayName}</span>
                                    {isTeamMemberDeal && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title="Team Member under TL">
                                        Team Member
                                      </span>
                                    )}
                                  </div>
                                  {subMember?.member?.department && (
                                    <span className="text-[10px] text-gray-400 font-normal">
                                      {subMember.member.department}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {breakdown.hasPartnerBdm && (
                                <div className="mt-1 text-[11px]">
                                  {breakdown.isUserPartner ? (
                                    <div className="flex items-center text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100 w-fit">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"></span>
                                      You: Partner BDM (₹{breakdown.partnerAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })})
                                    </div>
                                  ) : breakdown.isUserPrimary ? (
                                    <div className="flex items-center text-orange-700 font-medium">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>
                                      Partner: {breakdown.partnerName} (50% Split: ₹{breakdown.partnerAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })})
                                    </div>
                                  ) : (
                                    <div className="flex items-center text-purple-700 font-medium">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"></span>
                                      Partner: {breakdown.partnerName} (50/50 Split: ₹{breakdown.partnerAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} each)
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1.5">
                          {(() => {
                            const rawStage = (deal.stage || deal.rawZohoDeal?.Stage || deal.status || 'Sales').toLowerCase().trim();
                            const isAccountsStage = rawStage.includes('account');
                            const isLegalStage = rawStage.includes('legal');
                            const isAllocatorStage = rawStage.includes('allocat') && !rawStage.includes('execut');
                            const isExecutorsStage = rawStage.includes('execut');
                            const isQualityStage = rawStage.includes('qualit');
                            const isWonStage = rawStage.includes('won');
                            const isLostStage = rawStage.includes('lost');
                            const isSalesOrDraft = !isAccountsStage && !isLegalStage && !isAllocatorStage && !isExecutorsStage && !isQualityStage && !isWonStage && !isLostStage;

                            return (
                              <>
                                {/* 1. Send to Accounts Button (Sales to Account Blueprint Transition: 1078476000000489153) */}
                                {isSalesOrDraft && !breakdown.isPaymentVerified && (isSales || isSuperAdmin || (!isAccounts && !isLegal)) && (
                                  (() => {
                                    const val = isDealMissingMandatoryDetails(deal);
                                    return (
                                      <button
                                        onClick={() => handleSendToAccounts(deal)}
                                        disabled={val.isMissing || syncingId === deal.id}
                                        title={val.isMissing ? `Cannot send: ${val.reason}` : 'Send Deal to Accounts Department (Zoho Blueprint)'}
                                        className="px-2.5 py-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-xs flex items-center transition-all shrink-0"
                                      >
                                        {syncingId === deal.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <Building2 size={12} className="mr-1" />}
                                        Send to Accounts
                                      </button>
                                    );
                                  })()
                                )}

                                {/* 2. Verify Payment Button (Accounts Department Action - Automatically moves deal to Legal) */}
                                {!breakdown.isPaymentVerified && isAccountsStage && (isAccounts || isSuperAdmin) && (
                                  <button
                                    onClick={() => handleVerifyPayment(deal)}
                                    disabled={syncingId === deal.id}
                                    title="Verify payment and automatically send deal to Legal department"
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs flex items-center transition-all shrink-0"
                                  >
                                    {syncingId === deal.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle2 size={12} className="mr-1" />}
                                    Verify & Send to Legal
                                  </button>
                                )}

                                {/* 3. Send to Legal Button (Account to Legal Blueprint Transition: 1078476000000492001) */}
                                {breakdown.isPaymentVerified && isAccountsStage && (isAccounts || isSuperAdmin) && (
                                  <button
                                    onClick={() => handleSendToLegal(deal)}
                                    disabled={syncingId === deal.id}
                                    title="Send verified deal to Legal department (Zoho Blueprint)"
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs flex items-center transition-all shrink-0"
                                  >
                                    {syncingId === deal.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <ShieldCheck size={12} className="mr-1" />}
                                    Send to Legal
                                  </button>
                                )}

                                {/* 4. Send to Operations Allocator (Legal to Operations Allocator Blueprint Transition: 1078476000000492099) */}
                                {isLegalStage && (isLegal || isSuperAdmin) && (
                                  <button
                                    onClick={() => handleSendToOperationsAllocator(deal)}
                                    disabled={syncingId === deal.id}
                                    title="Send deal from Legal to Operations Allocator (Zoho Blueprint)"
                                    className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs flex items-center transition-all shrink-0"
                                  >
                                    {syncingId === deal.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <Users size={12} className="mr-1" />}
                                    To Allocator
                                  </button>
                                )}

                                {/* 5. Send to Operations Executors (Operations Allocator to Operations Executors Blueprint Transition: 1078476000001938757) */}
                                {isAllocatorStage && (isSuperAdmin || (!isSales && !isAccounts && !isLegal)) && (
                                  <button
                                    onClick={() => handleSendToOperationsExecutors(deal)}
                                    disabled={syncingId === deal.id}
                                    title="Send deal from Allocator to Operations Executors (Zoho Blueprint)"
                                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs flex items-center transition-all shrink-0"
                                  >
                                    {syncingId === deal.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <ArrowRight size={12} className="mr-1" />}
                                    To Executors
                                  </button>
                                )}
                              </>
                            );
                          })()}

                          {/* Standard Actions (View, Edit, Delete) */}
                          <button
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="View Deal Details"
                            onClick={() => navigate(`/crm/deals/${deal.id}`)}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Deal"
                            onClick={() => handleOpenModal(deal)}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Deal"
                            onClick={() => handleDeleteDeal(deal)}
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
                            <p className="text-sm font-semibold text-gray-800">Fetching live deals...</p>
                          </div>
                        ) : (
                          <>
                            {isUserTL && activeTab === 'All Deals' && myTeamDealsCount > 0 ? (
                              <div className="flex flex-col items-center justify-center py-4 space-y-2">
                                <p className="text-base font-semibold text-gray-900">No personal deals found</p>
                                <p className="text-sm text-gray-500">
                                  You have <span className="font-bold text-be-orange">{myTeamDealsCount}</span> active deal{myTeamDealsCount > 1 ? 's' : ''} submitted by your team members.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('My Team Deals')}
                                  className="mt-2 inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-be-orange rounded-xl hover:bg-orange-600 transition shadow-sm"
                                >
                                  <Users className="w-4 h-4 mr-2" />
                                  View My Team Deals ({myTeamDealsCount})
                                </button>
                              </div>
                            ) : activeTab === 'Received' ? (
                              <div className="flex flex-col items-center justify-center py-6 space-y-2">
                                <CheckCircle2 className="w-8 h-8 text-teal-500 mb-1" />
                                <p className="text-base font-semibold text-gray-900">No Received Deals Yet</p>
                                <p className="text-sm text-gray-500 max-w-md text-center">
                                  Deals whose internal legal status is marked as <span className="font-bold text-teal-700">"RECEIVED"</span> in the Legal Details subform will automatically appear here.
                                </p>
                              </div>
                            ) : (
                              <>
                                <p className="text-lg font-medium text-gray-900">No deals found</p>
                                <p className="text-xs text-gray-400 mt-1">Create a new deal or refresh live records.</p>
                              </>
                            )}
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
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
                itemLabel="deals"
                hasMoreOnServer={Boolean(!isFiltered && paginationInfo?.more_records)}
                onLoadMoreServer={() => {
                  if (paginationInfo?.more_records && paginationInfo?.next_page_token) {
                    handlePageChange(currentPage + 1);
                  }
                }}
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" value={formData.billingAddress || (formData as any).Billing_address || ''} onChange={e => setFormData({ ...formData, billingAddress: e.target.value, Billing_address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none" placeholder="Billing Address" />
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
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Address <span className="text-gray-400 font-normal">(Optional)</span></label>
                        <input type="text" value={formData.companyAddress || (formData as any).Company_address || ''} onChange={e => setFormData({ ...formData, companyAddress: e.target.value, Company_address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none" placeholder="Company Address" />
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
                            <th className="px-4 py-3 w-36">Total (₹)</th>
                            <th className="px-4 py-3 text-right">Base (₹)</th>
                            <th className="px-4 py-3 text-right">GST (18%) (₹)</th>
                            <th className="px-4 py-3 min-w-[190px]">
                              <div className="leading-tight">
                                <span>Amount after disbursement</span>
                                <span className="block text-[11px] text-gray-400 font-normal">(if you've % put 0)</span>
                              </div>
                            </th>
                            <th className="px-4 py-3 w-32">Success Fees (%)</th>
                            <th className="px-4 py-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-800">
                          {dealServices.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                No services added. Click "Add Service" to begin.
                              </td>
                            </tr>
                          )}
                          {dealServices.map((service) => {
                            const totalNum = Number(service.totalAmount) || (Number(service.baseAmount) ? Number((Number(service.baseAmount) * 1.18).toFixed(2)) : 0);
                            const base = Number(service.baseAmount) || (totalNum > 0 ? Number((totalNum / 1.18).toFixed(2)) : 0);
                            const gst = totalNum > 0 ? Number((totalNum - base).toFixed(2)) : 0;

                            return (
                              <tr key={service.id} className="align-top">
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
                                          className="absolute top-full left-0 w-[320px] mt-1 bg-white border border-gray-100 rounded-lg shadow-2xl z-[100] flex flex-col overflow-hidden"
                                        >
                                          <div className="p-2 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50/50">
                                            <div className="relative flex-1">
                                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                              <input
                                                type="text"
                                                placeholder={`Search ${allServices.length} services...`}
                                                value={serviceSearchQuery}
                                                onChange={(e) => setServiceSearchQuery(e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded text-sm focus:ring-1 focus:ring-be-orange focus:border-be-orange outline-none"
                                                autoFocus
                                              />
                                            </div>
                                            <span className="text-[10px] text-gray-400 font-bold shrink-0 px-1.5 py-0.5 bg-gray-100 rounded" title="Total Available Services">
                                              {allServices.filter(srv => srv.toLowerCase().includes(serviceSearchQuery.toLowerCase())).length}
                                            </span>
                                          </div>
                                          <div
                                            ref={(el) => {
                                              if (el && !serviceSearchQuery && (!service.name || !el.dataset.scrolled)) {
                                                el.scrollTop = 0;
                                                el.dataset.scrolled = 'true';
                                              }
                                            }}
                                            className="p-1 max-h-60 overflow-y-auto"
                                          >
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

                                  {/* Sub field of notes or remarks */}
                                  <div className="mt-2">
                                    <input
                                      type="text"
                                      placeholder="Add notes / remarks for this service..."
                                      value={service.notes || service.remarks || ''}
                                      onChange={(e) => updateService(service.id, 'notes', e.target.value)}
                                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none bg-gray-50/70 hover:bg-white text-gray-800 placeholder-gray-400 transition-colors shadow-2xs"
                                    />
                                  </div>
                                </td>

                                <td className="px-4 py-3 pt-3.5">
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

                                <td className="px-4 py-3 pt-4 text-right text-gray-600">₹{base.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 pt-4 text-right text-gray-500">₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                
                                <td className="px-4 py-3 pt-3.5">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={service.amountAfterDisbursement !== undefined ? service.amountAfterDisbursement : ''}
                                    onChange={(e) => updateService(service.id, 'amountAfterDisbursement', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none font-medium text-gray-900"
                                  />
                                </td>

                                <td className="px-4 py-3 pt-3.5">
                                  <select
                                    value={service.successFees ? service.successFees.replace('%', '').trim() : ''}
                                    onChange={(e) => updateService(service.id, 'successFees', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded focus:border-be-orange focus:ring-1 focus:ring-be-orange outline-none font-medium text-gray-900 bg-white"
                                  >
                                    <option value="">Select %</option>
                                    {SUCCESS_FEES_OPTIONS.map((fee) => (
                                      <option key={fee} value={fee}>
                                        {fee}%
                                      </option>
                                    ))}
                                    {service.successFees && !SUCCESS_FEES_OPTIONS.includes(service.successFees.replace('%', '').trim()) && (
                                      <option value={service.successFees.replace('%', '').trim()}>
                                        {service.successFees.replace('%', '').trim()}%
                                      </option>
                                    )}
                                  </select>
                                </td>

                                <td className="px-4 py-3 pt-3.5 text-center">
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
                      <div className="pt-3 border-t border-gray-200 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium text-gray-700 block">Payment Screenshot *</span>
                            <span className="text-[11px] text-gray-400">Upload multiple image receipts (Deal_payment_screenshot)</span>
                          </div>
                          <div className="relative flex justify-end">
                            <input
                              type="file"
                              id="paymentScreenshot"
                              className="hidden"
                              multiple
                              accept="image/*,.png,.jpg,.jpeg,.webp,.pdf"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  const selected = Array.from(e.target.files);
                                  setPaymentScreenshotFiles(prev => {
                                    const combined = [...prev, ...selected];
                                    setPaymentScreenshotFile(combined[0] || null);
                                    setPaymentScreenshotName(combined.length === 1 ? combined[0].name : `${combined.length} Screenshots`);
                                    return combined;
                                  });
                                }
                                e.target.value = '';
                              }}
                            />
                            <label
                              htmlFor="paymentScreenshot"
                              className={`cursor-pointer inline-flex items-center px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${formErrors.paymentScreenshot ? 'border-red-500 text-red-600 bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                              <UploadCloud size={14} className="mr-2" />
                              <span className="truncate max-w-[150px]">
                                {paymentScreenshotFiles.length > 0 
                                  ? `+ Add (${paymentScreenshotFiles.length})` 
                                  : (paymentScreenshotName || 'Upload Image(s)')}
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Selected payment screenshots chips */}
                        {paymentScreenshotFiles.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {paymentScreenshotFiles.map((file, idx) => (
                              <div
                                key={idx}
                                className="group relative flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-medium"
                              >
                                <ImageIcon size={12} className="text-emerald-600 shrink-0" />
                                <span className="truncate max-w-[130px]" title={file.name}>{file.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPaymentScreenshotFiles(prev => {
                                      const next = prev.filter((_, i) => i !== idx);
                                      setPaymentScreenshotFile(next[0] || null);
                                      setPaymentScreenshotName(next.length === 0 ? '' : (next.length === 1 ? next[0].name : `${next.length} Screenshots`));
                                      return next;
                                    });
                                  }}
                                  className="text-emerald-700 hover:text-rose-600 ml-0.5 p-0.5 rounded cursor-pointer transition-colors"
                                  title="Remove screenshot"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {formErrors.paymentScreenshot && <div className="text-red-500 text-xs text-right mt-1">{formErrors.paymentScreenshot}</div>}
                      <div className="flex justify-between text-orange-600 font-semibold items-center">
                        <span>Pending Amount</span>
                        <span className="text-base">₹{pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      </div>

                      {/* Remark Field */}
                      <div className="pt-3 border-t border-gray-200 space-y-1.5">
                        <label className="block font-medium text-gray-700">
                          Remark
                        </label>
                        <textarea
                          rows={2}
                          value={remark}
                          onChange={(e) => setRemark(e.target.value)}
                          placeholder="Enter remark..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-be-orange focus:border-be-orange transition-colors resize-none"
                        />
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
                                    title="Refresh Sales BDMs"
                                  >
                                    <RefreshCw size={11} className={isLoadingSalesEmployees ? 'animate-spin' : ''} />
                                    {isLoadingSalesEmployees ? 'Syncing...' : 'Refresh'}
                                  </button>
                                </div>
                                <select
                                  value={selectedPartnerDropdownVal}
                                  onChange={(e) => {
                                    const selectedVal = e.target.value;
                                    const found = eligiblePartnerBdms.find(emp => 
                                      String(emp.id) === selectedVal || 
                                      String(emp.zohoId) === selectedVal || 
                                      String(emp.empId) === selectedVal ||
                                      String(emp.name).toLowerCase() === selectedVal.toLowerCase()
                                    );
                                    if (found) {
                                      setPartnerBdmId(found.zohoId || found.id || found.empId || selectedVal);
                                      setPartnerBdmName(found.name);
                                    } else {
                                      setPartnerBdmId(selectedVal);
                                      setPartnerBdmName('');
                                    }
                                  }}
                                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-be-orange ${formErrors.partnerBdm ? 'border-red-500' : 'border-gray-300'}`}
                                >
                                  <option value="">
                                    {isLoadingSalesEmployees ? 'Syncing Sales BDMs...' : 'Select Sales Partner BDM...'}
                                  </option>
                                  {eligiblePartnerBdms.map(emp => {
                                    const empVal = emp.zohoId || emp.id || emp.empId || emp.name;
                                    return (
                                      <option key={`${empVal}-${emp.name}`} value={empVal}>
                                        {emp.name} ({emp.role || emp.dept || 'Sales'})
                                      </option>
                                    );
                                  })}
                                </select>
                                {formErrors.partnerBdm && <p className="text-red-500 text-xs mt-1">{formErrors.partnerBdm}</p>}
                                {!isLoadingSalesEmployees && eligiblePartnerBdms.length === 0 && (
                                  <p className="text-gray-400 text-[11px] mt-1">No active Sales department employees found.</p>
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

      {/* Screenshot Preview Modal */}
      <AnimatePresence>
        {previewScreenshotModal.isOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setPreviewScreenshotModal({ isOpen: false, url: '', title: '' })}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <ImageIcon size={18} className="text-be-orange" />
                  <h3 className="font-bold text-gray-900 text-sm truncate max-w-md">{previewScreenshotModal.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewScreenshotModal.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
                    title="Open in new window"
                  >
                    <ExternalLink size={14} /> Open Full
                  </a>
                  <button
                    onClick={() => setPreviewScreenshotModal({ isOpen: false, url: '', title: '' })}
                    className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-auto flex items-center justify-center bg-gray-50/50 min-h-[350px]">
                <img
                  src={previewScreenshotModal.url}
                  alt={previewScreenshotModal.title}
                  className="max-h-[75vh] w-auto max-w-full rounded-lg shadow-sm object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget.isOpen}
        onClose={() => !deleteTarget.isDeleting && setDeleteTarget({ isOpen: false, deal: null, isDeleting: false })}
        onConfirm={confirmDeleteDeal}
        title="Delete Deal"
        itemName={deleteTarget.deal ? (deleteTarget.deal.formData?.clientName || deleteTarget.deal.client || deleteTarget.deal.id) : undefined}
        message={deleteTarget.deal ? `Are you sure you want to delete deal "${deleteTarget.deal.formData?.clientName || deleteTarget.deal.client || deleteTarget.deal.id}"?` : undefined}
        isDeleting={deleteTarget.isDeleting}
      />
    </div>
  );
};
