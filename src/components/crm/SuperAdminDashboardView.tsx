import React, { useState, useEffect, useMemo } from 'react';
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
  getDealGstAmount
} from '../../utils/dealSplitUtils';
import { fetchInternalOperations, getStoredInternalOperations } from '../../services/internalOperationsService';
import type { InternalOperationRecord } from '../../types/operations';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export type SuperAdminDeptTab = 'sales' | 'operations' | 'others';
export type TimeframeOption = 'today' | 'week' | 'month' | 'all';

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
  salesHOD: 8500000,          // ₹85.00 L
  branchAhmedabad: 4200000,   // ₹42.00 L
  branchJaipur: 2300000,      // ₹23.00 L
  branchChennai: 2000000,     // ₹20.00 L
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
// MAIN COMPONENT (CLASSY, AESTHETIC, CLAYMORPHIC FULL-SCREEN BENTO DASHBOARD)
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
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Target Simulator state
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [simulationBoost, setSimulationBoost] = useState<number>(15);

  // Inspector Drawer toggle (Image 2 right-side phone preview widget)
  const [showInspectorDrawer, setShowInspectorDrawer] = useState<boolean>(true);

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

  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);

  useEffect(() => {
    if (propsDeals && propsDeals.length > 0) setLiveDeals(propsDeals);
    if (propsEmployees && propsEmployees.length > 0) setLiveEmployees(propsEmployees);
    if (propsClients && propsClients.length > 0) setLiveClients(propsClients);
  }, [propsDeals, propsEmployees, propsClients]);

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
    return liveDeals.filter((d: any) => {
      if (!d || isDealCloned(d) || !isOctoberBooking(d)) return false;
      if (timeframe === 'today') return isDealToday(d);
      return true;
    });
  }, [liveDeals, timeframe]);

  // Financial Aggregations
  const monthlyRevenue = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [filteredDeals]);
  const monthlyBooked = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);
  const monthlyWithGst = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);
  const monthlyWithoutGst = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealAmountWithoutGst(d), 0), [filteredDeals]);
  const monthlyGstTax = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealGstAmount(d), 0), [filteredDeals]);

  const wonDealsCount = useMemo(() => {
    return filteredDeals.filter(d => {
      const st = String(d.Stage || d.Deal_Stage || '').toLowerCase();
      return st.includes('won') || st.includes('closed') || getDealReceivedAmount(d) > 0;
    }).length;
  }, [filteredDeals]);

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
    { id: 'sales', name: 'Sales Stage', count: 136, amount: 1294000, received: 1154000, color: '#3b82f6', heightPct: 45 },
    { id: 'account', name: 'Account Verification', count: 1, amount: 25900, received: 25900, color: '#a855f7', heightPct: 20 },
    { id: 'legal', name: 'Legal Drafting & Review', count: 32, amount: 1175000, received: 1279000, color: '#06b6d4', heightPct: 35 },
    { id: 'operations', name: 'Internal Operations', count: 183, amount: 4424000, received: 3831000, color: '#f59e0b', heightPct: 75 },
    { id: 'won', name: 'Closed Won Delivery', count: wonDealsCount || 346, amount: 6919000, received: 6234267, color: '#10b981', heightPct: 100 }
  ], [wonDealsCount]);

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

  // Top Selling Services
  const topServicesList = [
    { name: 'Gujarat Samriddhi Yojana', count: 184, received: 3831000, avg: 20820, icon: Zap, grad: 'from-emerald-500 to-teal-600' },
    { name: 'CGSS Scheme', count: 72, received: 1450000, avg: 20138, icon: Award, grad: 'from-blue-500 to-indigo-600' },
    { name: 'Business Advisory & Strategy', count: 48, received: 953267, avg: 19859, icon: Compass, grad: 'from-amber-500 to-orange-600' },
    { name: 'GeM Portal Registration', count: 26, received: 350000, avg: 13461, icon: Building2, grad: 'from-cyan-500 to-teal-600' },
  ];

  // Velocity Spline Area Data (Image 1 top left)
  const splineTrendData = [
    { name: 'W1', target: 20, booked: 28, received: 18 },
    { name: 'W2', target: 40, booked: 52, received: 34 },
    { name: 'W3', target: 60, booked: 85, received: 48 },
    { name: 'W4', target: 85, booked: 155, received: 62 }
  ];

  return (
    <div className="w-full min-h-screen bg-[#edf0f4] text-slate-800 antialiased font-sans -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-16 relative overflow-hidden select-none">
      {/* ========================================================================= */}
      {/* VIVID VISIONOS ATMOSPHERIC BLUR ORBS (COLOR DIFFUSION THROUGH LIQUID GLASS) */}
      {/* ========================================================================= */}
      {/* Orb 1: Warm Sunset Amber / Peach Glow (Top Center & Hero) */}
      <div className="absolute -top-24 left-1/4 w-[750px] h-[750px] bg-gradient-to-br from-amber-400/40 via-orange-300/35 to-rose-300/30 rounded-full blur-[140px] pointer-events-none -z-10 animate-pulse duration-10000" />
      
      {/* Orb 2: Frosted Periwinkle & Azure Glow (Top Left) */}
      <div className="absolute -top-20 -left-20 w-[580px] h-[580px] bg-gradient-to-tr from-indigo-400/35 via-sky-300/30 to-blue-200/25 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* Orb 3: Warm Terracotta & Coral Aura (Top / Mid Right) */}
      <div className="absolute top-48 -right-24 w-[700px] h-[700px] bg-gradient-to-bl from-rose-400/35 via-amber-300/30 to-orange-200/25 rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* Orb 4: Lime & Emerald Hub Aura (Mid Left) */}
      <div className="absolute top-[520px] -left-24 w-[640px] h-[640px] bg-gradient-to-tr from-lime-400/35 via-emerald-300/30 to-teal-300/25 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Orb 5: Radiant Lavender / Violet Aura (Mid Center Canvas) */}
      <div className="absolute top-[1050px] left-1/3 w-[700px] h-[700px] bg-gradient-to-br from-purple-400/30 via-indigo-300/25 to-pink-200/20 rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* Orb 6: Marine Cyan & Teal Aura (Bottom Canvas) */}
      <div className="absolute bottom-0 -right-24 w-[800px] h-[800px] bg-gradient-to-tr from-cyan-400/30 via-blue-300/25 to-teal-200/20 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* ========================================================================= */}
      {/* 1. TOP EXECUTIVE PILL NAVIGATION BAR (MATCHING SCREENSHOT) */}
      {/* ========================================================================= */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pt-1">
        {/* Left Side: Brand & Department Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black shadow-md shadow-slate-900/15">
            <Crown size={18} className="text-amber-400" />
          </div>

          <nav className="inline-flex p-1.5 bg-white/50 backdrop-blur-2xl rounded-full border border-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
            <button
              onClick={() => setActiveDeptTab('sales')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeDeptTab === 'sales'
                  ? 'bg-slate-900/95 text-white shadow-md shadow-slate-900/20 font-black backdrop-blur-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Briefcase size={14} className={activeDeptTab === 'sales' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Sales Intelligence</span>
            </button>

            <button
              onClick={() => setActiveDeptTab('operations')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeDeptTab === 'operations'
                  ? 'bg-slate-900/95 text-white shadow-md shadow-slate-900/20 font-black backdrop-blur-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Layers size={14} className={activeDeptTab === 'operations' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Operations (4 Wings)</span>
            </button>

            <button
              onClick={() => setActiveDeptTab('others')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeDeptTab === 'others'
                  ? 'bg-slate-900/95 text-white shadow-md shadow-slate-900/20 font-black backdrop-blur-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
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
              className="bg-white/50 backdrop-blur-2xl border border-white/80 text-slate-800 text-xs font-medium rounded-full pl-9 pr-4 py-2 w-44 sm:w-52 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-2xs"
            />
          </div>

          <div className="inline-flex p-1 bg-white/50 backdrop-blur-2xl rounded-full border border-white/80 shadow-2xs text-xs font-bold">
            <button
              onClick={() => setTimeframe('today')}
              className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${timeframe === 'today' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('month')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${timeframe === 'month' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
            >
              October 2026
            </button>
            <button
              onClick={() => setTimeframe('all')}
              className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${timeframe === 'all' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
            >
              All Time
            </button>
          </div>

          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className={`px-3.5 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showSimulator ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-white/50 backdrop-blur-2xl text-slate-700 border-white/80 hover:bg-white/75 shadow-2xs'
            }`}
          >
            <Sliders size={13} className={showSimulator ? 'text-white' : 'text-amber-600'} />
            <span className="hidden sm:inline">Target Simulator</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isLocalRefreshing || propsRefreshing}
            title="Live Sync from Zoho CRM"
            className="p-2.5 bg-white/50 hover:bg-white/75 backdrop-blur-2xl border border-white/80 rounded-full text-slate-700 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLocalRefreshing || propsRefreshing ? 'animate-spin text-amber-600' : 'text-slate-600'} />
          </button>

          <button
            onClick={() => setShowInspectorDrawer(!showInspectorDrawer)}
            className={`p-2.5 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
              showInspectorDrawer ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white/50 backdrop-blur-2xl text-slate-700 border-white/80 hover:bg-white/75 shadow-2xs'
            }`}
          >
            <Smartphone size={14} className={showInspectorDrawer ? 'text-amber-400' : 'text-slate-600'} />
            <span className="hidden sm:inline">Inspector</span>
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
            <div className="rounded-[2rem] bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 border border-amber-200/90 shadow-sm">
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
      {/* 2. SALES INTELLIGENCE: CLAYMORPHIC BENTO MOSAIC (EXACT REFERENCE DESIGN) */}
      {/* ========================================================================= */}
      {activeDeptTab === 'sales' && (
        <div className="space-y-6">

          {/* ------------------------------------------------------------------- */}
          {/* ROW 1: SCORE 730 HERO + TWIN METALLIC GLOW CARDS + RIGHT PHONE DRAWER */}
          {/* ------------------------------------------------------------------- */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

            {/* LEFT 8 OR 9 COLUMNS */}
            <div className={`${showInspectorDrawer ? 'xl:col-span-8 2xl:col-span-9' : 'xl:col-span-12'} space-y-5 transition-all duration-300`}>

              {/* TOP HERO SUB-ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* TILE 1: "Hey, Super Admin!" & SCORE 730 WITH TIER PIN (5 COLUMNS) */}
                <div className="lg:col-span-5 bg-white/55 backdrop-blur-3xl rounded-[2.4rem] p-6 sm:p-7 border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                      Hey, <span className="text-slate-800">Super Admin!</span>
                    </h2>
                    <p className="text-xs font-normal text-slate-500 mt-0.5">
                      Let's analyze your stats!
                    </p>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/60 backdrop-blur-md text-slate-700 text-[11px] font-bold mt-4 border border-white/80 shadow-2xs">
                      <span>Transaction Score</span>
                      <ChevronDown size={12} className="text-slate-400" />
                    </div>

                    <div className="flex items-baseline gap-3 mt-3">
                      <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight">
                        {achievementScore}
                      </span>
                      <div className="flex flex-col">
                        <span className="inline-flex items-center text-xs font-black text-emerald-600 bg-emerald-50/80 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                          ▲ +16 PTS
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium mt-0.5">Updated Today • October Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Segmented Tier Bar with Needle Pin (Image 2 replica) */}
                  <div className="pt-6">
                    <div className="relative pt-4">
                      <div
                        style={{ left: `${Math.min(92, Math.max(8, achievementPct))}%` }}
                        className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ring-4 ring-white shadow-md" />
                        <div className="w-0.5 h-3 bg-slate-900" />
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 h-2.5 rounded-full overflow-hidden p-0.5 bg-slate-900/5 backdrop-blur-sm">
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

                {/* TILE 2: TWIN LUXURY GLOWING CARDS (TD BANK STYLE IN SCREENSHOT) (7 COLUMNS) */}
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* CARD A: LIME / EMERALD GLOW CARD (AHMEDABAD HUB) */}
                  <div className="rounded-[2.4rem] p-6 bg-gradient-to-br from-[#16301c]/90 via-[#274c2b]/85 to-[#669830]/90 backdrop-blur-3xl text-white shadow-[0_20px_50px_rgba(39,76,43,0.3),inset_0_1.5px_2px_rgba(255,255,255,0.4)] border border-white/20 flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/15 rounded-full blur-2xl group-hover:scale-125 transition-transform" />

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/25 shadow-2xs">
                            <Building2 size={15} className="text-emerald-200" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-white block">Ahmedabad Hub</span>
                            <span className="text-[10px] text-emerald-200/80">Primary Engine</span>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate('/crm/deals')}
                          className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
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
                  <div className="rounded-[2.4rem] p-6 bg-gradient-to-br from-[#3e1e17]/90 via-[#5e3124]/85 to-[#a45942]/90 backdrop-blur-3xl text-white shadow-[0_20px_50px_rgba(94,49,36,0.3),inset_0_1.5px_2px_rgba(255,255,255,0.4)] border border-white/20 flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/15 rounded-full blur-2xl group-hover:scale-125 transition-transform" />

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

              {/* ----------------------------------------------------------------- */}
              {/* TARGET VS ACHIEVEMENT OVERVIEW (NATIONAL & 3 BRANCHES) */}
              {/* ----------------------------------------------------------------- */}
              <div className="rounded-[2.4rem] bg-white/55 backdrop-blur-3xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] space-y-4 transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
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

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-xs font-extrabold text-slate-700">
                    <span>Full Sales Organization Progress</span>
                    <span className="text-indigo-600 font-black">{achievementPct}% Achieved</span>
                  </div>
                  <div className="w-full h-3 bg-slate-900/5 backdrop-blur-sm rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${achievementPct}%` }}
                      className="bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 h-full rounded-full transition-all duration-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
                  <div className="p-4 rounded-2xl bg-white/45 backdrop-blur-2xl border border-white/70 shadow-2xs hover:bg-white/65 hover:border-white/90 transition-all">
                    <div className="flex justify-between text-xs font-black text-slate-800">
                      <span className="flex items-center gap-1"><MapPin size={12} className="text-indigo-600" /> Ahmedabad Branch</span>
                      <span className="text-emerald-600 font-black">100%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900/5 rounded-full my-2 overflow-hidden">
                      <div className="h-full bg-emerald-500 w-full rounded-full" />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                      <span>Ach: {formatCompactRupee(6234267)}</span>
                      <span className="text-emerald-600 font-black">Shortfall: ₹0</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/45 backdrop-blur-2xl border border-white/70 shadow-2xs hover:bg-white/65 hover:border-white/90 transition-all">
                    <div className="flex justify-between text-xs font-black text-slate-800">
                      <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> Jaipur Branch</span>
                      <span className="text-slate-400 font-bold">0%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900/5 rounded-full my-2 overflow-hidden">
                      <div className="h-full bg-slate-300 w-0" />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                      <span>Ach: ₹0</span>
                      <span className="text-rose-500 font-black">Shortfall: {formatCompactRupee(2300000)}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/45 backdrop-blur-2xl border border-white/70 shadow-2xs hover:bg-white/65 hover:border-white/90 transition-all">
                    <div className="flex justify-between text-xs font-black text-slate-800">
                      <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> Chennai Branch</span>
                      <span className="text-slate-400 font-bold">0%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900/5 rounded-full my-2 overflow-hidden">
                      <div className="h-full bg-slate-300 w-0" />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                      <span>Ach: ₹0</span>
                      <span className="text-rose-500 font-black">Shortfall: {formatCompactRupee(2000000)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* GST TAX FINANCIAL RECONCILIATION CARDS */}
              {/* ----------------------------------------------------------------- */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/55 backdrop-blur-3xl rounded-[2.2rem] p-5 border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.03),inset_0_1.5px_2px_rgba(255,255,255,1)] flex items-center justify-between hover:shadow-[0_16px_40px_rgba(0,0,0,0.05)] transition-all">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">With GST Amount</span>
                    <span className="text-xl font-black text-cyan-600 tracking-tight block mt-1">{formatRupee(monthlyWithGst)}</span>
                    <span className="text-[10px] font-bold text-slate-500 block">Gross Billing Volume</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-cyan-50/80 backdrop-blur-md text-cyan-600 shadow-2xs border border-cyan-100/60">
                    <ReceiptIndianRupee size={22} />
                  </div>
                </div>

                <div className="bg-white/55 backdrop-blur-3xl rounded-[2.2rem] p-5 border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.03),inset_0_1.5px_2px_rgba(255,255,255,1)] flex items-center justify-between hover:shadow-[0_16px_40px_rgba(0,0,0,0.05)] transition-all">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Without GST Amount</span>
                    <span className="text-xl font-black text-blue-600 tracking-tight block mt-1">{formatRupee(monthlyWithoutGst)}</span>
                    <span className="text-[10px] font-bold text-slate-500 block">Net Realized Core</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-blue-50/80 backdrop-blur-md text-blue-600 shadow-2xs border border-blue-100/60">
                    <Calculator size={22} />
                  </div>
                </div>

                <div className="bg-white/55 backdrop-blur-3xl rounded-[2.2rem] p-5 border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.03),inset_0_1.5px_2px_rgba(255,255,255,1)] flex items-center justify-between hover:shadow-[0_16px_40px_rgba(0,0,0,0.05)] transition-all">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Statutory GST Tax</span>
                    <span className="text-xl font-black text-amber-600 tracking-tight block mt-1">{formatRupee(monthlyGstTax)}</span>
                    <span className="text-[10px] font-bold text-slate-500 block">18% Compliant Tax</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-50/80 backdrop-blur-md text-amber-600 shadow-2xs border border-amber-100/60">
                    <ReceiptIndianRupee size={22} />
                  </div>
                </div>

                <div className="bg-white/55 backdrop-blur-3xl rounded-[2.2rem] p-5 border border-white/80 shadow-[0_12px_32px_rgba(0,0,0,0.03),inset_0_1.5px_2px_rgba(255,255,255,1)] flex items-center justify-between hover:shadow-[0_16px_40px_rgba(0,0,0,0.05)] transition-all">
                  <div className="min-w-0 pr-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Top High Performer</span>
                    <span className="text-base font-black text-slate-900 tracking-tight block mt-1 truncate">{topHighPerformer.name}</span>
                    <span className="text-[10px] font-bold text-emerald-600 block">{topHighPerformer.branch} • {formatCompactRupee(topHighPerformer.achievement)}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-purple-50/80 backdrop-blur-md text-purple-600 shadow-2xs border border-purple-100/60 shrink-0">
                    <Trophy size={22} />
                  </div>
                </div>
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* BHARATEDGE MINDMAP FLOW CANVAS (EXACT CENTERPIECE OF IMAGE 1) */}
              {/* ----------------------------------------------------------------- */}
              <div className="rounded-[2.4rem] bg-white/55 backdrop-blur-3xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] relative overflow-hidden space-y-4 transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/70 backdrop-blur-xl flex items-center justify-center text-slate-800 shadow-2xs border border-white/80">
                      <Network size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 tracking-tight">BharatEdge Sales Mindmap Network</h3>
                      <p className="text-xs text-slate-400 font-medium">Click any branch or leader node to inspect live deal distribution</p>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/60 backdrop-blur-xl border border-white/80 text-slate-700 shadow-2xs">
                    Interactive Tree Canvas
                  </span>
                </div>

                <div className="py-6 px-4 bg-white/35 backdrop-blur-2xl rounded-3xl border border-white/60 flex flex-col md:flex-row items-center justify-around gap-6">
                  {/* Enterprise Node */}
                  <div
                    onClick={() => setInspectedEntity({
                      title: 'BharatEdge Enterprise',
                      subtitle: 'National Sales Operations',
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
                    className="p-5 rounded-3xl bg-white/75 backdrop-blur-2xl border-2 border-indigo-500/80 shadow-lg text-center cursor-pointer hover:scale-105 transition-transform"
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
                      className="p-3.5 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 hover:bg-white/85 hover:border-emerald-400 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all"
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
                      className="p-3.5 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 hover:bg-white/85 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all"
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
                      className="p-3.5 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 hover:bg-white/85 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all"
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
                      className="p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 hover:bg-white/85 hover:border-indigo-400 shadow-xs flex items-center justify-between gap-3 cursor-pointer"
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
                      className="p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 hover:bg-white/85 hover:border-indigo-400 shadow-xs flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <span className="text-xs font-black text-slate-800">Uday Dubey (TL)</span>
                      <span className="text-xs font-black text-indigo-600">₹3.36 L</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* VELOCITY SPLINE CHART & PIPELINE PROGRESSION (IMAGE 1 BENTO) */}
              {/* ----------------------------------------------------------------- */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

                {/* DUAL SMOOTH AREA SPLINE CHART */}
                <div className="md:col-span-6 bg-white/55 backdrop-blur-3xl rounded-[2.4rem] p-6 sm:p-7 border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Velocity Trend</span>
                      <h4 className="text-base font-black text-slate-900 tracking-tight">Sales Inflow vs Quota</h4>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-900" /> Booked</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Received</span>
                    </div>
                  </div>

                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={splineTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="splineGreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          formatter={(val: any) => [`₹${val} L`, '']}
                          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                        />
                        <Area type="monotone" dataKey="booked" stroke="#0f172a" strokeWidth={2.5} fillOpacity={0} />
                        <Area type="monotone" dataKey="received" stroke="#10b981" strokeWidth={2.5} fill="url(#splineGreen)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* PIPELINE PROGRESSION BARS (IMAGE 1 MIDDLE RIGHT) */}
                <div className="md:col-span-6 bg-white/55 backdrop-blur-3xl rounded-[2.4rem] p-6 sm:p-7 border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Workflow Stages</span>
                      <h4 className="text-base font-black text-slate-900 tracking-tight">Deal Pipeline Progression</h4>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">Click bar to drilldown</span>
                  </div>

                  <div className="grid grid-cols-5 gap-2 items-end h-44 pt-3 pb-1">
                    {pipelineStages.map(st => (
                      <div
                        key={st.id}
                        onClick={() => handleStageClick(st)}
                        className="flex flex-col items-center justify-end h-full gap-2 cursor-pointer group"
                      >
                        <div className="text-[10px] font-black text-slate-700 group-hover:text-emerald-600 transition-colors">
                          {st.count}
                        </div>
                        <div className="w-full bg-slate-900/5 backdrop-blur-sm rounded-t-xl overflow-hidden h-32 flex items-end">
                          <div
                            style={{ height: `${st.heightPct}%`, backgroundColor: st.color }}
                            className="w-full rounded-t-xl group-hover:opacity-90 transition-all duration-500 shadow-sm"
                          />
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 truncate max-w-full group-hover:text-slate-800" title={st.name}>
                          {st.name.split(' ')[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* ----------------------------------------------------------------- */}
              {/* BRANCH DONUT & TOP SERVICES & SCHEMES GRID */}
              {/* ----------------------------------------------------------------- */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Branch Revenue Donut Chart */}
                <div className="lg:col-span-4 bg-white/55 backdrop-blur-3xl rounded-[2.4rem] p-6 sm:p-7 border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Regional Mix</span>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">Branch Revenue Share</h4>
                  </div>

                  <div className="h-44 relative flex items-center justify-center my-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={branchPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {branchPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(val: any) => [formatRupee(Number(val)), 'Received']}
                          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Ahmedabad</span>
                      <span className="text-sm font-black text-slate-900">{formatCompactRupee(monthlyRevenue)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-center pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 block">Ahmedabad</span>
                      <span className="font-black text-emerald-600">100%</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 block">Jaipur</span>
                      <span className="font-bold text-slate-400">0%</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 block">Chennai</span>
                      <span className="font-bold text-slate-400">0%</span>
                    </div>
                  </div>
                </div>

                {/* Top Selling Services Grid (8 Columns) */}
                <div className="lg:col-span-8 bg-white/55 backdrop-blur-3xl rounded-[2.4rem] p-6 sm:p-7 border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">High Volume Verticals</span>
                      <h4 className="text-base font-black text-slate-900 tracking-tight">Top Selling Services & Schemes</h4>
                    </div>
                    <span className="text-xs font-black text-emerald-700 bg-emerald-50/80 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-100/80 shadow-2xs">
                      Total: {formatCompactRupee(monthlyRevenue)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {topServicesList.map((srv, idx) => {
                      const SrvIcon = srv.icon;
                      return (
                        <div key={srv.name} className="p-3.5 rounded-2xl bg-white/45 backdrop-blur-2xl border border-white/70 flex items-center justify-between gap-3 shadow-2xs hover:bg-white/65 hover:border-white/90 transition-all">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${srv.grad} text-white flex items-center justify-center shrink-0 shadow-2xs`}>
                              <SrvIcon size={14} />
                            </div>
                            <div className="truncate">
                              <h5 className="text-xs font-black text-slate-900 truncate" title={srv.name}>{srv.name}</h5>
                              <span className="text-[10px] text-slate-400">{srv.count} deals • Avg: {formatCompactRupee(srv.avg)}</span>
                            </div>
                          </div>
                          <span className="text-xs font-black text-emerald-700 shrink-0">{formatCompactRupee(srv.received)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* BDM PERFORMANCE MATRIX TABLE (ALL 39 BDMS WITH DEALS CREATED) */}
              {/* ----------------------------------------------------------------- */}
              <div className="rounded-[2.4rem] bg-white/55 backdrop-blur-3xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.4)] space-y-4 transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Users size={18} className="text-indigo-600" />
                      BDM Performance Matrix
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">Frontline sales representatives ranked by revenue realization</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={matrixSearch}
                        onChange={(e) => setMatrixSearch(e.target.value)}
                        placeholder="Search BDM..."
                        className="pl-7 pr-3 py-1 bg-white/60 backdrop-blur-md border border-white/80 rounded-full text-xs font-medium text-slate-800 focus:outline-none w-32 sm:w-40 shadow-2xs"
                      />
                    </div>

                    <div className="inline-flex p-1 bg-white/50 backdrop-blur-xl border border-white/80 rounded-full text-[11px] font-bold shadow-2xs">
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
                          className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${matrixFilter === tab.key ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
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
                      <tr className="bg-white/40 backdrop-blur-md border-b border-white/60 text-slate-500 uppercase tracking-wider font-extrabold text-[10px]">
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
                    <tbody className="divide-y divide-white/40 font-medium text-slate-700">
                      {filteredBdmMatrix.map((b) => (
                        <tr key={b.name} className="hover:bg-white/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-white/70 backdrop-blur-sm border border-white/80 text-slate-800 font-black text-[11px] flex items-center justify-center shadow-2xs">
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
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50/80 backdrop-blur-sm text-indigo-700 border border-indigo-100/80 shadow-2xs">
                              {b.dealsCount}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-600">{formatCompactRupee(b.target)}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-600">{formatCompactRupee(b.achievement)}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-500">{formatCompactRupee(b.shortfall)}</td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 h-1.5 bg-slate-900/5 backdrop-blur-sm rounded-full overflow-hidden">
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

            {/* ----------------------------------------------------------------- */}
            {/* RIGHT COMPANION WIDGET: SMARTPHONE / INSPECTOR DRAWER (IMAGE 2) */}
            {/* ----------------------------------------------------------------- */}
            {showInspectorDrawer && (
              <div className="xl:col-span-4 2xl:col-span-3">
                <div className="rounded-[2.8rem] bg-gradient-to-b from-[#241a18]/90 via-[#3a2722]/85 to-[#1c1412]/90 backdrop-blur-3xl text-white p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35),inset_0_1.5px_2px_rgba(255,255,255,0.2)] border border-white/20 relative overflow-hidden flex flex-col justify-between sticky top-4">

                  {/* Speaker notch */}
                  <div className="w-16 h-1.5 bg-white/20 rounded-full mx-auto mb-5" />

                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                          <Crown size={14} className="text-amber-400" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-white block">BharatEdge Group</span>
                          <span className="text-[10px] text-amber-200/80">Executive Inspector</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowInspectorDrawer(false)}
                        className="text-white/60 hover:text-white p-1"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Personal vs Team Switcher */}
                    <div className="grid grid-cols-2 p-1 bg-white/10 rounded-full mb-5 text-xs font-bold backdrop-blur-md">
                      <button
                        onClick={() => setTlViewMode('personal')}
                        className={`py-1.5 rounded-full transition-all cursor-pointer ${tlViewMode === 'personal' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-white/70'}`}
                      >
                        Personal
                      </button>
                      <button
                        onClick={() => setTlViewMode('team')}
                        className={`py-1.5 rounded-full transition-all cursor-pointer ${tlViewMode === 'team' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-white/70'}`}
                      >
                        Team
                      </button>
                    </div>

                    {/* Realized Revenue */}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200/80 block">
                      Realized Revenue
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-3xl font-black text-white tracking-tight">
                        {formatRupee(inspectedEntity.achievement)}
                      </span>
                    </div>

                    {/* Quota Progress Pill */}
                    <div className="mt-3 p-3 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-white/60 block">Target Quota</span>
                        <span className="font-black text-white">{formatCompactRupee(inspectedEntity.target)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-white/60 block">Deals Won</span>
                        <span className="font-black text-emerald-400">{inspectedEntity.dealsWon} Won</span>
                      </div>
                    </div>

                    {/* BEST SELLING SERVICE CARD */}
                    <div className="mt-4 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                          <Sparkles size={11} /> Best Selling Service
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-400/20 text-amber-300">
                          Top Seller
                        </span>
                      </div>

                      <h5 className="text-sm font-black text-white leading-snug">
                        {inspectedEntity.bestService}
                      </h5>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                        <div>
                          <span className="text-[9px] text-white/60 block">Closed Deals</span>
                          <span className="font-black text-white">{inspectedEntity.bestServiceDeals} Deals</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-white/60 block">Rec. Cash</span>
                          <span className="font-black text-emerald-400">{formatCompactRupee(inspectedEntity.bestServiceRevenue)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 2026 Deal Schedule Dots */}
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block mb-2">
                        2026 Schedule
                      </span>
                      <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                        {['Jul', 'Aug', 'Sep', 'Oct'].map((m, idx) => (
                          <div key={m} className={`p-2 rounded-xl border ${idx === 3 ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-black' : 'bg-white/5 border-white/10 text-white/60'}`}>
                            <span>{m}</span>
                            <span className="block mt-0.5 text-xs">✓</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => navigate('/crm/deals')}
                    className="w-full mt-5 py-3 rounded-full bg-white text-slate-900 text-xs font-black hover:bg-slate-100 transition-all shadow-lg shadow-black/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Briefcase size={14} />
                    <span>Inspect All Records</span>
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. OPERATIONS HUB VIEW */}
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
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-blue-900 block">Funding Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">112 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">Subsidy & Grant Approvals</p>
            </div>
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-cyan-900 block">Compliance Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">94 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">Annual MCA & Filings</p>
            </div>
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-emerald-900 block">Incorporation Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">128 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">Company Formations</p>
            </div>
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs">
              <span className="text-xs font-black text-purple-900 block">Certificate Wing</span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">48 Cases</h4>
              <p className="text-xs text-slate-400 mt-0.5">ISO, MSME, Startup India</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. OTHER DEPARTMENTS VIEW */}
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
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs space-y-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                Human Resources (HRMS)
              </h3>
              <p className="text-xs text-slate-400">Total Staff: {liveEmployees.length}</p>
              <button onClick={() => navigate('/hrms/employees')} className="text-xs font-bold text-indigo-600">
                Staff Directory &rarr;
              </button>
            </div>
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs space-y-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ReceiptIndianRupee size={18} className="text-cyan-600" />
                Accounts & Tax
              </h3>
              <p className="text-xs text-slate-400">GST Pool: {formatCompactRupee(monthlyGstTax)}</p>
              <button onClick={() => navigate('/crm/quotations')} className="text-xs font-bold text-cyan-600">
                Quotations &rarr;
              </button>
            </div>
            <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 border border-white shadow-xs space-y-3">
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
      {/* 5. INTERACTIVE STAGE DRILLDOWN MODAL */}
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
