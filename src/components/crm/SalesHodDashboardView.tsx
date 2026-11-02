import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Search, Filter, TrendingUp, TrendingDown, User, Users,
  Layers, ChevronRight, ChevronDown, Award, Trophy, Target,
  DollarSign, PieChart as PieChartIcon, BarChart3, ArrowUpRight,
  Shield, CheckCircle2, Clock, AlertTriangle, Building2, MapPin,
  Sparkles, RefreshCw, Briefcase, Zap, Flame, UserCheck, Eye,
  Maximize2, Minimize2, Compass, Activity, FileText,
  GitBranch, Network, Share2, Send, ZoomIn, ZoomOut, RotateCcw,
  SlidersHorizontal, Sliders, Download, Check, X, Info, Receipt, Calculator, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  getDealReceivedAmount,
  getDealPendingAmount,
  getDealTotalAmount,
  getDealAmountWithoutGst,
  getDealGstAmount,
  isDealPaymentVerified
} from '../../utils/dealSplitUtils';

// ============================================================================
// TYPES & BENCHMARKS
// ============================================================================

export type TimeframeOption = 'today' | 'week' | 'month' | 'quarter' | 'all';

export interface SalesHodDashboardViewProps {
  deals?: any[];
  personal?: {
    dealsCount: number;
    wonCount: number;
    received: number;
    bookedAmount: number;
    deals: any[];
  };
  team?: {
    dealsCount: number;
    wonCount: number;
    received: number;
    bookedAmount: number;
    membersCount: number;
    deals: any[];
  };
  employees?: any[];
  quotations?: any[];
  clients?: any[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export interface SalesTreeNode {
  id: string;
  name: string;
  roleType: 'root' | 'department' | 'branch' | 'tl' | 'tm' | 'service';
  subtitle?: string;
  avatar?: string;
  branchName?: string;
  tlName?: string;
  target: number;
  achievement: number; // Received Amount
  shortfall: number; // Target - Achievement (>= 0)
  bookedAmount: number; // Total deal amount
  dealsCount: number;
  wonCount: number;
  children?: SalesTreeNode[];
  topService?: string;
  deals?: any[];
  personal?: {
    dealsCount: number;
    wonCount: number;
    received: number;
    bookedAmount: number;
    deals: any[];
  };
  team?: {
    dealsCount: number;
    wonCount: number;
    received: number;
    bookedAmount: number;
    membersCount: number;
    deals: any[];
  };
}

const TARGET_BENCHMARKS = {
  org: 8500000, // ₹85 Lakhs
  department: 8500000,
  branchAhmedabad: 4200000, // ₹42 Lakhs
  branchJaipur: 2300000, // ₹23 Lakhs
  branchChennai: 2000000, // ₹20 Lakhs
  tl: 1200000, // ₹12 Lakhs
  tm: 250000, // ₹2.5 Lakhs
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatRupee = (num: number): string => {
  if (!num || isNaN(num)) return '₹0';
  return '₹' + Math.round(num).toLocaleString('en-IN');
};

const formatCompactRupee = (num: number): string => {
  if (!num || isNaN(num) || num === 0) return '₹0';
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)} K`;
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
};

const getDealDateMs = (d: any): number | null => {
  if (!d) return null;
  const raw =
    d.Booking_Date ||
    d.rawZohoDeal?.Booking_Date ||
    d.booking_date ||
    d.rawZohoDeal?.booking_date ||
    d.Payment_Date ||
    d.rawZohoDeal?.Payment_Date ||
    d.Closing_Date ||
    d.Created_Time ||
    d.rawZohoDeal?.Created_Time ||
    d.rawDate ||
    d.date;
  if (!raw) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/[\/\-]/);
    if (parts.length === 3 && parts[0].length <= 2 && parts[2].length === 4) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, day).getTime();
      }
    }
    const dt = new Date(trimmed);
    const ms = dt.getTime();
    if (!isNaN(ms)) return ms;
  }
  return null;
};

// Helper to check if Cloned_Deal checkbox is checked in Zoho CRM deal module (api name: Cloned_Deal)
const isDealCloned = (d: any): boolean => {
  if (!d) return false;
  const raw = d.rawZohoDeal || {};
  const val =
    d.Cloned_Deal !== undefined ? d.Cloned_Deal :
      raw.Cloned_Deal !== undefined ? raw.Cloned_Deal :
        d.cloned_deal !== undefined ? d.cloned_deal :
          raw.cloned_deal !== undefined ? raw.cloned_deal :
            d.Is_Cloned !== undefined ? d.Is_Cloned :
              raw.Is_Cloned;
  return val === true || val === 'true' || val === 1 || val === '1';
};

// Helper to filter records with booking date in October month (previous month)
const isOctoberBooking = (d: any): boolean => {
  if (!d) return false;
  const raw =
    d.Booking_Date ||
    d.rawZohoDeal?.Booking_Date ||
    d.booking_date ||
    d.rawZohoDeal?.booking_date ||
    d.Payment_Date ||
    d.rawZohoDeal?.Payment_Date ||
    d.rawDate ||
    d.date;
  if (!raw) return false;

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^2026-10-\d\d/.test(s)) return true;
    if (/^\d{1,2}[\/\-]10[\/\-]2026/.test(s)) return true;
    if (/2026.*oct/i.test(s) || /oct.*2026/i.test(s)) return true;
  }

  const ms = getDealDateMs(d);
  if (!ms) return false;
  const dt = new Date(ms);
  return dt.getMonth() === 9 && dt.getFullYear() === 2026;
};

const isDealToday = (d: any): boolean => {
  if (!d) return false;
  const now = new Date();
  const todayYMD = now.toISOString().split('T')[0];
  const todayDMY = now.toLocaleDateString('en-GB');
  const raw = String(
    d.Booking_Date ||
    d.Payment_Date ||
    d.date ||
    d.Closing_Date ||
    d.Created_Time ||
    d.rawZohoDeal?.Booking_Date ||
    ''
  );
  return raw.includes(todayYMD) || raw.includes(todayDMY);
};

// ============================================================================
// MAIN COMPONENT (LIGHT THEME EXECUTIVE COMMAND CENTER)
// ============================================================================

export const SalesHodDashboardView: React.FC<SalesHodDashboardViewProps> = ({
  deals: propsDeals,
  employees: propsEmployees,
  quotations: propsQuotations,
  isRefreshing: propsRefreshing,
  onRefresh
}) => {
  // Local state for fetched live data
  const [liveDeals, setLiveDeals] = useState<any[]>(propsDeals || []);
  const [liveEmployees, setLiveEmployees] = useState<any[]>(propsEmployees || []);
  const [liveQuotations, setLiveQuotations] = useState<any[]>(propsQuotations || []);
  const [isLoading, setIsLoading] = useState<boolean>(!propsDeals || propsDeals.length === 0);

  // Timeframe filter (daily, weekly, monthly, quarter, all)
  const [timeframe, setTimeframe] = useState<TimeframeOption>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // 0-indexed: 9 = October
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Flow canvas interactive state
  const [flowSelectedCategory, setFlowSelectedCategory] = useState<string>('branch_ahmedabad');
  const [flowSelectedLeafId, setFlowSelectedLeafId] = useState<string>('');
  const [flowZoom, setFlowZoom] = useState<number>(1.0);
  const [flowViewMode, setFlowViewMode] = useState<'network' | 'tree' | 'services'>('network');
  const [flowSearchQuery, setFlowSearchQuery] = useState<string>('');

  const navigate = useNavigate();
  const [selectedStageModal, setSelectedStageModal] = useState<{
    name: string;
    color: string;
    count: number;
    amount: number;
    received: number;
    deals: any[];
  } | null>(null);
  const [stageModalSearch, setStageModalSearch] = useState<string>('');

  // Executive Tools state
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [simulationBoost, setSimulationBoost] = useState<number>(15); // +15% default simulation
  const [activeTab, setActiveTab] = useState<'overview' | 'charts' | 'matrix'>('overview');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'met' | 'progress' | 'gap' | 'ahmedabad' | 'jaipur' | 'chennai'>('all');

  // Load live data if props change
  useEffect(() => {
    if (propsDeals && propsDeals.length > 0) {
      const isStale = propsDeals.some((d: any) => d.Cloned_Deal === undefined && d.rawZohoDeal?.Cloned_Deal === undefined);
      if (!isStale) {
        setLiveDeals(propsDeals);
      }
    }
    if (propsEmployees && propsEmployees.length > 0) setLiveEmployees(propsEmployees);
    if (propsQuotations && propsQuotations.length > 0) setLiveQuotations(propsQuotations);
  }, [propsDeals, propsEmployees, propsQuotations]);

  useEffect(() => {
    const isStale = !propsDeals || propsDeals.length === 0 || propsDeals.some((d: any) => d.Cloned_Deal === undefined && d.rawZohoDeal?.Cloned_Deal === undefined);
    if (isStale) {
      const fetchAllLiveData = async () => {
        setIsLoading(true);
        try {
          const allDealFields = 'id,Deal_Name,Account_Name,Contact_Name,Company,Company_Name,Client_Name,Clients,Owner,Employee,Stage,Pipeline,Closing_Date,Booking_Date,Payment_Date,Created_Time,Modified_Time,Amount,Total_deal_amount_inclusive_of_gst,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Total_Pending_Amount,Pending_amount,Choose_Wisely,Service_Name,Service_Count,Subform_1,Legal,Client_contact_detail,Client_Email_address,Gst_number,Pan_number,Aadhaar_Card,Billing_address,Company_address,City,State,Bank_details,Accounts_remark,Remark,Description,Partner_BDM,Partner_BDM_Amount,Partner_BDM_ID,Quotation,Payment_verifications,Deal_payment_screenshot,Cloned_Deal';
          const [dealsRes, empRes] = await Promise.all([
            fetch('/api/deals?fetchAll=true&fields=' + encodeURIComponent(allDealFields)).then(r => r.json()).catch(() => null),
            fetch('/api/zoho/get-employees').then(r => r.json()).catch(() => null)
          ]);
          if (dealsRes && Array.isArray(dealsRes.data)) {
            setLiveDeals(dealsRes.data);
            try { localStorage.setItem('be_deals', JSON.stringify(dealsRes.data)); } catch (e) { }
          }
          if (empRes && Array.isArray(empRes.data)) setLiveEmployees(empRes.data);
        } catch (err) {
          console.warn('[SalesHodDashboard] Auto-fetch error:', err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchAllLiveData();
    }
  }, [propsDeals]);

  // Filter deals based on active timeframe with revenue filter: October booking date and unchecked Cloned_Deal
  const filteredDeals = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const sevenDaysAgoMs = nowMs - 7 * 86400000;

    return liveDeals.filter((d: any) => {
      if (!d) return false;

      // Revenue filter: Cloned_Deal field must be unchecked
      if (isDealCloned(d)) return false;

      // Revenue filter: Booking Date must be in October month (previous month)
      if (!isOctoberBooking(d)) return false;

      if (timeframe === 'today') return isDealToday(d);

      const ms = getDealDateMs(d);
      if (!ms) return timeframe === 'all';

      if (timeframe === 'week') {
        return ms >= sevenDaysAgoMs && ms <= nowMs + 86400000;
      }
      if (timeframe === 'month') {
        const dt = new Date(ms);
        return dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear;
      }
      if (timeframe === 'quarter') {
        const dt = new Date(ms);
        const dealQuarter = Math.floor(dt.getMonth() / 3);
        const targetQuarter = Math.floor(selectedMonth / 3);
        return dealQuarter === targetQuarter && dt.getFullYear() === selectedYear;
      }
      return true;
    });
  }, [liveDeals, timeframe, selectedMonth, selectedYear]);

  // Independent metrics for Today and Current Month
  const todayDeals = useMemo(() => liveDeals.filter(d => !isDealCloned(d) && isOctoberBooking(d) && isDealToday(d)), [liveDeals]);
  const currentMonthDeals = useMemo(() => {
    return liveDeals.filter(d => {
      if (!d || isDealCloned(d) || !isOctoberBooking(d)) return false;
      const ms = getDealDateMs(d);
      if (!ms) return false;
      const dt = new Date(ms);
      return dt.getMonth() === selectedMonth && dt.getFullYear() === selectedYear;
    });
  }, [liveDeals, selectedMonth, selectedYear]);

  // 1. TODAY'S REVENUE
  const todayRevenue = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [todayDeals]);
  const todayBooked = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [todayDeals]);
  const todayWithGst = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [todayDeals]);
  const todayWithoutGst = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealAmountWithoutGst(d), 0), [todayDeals]);
  const todayGstTax = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealGstAmount(d), 0), [todayDeals]);

  // 2. MONTHLY REVENUE & GST AMOUNTS (October 2026 / Selected Month)
  const monthlyRevenue = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [currentMonthDeals]);
  const monthlyBooked = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [currentMonthDeals]);
  const monthlyWithGst = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [currentMonthDeals]);
  const monthlyWithoutGst = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealAmountWithoutGst(d), 0), [currentMonthDeals]);
  const monthlyGstTax = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealGstAmount(d), 0), [currentMonthDeals]);

  // 3. REVENUE BREAKDOWN & GST AMOUNTS FOR ACTIVE TIMEFRAME
  const totalReceivedAmount = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [filteredDeals]);
  const totalPendingAmount = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealPendingAmount(d), 0), [filteredDeals]);
  const totalBookedValue = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);
  const totalWithGst = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);
  const totalWithoutGst = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealAmountWithoutGst(d), 0), [filteredDeals]);
  const totalGstTax = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealGstAmount(d), 0), [filteredDeals]);

  // Active Timeframe GST amounts for display
  const activeWithGst = timeframe === 'month' ? monthlyWithGst : totalWithGst;
  const activeWithoutGst = timeframe === 'month' ? monthlyWithoutGst : totalWithoutGst;
  const activeGstTax = timeframe === 'month' ? monthlyGstTax : totalGstTax;

  // 4. TOP SELLING SERVICES
  const topServices = useMemo(() => {
    const map = new Map<string, { name: string; count: number; received: number; booked: number }>();
    filteredDeals.forEach(d => {
      let s = '';
      if (d.service && d.service !== 'General Services' && d.service !== 'Services' && d.service !== 'N/A' && d.service !== 'Choose Wisely') {
        s = d.service;
      } else if (d.Service_Name && d.Service_Name !== 'Services' && d.Service_Name !== 'Choose Wisely') {
        s = d.Service_Name;
      } else if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
        const sub = d.rawZohoDeal.Subform_1[0];
        s = sub.Schemas || sub.Schema || sub.Service_Name || sub.Service || sub.Business_plan_selected || '';
      }
      if (!s && (d.Deal_Name || d.client || d.rawZohoDeal?.Deal_Name)) {
        const dName = d.Deal_Name || d.rawZohoDeal?.Deal_Name || d.client || '';
        const parts = dName.split(' - ');
        if (parts.length > 1) {
          s = parts.slice(1).join(' - ').replace(/\(DL-\d+\)/i, '').trim();
        }
      }
      if (!s || s === 'N/A' || s === 'Choose Wisely' || s === 'Services' || s === 'General Services' || s === 'New Case Booking') {
        s = 'Business Advisory';
      }
      s = s.trim().toUpperCase();

      const existing = map.get(s) || { name: s, count: 0, received: 0, booked: 0 };
      existing.count++;
      existing.received += getDealReceivedAmount(d);
      existing.booked += getDealTotalAmount(d);
      map.set(s, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.received - a.received)
      .slice(0, 8);
  }, [filteredDeals]);

  // 5. BDM / SALES EMPLOYEE ATTRIBUTION
  const bdmPerformance = useMemo(() => {
    const map = new Map<string, {
      name: string;
      cleanName: string;
      received: number;
      booked: number;
      count: number;
      deals: any[];
    }>();

    const isValidBdmCandidate = (val: any): boolean => {
      if (!val) return false;
      const s = String(typeof val === 'object' ? (val.name || '') : val).trim().toLowerCase();
      if (!s || s === 'n/a' || s === 'null' || s === 'undefined' || s === '-' || s === 'choose wisely' || s === 'services' || s === 'general services') return false;
      if (/^\d+$/.test(s)) return false;
      if (['sirjan singh', 'crm', 'admin', 'managing director', 'system', 'super admin', 'direct house accounts'].includes(s)) return false;
      return true;
    };

    filteredDeals.forEach(d => {
      const rawDeal = d.rawZohoDeal || d;
      let empName = '';

      // 1. Employee field
      if (isValidBdmCandidate(d.Employee)) {
        empName = typeof d.Employee === 'object' ? (d.Employee.name || '') : String(d.Employee);
      } else if (isValidBdmCandidate(rawDeal.Employee)) {
        empName = typeof rawDeal.Employee === 'object' ? (rawDeal.Employee.name || '') : String(rawDeal.Employee);
      }

      // 2. Owner field (Deal Owner in Zoho)
      if (!empName || !isValidBdmCandidate(empName)) {
        if (isValidBdmCandidate(rawDeal.Owner)) {
          empName = typeof rawDeal.Owner === 'object' ? (rawDeal.Owner.name || '') : String(rawDeal.Owner);
        } else if (isValidBdmCandidate(d.owner)) {
          empName = String(d.owner);
        }
      }

      // 3. Created_By field (Deal Creator in Zoho)
      if (!empName || !isValidBdmCandidate(empName)) {
        if (isValidBdmCandidate(rawDeal.Created_By)) {
          empName = typeof rawDeal.Created_By === 'object' ? (rawDeal.Created_By.name || '') : String(rawDeal.Created_By);
        } else if (isValidBdmCandidate(d.Created_By)) {
          empName = typeof d.Created_By === 'object' ? (d.Created_By.name || '') : String(d.Created_By);
        }
      }

      // 4. Fallback deal candidates
      if (!empName || !isValidBdmCandidate(empName)) {
        for (const candidate of [d.salesEmployee, d.employeeName, d.bdm, rawDeal.Deal_Owner, rawDeal.Owner_Name]) {
          if (isValidBdmCandidate(candidate)) {
            empName = String(candidate);
            break;
          }
        }
      }

      // 5. Fallback ID match in liveEmployees
      if ((!empName || !isValidBdmCandidate(empName)) && Array.isArray(liveEmployees)) {
        const rawId = String(d.Employee || rawDeal.Employee || '').trim();
        if (rawId) {
          const matchedEmp = liveEmployees.find(e => String(e.id) === rawId || String(e.employeeId) === rawId || String(e.zohoId) === rawId);
          if (matchedEmp && isValidBdmCandidate(matchedEmp.name)) {
            empName = matchedEmp.name;
          }
        }
      }

      empName = empName ? empName.trim() : 'Direct House Accounts';

      const clean = empName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existing = map.get(clean) || {
        name: empName,
        cleanName: clean,
        received: 0,
        booked: 0,
        count: 0,
        deals: []
      };
      existing.received += getDealReceivedAmount(d);
      existing.booked += getDealTotalAmount(d);
      existing.count += 1;
      existing.deals.push(d);
      map.set(clean, existing);
    });

    return map;
  }, [filteredDeals, liveEmployees]);

  // Helper to match BDM deals with strict token validation and no false surname matches
  const matchBdmDeals = (officialName: string, claimedSet: Set<string>, branchName?: string) => {
    const cleanOfficial = officialName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const offTokens = officialName.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const firstWord = offTokens[0] || '';
    const lastWord = offTokens[offTokens.length - 1] || '';

    let totalRec = 0;
    let totalBkd = 0;
    let totalCnt = 0;
    let dealList: any[] = [];

    // Distinct unique first names across the entire 39 BDM roster
    const uniqueFirstNames = new Set([
      'meet', 'daivik', 'rutvik', 'vijay', 'umang', 'nilesh', 'jitendra', 'naman',
      'priyanshi', 'rituraj', 'sayyam', 'hetul', 'aakash', 'arpit', 'harshita',
      'punit', 'akshat', 'konpal', 'palak', 'pratima', 'janvi', 'kalash', 'astha',
      'drashti', 'muliyashiya', 'trivedi', 'chirag', 'amarnath', 'vaishnavi', 'justin', 'gokul',
      'romil', 'uday', 'sourav'
    ]);

    bdmPerformance.forEach((val, cleanKey) => {
      if (claimedSet.has(cleanKey)) return;
      if (cleanKey === 'directhouseaccounts' || cleanKey.includes('sirjansingh')) return;

      const dealTokens = val.name.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const dealFirst = dealTokens[0] || '';
      const dealLast = dealTokens[dealTokens.length - 1] || '';

      // 1. Direct clean match
      const isDirectMatch = cleanKey === cleanOfficial;

      // 2. Both First and Last name match (e.g. "Abhishek Singh" matches "Abhishek Harendra Singh", NOT "Abhishek Prajapati")
      const isFirstAndLastMatch = dealTokens.length >= 2 && offTokens.length >= 2 &&
        dealFirst === firstWord && dealLast === lastWord;

      // 3. Substring match when surname is identical
      const isSubMatchWithSameSurname = cleanKey.length > 5 && cleanOfficial.length > 5 &&
        (cleanKey.includes(cleanOfficial) || cleanOfficial.includes(cleanKey)) &&
        dealLast === lastWord;

      // 4. Unique single first name match (e.g. deal owner says only "Meet" or "Daivik" or "Rutvik")
      const isUniqueFirstNameMatch = dealTokens.length === 1 &&
        uniqueFirstNames.has(dealFirst) &&
        dealFirst === firstWord;

      // 5. Shared first name resolution by branch (e.g. "Monika" without surname)
      const isBranchQualifiedMatch = dealTokens.length === 1 &&
        dealFirst === firstWord &&
        Boolean(branchName) &&
        val.deals.some((d: any) => {
          const raw = d.rawZohoDeal || d;
          const loc = String(raw.City || raw.State || raw.Branch || '').toLowerCase();
          return branchName && loc.includes(branchName.toLowerCase().replace(' branch', ''));
        });

      if (isDirectMatch || isFirstAndLastMatch || isSubMatchWithSameSurname || isUniqueFirstNameMatch || isBranchQualifiedMatch) {
        totalRec += val.received;
        totalBkd += val.booked;
        totalCnt += val.count;
        dealList = [...dealList, ...val.deals];
        claimedSet.add(cleanKey);
      }
    });

    return { received: totalRec, booked: totalBkd, count: totalCnt, deals: dealList };
  };

  // 6. BUILD SALES HIERARCHY TREE
  const salesTree: SalesTreeNode = useMemo(() => {
    const branchConfigs = [
      {
        id: 'branch_ahmedabad',
        name: 'Ahmedabad Branch',
        subtitle: 'Headquarters & West Region',
        target: TARGET_BENCHMARKS.branchAhmedabad,
        tls: [
          {
            name: 'Romil Prajapati',
            title: 'Branch Manager (TL)',
            target: 2200000,
            tms: [
              'Meet Yadav', 'Daivik Patel', 'Rutvik Patel', 'Vijay Singh',
              'Ayushkumar Patel', 'Umang Soni', 'Nilesh Solanki', 'Jitendra Rathore', 'Naman Makkad'
            ]
          },
          {
            name: 'Uday Dubey',
            title: 'Vice Sales Head (TL)',
            target: 2000000,
            tms: [
              'Abhishek Harendra Singh', 'Abhishek Prajapati', 'Monika Rola',
              'Priyanshi Barmashe', 'Rituraj Singh', 'Jainam Patva', 'Sayyam Jain',
              'Ayush Bhat', 'Jainam Sompura', 'Hetul Chiragbhai'
            ]
          }
        ]
      },
      {
        id: 'branch_jaipur',
        name: 'Jaipur Branch',
        subtitle: 'North Region Cluster',
        target: TARGET_BENCHMARKS.branchJaipur,
        tls: [
          {
            name: 'Akshay Kumar Sharma',
            title: 'Sr. Cluster Development Manager (TL)',
            target: TARGET_BENCHMARKS.branchJaipur,
            tms: [
              'Aakash Goswami', 'Arpit Sharma', 'Harshita Manohar', 'Monika Gurjar',
              'Punit Kumar Khaliya', 'Akshat Mishra', 'Konpal Sharma'
            ]
          }
        ]
      },
      {
        id: 'branch_chennai',
        name: 'Chennai Branch',
        subtitle: 'South Region Cluster',
        target: TARGET_BENCHMARKS.branchChennai,
        tls: [
          {
            name: 'Sourav Modak',
            title: 'Branch Manager (TL)',
            target: 1200000,
            tms: [
              'Palak Dubey', 'Pratima Sahu', 'Janvi Chabhadiya', 'Kalash Srivastava',
              'Astha Chauhan', 'Drashti Bhuva', 'Muliyashiya Goganbhai', 'Trivedi Bhavikkumar', 'Chirag Navani'
            ]
          },
          {
            name: 'Amarnath C & Southern Cluster',
            title: 'Sr. BDM Cluster (TL)',
            target: 800000,
            tms: ['AMARNATH C', 'Vaishnavi R', 'Justin J', 'Gokul G']
          }
        ]
      }
    ];

    const sharedClaimedSet = new Set<string>();

    const branchNodes: SalesTreeNode[] = branchConfigs.map(bc => {
      let branchReceived = 0;
      let branchBooked = 0;
      let branchDealsCount = 0;
      let branchAllDeals: any[] = [];

      const tlNodes: SalesTreeNode[] = bc.tls.map(tl => {
        let teamReceived = 0;
        let teamBooked = 0;
        let teamDealsCount = 0;
        let teamAllDeals: any[] = [];

        const tmNodes: SalesTreeNode[] = tl.tms.map(tmName => {
          const matched = matchBdmDeals(tmName, sharedClaimedSet, bc.name);
          const tmTarget = TARGET_BENCHMARKS.tm;
          const tmShortfall = Math.max(0, tmTarget - matched.received);

          teamReceived += matched.received;
          teamBooked += matched.booked;
          teamDealsCount += matched.count;
          teamAllDeals = [...teamAllDeals, ...matched.deals];

          // Determine TM's top service
          const sMap = new Map<string, number>();
          matched.deals.forEach(d => {
            let sn = '';
            if (d.service && d.service !== 'General Services' && d.service !== 'Services' && d.service !== 'N/A' && d.service !== 'Choose Wisely') sn = d.service;
            else if (d.Service_Name && d.Service_Name !== 'Services' && d.Service_Name !== 'Choose Wisely') sn = d.Service_Name;
            else if (d.rawZohoDeal?.Deal_Name || d.Deal_Name) {
              const parts = (d.rawZohoDeal?.Deal_Name || d.Deal_Name || '').split(' - ');
              if (parts.length > 1) sn = parts.slice(1).join(' - ').replace(/\(DL-\d+\)/i, '').trim();
            }
            if (!sn || sn === 'General Services' || sn === 'Services' || sn === 'New Case Booking' || sn === 'N/A') sn = 'Business Advisory';
            sMap.set(sn, (sMap.get(sn) || 0) + 1);
          });
          let bestS = 'Business Advisory';
          let mCnt = 0;
          sMap.forEach((c, s) => {
            if (c > mCnt) { mCnt = c; bestS = s; }
          });

          return {
            id: `tm_${tmName.toLowerCase().replace(/\s+/g, '_')}`,
            name: tmName,
            roleType: 'tm',
            subtitle: 'Business Development Manager',
            branchName: bc.name,
            tlName: tl.name,
            target: tmTarget,
            achievement: matched.received,
            shortfall: tmShortfall,
            bookedAmount: matched.booked,
            dealsCount: matched.count,
            wonCount: matched.deals.filter(d => isDealPaymentVerified(d)).length,
            topService: bestS,
            deals: matched.deals
          };
        });

        // Direct / Personal deals closed by the TL themselves
        const tlDirect = matchBdmDeals(tl.name, sharedClaimedSet, bc.name);
        const personalReceived = tlDirect.received;
        const personalBooked = tlDirect.booked;
        const personalDealsCount = tlDirect.count;
        const personalAllDeals = tlDirect.deals;

        const combinedReceived = teamReceived + personalReceived;
        const combinedBooked = teamBooked + personalBooked;
        const combinedDealsCount = teamDealsCount + personalDealsCount;
        const combinedAllDeals = [...teamAllDeals, ...personalAllDeals];

        const tlShortfall = Math.max(0, tl.target - combinedReceived);
        branchReceived += combinedReceived;
        branchBooked += combinedBooked;
        branchDealsCount += combinedDealsCount;
        branchAllDeals = [...branchAllDeals, ...combinedAllDeals];

        return {
          id: `tl_${tl.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: tl.name,
          roleType: 'tl',
          subtitle: tl.title,
          branchName: bc.name,
          target: tl.target,
          achievement: combinedReceived,
          shortfall: tlShortfall,
          bookedAmount: combinedBooked,
          dealsCount: combinedDealsCount,
          wonCount: combinedAllDeals.filter(d => isDealPaymentVerified(d)).length,
          children: tmNodes,
          deals: combinedAllDeals,
          personal: {
            dealsCount: personalDealsCount,
            wonCount: personalAllDeals.filter(d => isDealPaymentVerified(d)).length,
            received: personalReceived,
            bookedAmount: personalBooked,
            deals: personalAllDeals
          },
          team: {
            dealsCount: teamDealsCount,
            wonCount: teamAllDeals.filter(d => isDealPaymentVerified(d)).length,
            received: teamReceived,
            bookedAmount: teamBooked,
            membersCount: tl.tms.length,
            deals: teamAllDeals
          }
        };
      });

      // Attribute unassigned direct house / corporate inbound deals to Headquarters (Ahmedabad)
      if (bc.id === 'branch_ahmedabad') {
        const unassignedKeys = Array.from(bdmPerformance.keys()).filter(k => !sharedClaimedSet.has(k));
        let unassignedRec = 0;
        let unassignedBkd = 0;
        let unassignedCnt = 0;
        let unassignedDeals: any[] = [];
        unassignedKeys.forEach(k => {
          const val = bdmPerformance.get(k);
          if (val) {
            unassignedRec += val.received;
            unassignedBkd += val.booked;
            unassignedCnt += val.count;
            unassignedDeals = [...unassignedDeals, ...val.deals];
            sharedClaimedSet.add(k);
          }
        });
        branchReceived += unassignedRec;
        branchBooked += unassignedBkd;
        branchDealsCount += unassignedCnt;
        branchAllDeals = [...branchAllDeals, ...unassignedDeals];
      }

      const branchShortfall = Math.max(0, bc.target - branchReceived);

      return {
        id: bc.id,
        name: bc.name,
        roleType: 'branch',
        subtitle: bc.subtitle,
        branchName: bc.name,
        target: bc.target,
        achievement: branchReceived,
        shortfall: branchShortfall,
        bookedAmount: branchBooked,
        dealsCount: branchDealsCount,
        wonCount: branchAllDeals.filter(d => isDealPaymentVerified(d)).length,
        children: tlNodes,
        deals: branchAllDeals
      };
    });

    const deptReceived = branchNodes.reduce((acc, b) => acc + b.achievement, 0);
    const deptBooked = branchNodes.reduce((acc, b) => acc + b.bookedAmount, 0);
    const deptDeals = branchNodes.reduce((acc, b) => acc + b.dealsCount, 0);
    const deptShortfall = Math.max(0, TARGET_BENCHMARKS.department - deptReceived);

    const deptNode: SalesTreeNode = {
      id: 'dept_sales',
      name: 'Sales & Growth Division',
      roleType: 'department',
      subtitle: 'National Sales Head: Mishal Bhatia',
      target: TARGET_BENCHMARKS.department,
      achievement: deptReceived > 0 ? deptReceived : totalReceivedAmount,
      shortfall: deptShortfall,
      bookedAmount: deptBooked > 0 ? deptBooked : totalBookedValue,
      dealsCount: deptDeals > 0 ? deptDeals : filteredDeals.length,
      wonCount: branchNodes.reduce((acc, b) => acc + b.wonCount, 0),
      children: branchNodes,
      deals: filteredDeals
    };

    const rootTarget = TARGET_BENCHMARKS.org;
    const rootAchievement = deptNode.achievement;
    const rootShortfall = Math.max(0, rootTarget - rootAchievement);

    return {
      id: 'root',
      name: 'BharatEdge Group',
      roleType: 'root',
      subtitle: 'Corporate Enterprise HQ',
      target: rootTarget,
      achievement: rootAchievement,
      shortfall: rootShortfall,
      bookedAmount: deptNode.bookedAmount,
      dealsCount: deptNode.dealsCount,
      wonCount: deptNode.wonCount,
      children: [deptNode],
      deals: filteredDeals
    };
  }, [filteredDeals, bdmPerformance, totalReceivedAmount, totalBookedValue]);

  // Overall Benchmarks
  const overallTarget = salesTree.target;
  const overallAchievement = salesTree.achievement;
  const overallShortfall = salesTree.shortfall;
  const overallAchievementPct = overallTarget > 0 ? Math.min(100, Math.round((overallAchievement / overallTarget) * 100)) : 0;

  // High Performers (Extract directly from salesTree frontline BDMs so corporate/house accounts are excluded)
  const topHighPerformer = useMemo<{ name: string; received: number; branch: string; dealsCount: number } | null>(() => {
    let best: { name: string; received: number; branch: string; dealsCount: number } | null = null;
    (salesTree.children?.[0]?.children || []).forEach(br => {
      (br.children || []).forEach(tl => {
        (tl.children || []).forEach(tm => {
          if (!best || tm.achievement > best.received) {
            best = {
              name: tm.name,
              received: tm.achievement,
              branch: br.name.replace(' Branch', '').trim(),
              dealsCount: tm.dealsCount
            };
          }
        });
      });
    });
    return best;
  }, [salesTree]);

  const topHighBranch = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    if (branches.length === 0) return null;
    return [...branches].sort((a, b) => b.achievement - a.achievement)[0];
  }, [salesTree]);

  // Deal Stage Pipeline counts
  const stageStats = useMemo(() => {
    const stages = [
      { name: 'Sales Stage', match: ['sales', 'pitch', 'lead'], count: 0, amount: 0, received: 0, color: 'bg-blue-500', deals: [] as any[] },
      { name: 'Account Verification', match: ['account', 'audit'], count: 0, amount: 0, received: 0, color: 'bg-purple-500', deals: [] as any[] },
      { name: 'Legal Drafting & Review', match: ['legal', 'draft'], count: 0, amount: 0, received: 0, color: 'bg-cyan-500', deals: [] as any[] },
      { name: 'Internal Operations', match: ['operation', 'allocat', 'execut'], count: 0, amount: 0, received: 0, color: 'bg-amber-500', deals: [] as any[] },
      { name: 'Closed Won Delivery', match: ['won', 'deliver', 'complet'], count: 0, amount: 0, received: 0, color: 'bg-emerald-500', deals: [] as any[] }
    ];

    filteredDeals.forEach(d => {
      const stageStr = String(d.stage || d.Stage || d.status || 'sales').toLowerCase();
      const rec = getDealReceivedAmount(d);
      const tot = getDealTotalAmount(d);

      let matched = false;
      for (const st of stages) {
        if (st.match.some(m => stageStr.includes(m))) {
          st.count++;
          st.amount += tot;
          st.received += rec;
          st.deals.push(d);
          matched = true;
          break;
        }
      }
      if (!matched) {
        stages[0].count++;
        stages[0].amount += tot;
        stages[0].received += rec;
        stages[0].deals.push(d);
      }
    });

    return stages;
  }, [filteredDeals]);

  // ============================================================================
  // RECHARTS DATA STRUCTURES (NEW PIE CHARTS & BAR CHARTS)
  // ============================================================================

  // 1. Branch Revenue Share Donut Data
  const branchPieData = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    const colors = ['#6366f1', '#06b6d4', '#f59e0b', '#10b981'];
    return branches.map((b, i) => ({
      name: b.name.replace(' Branch', ''),
      fullName: b.name,
      value: b.achievement,
      deals: b.dealsCount,
      target: b.target,
      shortfall: b.shortfall,
      color: colors[i % colors.length]
    }));
  }, [salesTree]);

  // 2. Deal Stages Pie Data
  const stagePieData = useMemo(() => {
    const colors: Record<string, string> = {
      'Sales Stage': '#3b82f6',
      'Account Verification': '#a855f7',
      'Legal Drafting & Review': '#06b6d4',
      'Internal Operations': '#f59e0b',
      'Closed Won Delivery': '#10b981'
    };
    return stageStats.map(st => ({
      name: st.name.replace(' Stage', '').replace(' Verification', '').replace(' & Review', ''),
      fullName: st.name,
      value: st.count,
      amount: st.amount,
      received: st.received,
      color: colors[st.name] || '#64748b',
      deals: st.deals
    }));
  }, [stageStats]);

  // 3. Target vs Achieved Comparison Bar Data
  const branchBarData = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    return branches.map(b => ({
      name: b.name.replace(' Branch', ''),
      Target: Math.round(b.target / 100000), // in Lakhs
      Achieved: Math.round(b.achievement / 100000),
      Shortfall: Math.round(b.shortfall / 100000)
    }));
  }, [salesTree]);

  // ============================================================================
  // PROGRESSIVE HIERARCHY COMPUTATIONS (EXACT USER SPECIFICATION)
  // Logo -> Sales -> 3 Branches (Ahmedabad, Jaipur, Chennai) -> TLs -> TMs
  // ============================================================================
  const salesDept = salesTree.children?.[0] || salesTree;

  // Exactly 3 Branches (Ahmedabad, Jaipur, Chennai) with their TLs and TMs
  const branches = useMemo(() => {
    const rawBranches = salesDept.children || [];
    const targetBranchIds = ['branch_ahmedabad', 'branch_jaipur', 'branch_chennai'];

    return targetBranchIds.map(id => {
      const b = rawBranches.find(rb => rb.id === id) || {
        id,
        name: id === 'branch_ahmedabad' ? 'Ahmedabad' : id === 'branch_jaipur' ? 'Jaipur' : 'Chennai',
        target: id === 'branch_ahmedabad' ? 4200000 : id === 'branch_jaipur' ? 2300000 : 2000000,
        achievement: 0,
        shortfall: 0,
        dealsCount: 0,
        children: []
      };

      const cleanName = b.name.replace(' Branch', '').trim();
      const tls = (b.children || []).map(tl => ({
        id: tl.id,
        name: tl.name,
        target: tl.target,
        achievement: tl.achievement,
        shortfall: tl.shortfall,
        dealsCount: tl.dealsCount,
        personal: tl.personal,
        team: tl.team,
        tms: (tl.children || []).map(tm => ({
          id: tm.id,
          name: tm.name,
          target: tm.target,
          achievement: tm.achievement,
          shortfall: tm.shortfall,
          dealsCount: tm.dealsCount,
          topService: tm.topService || 'Business Advisory',
          data: tm
        })),
        data: tl
      }));

      return {
        id: b.id,
        name: cleanName,
        target: b.target,
        achievement: b.achievement,
        shortfall: b.shortfall,
        dealsCount: b.dealsCount,
        tls,
        data: b
      };
    });
  }, [salesDept]);

  // Progressive Interactive State
  const [selectedBranchId, setSelectedBranchId] = useState<string>('branch_ahmedabad');
  const [selectedTlId, setSelectedTlId] = useState<string>('tl_romil_prajapati');
  const [selectedTmId, setSelectedTmId] = useState<string>('');
  const [activeInspectLevel, setActiveInspectLevel] = useState<'root' | 'sales' | 'branch' | 'tl' | 'tm'>('root');
  // Drilldown level: 0 = Centered BharatEdge Logo, 1 = +Sales, 2 = +3 Branches, 3 = +TLs, 4 = +TMs
  const [drillLevel, setDrillLevel] = useState<0 | 1 | 2 | 3 | 4>(0);
  // TL View Mode: personal = Personal (Self), team = Team
  const [tlViewMode, setTlViewMode] = useState<'personal' | 'team'>('personal');

  const activeBranch = useMemo(() => {
    return branches.find(b => b.id === selectedBranchId) || branches[0];
  }, [branches, selectedBranchId]);

  const activeBranchIndex = useMemo(() => {
    const idx = branches.findIndex(b => b.id === selectedBranchId);
    return idx >= 0 ? idx : 0;
  }, [branches, selectedBranchId]);

  const activeTl = useMemo(() => {
    if (!activeBranch) return null;
    const found = activeBranch.tls.find(t => t.id === selectedTlId);
    return found || activeBranch.tls[0] || null;
  }, [activeBranch, selectedTlId]);

  const activeTlIndex = useMemo(() => {
    if (!activeBranch || !activeTl) return 0;
    const idx = activeBranch.tls.findIndex(t => t.id === activeTl.id);
    return idx >= 0 ? idx : 0;
  }, [activeBranch, activeTl]);

  const activeTm = useMemo(() => {
    if (!activeTl) return null;
    if (selectedTmId) {
      const found = activeTl.tms.find(m => m.id === selectedTmId);
      if (found) return found;
    }
    return activeTl.tms[0] || null;
  }, [activeTl, selectedTmId]);

  const inspectedEntity: any = useMemo(() => {
    if (activeInspectLevel === 'root') return salesTree;
    if (activeInspectLevel === 'sales') return salesDept;
    if (activeInspectLevel === 'branch') return activeBranch?.data || salesDept;
    if (activeInspectLevel === 'tl') return activeTl?.data || salesDept;
    if (activeInspectLevel === 'tm') return activeTm?.data || activeTl?.data || salesDept;
    return activeTm?.data || activeTl?.data || salesDept;
  }, [activeInspectLevel, salesTree, salesDept, activeBranch, activeTl, activeTm]);

  // Waveform equalizer bars for sentiment visualizer
  const waveformBars = useMemo(() => {
    return [24, 38, 48, 32, 60, 75, 90, 65, 42, 80, 95, 100, 92, 82, 68, 52, 42, 62, 78, 52, 38, 28, 42, 32];
  }, []);

  // Filtered BDM Matrix
  const rawBdmList = useMemo(() => {
    const list: any[] = [];
    (salesTree.children?.[0]?.children || []).forEach(br => {
      (br.children || []).forEach(tl => {
        (tl.children || []).forEach(tm => {
          const rawSrv = tm.topService || 'Business Advisory';
          const cleanSrv = rawSrv.toUpperCase().trim() === 'CGSS'
            ? 'CGSS Scheme'
            : rawSrv.toUpperCase().trim() === 'GEM REGISTRATION'
              ? 'GeM Portal Registration'
              : rawSrv.toUpperCase().trim() === 'ISO CERTIFICATE'
                ? 'ISO Certification'
                : rawSrv.toLowerCase().split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

          list.push({
            id: tm.id,
            name: tm.name,
            branch: br.name.replace(' Branch', '').trim(),
            tl: tl.name,
            target: tm.target,
            achievement: tm.achievement,
            shortfall: tm.shortfall,
            dealsCount: tm.dealsCount,
            topService: cleanSrv,
            pct: tm.target > 0 ? Math.round((tm.achievement / tm.target) * 100) : 0
          });
        });
      });
    });
    return list;
  }, [salesTree]);

  const bdmList = useMemo(() => {
    let list = [...rawBdmList];

    if (matrixFilter === 'met') {
      list = list.filter(b => b.shortfall === 0);
    } else if (matrixFilter === 'progress') {
      list = list.filter(b => b.pct >= 50 && b.shortfall > 0);
    } else if (matrixFilter === 'gap') {
      list = list.filter(b => b.pct < 50);
    } else if (matrixFilter === 'ahmedabad') {
      list = list.filter(b => b.branch.toLowerCase().includes('ahmedabad'));
    } else if (matrixFilter === 'jaipur') {
      list = list.filter(b => b.branch.toLowerCase().includes('jaipur'));
    } else if (matrixFilter === 'chennai') {
      list = list.filter(b => b.branch.toLowerCase().includes('chennai'));
    }

    if (!matrixSearch.trim()) return list;
    const q = matrixSearch.toLowerCase();
    return list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.branch.toLowerCase().includes(q) ||
      b.tl.toLowerCase().includes(q) ||
      b.topService.toLowerCase().includes(q)
    );
  }, [rawBdmList, matrixSearch, matrixFilter]);

  // Executive CSV Export Tool
  const handleExportCsv = () => {
    const headers = ['BDM Name', 'Branch', 'Team Leader', 'Deals Created', 'Target (INR)', 'Achievement (INR)', 'Shortfall (INR)', 'Target Progress (%)', 'Top Service'];
    const rows = bdmList.map(b => [
      `"${b.name}"`,
      `"${b.branch}"`,
      `"${b.tl}"`,
      b.dealsCount,
      b.target,
      b.achievement,
      b.shortfall,
      `"${b.pct}%"`,
      `"${b.topService}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sales_HOD_Hierarchy_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ============================================================================
  // RENDER (LIGHT THEME)
  // ============================================================================

  return (
    <div className="space-y-8 bg-[#f8fafc] text-slate-800 p-4 sm:p-7 min-h-screen">
      {/* ========================================================================= */}
      {/* TOP EXECUTIVE COMMAND BAR */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white shadow-md shadow-indigo-500/20">
              <Compass size={20} />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Sales Executive Intelligence Hub
              </h1>
            </div>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Timeframe Filter Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            {(['today', 'week', 'month', 'quarter', 'all'] as TimeframeOption[]).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer capitalize ${timeframe === tf
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {tf === 'month' ? 'October 2026' : tf === 'all' ? 'All Time' : tf}
              </button>
            ))}
          </div>

          {/* Month / Year Picker (when in month mode) */}
          {timeframe === 'month' && (
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm text-xs font-bold text-slate-700">
              <Calendar size={13} className="text-indigo-600" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer"
              >
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <span>2026</span>
            </div>
          )}

          {/* Target Simulator Tool Toggle */}
          <button
            onClick={() => setShowSimulator(s => !s)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${showSimulator
              ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm'
              }`}
          >
            <Sliders size={14} className={showSimulator ? 'text-white' : 'text-amber-500'} />
            <span>Target Simulator</span>
          </button>

          {/* Export Report Tool */}
          <button
            onClick={handleExportCsv}
            title="Download CSV Hierarchy Summary"
            className="p-2 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm transition-all cursor-pointer flex items-center justify-center"
          >
            <Download size={15} />
          </button>

          {/* Refresh Live Zoho Button */}
          <button
            onClick={onRefresh}
            disabled={propsRefreshing || isLoading}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/25 hover:brightness-110 transition-all cursor-pointer flex items-center gap-2"
          >
            <RefreshCw size={13} className={propsRefreshing || isLoading ? 'animate-spin' : ''} />
            <span>Sync Zoho</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TARGET SIMULATOR DRAWER TOOL (EXPANDABLE) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showSimulator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-3xl bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 border border-amber-200/80 p-6 shadow-md overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <SlidersHorizontal size={16} />
                  <span>Interactive What-If Sales Quota Simulator</span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Model executive revenue growth and shortfall reduction by simulating a team-wide conversion lift.
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <span className="text-xs font-bold text-slate-700">Conversion Lift:</span>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={simulationBoost}
                    onChange={(e) => setSimulationBoost(Number(e.target.value))}
                    className="w-48 accent-amber-500 cursor-pointer"
                  />
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-black text-xs shadow-sm">
                    +{simulationBoost}%
                  </span>
                </div>
              </div>

              {/* Dynamic Recalculated Output Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-white/90 rounded-2xl border border-amber-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Simulated Revenue</p>
                  <p className="text-base font-black text-emerald-600 mt-0.5">
                    {formatCompactRupee(overallAchievement * (1 + simulationBoost / 100))}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                    +{formatCompactRupee(overallAchievement * (simulationBoost / 100))} lift
                  </p>
                </div>
                <div className="p-3.5 bg-white/90 rounded-2xl border border-amber-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Remaining Shortfall</p>
                  <p className="text-base font-black text-rose-600 mt-0.5">
                    {formatCompactRupee(Math.max(0, overallTarget - overallAchievement * (1 + simulationBoost / 100)))}
                  </p>
                  <p className="text-[10px] text-rose-600 font-bold mt-0.5">
                    -{formatCompactRupee(Math.min(overallShortfall, overallAchievement * (simulationBoost / 100)))} gap closed
                  </p>
                </div>
                <div className="p-3.5 bg-white/90 rounded-2xl border border-amber-200 shadow-sm col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Projected Quota</p>
                  <p className="text-base font-black text-indigo-700 mt-0.5">
                    {Math.min(100, Math.round(((overallAchievement * (1 + simulationBoost / 100)) / overallTarget) * 100))}%
                  </p>
                  <p className="text-[10px] text-indigo-600 font-bold mt-0.5">Target: {formatCompactRupee(overallTarget)}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 1. TOP EXECUTIVE REVENUE & GST STRIP (CRISP WHITE LIGHT THEME) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-5">
        {/* Card 1: Today's Revenue */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm">
                <DollarSign size={18} />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                Today Live
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Revenue</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                {formatRupee(todayRevenue)}
              </h3>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium relative z-10">
            <span>Booked: <strong className="text-slate-800">{formatCompactRupee(todayBooked)}</strong></span>
            <span>Deals: <strong className="text-indigo-600">{todayDeals.length}</strong></span>
          </div>
        </div>

        {/* Card 2: Monthly Revenue */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-emerald-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">
                <TrendingUp size={18} />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                October 2026
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Revenue</p>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight mt-1" title={formatRupee(monthlyRevenue)}>
                {formatRupee(monthlyRevenue)}
              </h3>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium relative z-10">
            <span>Booked: <strong className="text-slate-800">{formatCompactRupee(monthlyBooked)}</strong></span>
            <span>Deals: <strong className="text-emerald-700">{currentMonthDeals.length}</strong></span>
          </div>
        </div>

        {/* Card 3: With GST Amount */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-cyan-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className="p-3 rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-100 shadow-sm">
                <Receipt size={18} />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-100">
                Incl. 18% GST
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">With GST Amount</p>
              <h3 className="text-xl sm:text-2xl font-black text-cyan-600 tracking-tight mt-1 truncate" title={formatRupee(activeWithGst)}>
                {formatRupee(activeWithGst)}
              </h3>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium relative z-10">
            <span>GST Tax: <strong className="text-slate-800">{formatCompactRupee(activeGstTax)}</strong></span>
            <span>Gross: <strong className="text-cyan-700">{formatCompactRupee(activeWithGst)}</strong></span>
          </div>
        </div>

        {/* Card 4: Without GST Amount */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-blue-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
                <Calculator size={18} />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                Excl. GST (Base)
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Without GST Amount</p>
              <h3 className="text-xl sm:text-2xl font-black text-blue-600 tracking-tight mt-1 truncate" title={formatRupee(activeWithoutGst)}>
                {formatRupee(activeWithoutGst)}
              </h3>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium relative z-10">
            <span>Net Base: <strong className="text-slate-800">{formatCompactRupee(activeWithoutGst)}</strong></span>
            <span>Deals: <strong className="text-blue-700">{currentMonthDeals.length}</strong></span>
          </div>
        </div>

        {/* Card 5: Revenue Breakdown */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-amber-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 shadow-sm">
                <PieChartIcon size={18} />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                Rec vs Pend
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Breakdown</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <h3 className="text-lg sm:text-xl font-black text-emerald-600 tracking-tight">
                  {formatCompactRupee(totalReceivedAmount)}
                </h3>
                <span className="text-[11px] text-slate-400">/</span>
                <span className="text-sm font-bold text-rose-500">
                  {formatCompactRupee(totalPendingAmount)}
                </span>
              </div>
              {/* Visual Progress Bar */}
              <div className="w-full h-2 bg-slate-100 rounded-full mt-2.5 overflow-hidden flex">
                <div
                  style={{ width: `${totalBookedValue > 0 ? (totalReceivedAmount / totalBookedValue) * 100 : 50}%` }}
                  className="bg-emerald-500 h-full"
                  title="Received Ratio"
                />
                <div
                  style={{ width: `${totalBookedValue > 0 ? (totalPendingAmount / totalBookedValue) * 100 : 50}%` }}
                  className="bg-rose-400 h-full"
                  title="Pending Ratio"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium relative z-10">
            <span>Ratio: <strong className="text-slate-800">{totalBookedValue > 0 ? Math.round((totalReceivedAmount / totalBookedValue) * 100) : 0}%</strong></span>
            <span>Total: <strong className="text-slate-800">{formatCompactRupee(totalBookedValue)}</strong></span>
          </div>
        </div>

        {/* Card 6: Top High Performer & Branch */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-purple-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex justify-between items-start mb-3 relative z-10">
              <span className="p-3 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 shadow-sm">
                <Trophy size={18} />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
                National Leader
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top High Performer</p>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={topHighPerformer?.name}>
                {topHighPerformer ? topHighPerformer.name : 'Calculating...'}
              </h3>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium relative z-10">
            <span>Branch: <strong className="text-indigo-600">{topHighPerformer?.branch || topHighBranch?.name.split(' ')[0] || 'Ahmedabad'}</strong></span>
            <span>Rev: <strong className="text-emerald-600">{formatCompactRupee(topHighPerformer?.received || 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* GST Audit & Revenue Reconciliation Section */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="p-3.5 rounded-2xl bg-white/10 text-cyan-400 border border-white/10 backdrop-blur-md shrink-0">
              <Receipt size={24} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">GST Tax & Revenue Audit</h3>

              </div>

            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 shrink-0">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">With GST (Gross)</span>
              <span className="text-base sm:text-lg font-black text-cyan-400">{formatRupee(activeWithGst)}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">100% Total Quoted</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Without GST (Net Base)</span>
              <span className="text-base sm:text-lg font-black text-emerald-400">{formatRupee(activeWithoutGst)}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">~84.7% Base Value</span>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">GST Component (18%)</span>
              <span className="text-base sm:text-lg font-black text-amber-400">{formatRupee(activeGstTax)}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Tax Offset Collected</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. NEW INTERACTIVE VISUAL GRAPHS (PIE CHARTS) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Branch Revenue Share Donut Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <PieChartIcon size={16} className="text-indigo-600" />
                Branch Revenue Share
              </h3>
              <span className="text-xs font-bold text-slate-500">Regional Mix</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Real-time received revenue contribution across Ahmedabad, Jaipur & Chennai.
            </p>
          </div>

          <div className="h-48 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={branchPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {branchPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(val: any) => [formatRupee(Number(val)), 'Received Revenue']}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Total Rec.</span>
              <span className="text-base font-black text-slate-900">{formatCompactRupee(totalReceivedAmount)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-center">
            {branchPieData.map(b => (
              <div key={b.name} className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                  <span>{b.name}</span>
                </div>
                <p className="text-xs font-black text-slate-900 mt-1">{formatCompactRupee(b.value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Graph 2: Deal Stage Pipeline Composition Donut */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Layers size={16} className="text-cyan-600" />
                Pipeline Stage Distribution
              </h3>
              <span className="text-xs font-bold text-slate-500">{filteredDeals.length} Deals</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Volume of deals progressing through Sales, Account, Legal, Operations & Won.
            </p>
          </div>

          <div className="h-48 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stagePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {stagePieData.map((entry, index) => (
                    <Cell key={`stage-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(val: any) => [`${val} Deals`, 'Volume']}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Live Pipeline</span>
              <span className="text-base font-black text-slate-900">{filteredDeals.length}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-100 text-xs">
            {stagePieData.map(st => (
              <button
                key={st.name}
                onClick={() => {
                  const targetStage = stageStats.find(s => s.name.toLowerCase().includes(st.name.toLowerCase()) || st.fullName === s.name);
                  if (targetStage) {
                    setSelectedStageModal(targetStage);
                    setStageModalSearch('');
                  }
                }}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 px-2.5 py-1 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs group"
                title={`Click to view deals in ${st.fullName}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                <span>{st.name}: <strong className="group-hover:text-indigo-600">{st.value}</strong></span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MASTER TARGET & ACHIEVEMENT BAR VIEW (LIGHT THEME) */}
      {/* ========================================================================= */}
      <div className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-7 shadow-[0_4px_25px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Target size={18} className="text-indigo-600" />
              Target vs Achievement Overview (Entire Sales Team)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              National sales target benchmark vs. actual revenue received with shortfall gap.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Target: {formatCompactRupee(overallTarget)}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Achieved: {formatCompactRupee(overallAchievement)}
            </span>
            <span className="flex items-center gap-1.5 text-rose-600">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Shortfall: {formatCompactRupee(overallShortfall)}
            </span>
          </div>
        </div>

        {/* Master Comparison Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-slate-800">Full Sales Organization Progress</span>
            <span className="text-indigo-700 font-extrabold">{overallAchievementPct}% Achieved</span>
          </div>
          <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 flex">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallAchievementPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-400 rounded-full shadow-sm"
            />
          </div>
        </div>

        {/* Branch-by-Branch Breakdown Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
          {(salesTree.children?.[0]?.children || []).map((br: SalesTreeNode) => {
            const pct = br.target > 0 ? Math.min(100, Math.round((br.achievement / br.target) * 100)) : 0;
            return (
              <div key={br.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin size={13} className="text-indigo-600" />
                    {br.name}
                  </span>
                  <span className="text-emerald-700 font-black">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex mb-2">
                  <div style={{ width: `${pct}%` }} className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full" />
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500">
                  <span>Ach: <strong className="text-slate-800">{formatCompactRupee(br.achievement)}</strong></span>
                  <span>Shortfall: <strong className="text-rose-600">{formatCompactRupee(br.shortfall)}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. LIGHT THEME PROGRESSIVE CENTER-TO-LEFT MINDMAP FLOW */}
      {(() => {
        const itemStep = 36;
        const currentTms = activeTl?.tms || [];
        const tmCount = currentTms.length || 7;
        const canvasHeight = Math.max(620, tmCount * itemStep + 70);

        // Dynamic horizontal coordinates according to drillLevel
        // Center of the tree flow area (tree width ~800px, Inspector anchored on the right)
        // drillLevel: 0 = Heroic Center Constellation, 1 = Sales, 2 = 3 Branches, 3 = TLs, 4 = TMs
        const col0Left = drillLevel === 0 ? 320 : drillLevel === 1 ? 180 : drillLevel === 2 ? 75 : drillLevel === 3 ? 20 : 10;
        const orbSocketY = canvasHeight / 2;
        const x0 = drillLevel === 0 ? col0Left + 144 : drillLevel >= 3 ? col0Left + 85 : col0Left + 105;

        // Col 1: Sales Node
        const col1Width = 105;
        const col1Height = 44;
        const col1Left = drillLevel === 1 ? 380 : drillLevel === 2 ? 230 : drillLevel === 3 ? 145 : 120;
        const col1Right = col1Left + col1Width;
        const col1Top = orbSocketY - col1Height / 2;

        // Col 2: 3 Branches (Ahmedabad, Jaipur, Chennai)
        const col2Width = 135;
        const branchHeight = 44;
        const branchGap = 16;
        const totalBranchHeight = 3 * branchHeight + 2 * branchGap; // 164
        const col2StartY = (canvasHeight - totalBranchHeight) / 2;
        const col2Left = drillLevel === 2 ? 380 : drillLevel === 3 ? 275 : 245;
        const col2Right = col2Left + col2Width;
        const activeBranchCenterY = col2StartY + activeBranchIndex * (branchHeight + branchGap) + branchHeight / 2;

        // Col 3: TLs of Active Branch
        const currentTls = activeBranch?.tls || [];
        const tlCount = currentTls.length || 1;
        const tlHeight = 40;
        const tlGap = 12;
        const totalTlHeight = tlCount * tlHeight + (tlCount - 1) * tlGap;
        const col3StartY = (canvasHeight - totalTlHeight) / 2;
        const col3Width = 155;
        const col3Left = drillLevel === 3 ? 440 : 400;
        const col3Right = col3Left + col3Width;
        const activeTlCenterY = col3StartY + activeTlIndex * (tlHeight + tlGap) + tlHeight / 2;

        // Col 4: TMs of Active TL
        const col4Width = 185;
        const totalTmHeight = tmCount * itemStep;
        const col4StartY = Math.max(25, (canvasHeight - totalTmHeight) / 2);
        const col4Left = 575;

        // Inspector card metrics
        const isTl = activeInspectLevel === 'tl' || Boolean(inspectedEntity.personal && inspectedEntity.team);
        const personal = inspectedEntity.personal;
        const team = inspectedEntity.team;

        const currentDisplayTarget = (isTl && tlViewMode === 'personal') ? 400000 : (inspectedEntity.target || 0);
        const currentDisplayAchievement = (isTl && tlViewMode === 'personal' && personal)
          ? personal.received
          : (isTl && tlViewMode === 'team' && team)
            ? team.received
            : (inspectedEntity.achievement || 0);
        const currentDisplayBooked = (isTl && tlViewMode === 'personal' && personal)
          ? personal.bookedAmount
          : (isTl && tlViewMode === 'team' && team)
            ? team.bookedAmount
            : (inspectedEntity.bookedAmount || inspectedEntity.achievement || 0);
        const currentDisplayWon = (isTl && tlViewMode === 'personal' && personal)
          ? (personal.wonCount || personal.dealsCount || 0)
          : (isTl && tlViewMode === 'team' && team)
            ? (team.wonCount || team.dealsCount || 0)
            : (inspectedEntity.wonCount || inspectedEntity.dealsCount || 0);
        const currentDisplayShortfall = Math.max(0, currentDisplayTarget - currentDisplayAchievement);

        const sentimentRate = currentDisplayTarget > 0
          ? Math.min(150, Math.round((currentDisplayAchievement / currentDisplayTarget) * 100))
          : 0;
        const isSurplus = currentDisplayShortfall === 0;

        return (
          <div className="rounded-3xl bg-gradient-to-br from-white via-slate-50 to-indigo-50/20 border border-slate-200/90 p-5 sm:p-7 shadow-[0_4px_30px_rgba(0,0,0,0.03)] relative overflow-hidden">
            {/* Subtle light geometric grid */}
            <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-70 pointer-events-none" />

            {/* TOP HEADER BREADCRUMB NAVIGATION & RESET CONTROLS */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200/70">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <button
                  onClick={() => {
                    setDrillLevel(0);
                    setActiveInspectLevel('root');
                  }}
                  className={`hover:underline font-bold cursor-pointer flex items-center gap-1 ${drillLevel === 0 ? 'text-indigo-600 font-black' : 'text-slate-700'
                    }`}
                  title="Click to reset BharatEdge to center"
                >
                  <span>🌐 BharatEdge</span>
                </button>

                {drillLevel >= 1 && (
                  <>
                    <span className="text-slate-300">/</span>
                    <button
                      onClick={() => {
                        setDrillLevel(1);
                        setActiveInspectLevel('sales');
                      }}
                      className={`hover:underline cursor-pointer font-bold ${drillLevel === 1 ? 'text-indigo-600 font-black' : 'text-slate-700'
                        }`}
                    >
                      Sales
                    </button>
                  </>
                )}

                {drillLevel >= 2 && activeBranch && (
                  <>
                    <span className="text-slate-300">/</span>
                    <button
                      onClick={() => {
                        setDrillLevel(2);
                        setActiveInspectLevel('branch');
                      }}
                      className={`hover:underline cursor-pointer font-bold ${drillLevel === 2 ? 'text-amber-600 font-black' : 'text-slate-700'
                        }`}
                    >
                      {activeBranch.name}
                    </button>
                  </>
                )}

                {drillLevel >= 3 && activeTl && (
                  <>
                    <span className="text-slate-300">/</span>
                    <button
                      onClick={() => {
                        setDrillLevel(3);
                        setActiveInspectLevel('tl');
                      }}
                      className={`hover:underline cursor-pointer font-bold ${drillLevel === 3 ? 'text-cyan-600 font-black' : 'text-slate-700'
                        }`}
                    >
                      {activeTl.name}
                    </button>
                  </>
                )}

                {drillLevel >= 4 && activeTm && (
                  <>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-900 font-black">{activeTm.name}</span>
                  </>
                )}
              </div>

              {/* Quick Navigation & View Actions */}
              <div className="flex items-center gap-2">
                {drillLevel > 0 && (
                  <button
                    onClick={() => {
                      setDrillLevel(0);
                      setActiveInspectLevel('root');
                    }}
                    className="px-3 py-1 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    title="Center BharatEdge orb"
                  >
                    <RotateCcw size={11} className="text-slate-500" />
                    <span>Center BharatEdge</span>
                  </button>
                )}

                {drillLevel < 4 && (
                  <button
                    onClick={() => {
                      setDrillLevel(4);
                      setActiveInspectLevel('tm');
                    }}
                    className="px-3 py-1 rounded-xl text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    title="Expand all hierarchy levels"
                  >
                    <span>Expand All</span>
                    <ChevronRight size={11} />
                  </button>
                )}

                {drillLevel >= 2 && (
                  <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-2">
                    {branches.map(b => (
                      <button
                        key={b.id}
                        onClick={() => {
                          setSelectedBranchId(b.id);
                          setSelectedTlId(b.tls[0]?.id || '');
                          setSelectedTmId(b.tls[0]?.tms[0]?.id || '');
                          setDrillLevel(3);
                          setActiveInspectLevel('branch');
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${selectedBranchId === b.id
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ===================================================================== */}
            {/* MAIN PROGRESSIVE CANVAS (HORIZONTAL SVG FLOW + NODES + INSPECTOR PANEL) */}
            {/* ===================================================================== */}
            <div className="overflow-x-auto pb-4">
              <div
                className="relative transition-all duration-700 ease-out origin-top-left"
                style={{
                  minWidth: 1160,
                  height: canvasHeight
                }}
              >
                {/* Atmospheric Glow Highlights in Canvas Background */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
                <div className="absolute bottom-1/4 left-1/2 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

                {/* SVG CONNECTIONS LAYER */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ minWidth: 1160, height: canvasHeight }}
                >
                  <defs>
                    <linearGradient id="activeLightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="50%" stopColor="#0ea5e9" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                    <linearGradient id="fanLightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="50%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                    <marker id="arrowhead-indigo" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#6366f1" />
                    </marker>
                    <marker id="arrowhead-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#f59e0b" />
                    </marker>
                    <marker id="arrowhead-cyan" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="#0ea5e9" />
                    </marker>
                  </defs>

                  {/* Level 0 Branch Preview Dotted Curves */}
                  {drillLevel === 0 && branches.map((b, i) => {
                    const satY = orbSocketY + (i === 0 ? -75 : i === 1 ? 0 : 75);
                    const satX = 540;
                    const pathD = `M ${x0} ${orbSocketY} C ${x0 + 40} ${orbSocketY}, ${satX - 40} ${satY}, ${satX} ${satY}`;
                    return (
                      <g key={`sat_line_${b.id}`} className="transition-opacity duration-500">
                        <path
                          d={pathD}
                          stroke="#6366f1"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                          fill="none"
                          opacity={0.65}
                        />
                        <circle cx={satX} cy={satY} r={3.5} fill="#6366f1" />
                      </g>
                    );
                  })}

                  {/* 1. Curve: Logo -> Sales */}
                  {drillLevel >= 1 && (
                    <g className="transition-opacity duration-500">
                      <path
                        d={`M ${x0} ${orbSocketY} C ${x0 + (col1Left - x0) * 0.5} ${orbSocketY}, ${col1Left - (col1Left - x0) * 0.5} ${orbSocketY}, ${col1Left} ${orbSocketY}`}
                        stroke="#6366f1"
                        strokeWidth="2.5"
                        fill="none"
                        markerEnd="url(#arrowhead-indigo)"
                      />
                      <circle cx={x0} cy={orbSocketY} r={4.5} fill="#6366f1" />
                      <circle cx={col1Left} cy={orbSocketY} r={4} fill="#6366f1" />
                    </g>
                  )}

                  {/* 2. Curves: Sales -> 3 Branches */}
                  {drillLevel >= 2 && branches.map((b, i) => {
                    const branchCenterY = col2StartY + i * (branchHeight + branchGap) + branchHeight / 2;
                    const isBranchActive = i === activeBranchIndex;
                    const dx = (col2Left - col1Right) * 0.5;
                    const pathD = `M ${col1Right} ${orbSocketY} C ${col1Right + dx} ${orbSocketY}, ${col2Left - dx} ${branchCenterY}, ${col2Left} ${branchCenterY}`;

                    return (
                      <g key={b.id} className="transition-opacity duration-500">
                        <path
                          d={pathD}
                          stroke={isBranchActive ? 'url(#activeLightGrad)' : '#cbd5e1'}
                          strokeWidth={isBranchActive ? 2.5 : 1.5}
                          fill="none"
                          opacity={isBranchActive ? 1 : 0.65}
                          markerEnd={isBranchActive ? "url(#arrowhead-amber)" : undefined}
                        />
                        <circle
                          cx={col2Left}
                          cy={branchCenterY}
                          r={isBranchActive ? 4 : 2.5}
                          fill={isBranchActive ? '#f59e0b' : '#94a3b8'}
                        />
                      </g>
                    );
                  })}
                  {drillLevel >= 2 && <circle cx={col1Right} cy={orbSocketY} r={4.5} fill="#f59e0b" />}

                  {/* 3. Curves: Active Branch -> TLs */}
                  {drillLevel >= 3 && currentTls.map((tl, t) => {
                    const tlCenterY = col3StartY + t * (tlHeight + tlGap) + tlHeight / 2;
                    const isTlActive = t === activeTlIndex;
                    const dx = (col3Left - col2Right) * 0.5;
                    const pathD = `M ${col2Right} ${activeBranchCenterY} C ${col2Right + dx} ${activeBranchCenterY}, ${col3Left - dx} ${tlCenterY}, ${col3Left} ${tlCenterY}`;

                    return (
                      <g key={tl.id} className="transition-opacity duration-500">
                        <path
                          d={pathD}
                          stroke={isTlActive ? 'url(#fanLightGrad)' : '#cbd5e1'}
                          strokeWidth={isTlActive ? 2.5 : 1.5}
                          fill="none"
                          opacity={isTlActive ? 1 : 0.65}
                          markerEnd={isTlActive ? "url(#arrowhead-cyan)" : undefined}
                        />
                        <circle
                          cx={col3Left}
                          cy={tlCenterY}
                          r={isTlActive ? 4 : 2.5}
                          fill={isTlActive ? '#0ea5e9' : '#94a3b8'}
                        />
                      </g>
                    );
                  })}
                  {drillLevel >= 3 && <circle cx={col2Right} cy={activeBranchCenterY} r={4.5} fill="#f59e0b" />}

                  {/* 4. Curves: Active TL -> TMs */}
                  {drillLevel >= 4 && currentTms.map((tm, k) => {
                    const tmCenterY = col4StartY + k * itemStep + 15;
                    const isTmActive = activeTm?.id === tm.id;
                    const dx = (col4Left - col3Right) * 0.5;
                    const pathD = `M ${col3Right} ${activeTlCenterY} C ${col3Right + dx} ${activeTlCenterY}, ${col4Left - dx} ${tmCenterY}, ${col4Left} ${tmCenterY}`;

                    return (
                      <g key={tm.id} className="transition-opacity duration-500">
                        <path
                          d={pathD}
                          stroke={isTmActive ? '#0ea5e9' : '#cbd5e1'}
                          strokeWidth={isTmActive ? 2.2 : 1.2}
                          fill="none"
                          opacity={isTmActive ? 1 : 0.6}
                        />
                        <circle
                          cx={col4Left}
                          cy={tmCenterY}
                          r={isTmActive ? 4 : 2}
                          fill={isTmActive ? '#0ea5e9' : '#94a3b8'}
                        />
                      </g>
                    );
                  })}
                  {drillLevel >= 4 && <circle cx={col3Right} cy={activeTlCenterY} r={4.5} fill="#0ea5e9" />}
                </svg>

                {/* ================================================================= */}
                {/* LEVEL 0 BRANCH PREVIEW SATELLITES (NEVER AN EMPTY VOID) */}
                {/* ================================================================= */}
                {drillLevel === 0 && (
                  <div className="absolute space-y-3 z-10" style={{ left: 540, top: orbSocketY - 95 }}>
                    {branches.map(b => (
                      <div
                        key={`sat_node_${b.id}`}
                        onClick={() => {
                          setSelectedBranchId(b.id);
                          setSelectedTlId(b.tls[0]?.id || '');
                          setSelectedTmId(b.tls[0]?.tms[0]?.id || '');
                          setDrillLevel(3);
                          setActiveInspectLevel('branch');
                        }}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-white/95 hover:bg-slate-50 border border-indigo-100 hover:border-indigo-400 shadow-sm hover:shadow-md transition-all cursor-pointer group w-52"
                      >
                        <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                          {b.name} Branch
                        </span>
                        <span className="text-xs font-black text-emerald-600">
                          {formatCompactRupee(b.achievement)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ================================================================= */}
                {/* COLUMN 0: BHARATEDGE LOGO ORB (HEROIC CENTER -> GLIDES LEFT) */}
                {/* ================================================================= */}
                <div
                  onClick={() => {
                    if (drillLevel === 0) {
                      setDrillLevel(1);
                      setActiveInspectLevel('sales');
                    } else {
                      setActiveInspectLevel('root');
                    }
                  }}
                  className="absolute cursor-pointer group flex flex-col items-center justify-center z-10"
                  style={{
                    left: col0Left,
                    top: drillLevel === 0 ? orbSocketY - 95 : orbSocketY - 45,
                    width: drillLevel === 0 ? 144 : 90,
                    transition: 'all 0.65s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                  title={drillLevel === 0 ? "Click to open Sales division" : "Click to inspect BharatEdge Enterprise Overview"}
                >
                  {/* Glowing Ambient Atmospheric Halo */}
                  <div
                    className={`absolute rounded-full bg-gradient-to-tr from-indigo-500/25 via-purple-500/20 to-cyan-400/25 blur-2xl pointer-events-none transition-all duration-700 ${drillLevel === 0 ? 'w-48 h-48 -top-3 animate-pulse' : 'w-24 h-24 top-0 opacity-40'
                      }`}
                  />

                  {/* Outer Concentric Planetary Rings (active at Level 0) */}
                  {drillLevel === 0 && (
                    <>
                      <div className="absolute w-44 h-44 rounded-full border border-dashed border-indigo-300/70 animate-[spin_35s_linear_infinite] pointer-events-none" />
                      <div className="absolute w-36 h-36 rounded-full border border-cyan-400/60 animate-[spin_18s_linear_infinite_reverse] pointer-events-none">
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-cyan-500 rounded-full shadow-[0_0_8px_#06b6d4]" />
                      </div>
                    </>
                  )}

                  {/* Core Glass Sphere */}
                  <div
                    className={`relative rounded-full bg-white/95 backdrop-blur-xl border-2 border-indigo-200/90 shadow-[0_15px_45px_rgba(99,102,241,0.22)] flex items-center justify-center group-hover:scale-105 group-hover:border-indigo-400 group-hover:shadow-[0_20px_55px_rgba(99,102,241,0.35)] transition-all duration-300 ${drillLevel === 0 ? 'w-28 h-28 p-3' : 'w-20 h-20 p-2'
                      }`}
                  >
                    <img
                      src="/logo.png"
                      alt="BharatEdge"
                      className="w-full h-full object-contain relative z-10 drop-shadow-sm select-none"
                    />
                  </div>

                  {/* Rich Floating Badges & Action Buttons (Hero Level 0) */}
                  {drillLevel === 0 ? (
                    <div className="flex flex-col items-center mt-3 space-y-2 pointer-events-auto">
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/95 border border-indigo-200 text-indigo-900 shadow-sm flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>Enterprise HQ • ₹1.33 Cr</span>
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrillLevel(2);
                          setActiveInspectLevel('sales');
                        }}
                        className="px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-700 to-cyan-600 text-white font-extrabold text-[11px] shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Sparkles size={12} className="text-amber-300" />
                        <span>Explore Sales Network</span>
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black text-slate-500 mt-1 whitespace-nowrap tracking-wider uppercase">
                      HQ
                    </span>
                  )}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 1: SALES NODE (APPEARS AT LEVEL >= 1, CLICKS TO OPEN BRANCHES) */}
                {/* ================================================================= */}
                <div
                  onClick={() => {
                    if (drillLevel === 1) {
                      setDrillLevel(2);
                      setActiveInspectLevel('branch');
                    } else {
                      setActiveInspectLevel('sales');
                    }
                  }}
                  className={`absolute rounded-2xl px-3.5 py-2 cursor-pointer flex items-center justify-between gap-2 shadow-sm ${activeInspectLevel === 'sales'
                    ? 'bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-600 shadow-md text-indigo-950'
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  style={{
                    left: col1Left,
                    top: col1Top,
                    width: col1Width,
                    height: col1Height,
                    transition: 'all 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: drillLevel >= 1 ? 1 : 0,
                    pointerEvents: drillLevel >= 1 ? 'auto' : 'none',
                    transform: drillLevel >= 1 ? 'scale(1)' : 'scale(0.85)'
                  }}
                  title={drillLevel === 1 ? "Click to open Branches" : "Click to inspect National Sales"}
                >
                  <span className="text-sm font-black tracking-tight">Sales</span>
                  <span className="text-xs font-black text-emerald-600">
                    {formatCompactRupee(salesDept.achievement)}
                  </span>

                  {/* Indicator when at level 1 to invite opening branches */}
                  {drillLevel === 1 && (
                    <span className="absolute -right-2 -top-2 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 text-[9px] font-black text-white items-center justify-center">3</span>
                    </span>
                  )}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 2: 3 BRANCHES ONLY (APPEARS AT LEVEL >= 2, CLICKS TO OPEN TLS) */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-4"
                  style={{
                    left: col2Left,
                    top: col2StartY,
                    width: col2Width,
                    transition: 'all 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: drillLevel >= 2 ? 1 : 0,
                    pointerEvents: drillLevel >= 2 ? 'auto' : 'none',
                    transform: drillLevel >= 2 ? 'scale(1)' : 'scale(0.85)'
                  }}
                >
                  {branches.map((b, i) => {
                    const isBranchActive = i === activeBranchIndex;

                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          setSelectedBranchId(b.id);
                          setSelectedTlId(b.tls[0]?.id || '');
                          setSelectedTmId(b.tls[0]?.tms[0]?.id || '');
                          setDrillLevel(3);
                          setActiveInspectLevel('branch');
                        }}
                        className={`rounded-2xl px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-2 shadow-sm transition-all duration-300 ${isBranchActive
                          ? 'bg-gradient-to-r from-amber-50 to-orange-50/70 border-2 border-amber-500 shadow-md text-slate-900'
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                          }`}
                        style={{ height: branchHeight }}
                        title={`Click to view ${b.name} Team Leaders`}
                      >
                        <span className="text-xs font-black tracking-tight">{b.name}</span>
                        <span className={`text-xs font-black ${isBranchActive ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {formatCompactRupee(b.achievement)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 3: TLS ONLY OF ACTIVE BRANCH (APPEARS AT LEVEL >= 3, CLICKS TO OPEN TMS) */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-3.5"
                  style={{
                    left: col3Left,
                    top: col3StartY,
                    width: col3Width,
                    transition: 'all 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: drillLevel >= 3 ? 1 : 0,
                    pointerEvents: drillLevel >= 3 ? 'auto' : 'none',
                    transform: drillLevel >= 3 ? 'scale(1)' : 'scale(0.85)'
                  }}
                >
                  {currentTls.map((tl, t) => {
                    const isTlActive = t === activeTlIndex;

                    return (
                      <div
                        key={tl.id}
                        onClick={() => {
                          setSelectedTlId(tl.id);
                          setSelectedTmId(tl.tms[0]?.id || '');
                          setDrillLevel(4);
                          setActiveInspectLevel('tl');
                        }}
                        className={`rounded-2xl px-3 py-2 cursor-pointer flex items-center justify-between gap-2 shadow-sm transition-all duration-300 ${isTlActive
                          ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-500 shadow-md text-slate-900'
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                          }`}
                        style={{ height: tlHeight }}
                        title={`Click to view ${tl.name} Team Members`}
                      >
                        <span className="text-xs font-bold truncate max-w-[95px]" title={tl.name}>
                          {tl.name}
                        </span>
                        <span className={`text-xs font-black ${isTlActive ? 'text-cyan-700' : 'text-emerald-600'}`}>
                          {formatCompactRupee(tl.achievement)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 4: TMS ONLY OF ACTIVE TL (APPEARS AT LEVEL >= 4) */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-2"
                  style={{
                    left: col4Left,
                    top: col4StartY,
                    width: col4Width,
                    transition: 'all 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: drillLevel >= 4 ? 1 : 0,
                    pointerEvents: drillLevel >= 4 ? 'auto' : 'none',
                    transform: drillLevel >= 4 ? 'scale(1)' : 'scale(0.85)'
                  }}
                >
                  {currentTms.map((tm) => {
                    const isTmActive = activeTm?.id === tm.id;

                    return (
                      <div
                        key={tm.id}
                        onClick={() => {
                          setSelectedTmId(tm.id);
                          setActiveInspectLevel('tm');
                        }}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-200 ${isTmActive
                          ? 'bg-cyan-50 border-2 border-cyan-500 text-cyan-950 font-bold shadow-sm'
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-xs'
                          }`}
                        style={{ height: 30 }}
                      >
                        <span className="text-xs font-bold truncate max-w-[110px]" title={tm.name}>
                          {tm.name}
                        </span>
                        <span className="text-[11px] font-black text-slate-700">
                          {formatCompactRupee(tm.achievement)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 5: SLEEK INSPECTOR PANEL (ALWAYS ON RIGHT SIDE) */}
                {/* ================================================================= */}
                <div
                  className="absolute rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_10px_40px_rgba(0,0,0,0.06)] p-5 overflow-y-auto flex flex-col justify-start space-y-3.5 z-20"
                  style={{
                    right: 15,
                    top: 15,
                    width: 330,
                    bottom: 15
                  }}
                >
                  {/* Header */}
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-snug truncate" title={inspectedEntity.name}>
                      {inspectedEntity.name}
                    </h3>
                  </div>

                  {/* TL View Mode Toggle Pills (Personal vs Team) */}
                  {isTl && (
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        onClick={() => setTlViewMode('personal')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${tlViewMode === 'personal'
                          ? 'bg-white text-blue-900 shadow-xs ring-1 ring-blue-200'
                          : 'text-slate-500 hover:text-slate-800'
                          }`}
                      >
                        <User size={12} className={tlViewMode === 'personal' ? 'text-blue-600' : 'text-slate-400'} />
                        <span>Personal</span>
                      </button>
                      <button
                        onClick={() => setTlViewMode('team')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${tlViewMode === 'team'
                          ? 'bg-white text-cyan-900 shadow-xs ring-1 ring-cyan-200'
                          : 'text-slate-500 hover:text-slate-800'
                          }`}
                      >
                        <Users size={12} className={tlViewMode === 'team' ? 'text-cyan-600' : 'text-slate-400'} />
                        <span>Team</span>
                      </button>
                    </div>
                  )}

                  {/* Sentiment Rate Card */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
                      <span>Sentiment / Achievement Rate</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${sentimentRate >= 100
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : sentimentRate >= 50
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                        {sentimentRate >= 100 ? 'High' : sentimentRate >= 50 ? 'Moderate' : 'Needs Focus'}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl font-black text-slate-900">
                          {sentimentRate}%
                        </span>
                        <span className={`text-[11px] font-bold flex items-center gap-0.5 ${isSurplus ? 'text-emerald-600' : 'text-rose-500'
                          }`}>
                          {isSurplus ? '+12% Target met' : '-4% Last month'}
                        </span>
                      </div>

                      {/* Equalizer Waveform Bars */}
                      <div className="flex items-end gap-[2px] h-8 pb-1">
                        {waveformBars.slice(0, 18).map((h, bIdx) => (
                          <span
                            key={bIdx}
                            style={{ height: `${h}%` }}
                            className={`w-1 rounded-full transition-all ${bIdx >= 8 && bIdx <= 15
                              ? 'bg-amber-500 shadow-sm'
                              : 'bg-slate-300'
                              }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 2x2 Core Metric Tiles */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-blue-50/70 border border-blue-100">
                      <div className="flex items-center gap-1 text-[10px] text-blue-700 font-bold">
                        <CheckCircle2 size={11} className="text-blue-600" />
                        <span>Deals Won</span>
                      </div>
                      <p className="text-base font-black text-blue-950 mt-0.5">
                        {currentDisplayWon}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-purple-50/70 border border-purple-100">
                      <div className="flex items-center gap-1 text-[10px] text-purple-700 font-bold">
                        <FileText size={11} className="text-purple-600" />
                        <span>Quoted Value</span>
                      </div>
                      <p className="text-base font-black text-purple-950 mt-0.5">
                        {formatCompactRupee(currentDisplayBooked)}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                      <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                        <Sparkles size={11} className="text-emerald-600" />
                        <span>Received</span>
                      </div>
                      <p className="text-base font-black text-emerald-800 mt-0.5">
                        {formatCompactRupee(currentDisplayAchievement)}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-rose-50/70 border border-rose-100">
                      <div className="flex items-center gap-1 text-[10px] text-rose-700 font-bold">
                        <Target size={11} className="text-rose-600" />
                        <span>Shortfall Gap</span>
                      </div>
                      <p className="text-base font-black text-rose-800 mt-0.5">
                        {formatCompactRupee(currentDisplayShortfall)}
                      </p>
                    </div>
                  </div>

                  {/* Regional Branch Hubs (Shown when viewing Organization or Sales overview) */}
                  {(activeInspectLevel === 'root' || activeInspectLevel === 'sales') && (
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="text-xs font-black text-slate-700 flex items-center justify-between">
                        <span>Regional Branch Hubs</span>
                        <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full">3 Branches</span>
                      </div>
                      <div className="space-y-2">
                        {branches.map(b => (
                          <div
                            key={b.id}
                            onClick={() => {
                              setSelectedBranchId(b.id);
                              setSelectedTlId(b.tls[0]?.id || '');
                              setSelectedTmId(b.tls[0]?.tms[0]?.id || '');
                              setDrillLevel(3);
                              setActiveInspectLevel('branch');
                            }}
                            className="p-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 shadow-xs hover:border-indigo-300 transition-all cursor-pointer flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500/10 to-cyan-500/10 text-indigo-600 flex items-center justify-center font-black text-xs border border-indigo-100">
                                {b.name[0]}
                              </span>
                              <div>
                                <h5 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                  {b.name} Branch
                                </h5>
                                <p className="text-[10px] text-slate-500 font-medium">
                                  {b.tls.length} TLs • {b.tls.reduce((acc, t) => acc + t.tms.length, 0)} TMs
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-emerald-700 block">
                                {formatCompactRupee(b.achievement)}
                              </span>
                              <span className="text-[9px] font-bold text-indigo-600 flex items-center justify-end gap-0.5 group-hover:translate-x-0.5 transition-transform">
                                <span>Explore</span>
                                <ChevronRight size={10} />
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TL DUAL BREAKDOWN: PERSONAL VS TEAM */}
                  {isTl && personal && team && (
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      {/* 1. Personal Records Card */}
                      <div
                        onClick={() => setTlViewMode('personal')}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer ${tlViewMode === 'personal'
                          ? 'bg-blue-50/95 border-blue-400 ring-2 ring-blue-200 shadow-sm'
                          : 'bg-gradient-to-r from-blue-50/60 to-indigo-50/30 border-blue-200/70 hover:bg-blue-50/80'
                          }`}
                      >
                        <div className="flex items-center justify-between text-xs font-black text-blue-950 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <User size={13} className="text-blue-600" />
                            <span>Personal Records (Self)</span>
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            {personal.wonCount || personal.dealsCount || 0} Won
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/90 p-2 rounded-xl border border-blue-100 shadow-xs">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Received</span>
                            <span className="text-sm font-black text-emerald-700">
                              {formatCompactRupee(personal.received)}
                            </span>
                          </div>
                          <div className="bg-white/90 p-2 rounded-xl border border-blue-100 shadow-xs">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Quoted</span>
                            <span className="text-sm font-black text-slate-800">
                              {formatCompactRupee(personal.bookedAmount)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Team Records Card */}
                      <div
                        onClick={() => setTlViewMode('team')}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer ${tlViewMode === 'team'
                          ? 'bg-cyan-50/95 border-cyan-400 ring-2 ring-cyan-200 shadow-sm'
                          : 'bg-gradient-to-r from-cyan-50/60 to-teal-50/30 border-cyan-200/70 hover:bg-cyan-50/80'
                          }`}
                      >
                        <div className="flex items-center justify-between text-xs font-black text-cyan-950 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <Users size={13} className="text-cyan-700" />
                            <span>Team Records ({team.membersCount || currentTms.length} Members)</span>
                          </span>
                          <span className="text-[10px] font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded-full">
                            {team.wonCount || team.dealsCount || 0} Won
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/90 p-2 rounded-xl border border-cyan-100 shadow-xs">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Received</span>
                            <span className="text-sm font-black text-emerald-700">
                              {formatCompactRupee(team.received)}
                            </span>
                          </div>
                          <div className="bg-white/90 p-2 rounded-xl border border-cyan-100 shadow-xs">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Quoted</span>
                            <span className="text-sm font-black text-slate-800">
                              {formatCompactRupee(team.bookedAmount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 5. DEAL PIPELINE VIEW STAGES & SALES FUNNEL (LIGHT THEME) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deal Pipeline View Stages */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-7 shadow-[0_4px_25px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                Deal Pipeline View Stages
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Live deals distributed across operational workflow stages.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
              {filteredDeals.length} Deals
            </span>
          </div>

          <div className="space-y-3">
            {stageStats.map(st => (
              <div
                key={st.name}
                onClick={() => {
                  setSelectedStageModal(st);
                  setStageModalSearch('');
                }}
                className="p-3.5 rounded-2xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 hover:border-indigo-400 hover:shadow-md cursor-pointer flex items-center justify-between transition-all group active:scale-[0.99]"
                title={`Click to view all ${st.count} deals in ${st.name}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3.5 h-3.5 rounded-full ${st.color} group-hover:scale-125 transition-transform shrink-0`} />
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                      <span>{st.name}</span>
                      <Eye size={12} className="opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Total Quoted: {formatCompactRupee(st.amount)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-black text-slate-900 group-hover:text-indigo-700 transition-colors block">{st.count} Deals</span>
                    <p className="text-[11px] font-bold text-emerald-600">
                      Rec: {formatCompactRupee(st.received)}
                    </p>
                  </div>
                  <span className="p-1 rounded-lg bg-white group-hover:bg-indigo-100 text-slate-400 group-hover:text-indigo-600 transition-all">
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales Funnel */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-7 shadow-[0_4px_25px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-cyan-600" />
                Executive Sales Funnel
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Conversion drop-off from initial quote to closed won delivery.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-50 text-cyan-700 border border-cyan-100">
              Conversion
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {[
              { stage: '1. Quotations Generated', count: Math.max(liveQuotations.length, filteredDeals.length * 2), color: 'bg-blue-500', pct: 100, deals: [] },
              { stage: '2. Deal Contracts Booked', count: filteredDeals.length, color: 'bg-indigo-500', pct: Math.round((filteredDeals.length / Math.max(1, liveQuotations.length)) * 100), deals: filteredDeals },
              { stage: '3. Accounts Verified', count: filteredDeals.filter(d => isDealPaymentVerified(d)).length, color: 'bg-purple-500', pct: Math.round((filteredDeals.filter(d => isDealPaymentVerified(d)).length / Math.max(1, filteredDeals.length)) * 100), deals: filteredDeals.filter(d => isDealPaymentVerified(d)) },
              { stage: '4. Legal / Operations', count: filteredDeals.filter(d => !String(d.stage || '').toLowerCase().includes('sales')).length, color: 'bg-cyan-500', pct: 75, deals: filteredDeals.filter(d => !String(d.stage || '').toLowerCase().includes('sales')) },
              { stage: '5. Closed Won Delivery', count: filteredDeals.filter(d => String(d.stage || '').toLowerCase().includes('won')).length, color: 'bg-emerald-500', pct: 45, deals: filteredDeals.filter(d => String(d.stage || '').toLowerCase().includes('won')) }
            ].map(fn => (
              <div
                key={fn.stage}
                onClick={() => {
                  if (fn.deals.length > 0) {
                    setSelectedStageModal({
                      name: fn.stage,
                      color: fn.color,
                      count: fn.deals.length,
                      amount: fn.deals.reduce((s, d) => s + getDealTotalAmount(d), 0),
                      received: fn.deals.reduce((s, d) => s + getDealReceivedAmount(d), 0),
                      deals: fn.deals
                    });
                    setStageModalSearch('');
                  }
                }}
                className={`space-y-1 p-1.5 rounded-xl transition-all ${fn.deals.length > 0 ? 'cursor-pointer hover:bg-indigo-50/40 group' : ''}`}
                title={fn.deals.length > 0 ? `Click to inspect ${fn.deals.length} deals in ${fn.stage}` : ''}
              >
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                    <span>{fn.stage}</span>
                    {fn.deals.length > 0 && <Eye size={11} className="opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />}
                  </span>
                  <span className="text-slate-900">{fn.count} Records ({fn.pct}%)</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(5, fn.pct))}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full ${fn.color} rounded-full`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. TOP SELLING SERVICES & BDM MATRIX TABLE (LIGHT THEME) */}
      {/* ========================================================================= */}
      <div className="space-y-6">
        {/* Top Selling Services Strip (Sleek Apple/Linear Executive Cards) */}
        {(() => {
          const maxRevenue = topServices[0]?.received || 1;
          const totalRevenue = topServices.reduce((sum, s) => sum + s.received, 0);
          const totalDeals = topServices.reduce((sum, s) => sum + s.count, 0);

          const formatServiceName = (name: string) => {
            if (!name) return 'Business Advisory';
            const upper = name.toUpperCase().trim();
            if (upper === 'CGSS') return 'CGSS Scheme';
            if (upper === 'GEM REGISTRATION') return 'GeM Portal Registration';
            if (upper === 'ISO CERTIFICATE') return 'ISO Certification';
            if (upper === 'SEED SUPPORT SCHEME') return 'Seed Support Scheme';
            if (upper === 'GUJARAT SAMRIDDHI YOJANA') return 'Gujarat Samriddhi Yojana';
            if (upper === 'STARTUP INDIA CERTIFICATE') return 'Startup India Certificate';
            return name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          };

          const getServiceMeta = (name: string, idx: number) => {
            const upper = (name || '').toUpperCase();
            if (upper.includes('GENERAL')) {
              return {
                icon: Briefcase,
                iconGrad: 'from-blue-600 to-indigo-600',
                badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
                tag: 'Core Consulting'
              };
            }
            if (upper.includes('ADVISORY') || upper.includes('BUSINESS')) {
              return {
                icon: Compass,
                iconGrad: 'from-indigo-600 to-purple-600',
                badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                tag: 'Business Strategy'
              };
            }
            if (upper.includes('STARTUP') || upper.includes('CERTIFICATE') || upper.includes('ISO')) {
              return {
                icon: Award,
                iconGrad: 'from-amber-500 to-orange-600',
                badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
                tag: 'Certification'
              };
            }
            if (upper.includes('GEM') || upper.includes('REGISTRATION')) {
              return {
                icon: Building2,
                iconGrad: 'from-cyan-600 to-teal-600',
                badgeBg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
                tag: 'Govt E-Market'
              };
            }
            if (upper.includes('SCHEME') || upper.includes('YOJANA') || upper.includes('CGSS') || upper.includes('SEED')) {
              return {
                icon: Zap,
                iconGrad: 'from-emerald-600 to-teal-600',
                badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                tag: 'Subsidy & Grants'
              };
            }
            return {
              icon: Sparkles,
              iconGrad: 'from-purple-600 to-indigo-600',
              badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
              tag: 'Enterprise'
            };
          };

          return (
            <div className="rounded-3xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-[0_4px_30px_rgba(0,0,0,0.03)] relative overflow-hidden">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shadow-xs">
                      <Sparkles size={18} />
                    </span>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      Top Selling Services & Schemes
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    Real-time revenue contribution and deal volume across BharatEdge core business verticals.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="px-3.5 py-1.5 rounded-2xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
                    Total: <strong className="font-black text-emerald-700">{formatCompactRupee(totalRevenue)}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-2xl text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-xs">
                    {totalDeals} Deals
                  </span>
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {topServices.map((srv, idx) => {
                  const meta = getServiceMeta(srv.name, idx);
                  const SrvIcon = meta.icon;
                  const pctOfTop = Math.min(100, Math.round((srv.received / maxRevenue) * 100));
                  const avgTicket = srv.count > 0 ? Math.round(srv.received / srv.count) : 0;
                  const isTop1 = idx === 0;

                  return (
                    <motion.div
                      key={srv.name}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.2 }}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between group ${isTop1
                        ? 'bg-gradient-to-br from-amber-50/50 via-white to-orange-50/20 border-amber-300 shadow-md shadow-amber-500/5 ring-1 ring-amber-200/60'
                        : 'bg-white hover:bg-slate-50/50 border-slate-200/80 hover:border-indigo-300 shadow-xs hover:shadow-md'
                        }`}
                    >
                      <div>
                        {/* Card Top Row: Rank Badge & Category */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${idx === 0
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs'
                                : idx === 1
                                  ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-xs'
                                  : idx === 2
                                    ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-700 font-bold'
                                }`}
                            >
                              #{idx + 1}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${meta.badgeBg}`}>
                              {meta.tag}
                            </span>
                          </div>

                          <span className="text-[11px] font-black text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-md">
                            {srv.count} deals
                          </span>
                        </div>

                        {/* Service Title */}
                        <div className="flex items-start gap-2.5 mb-3">
                          <span
                            className={`p-2 rounded-xl bg-gradient-to-tr ${meta.iconGrad} text-white shadow-xs shrink-0 mt-0.5`}
                          >
                            <SrvIcon size={14} />
                          </span>
                          <h4
                            className="text-xs sm:text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-tight"
                            title={srv.name}
                          >
                            {formatServiceName(srv.name)}
                          </h4>
                        </div>
                      </div>

                      {/* Revenue & Avg Ticket */}
                      <div className="space-y-2.5 pt-3 border-t border-slate-100">
                        <div className="flex items-baseline justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                              Received
                            </span>
                            <span className="text-base sm:text-lg font-black text-emerald-700 tracking-tight">
                              {formatCompactRupee(srv.received)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                              Avg Ticket
                            </span>
                            <span className="text-xs font-black text-slate-700">
                              {formatCompactRupee(avgTicket)}
                            </span>
                          </div>
                        </div>

                        {/* Relative Share Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <div
                              style={{ width: `${pctOfTop}%` }}
                              className={`h-full rounded-full bg-gradient-to-r ${meta.iconGrad}`}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                            <span>Share of #1</span>
                            <span className="text-slate-600">{pctOfTop}%</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* BDM Matrix Table (Aesthetic Modern Executive Table) */}
        <div className="rounded-3xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
          {/* Header with Title and Global Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-5 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-600/20">
                <Users size={18} />
              </span>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>BDM Performance Matrix</span>

                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Individual Business Development Manager targets, revenue achievement, and shortfall gaps.
                </p>
              </div>
            </div>

            {/* Action Controls & Search */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  placeholder="Search BDM, TL, Branch, Service..."
                  className="pl-9 pr-8 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all w-64 font-medium shadow-xs"
                />
                {matrixSearch && (
                  <button
                    onClick={() => setMatrixSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={handleExportCsv}
                className="px-4 py-2 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-xs hover:shadow-sm"
              >
                <Download size={13} className="text-indigo-600" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Quick Filter Tabs Strip */}
          {(() => {
            const rawTotal = rawBdmList.length;
            const metCount = rawBdmList.filter(b => b.shortfall === 0).length;
            const progressCount = rawBdmList.filter(b => b.pct >= 50 && b.shortfall > 0).length;
            const gapCount = rawBdmList.filter(b => b.pct < 50).length;

            return (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl">
                  {[
                    { key: 'all', label: `All BDMs (${rawTotal})` },
                    { key: 'met', label: `Quota Met (${metCount})` },
                    { key: 'progress', label: `In Progress (${progressCount})` },
                    { key: 'gap', label: `Under Target (${gapCount})` },
                    { key: 'ahmedabad', label: 'Ahmedabad' },
                    { key: 'jaipur', label: 'Jaipur' },
                    { key: 'chennai', label: 'Chennai' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setMatrixFilter(tab.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${matrixFilter === tab.key
                        ? 'bg-white text-indigo-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="text-xs font-bold text-slate-500">
                  Showing <strong className="text-slate-900">{bdmList.length}</strong> of {rawTotal} BDMs
                </div>
              </div>
            );
          })()}

          {/* Aesthetic Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/90 text-slate-500 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">BDM Profile</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Team Leader</th>
                  <th className="px-5 py-3.5 text-center">Deals Created</th>
                  <th className="px-5 py-3.5 text-right">Target</th>
                  <th className="px-5 py-3.5 text-right">Revenue Achieved</th>
                  <th className="px-5 py-3.5 text-right">Shortfall</th>
                  <th className="px-5 py-3.5 text-center min-w-[125px]">Target Progress</th>
                  <th className="px-5 py-3.5">Top Selling Service</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium bg-white">
                {bdmList.map(bdm => {
                  const initials = bdm.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('');
                  const isMet = bdm.shortfall === 0;

                  return (
                    <tr key={bdm.id} className="hover:bg-indigo-50/30 transition-colors group">
                      {/* 1. BDM Profile */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <span
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black shadow-2xs ${isMet
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : bdm.pct >= 50
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                            >
                              {initials}
                            </span>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${isMet ? 'bg-emerald-500' : bdm.pct >= 50 ? 'bg-amber-500' : 'bg-slate-300'
                                }`}
                            />
                          </div>
                          <div>
                            <h5 className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors text-xs">
                              {bdm.name}
                            </h5>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Business Development Manager
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Branch */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${bdm.branch.toLowerCase().includes('ahmedabad')
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : bdm.branch.toLowerCase().includes('jaipur')
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                            }`}
                        >
                          {bdm.branch}
                        </span>
                      </td>

                      {/* 3. Team Leader */}
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <User size={12} className="text-slate-400" />
                          <span>{bdm.tl}</span>
                        </span>
                      </td>

                      {/* 4. Deals Created */}
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black shadow-2xs border ${bdm.dealsCount > 0
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                            : 'bg-slate-50 text-slate-400 border-slate-200/80'
                            }`}
                        >
                          <FileText size={12} className={bdm.dealsCount > 0 ? 'text-indigo-600' : 'text-slate-400'} />
                          <span>{bdm.dealsCount} {bdm.dealsCount === 1 ? 'Deal' : 'Deals'}</span>
                        </span>
                      </td>

                      {/* 4. Target */}
                      <td className="px-5 py-3.5 text-right font-bold text-slate-500">
                        {formatCompactRupee(bdm.target)}
                      </td>

                      {/* 5. Achieved */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-black text-emerald-700 text-sm">
                          {formatCompactRupee(bdm.achievement)}
                        </span>
                      </td>

                      {/* 6. Shortfall */}
                      <td className="px-5 py-3.5 text-right">
                        {isMet ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-emerald-600" />
                            <span>Target Met</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-rose-600">
                            {formatCompactRupee(bdm.shortfall)}
                          </span>
                        )}
                      </td>

                      {/* 7. Progress & Mini Bar */}
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1 min-w-[95px]">
                          <div className="flex items-center justify-between w-full text-[10px] font-black">
                            <span
                              className={
                                isMet
                                  ? 'text-emerald-700'
                                  : bdm.pct >= 50
                                    ? 'text-amber-700'
                                    : 'text-rose-600'
                              }
                            >
                              {bdm.pct}%
                            </span>
                            {isMet && (
                              <span className="text-[9px] font-bold text-emerald-600">Surplus</span>
                            )}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <div
                              style={{ width: `${Math.min(100, Math.max(4, bdm.pct))}%` }}
                              className={`h-full rounded-full ${isMet
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : bdm.pct >= 50
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                                  : 'bg-gradient-to-r from-rose-400 to-rose-500'
                                }`}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 8. Top Selling Service */}
                      <td className="px-5 py-3.5">
                        <span
                          className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-50 border border-slate-200/80 text-slate-700 truncate max-w-[190px] block shadow-2xs"
                          title={bdm.topService}
                        >
                          {bdm.topService}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. INTERACTIVE MODAL: STAGE DEALS DRILLDOWN VIEW */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {selectedStageModal && (
          <div
            onClick={() => setSelectedStageModal(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-50 via-white to-indigo-50/20">
                <div className="flex items-center gap-3">
                  <span className={`w-4 h-4 rounded-full ${selectedStageModal.color} shadow-sm shrink-0`} />
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-lg sm:text-xl font-black text-slate-900">
                        {selectedStageModal.name}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {selectedStageModal.count} Deals
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Live deal records progressing through this stage for October 2026
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate('/crm/deals')}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="Open Deals Page in new view"
                  >
                    <span>Go to Deals</span>
                    <ExternalLink size={12} />
                  </button>

                  <button
                    onClick={() => setSelectedStageModal(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Stage Financial Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Quoted</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 mt-0.5 block">
                    {formatRupee(selectedStageModal.amount)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Received</span>
                  <span className="text-sm sm:text-base font-black text-emerald-700 mt-0.5 block">
                    {formatRupee(selectedStageModal.received)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Pending</span>
                  <span className="text-sm sm:text-base font-black text-rose-600 mt-0.5 block">
                    {formatRupee(Math.max(0, selectedStageModal.amount - selectedStageModal.received))}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recovery Ratio</span>
                  <span className="text-sm sm:text-base font-black text-indigo-700 mt-0.5 block">
                    {selectedStageModal.amount > 0 ? Math.round((selectedStageModal.received / selectedStageModal.amount) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={stageModalSearch}
                    onChange={(e) => setStageModalSearch(e.target.value)}
                    placeholder="Search by deal name, client, BDM owner, service..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-xs"
                  />
                  {stageModalSearch && (
                    <button
                      onClick={() => setStageModalSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {(() => {
                  const filteredList = selectedStageModal.deals.filter(d => {
                    if (!stageModalSearch) return true;
                    const q = stageModalSearch.toLowerCase();
                    const dName = String(d.Deal_Name || d.rawZohoDeal?.Deal_Name || d.client || '').toLowerCase();
                    const comp = String(d.company || d.rawZohoDeal?.Company_Name || '').toLowerCase();
                    const srv = String(d.service || d.Service_Name || '').toLowerCase();
                    const owner = String(d.owner || d.rawZohoDeal?.Owner?.name || '').toLowerCase();
                    return dName.includes(q) || comp.includes(q) || srv.includes(q) || owner.includes(q);
                  });
                  return (
                    <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                      Showing <strong className="text-slate-900">{filteredList.length}</strong> of {selectedStageModal.count} deals
                    </span>
                  );
                })()}
              </div>

              {/* Scrollable Deals Table */}
              <div className="overflow-y-auto flex-1 p-4">
                {(() => {
                  const filteredList = selectedStageModal.deals.filter(d => {
                    if (!stageModalSearch) return true;
                    const q = stageModalSearch.toLowerCase();
                    const dName = String(d.Deal_Name || d.rawZohoDeal?.Deal_Name || d.client || '').toLowerCase();
                    const comp = String(d.company || d.rawZohoDeal?.Company_Name || '').toLowerCase();
                    const srv = String(d.service || d.Service_Name || '').toLowerCase();
                    const owner = String(d.owner || d.rawZohoDeal?.Owner?.name || '').toLowerCase();
                    return dName.includes(q) || comp.includes(q) || srv.includes(q) || owner.includes(q);
                  });

                  if (filteredList.length === 0) {
                    return (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <FileText size={32} className="mx-auto text-slate-300" />
                        <p className="text-xs font-bold">No deals found for this stage or search filter.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">Deal & Client</th>
                            <th className="px-4 py-3">Service</th>
                            <th className="px-4 py-3">BDM / Owner</th>
                            <th className="px-4 py-3">Booking Date</th>
                            <th className="px-4 py-3 text-right">Quoted Amount</th>
                            <th className="px-4 py-3 text-right">Received</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium bg-white">
                          {filteredList.map((deal, idx) => {
                            const raw = deal.rawZohoDeal || deal;
                            const dealTitle = deal.Deal_Name || raw.Deal_Name || deal.client || 'Deal';
                            const clientName = deal.company || raw.Company_Name || raw.Account_Name?.name || raw.Client_Name || 'Client';
                            const serviceName = deal.service || raw.Service_Name || 'Business Advisory';
                            const ownerName = deal.owner || raw.Owner?.name || 'Managing Director';
                            const bDate = deal.Booking_Date || raw.Booking_Date || deal.date || '-';
                            const quoted = getDealTotalAmount(deal);
                            const rec = getDealReceivedAmount(deal);
                            const dealId = deal.id || raw.id || deal.zohoId;

                            return (
                              <tr key={dealId || idx} className="hover:bg-indigo-50/30 transition-colors">
                                <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="max-w-xs">
                                    <h5 className="font-extrabold text-slate-900 truncate" title={dealTitle}>
                                      {dealTitle}
                                    </h5>
                                    <span className="text-[10px] text-slate-400 truncate block" title={clientName}>
                                      {clientName}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {serviceName}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                                    <User size={11} className="text-slate-400" />
                                    <span>{ownerName}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-[11px]">
                                  {bDate}
                                </td>
                                <td className="px-4 py-3 text-right font-black text-slate-900">
                                  {formatRupee(quoted)}
                                </td>
                                <td className="px-4 py-3 text-right font-black text-emerald-700">
                                  {formatRupee(rec)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => {
                                      if (dealId) {
                                        navigate(`/crm/deals/${dealId}`);
                                      } else {
                                        navigate('/crm/deals');
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-all flex items-center gap-1 mx-auto cursor-pointer"
                                    title="View full deal details"
                                  >
                                    <span>View</span>
                                    <ArrowUpRight size={11} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>BharatEdge Sales Operations Intelligence</span>
                <button
                  onClick={() => setSelectedStageModal(null)}
                  className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-all cursor-pointer shadow-xs"
                >
                  Close View
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
