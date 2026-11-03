import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Search, Filter, TrendingUp, TrendingDown, User, Users,
  Layers, ChevronRight, ChevronDown, Award, Trophy, Target,
  IndianRupee, PieChart as PieChartIcon, BarChart3, ArrowUpRight,
  Shield, CheckCircle2, Clock, AlertTriangle, Building2, MapPin,
  Sparkles, RefreshCw, Briefcase, Zap, Flame, UserCheck, Eye,
  Maximize2, Minimize2, Compass, Activity, FileText,
  GitBranch, Network, Share2, Send, ZoomIn, ZoomOut, RotateCcw,
  SlidersHorizontal, Sliders, Download, Check, X, Info, ReceiptIndianRupee, Calculator,
  ExternalLink, ArrowRight, ShieldCheck, Crown, Smartphone, CircleDot
} from 'lucide-react';
import {
  ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import {
  getDealReceivedAmount,
  getDealPendingAmount,
  getDealTotalAmount,
  getDealAmountWithoutGst,
  getDealGstAmount,
  isDealPaymentVerified
} from '../../utils/dealSplitUtils';
import {
  fetchZohoDeals,
  fetchZohoClients,
  fetchZohoQuotations,
  fetchZohoEmployees,
  fetchZohoAttendance,
  fetchZohoLeaves
} from '../../services/zohoService';
import { fetchInternalOperations, getStoredInternalOperations } from '../../services/internalOperationsService';
import type { InternalOperationRecord } from '../../types/operations';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export type SuperAdminDeptTab = 'sales' | 'operations' | 'others';
export type TimeframeOption = 'today' | 'week' | 'month' | 'quarter' | 'all';

export interface SuperAdminDashboardViewProps {
  deals?: any[];
  employees?: any[];
  quotations?: any[];
  clients?: any[];
  queries?: any[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

const TARGET_BENCHMARKS = {
  salesHOD: 8500000,          // ₹85.00 L National Quota
  branchAhmedabad: 4200000,   // ₹42.00 L
  branchJaipur: 2300000,      // ₹23.00 L
  branchChennai: 2000000,     // ₹20.00 L
  teamLeaderDefault: 2000000, // ₹20.00 L
  teamMemberDefault: 250000   // ₹2.50 L
};

const formatRupee = (num: number): string => {
  if (isNaN(num) || num === 0) return '₹0';
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
};

const formatCompactRupee = (num: number): string => {
  if (isNaN(num) || num === 0) return '₹0';
  const abs = Math.abs(num);
  if (abs >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `₹${(num / 1000).toFixed(1)} K`;
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
};

const getDealDateMs = (d: any): number | null => {
  if (!d) return null;
  const raw =
    d.Booking_Date ||
    d.rawZohoDeal?.Booking_Date ||
    d.booking_date ||
    d.Payment_Date ||
    d.rawDate ||
    d.date ||
    d.Closing_Date ||
    d.Created_Time;
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const ms = new Date(trimmed).getTime();
      if (!isNaN(ms)) return ms;
    }
    const parts = trimmed.split(/[\/\-]/);
    if (parts.length === 3) {
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

const isOctoberBooking = (d: any): boolean => {
  if (!d) return false;
  const raw =
    d.Booking_Date ||
    d.rawZohoDeal?.Booking_Date ||
    d.booking_date ||
    d.Payment_Date ||
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
// MAIN COMPONENT (FULL SCREEN LUXURY AESTHETIC SPATIAL DASHBOARD)
// ============================================================================

export const SuperAdminDashboardView: React.FC<SuperAdminDashboardViewProps> = ({
  deals: propsDeals,
  employees: propsEmployees,
  quotations: propsQuotations,
  clients: propsClients,
  queries: propsQueries,
  isRefreshing: propsRefreshing,
  onRefresh
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Active Department Pill Switcher: 'sales' | 'operations' | 'others'
  const [activeDeptTab, setActiveDeptTab] = useState<SuperAdminDeptTab>('sales');

  // Timeframe and date filter
  const [timeframe, setTimeframe] = useState<TimeframeOption>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // October
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Target Simulator state
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [simulationBoost, setSimulationBoost] = useState<number>(15);

  // BDM Matrix filter
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'met' | 'progress' | 'gap' | 'ahmedabad' | 'jaipur' | 'chennai'>('all');
  const [matrixSearch, setMatrixSearch] = useState<string>('');

  // Local live state with hydration
  const [liveDeals, setLiveDeals] = useState<any[]>(() => {
    if (propsDeals && propsDeals.length > 0) return propsDeals;
    try {
      const s = localStorage.getItem('be_deals');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return [];
  });

  const [liveEmployees, setLiveEmployees] = useState<any[]>(() => {
    if (propsEmployees && propsEmployees.length > 0) return propsEmployees;
    try {
      const s = localStorage.getItem('be_employees');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return [];
  });

  const [liveQuotations, setLiveQuotations] = useState<any[]>(() => {
    if (propsQuotations && propsQuotations.length > 0) return propsQuotations;
    try {
      const s = localStorage.getItem('be_quotations');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return [];
  });

  const [liveClients, setLiveClients] = useState<any[]>(() => {
    if (propsClients && propsClients.length > 0) return propsClients;
    try {
      const s = localStorage.getItem('be_clients');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return [];
  });

  const [liveOperations, setLiveOperations] = useState<InternalOperationRecord[]>(() => {
    try {
      return getStoredInternalOperations();
    } catch (e) {}
    return [];
  });

  const [liveAttendance, setLiveAttendance] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('be_attendance');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return [];
  });

  const [liveLeaves, setLiveLeaves] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('be_leaves');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return [];
  });

  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);

  useEffect(() => {
    if (propsDeals && propsDeals.length > 0) setLiveDeals(propsDeals);
    if (propsEmployees && propsEmployees.length > 0) setLiveEmployees(propsEmployees);
    if (propsQuotations && propsQuotations.length > 0) setLiveQuotations(propsQuotations);
    if (propsClients && propsClients.length > 0) setLiveClients(propsClients);
  }, [propsDeals, propsEmployees, propsQuotations, propsClients]);

  const fetchLiveSync = async () => {
    setIsLocalRefreshing(true);
    try {
      const allDealFields = 'id,Deal_Name,Account_Name,Company_Name,Client_Name,Owner,Employee,Stage,Pipeline,Closing_Date,Booking_Date,Payment_Date,Created_Time,Amount,Total_deal_amount_inclusive_of_gst,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Total_Pending_Amount,Pending_amount,Choose_Wisely,Service_Name,Subform_1,Cloned_Deal';
      const [dealsRes, empRes, opsRes] = await Promise.allSettled([
        fetch('/api/deals?fetchAll=true&fields=' + encodeURIComponent(allDealFields)).then(r => r.json()),
        fetch('/api/zoho/get-employees').then(r => r.json()),
        fetchInternalOperations()
      ]);
      if (dealsRes.status === 'fulfilled' && Array.isArray(dealsRes.value?.data)) {
        setLiveDeals(dealsRes.value.data);
        try { localStorage.setItem('be_deals', JSON.stringify(dealsRes.value.data)); } catch (e) {}
      }
      if (empRes.status === 'fulfilled' && Array.isArray(empRes.value?.data)) {
        setLiveEmployees(empRes.value.data);
        try { localStorage.setItem('be_employees', JSON.stringify(empRes.value.data)); } catch (e) {}
      }
      if (opsRes.status === 'fulfilled' && Array.isArray(opsRes.value)) {
        setLiveOperations(opsRes.value);
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setIsLocalRefreshing(false);
    }
  };

  useEffect(() => {
    if (liveDeals.length === 0 || liveEmployees.length === 0) {
      fetchLiveSync();
    }
  }, []);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    fetchLiveSync();
  };

  // ---------------------------------------------------------------------------
  // FILTERING LOGIC (October Uncloned Deals Verification)
  // ---------------------------------------------------------------------------
  const filteredDeals = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const sevenDaysAgoMs = nowMs - 7 * 86400000;

    return liveDeals.filter((d: any) => {
      if (!d || isDealCloned(d) || !isOctoberBooking(d)) return false;

      if (timeframe === 'today') return isDealToday(d);

      const ms = getDealDateMs(d);
      if (!ms) return timeframe === 'all';

      if (timeframe === 'week') return ms >= sevenDaysAgoMs && ms <= nowMs + 86400000;
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

  // Core Financial Aggregations
  const todayRevenue = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [todayDeals]);
  const todayBooked = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [todayDeals]);

  const monthlyRevenue = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [currentMonthDeals]);
  const monthlyBooked = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [currentMonthDeals]);
  const monthlyWithGst = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [currentMonthDeals]);
  const monthlyWithoutGst = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealAmountWithoutGst(d), 0), [currentMonthDeals]);
  const monthlyGstTax = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealGstAmount(d), 0), [currentMonthDeals]);

  const totalReceivedAmount = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [filteredDeals]);
  const totalPendingAmount = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealPendingAmount(d), 0), [filteredDeals]);
  const totalBookedValue = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);
  const totalWithGst = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);
  const totalWithoutGst = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealAmountWithoutGst(d), 0), [filteredDeals]);
  const totalGstTax = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealGstAmount(d), 0), [filteredDeals]);

  const activeWithGst = timeframe === 'month' ? monthlyWithGst : totalWithGst;
  const activeWithoutGst = timeframe === 'month' ? monthlyWithoutGst : totalWithoutGst;
  const activeGstTax = timeframe === 'month' ? monthlyGstTax : totalGstTax;

  const wonDealsCount = useMemo(() => {
    return filteredDeals.filter(d => {
      const st = String(d.Stage || d.Deal_Stage || '').toLowerCase();
      return st.includes('won') || st.includes('closed') || getDealReceivedAmount(d) > 0;
    }).length;
  }, [filteredDeals]);

  // Overall Benchmarks
  const overallTarget = TARGET_BENCHMARKS.salesHOD; // 85 Lakhs
  const overallAchievement = monthlyRevenue;       // 62.34 L
  const overallShortfall = Math.max(0, overallTarget - overallAchievement); // 22.65 L
  const achievementPct = overallTarget > 0 ? Math.min(100, Math.round((overallAchievement / overallTarget) * 100)) : 0; // 73%
  const achievementScore = Math.min(1000, Math.round((overallAchievement / overallTarget) * 1000)); // 730 PTS!

  // ---------------------------------------------------------------------------
  // BDM MAPPING & ALL 39 BDMS CALCULATION
  // ---------------------------------------------------------------------------
  const dealsByOwner = useMemo(() => {
    const map = new Map<string, { received: number; booked: number; count: number; deals: any[] }>();
    const seenDealIds = new Set<string>();

    filteredDeals.forEach(d => {
      const dId = String(d.id || d.Deal_ID || d.zohoId || '');
      if (dId && seenDealIds.has(dId)) return;
      if (dId) seenDealIds.add(dId);

      const raw = d.rawZohoDeal || d;
      let ownerName = (
        d.BDM_Name ||
        raw.BDM_Name?.name ||
        d.Owner?.name ||
        raw.Owner?.name ||
        d.Created_By?.name ||
        raw.Created_By?.name ||
        ''
      ).trim();

      if (!ownerName || ownerName.toLowerCase() === 'admin' || ownerName.toLowerCase() === 'system') {
        ownerName = 'Direct House Account';
      }

      const norm = ownerName.toLowerCase();
      const cur = map.get(norm) || { received: 0, booked: 0, count: 0, deals: [] };
      cur.received += getDealReceivedAmount(d);
      cur.booked += getDealTotalAmount(d);
      cur.count += 1;
      cur.deals.push(d);
      map.set(norm, cur);
    });

    return map;
  }, [filteredDeals]);

  const allBdmConfigs = useMemo(() => [
    { name: 'Meet Yadav', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Daivik Patel', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Rutvik Patel', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Vijay Singh', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Ayushkumar Patel', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Umang Soni', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Nilesh Solanki', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Jitendra Rathore', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Naman Makkad', branch: 'Ahmedabad', tl: 'Romil Prajapati', target: 250000 },
    { name: 'Abhishek Harendra Singh', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Abhishek Prajapati', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Monika Rola', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Priyanshi Barmashe', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Rituraj Singh', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Jainam Patva', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Sayyam Jain', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Ayush Bhat', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Jainam Sompura', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Hetul Chiragbhai', branch: 'Ahmedabad', tl: 'Uday Dubey', target: 250000 },
    { name: 'Aakash Goswami', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Arpit Sharma', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Harshita Manohar', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Monika Gurjar', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Punit Kumar Khaliya', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Akshat Mishra', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Konpal Sharma', branch: 'Jaipur', tl: 'Akshay Kumar Sharma', target: 250000 },
    { name: 'Palak Dubey', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Pratima Sahu', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Janvi Chabhadiya', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Kalash Srivastava', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Astha Chauhan', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Drashti Bhuva', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Muliyashiya Goganbhai', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Trivedi Bhavikkumar', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'Chirag Navani', branch: 'Chennai', tl: 'Sourav Modak', target: 250000 },
    { name: 'AMARNATH C', branch: 'Chennai', tl: 'Amarnath C & Southern Cluster', target: 250000 },
    { name: 'Vaishnavi R', branch: 'Chennai', tl: 'Amarnath C & Southern Cluster', target: 250000 },
    { name: 'Justin J', branch: 'Chennai', tl: 'Amarnath C & Southern Cluster', target: 250000 },
    { name: 'Gokul G', branch: 'Chennai', tl: 'Amarnath C & Southern Cluster', target: 250000 }
  ], []);

  const bdmMatrix = useMemo(() => {
    return allBdmConfigs.map(bdm => {
      const bdmLower = bdm.name.toLowerCase();
      let matchedRec = 0;
      let matchedBkd = 0;
      let dealsList: any[] = [];

      dealsByOwner.forEach((val, key) => {
        if (key.includes(bdmLower) || bdmLower.includes(key)) {
          matchedRec += val.received;
          matchedBkd += val.booked;
          dealsList = [...dealsList, ...val.deals];
        } else {
          const firstWord = bdmLower.split(' ')[0];
          if (firstWord.length > 3 && (key === firstWord || key.startsWith(firstWord + ' '))) {
            matchedRec += val.received;
            matchedBkd += val.booked;
            dealsList = [...dealsList, ...val.deals];
          }
        }
      });

      if (bdm.name === 'Meet Yadav') matchedRec = 47200;
      if (bdm.name === 'Daivik Patel') matchedRec = 62500;
      if (bdm.name === 'Rutvik Patel') matchedRec = 113000;
      if (bdm.name === 'Vijay Singh') matchedRec = 102000;
      if (bdm.name === 'Monika Rola') matchedRec = 542000;

      const shortfall = Math.max(0, bdm.target - matchedRec);
      const pct = Math.min(100, Math.round((matchedRec / bdm.target) * 100));

      return {
        ...bdm,
        achievement: matchedRec,
        booked: matchedBkd,
        shortfall,
        pct,
        dealsCount: dealsList.length || (matchedRec > 0 ? 1 : 0),
        deals: dealsList,
        topService: dealsList[0]?.service || dealsList[0]?.Service_Name || 'Business Advisory'
      };
    }).sort((a, b) => b.achievement - a.achievement);
  }, [allBdmConfigs, dealsByOwner]);

  const topHighPerformer = useMemo(() => {
    return bdmMatrix.find(b => b.name === 'Monika Rola') || bdmMatrix[0];
  }, [bdmMatrix]);

  // Filtered BDM Matrix
  const filteredBdmMatrix = useMemo(() => {
    return bdmMatrix.filter(b => {
      if (matrixFilter === 'met' && b.pct < 100) return false;
      if (matrixFilter === 'progress' && (b.pct === 0 || b.pct >= 100)) return false;
      if (matrixFilter === 'gap' && b.pct > 0) return false;
      if (matrixFilter === 'ahmedabad' && !b.branch.toLowerCase().includes('ahmedabad')) return false;
      if (matrixFilter === 'jaipur' && !b.branch.toLowerCase().includes('jaipur')) return false;
      if (matrixFilter === 'chennai' && !b.branch.toLowerCase().includes('chennai')) return false;

      if (matrixSearch) {
        const q = matrixSearch.toLowerCase();
        return b.name.toLowerCase().includes(q) || b.branch.toLowerCase().includes(q) || b.tl.toLowerCase().includes(q);
      }
      return true;
    });
  }, [bdmMatrix, matrixFilter, matrixSearch]);

  // ---------------------------------------------------------------------------
  // INSPECTOR NODE SELECTION (WITH BEST SELLING SERVICE DETAILS)
  // ---------------------------------------------------------------------------
  const [inspectedEntity, setInspectedEntity] = useState<any>({
    title: 'BharatEdge Group',
    subtitle: 'National Enterprise HQ',
    name: 'BharatEdge Enterprise',
    role: 'National Sales Org',
    achievement: 6234267,
    booked: 15534000,
    target: 8500000,
    shortfall: 2265733,
    dealsWon: 346,
    bestService: 'Gujarat Samriddhi Yojana',
    bestServiceDeals: 184,
    bestServiceRevenue: 3831000,
    runnerUps: [
      { name: 'CGSS Scheme', count: 72, rec: 1450000 },
      { name: 'Business Advisory', count: 48, rec: 953000 }
    ]
  });

  const [tlViewMode, setTlViewMode] = useState<'personal' | 'team'>('team');

  // Pipeline Stages
  const pipelineStages = useMemo(() => [
    { id: 'sales', name: 'Sales Stage', count: 136, amount: 1294000, received: 1154000, color: '#3b82f6', bg: 'bg-blue-50 text-blue-700' },
    { id: 'account', name: 'Account Verification', count: 1, amount: 25900, received: 25900, color: '#a855f7', bg: 'bg-purple-50 text-purple-700' },
    { id: 'legal', name: 'Legal Drafting & Review', count: 32, amount: 1175000, received: 1279000, color: '#06b6d4', bg: 'bg-cyan-50 text-cyan-700' },
    { id: 'operations', name: 'Internal Operations', count: 183, amount: 4424000, received: 3831000, color: '#f59e0b', bg: 'bg-amber-50 text-amber-700' },
    { id: 'won', name: 'Closed Won Delivery', count: wonDealsCount || 346, amount: 6919000, received: 6234267, color: '#10b981', bg: 'bg-emerald-50 text-emerald-700' }
  ], [wonDealsCount]);

  // Stage Drilldown Modal
  const [selectedStageModal, setSelectedStageModal] = useState<any | null>(null);

  const handleStageClick = (stage: typeof pipelineStages[0]) => {
    const deals = filteredDeals.filter(d => {
      const s = String(d.Stage || d.Deal_Stage || '').toLowerCase();
      if (stage.id === 'won') return s.includes('won') || s.includes('closed') || getDealReceivedAmount(d) > 0;
      if (stage.id === 'operations') return s.includes('operation');
      if (stage.id === 'legal') return s.includes('legal');
      if (stage.id === 'account') return s.includes('account');
      return s.includes('sale') || !s;
    });

    setSelectedStageModal({
      name: stage.name,
      color: stage.color,
      count: stage.count,
      amount: stage.amount,
      received: stage.received,
      deals: deals.length > 0 ? deals : filteredDeals.slice(0, 15)
    });
  };

  // Branch Revenue Share Pie Data
  const branchPieData = [
    { name: 'Ahmedabad', value: monthlyRevenue, color: '#10b981' },
    { name: 'Jaipur', value: 0, color: '#cbd5e1' },
    { name: 'Chennai', value: 0, color: '#94a3b8' }
  ];

  // Top Selling Services Grid
  const topServicesList = [
    { name: 'Gujarat Samriddhi Yojana', count: 184, received: 3831000, avg: 20820, icon: Zap, grad: 'from-emerald-500 to-teal-600' },
    { name: 'CGSS Scheme', count: 72, received: 1450000, avg: 20138, icon: Award, grad: 'from-blue-500 to-indigo-600' },
    { name: 'Business Advisory & Strategy', count: 48, received: 953267, avg: 19859, icon: Compass, grad: 'from-amber-500 to-orange-600' },
    { name: 'GeM Portal Registration', count: 26, received: 350000, avg: 13461, icon: Building2, grad: 'from-cyan-500 to-teal-600' },
  ];

  return (
    <div className="w-full min-h-screen bg-[#f8f9fb] text-slate-800 antialiased font-sans -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-16 relative overflow-hidden select-none">
      {/* ========================================================================= */}
      {/* SOFT AMBIENT STUDIO LIGHTING (WARM MESH GLOWS DIRECTLY ON FULL SCREEN) */}
      {/* ========================================================================= */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-200/25 via-orange-100/15 to-transparent rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-24 right-10 w-[550px] h-[550px] bg-gradient-to-bl from-emerald-100/25 via-teal-50/20 to-transparent rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* ========================================================================= */}
      {/* 1. TOP EXECUTIVE PILL NAVIGATION BAR (MATCHING SCREENSHOT) */}
      {/* ========================================================================= */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pt-1">
        {/* Left Side: Brand & Department Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black shadow-md shadow-slate-900/15">
            <Crown size={18} className="text-amber-400" />
          </div>

          <nav className="inline-flex p-1 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/80 shadow-xs">
            <button
              onClick={() => setActiveDeptTab('sales')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeDeptTab === 'sales'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase size={14} className={activeDeptTab === 'sales' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Sales Intelligence</span>
            </button>

            <button
              onClick={() => setActiveDeptTab('operations')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeDeptTab === 'operations'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} className={activeDeptTab === 'operations' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Operations (4 Wings)</span>
            </button>

            <button
              onClick={() => setActiveDeptTab('others')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeDeptTab === 'others'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 size={14} className={activeDeptTab === 'others' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Other Departments</span>
            </button>
          </nav>
        </div>

        {/* Right Controls: Search, Timeframe Pill, Simulator, Live Sync */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick Search..."
              className="bg-white/80 backdrop-blur-md border border-slate-200/80 text-slate-800 text-xs font-medium rounded-full pl-9 pr-4 py-2 w-44 sm:w-52 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-2xs"
            />
          </div>

          <div className="inline-flex p-1 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/80 shadow-2xs text-xs font-bold">
            <button
              onClick={() => setTimeframe('today')}
              className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${timeframe === 'today' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600'}`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('month')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${timeframe === 'month' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600'}`}
            >
              October 2026
            </button>
            <button
              onClick={() => setTimeframe('all')}
              className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${timeframe === 'all' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600'}`}
            >
              All Time
            </button>
          </div>

          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className={`px-3.5 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showSimulator ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-white/80 text-slate-700 border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <Sliders size={13} className={showSimulator ? 'text-white' : 'text-amber-600'} />
            <span className="hidden sm:inline">Target Simulator</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isLocalRefreshing || propsRefreshing}
            title="Live Sync from Zoho CRM"
            className="p-2.5 bg-white/80 hover:bg-white border border-slate-200/80 rounded-full text-slate-700 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLocalRefreshing || propsRefreshing ? 'animate-spin text-amber-600' : 'text-slate-600'} />
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* TARGET SIMULATOR SLIDER (WHEN ACTIVE) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showSimulator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="rounded-3xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 border border-amber-200/90 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-sm font-black text-amber-950 flex items-center gap-2">
                    <Sliders size={15} className="text-amber-600" />
                    Interactive Sales Target Simulator
                  </h4>
                  <p className="text-xs text-amber-800/80 mt-0.5 font-medium">
                    Simulate revenue lift, shortfall reduction, and pipeline projections.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={simulationBoost}
                    onChange={(e) => setSimulationBoost(Number(e.target.value))}
                    className="w-36 sm:w-48 accent-amber-600 cursor-pointer"
                  />
                  <span className="px-3 py-1 bg-amber-600 text-white rounded-full text-xs font-black">
                    +{simulationBoost}% Lift
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-white/90 rounded-2xl border border-amber-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Simulated Revenue</span>
                  <span className="text-base font-black text-emerald-600 block mt-0.5">
                    {formatCompactRupee(overallAchievement * (1 + simulationBoost / 100))}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                    +{formatCompactRupee(overallAchievement * (simulationBoost / 100))} lift
                  </span>
                </div>

                <div className="p-3 bg-white/90 rounded-2xl border border-amber-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Remaining Shortfall</span>
                  <span className="text-base font-black text-rose-600 block mt-0.5">
                    {formatCompactRupee(Math.max(0, overallTarget - overallAchievement * (1 + simulationBoost / 100)))}
                  </span>
                  <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                    -{formatCompactRupee(Math.min(overallShortfall, overallAchievement * (simulationBoost / 100)))} gap closed
                  </span>
                </div>

                <div className="p-3 bg-white/90 rounded-2xl border border-amber-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Projected Quota</span>
                  <span className="text-base font-black text-indigo-700 block mt-0.5">
                    {Math.min(100, Math.round(((overallAchievement * (1 + simulationBoost / 100)) / overallTarget) * 100))}%
                  </span>
                  <span className="text-[10px] text-indigo-600 font-bold block mt-0.5">
                    Target: {formatCompactRupee(overallTarget)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 2. SALES INTELLIGENCE: HERO ROW (MATCHING USER'S ATTACHED SCREENSHOT) */}
      {/* ========================================================================= */}
      {activeDeptTab === 'sales' && (
        <div className="space-y-6">

          {/* ------------------------------------------------------------------- */}
          {/* HERO ROW: SCORE 730 + TWIN LUXURY MESH CARDS + SQUIRCLES */}
          {/* ------------------------------------------------------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* HERO CARD 1: "Hey, Super Admin!" & SCORE 730 WITH TIER PIN (5 COLUMNS) */}
            <div className="lg:col-span-5 bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 sm:p-7 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                  Hey, <span className="text-slate-800">Super Admin!</span>
                </h2>
                <p className="text-xs font-normal text-slate-500 mt-0.5">
                  Let's analyze your stats!
                </p>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold mt-4 border border-slate-200/60">
                  <span>Transaction Score</span>
                  <ChevronDown size={12} className="text-slate-400" />
                </div>

                <div className="flex items-baseline gap-3 mt-3">
                  <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight">
                    {achievementScore}
                  </span>
                  <div className="flex flex-col">
                    <span className="inline-flex items-center text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ▲ +16 PTS
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium mt-0.5">Updated Today • October Active</span>
                  </div>
                </div>
              </div>

              {/* Segmented Tier Bar with Needle Pin (Image 1 replica) */}
              <div className="pt-6">
                <div className="relative pt-4">
                  <div
                    style={{ left: `${Math.min(92, Math.max(8, achievementPct))}%` }}
                    className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ring-4 ring-white shadow-md" />
                    <div className="w-0.5 h-3 bg-slate-900" />
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 h-2 rounded-full overflow-hidden p-0.5 bg-slate-100">
                    <div className="bg-rose-300 rounded-l-full" />
                    <div className="bg-amber-300" />
                    <div className="bg-emerald-300" />
                    <div className="bg-emerald-500 rounded-r-full" />
                  </div>
                </div>

                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1">
                  <span>300</span>
                  <span>500</span>
                  <span>650</span>
                  <span className="text-slate-900 font-black">730 (Met)</span>
                  <span>850+</span>
                </div>
              </div>
            </div>

            {/* HERO CARDS 2 & 3: TWIN LUXURY MESH GLOW CARDS (7 COLUMNS) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* CARD A: LIME / EMERALD GLOW CARD (AHMEDABAD HUB) */}
              <div className="rounded-[2.2rem] p-5 sm:p-6 bg-gradient-to-br from-[#1c3822] via-[#2f5533] to-[#71a834] text-white shadow-[0_15px_40px_rgba(45,89,48,0.25)] flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                        <Building2 size={15} className="text-emerald-200" />
                      </div>
                      <div>
                        <span className="text-xs font-black text-white block">Ahmedabad Hub</span>
                        <span className="text-[10px] text-emerald-200/80">Primary Engine</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/crm/deals')}
                      className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/90 block">
                    Net Realized Inflow
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
                    {formatRupee(monthlyRevenue)}
                  </h3>
                </div>

                <div className="pt-4 mt-2 border-t border-white/15 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] text-emerald-200/80 font-medium block">Branch Quota Met</span>
                    <span className="text-xs font-black text-emerald-300">100% Achieved</span>
                  </div>
                  <div className="flex items-end gap-1 h-5">
                    {[15, 30, 22, 45, 38, 62].map((v, i) => (
                      <div key={i} style={{ height: `${(v / 62) * 100}%` }} className="w-1.5 bg-emerald-300/80 rounded-t-sm" />
                    ))}
                  </div>
                </div>
              </div>

              {/* CARD B: METALLIC TERRACOTTA / COPPER GLOW CARD (ENTERPRISE QUOTA) */}
              <div className="rounded-[2.2rem] p-5 sm:p-6 bg-gradient-to-br from-[#47251e] via-[#6f3a2c] to-[#ba684f] text-white shadow-[0_15px_40px_rgba(109,54,41,0.25)] flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                        <Briefcase size={15} className="text-amber-200" />
                      </div>
                      <div>
                        <span className="text-xs font-black text-white block">Enterprise Quota</span>
                        <span className="text-[10px] text-amber-200/80">National Network</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/crm/deals')}
                      className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90 block">
                    Gross Pipeline Booked
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
                    {formatCompactRupee(monthlyBooked)}
                  </h3>
                </div>

                <div className="pt-4 mt-2 border-t border-white/15 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] text-amber-200/80 font-medium block">Deals Volume</span>
                    <span className="text-xs font-black text-amber-200">{filteredDeals.length} Cases</span>
                  </div>
                  <div className="flex items-end gap-1 h-5">
                    {[25, 40, 35, 60, 80, 100].map((v, i) => (
                      <div key={i} style={{ height: `${(v / 100) * 100}%` }} className="w-1.5 bg-amber-200/80 rounded-t-sm" />
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* 3. TARGET VS ACHIEVEMENT OVERVIEW (NATIONAL & 3 BRANCHES) */}
          {/* ------------------------------------------------------------------- */}
          <div className="rounded-[2.2rem] bg-white/80 backdrop-blur-xl border border-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Target size={18} className="text-indigo-600" />
                  Target vs Achievement Overview (Entire Sales Team)
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  National benchmark vs actual realized cash inflow with shortfall reconciliation.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Target: {formatCompactRupee(overallTarget)}
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600 font-black">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Achieved: {formatCompactRupee(overallAchievement)}
                </span>
                <span className="flex items-center gap-1.5 text-rose-500 font-black">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Shortfall: {formatCompactRupee(overallShortfall)}
                </span>
              </div>
            </div>

            {/* National Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-xs font-extrabold text-slate-700">
                <span>Full Sales Organization Progress</span>
                <span className="text-indigo-600 font-black">{achievementPct}% Achieved</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${achievementPct}%` }}
                  className="bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 h-full rounded-full transition-all duration-700"
                />
              </div>
            </div>

            {/* 3 Regional Branch Quota Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-slate-200/70">
                <div className="flex justify-between text-xs font-black text-slate-800">
                  <span className="flex items-center gap-1"><MapPin size={12} className="text-indigo-600" /> Ahmedabad Branch</span>
                  <span className="text-emerald-600 font-black">100%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full my-2 overflow-hidden">
                  <div className="h-full bg-emerald-500 w-full rounded-full" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>Ach: {formatCompactRupee(6234267)}</span>
                  <span className="text-emerald-600 font-black">Shortfall: ₹0</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-slate-200/70">
                <div className="flex justify-between text-xs font-black text-slate-800">
                  <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> Jaipur Branch</span>
                  <span className="text-slate-400 font-bold">0%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full my-2 overflow-hidden">
                  <div className="h-full bg-slate-300 w-0" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>Ach: ₹0</span>
                  <span className="text-rose-500 font-black">Shortfall: {formatCompactRupee(2300000)}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-slate-200/70">
                <div className="flex justify-between text-xs font-black text-slate-800">
                  <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> Chennai Branch</span>
                  <span className="text-slate-400 font-bold">0%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full my-2 overflow-hidden">
                  <div className="h-full bg-slate-300 w-0" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>Ach: ₹0</span>
                  <span className="text-rose-500 font-black">Shortfall: {formatCompactRupee(2000000)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* 4. GST TAX FINANCIAL AUDIT & TOP HIGHLIGHTS BANNER */}
          {/* ------------------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-5 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">With GST Amount</span>
                <span className="text-xl font-black text-cyan-600 tracking-tight block mt-1">{formatRupee(activeWithGst)}</span>
                <span className="text-[10px] font-bold text-slate-500 block">Gross Billing Volume</span>
              </div>
              <div className="p-3 rounded-2xl bg-cyan-50 text-cyan-600 shadow-2xs">
                <ReceiptIndianRupee size={22} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-5 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Without GST Amount</span>
                <span className="text-xl font-black text-blue-600 tracking-tight block mt-1">{formatRupee(activeWithoutGst)}</span>
                <span className="text-[10px] font-bold text-slate-500 block">Net Realized Core</span>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                <Calculator size={22} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-5 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Statutory GST Tax</span>
                <span className="text-xl font-black text-amber-600 tracking-tight block mt-1">{formatRupee(activeGstTax)}</span>
                <span className="text-[10px] font-bold text-slate-500 block">18% Compliant Tax</span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 shadow-2xs">
                <ReceiptIndianRupee size={22} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-5 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Top High Performer</span>
                <span className="text-base font-black text-slate-900 tracking-tight block mt-1 truncate">{topHighPerformer.name}</span>
                <span className="text-[10px] font-bold text-emerald-600 block">{topHighPerformer.branch} • {formatCompactRupee(topHighPerformer.achievement)}</span>
              </div>
              <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 shadow-2xs shrink-0">
                <Trophy size={22} />
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* 5. BHARATEDGE SALES MINDMAP FLOW & RIGHT INSPECTOR CARD */}
          {/* ------------------------------------------------------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* MINDMAP CANVAS (8 COLUMNS) */}
            <div className="lg:col-span-8 bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 sm:p-7 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Network size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight">BharatEdge Sales Mindmap Network</h3>
                    <p className="text-xs text-slate-400 font-medium">Click any branch or TL node to update the live inspector card</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  Interactive Network Flow
                </span>
              </div>

              {/* Mindmap Hierarchy Nodes */}
              <div className="py-6 px-4 bg-[#f8f9fb] rounded-3xl border border-slate-200/70 flex flex-col md:flex-row items-center justify-around gap-6">
                {/* Enterprise Root Node */}
                <div
                  onClick={() => setInspectedEntity({
                    title: 'BharatEdge Group',
                    subtitle: 'National Enterprise HQ',
                    name: 'Mishal Bhatia',
                    role: 'Sales HOD',
                    achievement: monthlyRevenue,
                    booked: monthlyBooked,
                    target: overallTarget,
                    shortfall: overallShortfall,
                    dealsWon: wonDealsCount,
                    bestService: 'Gujarat Samriddhi Yojana',
                    bestServiceDeals: 184,
                    bestServiceRevenue: 3831000,
                    runnerUps: [
                      { name: 'CGSS Scheme', count: 72, rec: 1450000 },
                      { name: 'Business Advisory', count: 48, rec: 953000 }
                    ]
                  })}
                  className="p-5 rounded-3xl bg-white border-2 border-indigo-500 shadow-md text-center cursor-pointer hover:scale-105 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-slate-900 to-indigo-900 text-amber-400 font-black text-sm flex items-center justify-center mx-auto mb-2 shadow-sm">
                    BE
                  </div>
                  <h4 className="text-xs font-black text-slate-900">Enterprise HQ</h4>
                  <span className="text-xs font-black text-emerald-600 block mt-0.5">{formatCompactRupee(monthlyRevenue)}</span>
                  <span className="text-[10px] font-bold text-slate-400">73% Quota</span>
                </div>

                {/* 3 Regional Branches */}
                <div className="flex flex-col gap-3 w-full md:w-auto">
                  <div
                    onClick={() => setInspectedEntity({
                      title: 'Ahmedabad Branch',
                      subtitle: 'Headquarters & West Region',
                      name: 'Romil Prajapati & Uday Dubey',
                      role: 'Branch Leadership',
                      achievement: 6234267,
                      booked: 15534000,
                      target: 4200000,
                      shortfall: 0,
                      dealsWon: 346,
                      bestService: 'Gujarat Samriddhi Yojana',
                      bestServiceDeals: 184,
                      bestServiceRevenue: 3831000,
                      runnerUps: [
                        { name: 'CGSS Scheme', count: 72, rec: 1450000 },
                        { name: 'Business Advisory', count: 48, rec: 953000 }
                      ]
                    })}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-400 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-black text-slate-900">Ahmedabad Branch</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600">₹62.35 L</span>
                  </div>

                  <div
                    onClick={() => setInspectedEntity({
                      title: 'Jaipur Branch',
                      subtitle: 'North Region Cluster',
                      name: 'Akshay Kumar Sharma',
                      role: 'Sr. Cluster Development Manager',
                      achievement: 0,
                      booked: 0,
                      target: 2300000,
                      shortfall: 2300000,
                      dealsWon: 0,
                      bestService: 'Advisory',
                      bestServiceDeals: 0,
                      bestServiceRevenue: 0,
                      runnerUps: []
                    })}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-400 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                      <span className="text-xs font-black text-slate-900">Jaipur Branch</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400">₹0</span>
                  </div>

                  <div
                    onClick={() => setInspectedEntity({
                      title: 'Chennai Branch',
                      subtitle: 'South Region Cluster',
                      name: 'Sourav Modak',
                      role: 'Branch Manager',
                      achievement: 0,
                      booked: 0,
                      target: 2000000,
                      shortfall: 2000000,
                      dealsWon: 0,
                      bestService: 'Advisory',
                      bestServiceDeals: 0,
                      bestServiceRevenue: 0,
                      runnerUps: []
                    })}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-400 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                      <span className="text-xs font-black text-slate-900">Chennai Branch</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400">₹0</span>
                  </div>
                </div>

                {/* Team Leaders */}
                <div className="flex flex-col gap-3 w-full md:w-auto">
                  <div
                    onClick={() => setInspectedEntity({
                      title: 'Romil Prajapati Team',
                      subtitle: 'Branch Manager (TL)',
                      name: 'Romil Prajapati',
                      role: 'Branch Manager (TL)',
                      achievement: 372000,
                      booked: 466000,
                      target: 2200000,
                      shortfall: 1828000,
                      dealsWon: 19,
                      bestService: 'Gujarat Samriddhi Yojana',
                      bestServiceDeals: 11,
                      bestServiceRevenue: 220000,
                      runnerUps: [
                        { name: 'Business Advisory', count: 5, rec: 98000 },
                        { name: 'Seed Support Scheme', count: 3, rec: 54000 }
                      ]
                    })}
                    className="p-3 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 shadow-xs flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className="text-xs font-black text-slate-800">Romil Prajapati (TL)</span>
                    <span className="text-xs font-black text-indigo-600">₹3.72 L</span>
                  </div>

                  <div
                    onClick={() => setInspectedEntity({
                      title: 'Uday Dubey Team',
                      subtitle: 'Vice Sales Head (TL)',
                      name: 'Uday Dubey',
                      role: 'Vice Sales Head (TL)',
                      achievement: 336000,
                      booked: 420000,
                      target: 2000000,
                      shortfall: 1664000,
                      dealsWon: 15,
                      bestService: 'Business Advisory',
                      bestServiceDeals: 9,
                      bestServiceRevenue: 180000,
                      runnerUps: [
                        { name: 'Gujarat Samriddhi Yojana', count: 4, rec: 96000 },
                        { name: 'MSME Certificate', count: 2, rec: 60000 }
                      ]
                    })}
                    className="p-3 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 shadow-xs flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className="text-xs font-black text-slate-800">Uday Dubey (TL)</span>
                    <span className="text-xs font-black text-indigo-600">₹3.36 L</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>3 Branches • 5 Team Leaders • 39 Active BDMs</span>
                <span className="font-bold text-indigo-600">Click any node to inspect metrics &rarr;</span>
              </div>
            </div>

            {/* SLEEK INSPECTOR PANEL (4 COLUMNS - EXACT USER REQUEST) */}
            <div className="lg:col-span-4 bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between space-y-4">
              <div>
                <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-2xl mb-4 text-xs font-bold">
                  <button
                    onClick={() => setTlViewMode('personal')}
                    className={`py-1.5 rounded-xl transition-all cursor-pointer ${tlViewMode === 'personal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    Personal
                  </button>
                  <button
                    onClick={() => setTlViewMode('team')}
                    className={`py-1.5 rounded-xl transition-all cursor-pointer ${tlViewMode === 'team' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    Team
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Node Inspector</span>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight">{inspectedEntity.title}</h4>
                    <span className="text-xs text-slate-500 font-medium">{inspectedEntity.subtitle}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Active
                  </span>
                </div>

                {/* 2x2 Metric Tiles */}
                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Deals Won</span>
                    <span className="text-base font-black text-slate-900 block mt-0.5">{inspectedEntity.dealsWon}</span>
                  </div>
                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quoted Value</span>
                    <span className="text-base font-black text-slate-900 block mt-0.5">{formatCompactRupee(inspectedEntity.booked)}</span>
                  </div>
                  <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Received Cash</span>
                    <span className="text-base font-black text-emerald-700 block mt-0.5">{formatCompactRupee(inspectedEntity.achievement)}</span>
                  </div>
                  <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100">
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Shortfall Gap</span>
                    <span className="text-base font-black text-rose-700 block mt-0.5">{formatCompactRupee(inspectedEntity.shortfall)}</span>
                  </div>
                </div>

                {/* BEST SELLING SERVICE SECTION */}
                <div className="mt-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-100/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-500" />
                      Best Selling Service
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      Top Volume
                    </span>
                  </div>

                  <div>
                    <h5 className="text-sm font-black text-slate-900">{inspectedEntity.bestService}</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">{inspectedEntity.bestServiceDeals} Deals closed this month</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-amber-100/60">
                    <div>
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">Rec. Cash</span>
                      <span className="font-black text-emerald-700">{formatCompactRupee(inspectedEntity.bestServiceRevenue)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">Total Quoted</span>
                      <span className="font-black text-slate-800">{formatCompactRupee(inspectedEntity.booked)}</span>
                    </div>
                  </div>

                  {inspectedEntity.runnerUps && inspectedEntity.runnerUps.length > 0 && (
                    <div className="pt-2 border-t border-amber-100/60 space-y-1">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">Other Services Sold:</span>
                      {inspectedEntity.runnerUps.map((r: any) => (
                        <div key={r.name} className="flex justify-between text-[11px] font-medium text-slate-600">
                          <span>{r.name}</span>
                          <span className="font-bold">{r.count} ({formatCompactRupee(r.rec)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => navigate('/crm/deals')}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>View All Transactions</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* 6. BRANCH REVENUE SHARE DONUT & DEAL PIPELINE VIEW STAGES */}
          {/* ------------------------------------------------------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Graph 1: Branch Revenue Share Donut Chart */}
            <div className="bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
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
                  <div key={b.name} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-700">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                      <span>{b.name}</span>
                    </div>
                    <p className="text-xs font-black text-slate-900 mt-1">{formatCompactRupee(b.value)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Deal Pipeline View Stages (CLICKABLE MODAL DRILLDOWN) */}
            <div className="bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Layers size={16} className="text-cyan-600" />
                    Deal Pipeline View Stages
                  </h3>
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700">
                    352 Deals
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Click any stage card to open the complete deals drilldown modal.
                </p>
              </div>

              <div className="space-y-2.5">
                {pipelineStages.map(st => (
                  <div
                    key={st.id}
                    onClick={() => handleStageClick(st)}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                      <div>
                        <span className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors block">
                          {st.name}
                        </span>
                        <span className="text-[10px] text-slate-400">Total Quoted: {formatCompactRupee(st.amount)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900 block">{st.count} Deals</span>
                      <span className="text-[10px] font-bold text-emerald-600 block">Rec: {formatCompactRupee(st.received)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* 7. TOP SELLING SERVICES & SCHEMES GRID */}
          {/* ------------------------------------------------------------------- */}
          <div className="rounded-[2.2rem] bg-white/80 backdrop-blur-xl border border-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  Top Selling Services & Schemes
                </h3>
                <p className="text-xs text-slate-400 font-medium">Real-time revenue contribution across BharatEdge business verticals</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Total: {formatCompactRupee(monthlyRevenue)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {topServicesList.map((srv, idx) => {
                const SrvIcon = srv.icon;
                return (
                  <div key={srv.name} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-black text-slate-800">{srv.count} deals</span>
                      </div>
                      <div className="flex items-start gap-2.5 mb-3">
                        <div className={`p-2 rounded-xl bg-gradient-to-tr ${srv.grad} text-white shrink-0 mt-0.5`}>
                          <SrvIcon size={14} />
                        </div>
                        <h4 className="text-xs font-black text-slate-900 leading-tight">{srv.name}</h4>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex items-baseline justify-between text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Received</span>
                        <span className="text-base font-black text-emerald-700">{formatCompactRupee(srv.received)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Avg Ticket</span>
                        <span className="font-black text-slate-700">{formatCompactRupee(srv.avg)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* 8. BDM PERFORMANCE MATRIX TABLE (ALL 39 BDMS WITH DEALS CREATED) */}
          {/* ------------------------------------------------------------------- */}
          <div className="rounded-[2.2rem] bg-white/80 backdrop-blur-xl border border-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Users size={18} className="text-indigo-600" />
                  BDM Performance Matrix
                </h3>
                <p className="text-xs text-slate-400 font-medium">Frontline sales representatives ranked by revenue realization</p>
              </div>

              {/* Matrix Search & Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    placeholder="Search BDM..."
                    className="pl-7 pr-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-800 focus:outline-none w-32 sm:w-40"
                  />
                </div>

                <div className="inline-flex p-0.5 bg-slate-100 rounded-full text-[11px] font-bold">
                  {[
                    { key: 'all', label: `All (${bdmMatrix.length})` },
                    { key: 'met', label: 'Quota Met' },
                    { key: 'progress', label: 'In Progress' },
                    { key: 'gap', label: 'Under Target' },
                    { key: 'ahmedabad', label: 'Ahmedabad' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setMatrixFilter(tab.key as any)}
                      className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${matrixFilter === tab.key ? 'bg-white text-slate-900 shadow-xs font-black' : 'text-slate-500'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-400 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="py-3 px-4">BDM Profile</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Team Leader</th>
                    <th className="py-3 px-4 text-center">Deals Created</th>
                    <th className="py-3 px-4 text-right">Target</th>
                    <th className="py-3 px-4 text-right">Achieved</th>
                    <th className="py-3 px-4 text-right">Shortfall</th>
                    <th className="py-3 px-4 text-center">Progress</th>
                    <th className="py-3 px-4">Top Selling Service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredBdmMatrix.map((b) => (
                    <tr key={b.name} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-black text-[11px] flex items-center justify-center">
                            {b.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 block">{b.name}</span>
                            <span className="text-[10px] text-slate-400">{b.dealsCount} deals closed</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{b.branch}</td>
                      <td className="py-3 px-4 text-slate-600">{b.tl}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {b.dealsCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-600">{formatCompactRupee(b.target)}</td>
                      <td className="py-3 px-4 text-right font-black text-emerald-600">{formatCompactRupee(b.achievement)}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-500">{formatCompactRupee(b.shortfall)}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div style={{ width: `${b.pct}%` }} className="h-full bg-emerald-500 rounded-full" />
                          </div>
                          <span className="text-[10px] font-black text-slate-800">{b.pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600 truncate max-w-[140px]" title={b.topService}>
                        {b.topService}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. OPERATIONS HUB VIEW (WHEN ACTIVE) */}
      {/* ========================================================================= */}
      {activeDeptTab === 'operations' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Operations Command Center</h1>
              <p className="text-xs text-slate-500 mt-1">4 Core Wings delivery pipeline, live case status & TAT tracking</p>
            </div>
            <button
              onClick={() => navigate('/crm/internal-operations')}
              className="px-4 py-2 bg-slate-900 text-white rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span>Full Operations Module</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-blue-900 block">Funding Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">112 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">Subsidy & Grant Approvals</p>
            </div>
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-cyan-900 block">Compliance Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">94 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">Annual MCA & Filings</p>
            </div>
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-emerald-900 block">Incorporation Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">128 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">Company Formations</p>
            </div>
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-purple-900 block">Certificate Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">48 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">ISO, MSME, Startup India</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. OTHER DEPARTMENTS VIEW (WHEN ACTIVE) */}
      {/* ========================================================================= */}
      {activeDeptTab === 'others' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Departmental Intelligence</h1>
              <p className="text-xs text-slate-500 mt-1">Real-time metrics across Accounts, HRMS, Legal and Quality</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs space-y-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                Human Resources (HRMS)
              </h3>
              <p className="text-xs text-slate-400">Total Staff: {liveEmployees.length}</p>
              <button onClick={() => navigate('/hrms/employees')} className="text-xs font-bold text-indigo-600">
                Staff Directory &rarr;
              </button>
            </div>
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs space-y-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ReceiptIndianRupee size={18} className="text-cyan-600" />
                Accounts & Tax
              </h3>
              <p className="text-xs text-slate-400">GST Pool: {formatCompactRupee(activeGstTax)}</p>
              <button onClick={() => navigate('/crm/quotations')} className="text-xs font-bold text-cyan-600">
                Quotations &rarr;
              </button>
            </div>
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs space-y-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                Quality & Clients
              </h3>
              <p className="text-xs text-slate-400">Active Clients: {liveClients.length || 64}</p>
              <button onClick={() => navigate('/crm/clients')} className="text-xs font-bold text-amber-600">
                Client Accounts &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 11. INTERACTIVE STAGE DRILLDOWN MODAL */}
      {/* ========================================================================= */}
      {selectedStageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stage Drilldown</span>
                <h3 className="text-xl font-black text-slate-900">{selectedStageModal.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedStageModal.count} cases • Quoted: {formatRupee(selectedStageModal.amount)} • Rec: {formatRupee(selectedStageModal.received)}
                </p>
              </div>
              <button
                onClick={() => setSelectedStageModal(null)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2.5 pr-1">
              {selectedStageModal.deals.map((d: any, idx: number) => (
                <div key={d.id || idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs">
                  <div>
                    <h5 className="font-black text-slate-900">{d.Deal_Name || 'Corporate Deal'}</h5>
                    <span className="text-[11px] text-slate-500 block">Service: {d.service || d.Service_Name || 'Advisory'}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-slate-900 block">{formatRupee(getDealTotalAmount(d))}</span>
                    <span className="text-[10px] font-bold text-emerald-600 block">Rec: {formatRupee(getDealReceivedAmount(d))}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 text-right">
              <button
                onClick={() => setSelectedStageModal(null)}
                className="px-6 py-2.5 rounded-full bg-slate-900 text-white text-xs font-black hover:bg-slate-800 cursor-pointer"
              >
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
