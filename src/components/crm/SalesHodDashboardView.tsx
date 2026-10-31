import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Search, Filter, TrendingUp, TrendingDown, Users,
  Layers, ChevronRight, ChevronDown, Award, Trophy, Target,
  DollarSign, PieChart as PieChartIcon, BarChart3, ArrowUpRight,
  Shield, CheckCircle2, Clock, AlertTriangle, Building2, MapPin,
  Sparkles, RefreshCw, Briefcase, Zap, Flame, UserCheck, Eye,
  Maximize2, Minimize2, Compass, Activity, FileText,
  GitBranch, Network, Share2, Send, ZoomIn, ZoomOut, RotateCcw,
  SlidersHorizontal, Sliders, Download, Check, X, Info
} from 'lucide-react';
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
  isDealPaymentVerified
} from '../../utils/dealSplitUtils';

// ============================================================================
// TYPES & BENCHMARKS
// ============================================================================

export type TimeframeOption = 'today' | 'week' | 'month' | 'quarter' | 'all';

export interface SalesHodDashboardViewProps {
  deals?: any[];
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
    d.Payment_Date ||
    d.Closing_Date ||
    d.Created_Time ||
    d.date ||
    d.rawZohoDeal?.Booking_Date ||
    d.rawZohoDeal?.Created_Time;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return isNaN(ms) ? null : ms;
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

  // Executive Tools state
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [simulationBoost, setSimulationBoost] = useState<number>(15); // +15% default simulation
  const [activeTab, setActiveTab] = useState<'overview' | 'charts' | 'matrix'>('overview');
  const [matrixSearch, setMatrixSearch] = useState<string>('');

  // Load live data if props change
  useEffect(() => {
    if (propsDeals && propsDeals.length > 0) setLiveDeals(propsDeals);
    if (propsEmployees && propsEmployees.length > 0) setLiveEmployees(propsEmployees);
    if (propsQuotations && propsQuotations.length > 0) setLiveQuotations(propsQuotations);
  }, [propsDeals, propsEmployees, propsQuotations]);

  useEffect(() => {
    if (!propsDeals || propsDeals.length === 0) {
      const fetchAllLiveData = async () => {
        setIsLoading(true);
        try {
          const [dealsRes, empRes] = await Promise.all([
            fetch('/api/deals?fetchAll=true').then(r => r.json()).catch(() => null),
            fetch('/api/zoho/get-employees').then(r => r.json()).catch(() => null)
          ]);
          if (dealsRes && Array.isArray(dealsRes.data)) setLiveDeals(dealsRes.data);
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

  // Filter deals based on active timeframe
  const filteredDeals = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const sevenDaysAgoMs = nowMs - 7 * 86400000;

    return liveDeals.filter((d: any) => {
      if (!d) return false;
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
  const todayDeals = useMemo(() => liveDeals.filter(d => isDealToday(d)), [liveDeals]);
  const currentMonthDeals = useMemo(() => {
    return liveDeals.filter(d => {
      const ms = getDealDateMs(d);
      if (!ms) return false;
      const dt = new Date(ms);
      return dt.getMonth() === 9 && dt.getFullYear() === 2026;
    });
  }, [liveDeals]);

  // 1. TODAY'S REVENUE
  const todayRevenue = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [todayDeals]);
  const todayBooked = useMemo(() => todayDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [todayDeals]);

  // 2. MONTHLY REVENUE
  const monthlyRevenue = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [currentMonthDeals]);
  const monthlyBooked = useMemo(() => currentMonthDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [currentMonthDeals]);

  // 3. REVENUE BREAKDOWN
  const totalReceivedAmount = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0), [filteredDeals]);
  const totalPendingAmount = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealPendingAmount(d), 0), [filteredDeals]);
  const totalBookedValue = useMemo(() => filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0), [filteredDeals]);

  // 4. TOP SELLING SERVICES
  const topServices = useMemo(() => {
    const map = new Map<string, { name: string; count: number; received: number; booked: number }>();
    filteredDeals.forEach(d => {
      let s = d.service || d.Service_Name || d.Choose_Wisely || (d.servicesData?.[0]?.name) || 'Consulting Services';
      if (!s || s === 'N/A' || s === 'Choose Wisely' || s === 'Services') s = 'Business Advisory';
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

    filteredDeals.forEach(d => {
      const candidates = [
        d.salesEmployee,
        d.employeeName,
        d.Employee?.name,
        d.Owner?.name,
        d.rawZohoDeal?.Deal_Owner?.name,
        d.rawZohoDeal?.Created_By?.name
      ];
      let empName = 'Unassigned Sales';
      for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim() && c !== 'N/A') {
          empName = c.trim();
          break;
        }
      }

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
  }, [filteredDeals]);

  // Helper to match BDM deals
  const matchBdmDeals = (officialName: string, claimedSet: Set<string>) => {
    const cleanOfficial = officialName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let totalRec = 0;
    let totalBkd = 0;
    let totalCnt = 0;
    let dealList: any[] = [];

    bdmPerformance.forEach((val, cleanKey) => {
      if (claimedSet.has(cleanKey)) return;
      const isDirectMatch = cleanKey === cleanOfficial;
      const isSubMatch = cleanKey.includes(cleanOfficial) || cleanOfficial.includes(cleanKey);
      const wordsOff = officialName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const isWordMatch = wordsOff.length > 0 && wordsOff.some(w => cleanKey.includes(w));

      if (isDirectMatch || isSubMatch || isWordMatch) {
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

    const branchNodes: SalesTreeNode[] = branchConfigs.map(bc => {
      let branchReceived = 0;
      let branchBooked = 0;
      let branchDealsCount = 0;
      let branchAllDeals: any[] = [];

      const tlNodes: SalesTreeNode[] = bc.tls.map(tl => {
        let tlReceived = 0;
        let tlBooked = 0;
        let tlDealsCount = 0;
        let tlAllDeals: any[] = [];

        const tmNodes: SalesTreeNode[] = tl.tms.map(tmName => {
          const matched = matchBdmDeals(tmName, new Set<string>());
          const tmTarget = TARGET_BENCHMARKS.tm;
          const tmShortfall = Math.max(0, tmTarget - matched.received);

          tlReceived += matched.received;
          tlBooked += matched.booked;
          tlDealsCount += matched.count;
          tlAllDeals = [...tlAllDeals, ...matched.deals];

          // Determine TM's top service
          const sMap = new Map<string, number>();
          matched.deals.forEach(d => {
            const sn = String(d.service || d.Service_Name || 'Advisory').trim();
            sMap.set(sn, (sMap.get(sn) || 0) + 1);
          });
          let bestS = 'Advisory Services';
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

        // Add TL direct deals
        const tlDirect = matchBdmDeals(tl.name, new Set<string>());
        tlReceived += tlDirect.received;
        tlBooked += tlDirect.booked;
        tlDealsCount += tlDirect.count;
        tlAllDeals = [...tlAllDeals, ...tlDirect.deals];

        const tlShortfall = Math.max(0, tl.target - tlReceived);
        branchReceived += tlReceived;
        branchBooked += tlBooked;
        branchDealsCount += tlDealsCount;
        branchAllDeals = [...branchAllDeals, ...tlAllDeals];

        return {
          id: `tl_${tl.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: tl.name,
          roleType: 'tl',
          subtitle: tl.title,
          branchName: bc.name,
          target: tl.target,
          achievement: tlReceived,
          shortfall: tlShortfall,
          bookedAmount: tlBooked,
          dealsCount: tlDealsCount,
          wonCount: tlAllDeals.filter(d => isDealPaymentVerified(d)).length,
          children: tmNodes,
          deals: tlAllDeals
        };
      });

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

  // High Performers
  const topHighPerformer = useMemo<{ name: string; received: number } | null>(() => {
    let best: { name: string; received: number } | null = null;
    bdmPerformance.forEach(val => {
      if (!best || val.received > best.received) {
        best = { name: val.name, received: val.received };
      }
    });
    return best;
  }, [bdmPerformance]);

  const topHighBranch = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    if (branches.length === 0) return null;
    return [...branches].sort((a, b) => b.achievement - a.achievement)[0];
  }, [salesTree]);

  // Deal Stage Pipeline counts
  const stageStats = useMemo(() => {
    const stages = [
      { name: 'Sales Stage', match: ['sales', 'pitch', 'lead'], count: 0, amount: 0, received: 0, color: 'bg-blue-500' },
      { name: 'Account Verification', match: ['account', 'audit'], count: 0, amount: 0, received: 0, color: 'bg-purple-500' },
      { name: 'Legal Drafting & Review', match: ['legal', 'draft'], count: 0, amount: 0, received: 0, color: 'bg-cyan-500' },
      { name: 'Internal Operations', match: ['operation', 'allocat', 'execut'], count: 0, amount: 0, received: 0, color: 'bg-amber-500' },
      { name: 'Closed Won Delivery', match: ['won', 'deliver', 'complet'], count: 0, amount: 0, received: 0, color: 'bg-emerald-500' }
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
          matched = true;
          break;
        }
      }
      if (!matched) {
        stages[0].count++;
        stages[0].amount += tot;
        stages[0].received += rec;
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
      color: colors[st.name] || '#64748b'
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
  const [activeInspectLevel, setActiveInspectLevel] = useState<'root' | 'sales' | 'branch' | 'tl' | 'tm'>('tm');

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
  const bdmList = useMemo(() => {
    const list: any[] = [];
    (salesTree.children?.[0]?.children || []).forEach(br => {
      (br.children || []).forEach(tl => {
        (tl.children || []).forEach(tm => {
          list.push({
            id: tm.id,
            name: tm.name,
            branch: br.name.replace(' Branch', ''),
            tl: tl.name,
            target: tm.target,
            achievement: tm.achievement,
            shortfall: tm.shortfall,
            dealsCount: tm.dealsCount,
            topService: tm.topService || 'Business Advisory',
            pct: tm.target > 0 ? Math.round((tm.achievement / tm.target) * 100) : 0
          });
        });
      });
    });
    if (!matrixSearch.trim()) return list;
    const q = matrixSearch.toLowerCase();
    return list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.branch.toLowerCase().includes(q) ||
      b.tl.toLowerCase().includes(q) ||
      b.topService.toLowerCase().includes(q)
    );
  }, [salesTree, matrixSearch]);

  // Executive CSV Export Tool
  const handleExportCsv = () => {
    const headers = ['BDM Name', 'Branch', 'Team Leader', 'Target (INR)', 'Achievement (INR)', 'Shortfall (INR)', 'Deals Count', 'Top Service'];
    const rows = bdmList.map(b => [
      `"${b.name}"`,
      `"${b.branch}"`,
      `"${b.tl}"`,
      b.target,
      b.achievement,
      b.shortfall,
      b.dealsCount,
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
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Sales Executive Intelligence Hub
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  National HOD
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Real-time Zoho CRM Revenue Tracking, Hierarchy Shortfall Network & Quota Simulator
              </p>
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
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer capitalize ${
                  timeframe === tf
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
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showSimulator
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
      {/* 1. TOP EXECUTIVE REVENUE STRIP (CRISP WHITE LIGHT THEME) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Today's Revenue */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm">
              <DollarSign size={20} />
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
              Today Live
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Revenue</p>
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
              {formatRupee(todayRevenue)}
            </h3>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium">
              <span>Booked Total: <strong className="text-slate-800">{formatCompactRupee(todayBooked)}</strong></span>
              <span>Deals: <strong className="text-indigo-600">{todayDeals.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 2: Monthly Revenue */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-emerald-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">
              <TrendingUp size={20} />
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
              October 2026
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Revenue</p>
            <h3 className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight mt-1">
              {formatRupee(monthlyRevenue)}
            </h3>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium">
              <span>Booked Value: <strong className="text-slate-800">{formatCompactRupee(monthlyBooked)}</strong></span>
              <span>Month Deals: <strong className="text-emerald-700">{currentMonthDeals.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 3: Revenue Breakdown */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-amber-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 shadow-sm">
              <PieChartIcon size={20} />
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
              Received vs Pending
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Breakdown</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">
                {formatCompactRupee(totalReceivedAmount)}
              </h3>
              <span className="text-xs text-slate-400">rec /</span>
              <span className="text-base font-bold text-rose-500">
                {formatCompactRupee(totalPendingAmount)}
              </span>
              <span className="text-xs text-slate-400">pend</span>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full h-2.5 bg-slate-100 rounded-full mt-3 overflow-hidden flex">
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
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 font-medium">
              <span>Rec Ratio: <strong className="text-slate-800">{totalBookedValue > 0 ? Math.round((totalReceivedAmount / totalBookedValue) * 100) : 0}%</strong></span>
              <span>Total Quoted: <strong className="text-slate-800">{formatCompactRupee(totalBookedValue)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 4: Top High Performer & Branch */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-xl hover:border-purple-300 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3.5 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 shadow-sm">
              <Trophy size={20} />
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
              National Leader
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top High Performer</p>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1 truncate" title={topHighPerformer?.name}>
              {topHighPerformer ? topHighPerformer.name : 'Calculating...'}
            </h3>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 font-medium">
              <span>Branch: <strong className="text-indigo-600">{topHighBranch?.name.split(' ')[0] || 'Ahmedabad'}</strong></span>
              <span>Revenue: <strong className="text-emerald-600">{formatCompactRupee(topHighPerformer?.received || 0)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. NEW INTERACTIVE VISUAL GRAPHS (PIE CHARTS & TARGET COMPARATIVE BARS) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              <span key={st.name} className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                <span>{st.name}: <strong>{st.value}</strong></span>
              </span>
            ))}
          </div>
        </div>

        {/* Graph 3: Branch Target vs Achievement Comparative Bar Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BarChart3 size={16} className="text-amber-500" />
                Target vs Shortfall (in Lakhs)
              </h3>
              <span className="text-xs font-bold text-slate-500">Branch Quota</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Comparison of Target benchmark vs. Achieved revenue and Shortfall gap.
            </p>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <RechartsTooltip
                  formatter={(val: any, name: any) => [`₹${val} Lakhs`, name]}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', fontSize: '12px' }}
                />
                <Bar dataKey="Target" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Achieved" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Shortfall" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-around mt-4 pt-4 border-t border-slate-100 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> Target
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Achieved
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Shortfall
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LIGHT THEME RADIAL MINDMAP FLOW (EXACT USER SPECIFICATION) */}
      {(() => {
        const itemStep = 38;
        const currentTms = activeTl?.tms || [];
        const tmCount = currentTms.length || 7;
        const canvasHeight = Math.max(620, tmCount * itemStep + 70);

        // Col 0: Logo Orb
        const orbSocketY = canvasHeight / 2;
        const x0 = 135; // right socket of orb

        // Col 1: Sales Card
        const col1Left = 190;
        const col1Width = 115;
        const col1Right = 305;
        const col1Height = 46;
        const col1Top = orbSocketY - col1Height / 2;

        // Col 2: 3 Branches (Ahmedabad, Jaipur, Chennai)
        const col2Left = 370;
        const col2Width = 140;
        const col2Right = 510;
        const branchHeight = 44;
        const branchGap = 16;
        const totalBranchHeight = 3 * branchHeight + 2 * branchGap; // 164
        const col2StartY = (canvasHeight - totalBranchHeight) / 2;
        const activeBranchCenterY = col2StartY + activeBranchIndex * (branchHeight + branchGap) + branchHeight / 2;

        // Col 3: TLs of Active Branch
        const col3Left = 570;
        const col3Width = 165;
        const col3Right = 735;
        const currentTls = activeBranch?.tls || [];
        const tlCount = currentTls.length || 1;
        const tlHeight = 42;
        const tlGap = 14;
        const totalTlHeight = tlCount * tlHeight + (tlCount - 1) * tlGap;
        const col3StartY = (canvasHeight - totalTlHeight) / 2;
        const activeTlCenterY = col3StartY + activeTlIndex * (tlHeight + tlGap) + tlHeight / 2;

        // Col 4: TMs of Active TL
        const col4Left = 795;
        const col4Width = 205;
        const totalTmHeight = tmCount * itemStep;
        const col4StartY = Math.max(25, (canvasHeight - totalTmHeight) / 2);

        // Inspector card metrics
        const sentimentRate = inspectedEntity.target > 0
          ? Math.min(150, Math.round((inspectedEntity.achievement / inspectedEntity.target) * 100))
          : 0;
        const isSurplus = (inspectedEntity.shortfall || 0) === 0;

        return (
          <div className="rounded-3xl bg-gradient-to-br from-white via-slate-50 to-indigo-50/20 border border-slate-200/90 p-5 sm:p-7 shadow-[0_4px_30px_rgba(0,0,0,0.03)] relative overflow-hidden">
            {/* Subtle light geometric grid */}
            <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-70 pointer-events-none" />

            {/* TOP HEADER BREADCRUMB NAVIGATION */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200/70">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <button
                  onClick={() => setActiveInspectLevel('root')}
                  className="text-indigo-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                >
                  <span>🌐 BharatEdge</span>
                </button>
                <span className="text-slate-300">/</span>
                <button
                  onClick={() => setActiveInspectLevel('sales')}
                  className={`hover:underline cursor-pointer font-bold ${activeInspectLevel === 'sales' ? 'text-indigo-600' : 'text-slate-700'}`}
                >
                  Sales
                </button>
                <span className="text-slate-300">/</span>
                <button
                  onClick={() => setActiveInspectLevel('branch')}
                  className={`hover:underline cursor-pointer font-bold ${activeInspectLevel === 'branch' ? 'text-amber-600' : 'text-slate-700'}`}
                >
                  {activeBranch.name}
                </button>
                {activeTl && (
                  <>
                    <span className="text-slate-300">/</span>
                    <button
                      onClick={() => setActiveInspectLevel('tl')}
                      className={`hover:underline cursor-pointer font-bold ${activeInspectLevel === 'tl' ? 'text-cyan-600' : 'text-slate-700'}`}
                    >
                      {activeTl.name}
                    </button>
                  </>
                )}
                {activeTm && activeInspectLevel === 'tm' && (
                  <>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-900 font-extrabold">{activeTm.name}</span>
                  </>
                )}
              </div>

              {/* Quick Branch Switcher Pills */}
              <div className="flex items-center gap-2">
                {branches.map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSelectedBranchId(b.id);
                      setSelectedTlId(b.tls[0]?.id || '');
                      setSelectedTmId(b.tls[0]?.tms[0]?.id || '');
                      setActiveInspectLevel('branch');
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedBranchId === b.id
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {/* ===================================================================== */}
            {/* MAIN PROGRESSIVE CANVAS (HORIZONTAL SVG FLOW + NODES + INSPECTOR PANEL) */}
            {/* ===================================================================== */}
            <div className="overflow-x-auto pb-4">
              <div
                className="relative transition-transform duration-300 origin-top-left"
                style={{
                  minWidth: 1390,
                  height: canvasHeight
                }}
              >
                {/* SVG CONNECTIONS LAYER */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ minWidth: 1390, height: canvasHeight }}
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
                  </defs>

                  {/* 1. Curve: Logo -> Sales */}
                  <path
                    d={`M ${x0} ${orbSocketY} C ${x0 + 25} ${orbSocketY}, ${col1Left - 25} ${orbSocketY}, ${col1Left} ${orbSocketY}`}
                    stroke="url(#activeLightGrad)"
                    strokeWidth="2.5"
                    fill="none"
                  />
                  <circle cx={x0} cy={orbSocketY} r={4.5} fill="#6366f1" />
                  <circle cx={col1Left} cy={orbSocketY} r={4} fill="#6366f1" />

                  {/* 2. Curves: Sales -> 3 Branches */}
                  {branches.map((b, i) => {
                    const branchCenterY = col2StartY + i * (branchHeight + branchGap) + branchHeight / 2;
                    const isBranchActive = i === activeBranchIndex;
                    const dx = (col2Left - col1Right) * 0.5;
                    const pathD = `M ${col1Right} ${orbSocketY} C ${col1Right + dx} ${orbSocketY}, ${col2Left - dx} ${branchCenterY}, ${col2Left} ${branchCenterY}`;

                    return (
                      <g key={b.id}>
                        <path
                          d={pathD}
                          stroke={isBranchActive ? 'url(#activeLightGrad)' : '#cbd5e1'}
                          strokeWidth={isBranchActive ? 2.5 : 1.5}
                          fill="none"
                          opacity={isBranchActive ? 1 : 0.65}
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
                  <circle cx={col1Right} cy={orbSocketY} r={4.5} fill="#f59e0b" />

                  {/* 3. Curves: Active Branch -> TLs */}
                  {currentTls.map((tl, t) => {
                    const tlCenterY = col3StartY + t * (tlHeight + tlGap) + tlHeight / 2;
                    const isTlActive = t === activeTlIndex;
                    const dx = (col3Left - col2Right) * 0.5;
                    const pathD = `M ${col2Right} ${activeBranchCenterY} C ${col2Right + dx} ${activeBranchCenterY}, ${col3Left - dx} ${tlCenterY}, ${col3Left} ${tlCenterY}`;

                    return (
                      <g key={tl.id}>
                        <path
                          d={pathD}
                          stroke={isTlActive ? 'url(#fanLightGrad)' : '#cbd5e1'}
                          strokeWidth={isTlActive ? 2.5 : 1.5}
                          fill="none"
                          opacity={isTlActive ? 1 : 0.65}
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
                  <circle cx={col2Right} cy={activeBranchCenterY} r={4.5} fill="#f59e0b" />

                  {/* 4. Curves: Active TL -> TMs */}
                  {currentTms.map((tm, k) => {
                    const tmCenterY = col4StartY + k * itemStep + 15;
                    const isTmActive = activeTm?.id === tm.id;
                    const dx = (col4Left - col3Right) * 0.5;
                    const pathD = `M ${col3Right} ${activeTlCenterY} C ${col3Right + dx} ${activeTlCenterY}, ${col4Left - dx} ${tmCenterY}, ${col4Left} ${tmCenterY}`;

                    return (
                      <g key={tm.id}>
                        <path
                          d={pathD}
                          stroke={isTmActive ? '#0ea5e9' : '#cbd5e1'}
                          strokeWidth={isTmActive ? 2.5 : 1.2}
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
                  <circle cx={col3Right} cy={activeTlCenterY} r={4.5} fill="#0ea5e9" />
                </svg>

                {/* ================================================================= */}
                {/* COLUMN 0: LOGO ORB (NO TEXT, BIG LOGO) */}
                {/* ================================================================= */}
                <div
                  onClick={() => setActiveInspectLevel('root')}
                  className="absolute cursor-pointer group"
                  style={{
                    left: 15,
                    top: orbSocketY - 60,
                    width: 120,
                    height: 120
                  }}
                  title="Click to inspect Enterprise Overview"
                >
                  <div className="w-28 h-28 mx-auto rounded-full bg-white border border-indigo-100 shadow-[0_10px_35px_rgba(99,102,241,0.2)] flex items-center justify-center relative group-hover:border-indigo-300 group-hover:shadow-[0_12px_45px_rgba(99,102,241,0.3)] group-hover:scale-105 transition-all p-3">
                    <div className="absolute inset-0 rounded-full border border-dashed border-indigo-200 animate-[spin_25s_linear_infinite]" />
                    <img
                      src="/logo.png"
                      alt="BharatEdge"
                      className="w-full h-full object-contain relative z-10 drop-shadow-sm"
                    />
                  </div>
                </div>

                {/* ================================================================= */}
                {/* COLUMN 1: SALES NODE (NO EXTRA TEXTS) */}
                {/* ================================================================= */}
                <div
                  onClick={() => setActiveInspectLevel('sales')}
                  className={`absolute rounded-2xl px-4 py-2.5 transition-all duration-300 cursor-pointer flex items-center justify-between gap-2 ${
                    activeInspectLevel === 'sales'
                      ? 'bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-600 shadow-md text-indigo-950'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 shadow-sm text-slate-800'
                  }`}
                  style={{
                    left: col1Left,
                    top: col1Top,
                    width: col1Width,
                    height: col1Height
                  }}
                  title="Click to inspect National Sales"
                >
                  <span className="text-sm font-black tracking-tight">Sales</span>
                  <span className="text-xs font-black text-emerald-600">
                    {formatCompactRupee(salesDept.achievement)}
                  </span>
                </div>

                {/* ================================================================= */}
                {/* COLUMN 2: 3 BRANCHES ONLY (AHMEDABAD, JAIPUR, CHENNAI) */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-4"
                  style={{
                    left: col2Left,
                    top: col2StartY,
                    width: col2Width
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
                          setActiveInspectLevel('branch');
                        }}
                        className={`rounded-2xl px-3.5 py-2.5 transition-all duration-300 cursor-pointer flex items-center justify-between gap-2 ${
                          isBranchActive
                            ? 'bg-gradient-to-r from-amber-50 to-orange-50/70 border-2 border-amber-500 shadow-md text-slate-900'
                            : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm'
                        }`}
                        style={{ height: branchHeight }}
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
                {/* COLUMN 3: TLS ONLY OF ACTIVE BRANCH */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-3.5"
                  style={{
                    left: col3Left,
                    top: col3StartY,
                    width: col3Width
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
                          setActiveInspectLevel('tl');
                        }}
                        className={`rounded-2xl px-3 py-2 transition-all duration-300 cursor-pointer flex items-center justify-between gap-2 ${
                          isTlActive
                            ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-500 shadow-md text-slate-900'
                            : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm'
                        }`}
                        style={{ height: tlHeight }}
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
                {/* COLUMN 4: TMS ONLY OF ACTIVE TL */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-2"
                  style={{
                    left: col4Left,
                    top: col4StartY,
                    width: col4Width
                  }}
                >
                  {currentTms.map((tm) => {
                    const isTmActive = activeTm?.id === tm.id;
                    const pct = tm.target > 0 ? Math.round((tm.achievement / tm.target) * 100) : 0;

                    return (
                      <div
                        key={tm.id}
                        onClick={() => {
                          setSelectedTmId(tm.id);
                          setActiveInspectLevel('tm');
                        }}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-200 ${
                          isTmActive
                            ? 'bg-cyan-50 border-2 border-cyan-500 text-cyan-950 font-bold shadow-sm'
                            : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-xs'
                        }`}
                        style={{ height: 30 }}
                      >
                        <span className="text-xs font-bold truncate max-w-[110px]" title={tm.name}>
                          {tm.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-black text-slate-700">
                            {formatCompactRupee(tm.achievement)}
                          </span>
                          <span className="text-xs">
                            {pct >= 100 ? '🔥' : pct > 0 ? '👍' : '⚠️'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 5: SLEEK INSPECTOR PANEL (RIGHT SIDE) */}
                {/* ================================================================= */}
                <div
                  className="absolute rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.06)] p-5 overflow-hidden flex flex-col justify-between"
                  style={{
                    left: 1045,
                    top: 15,
                    width: 335,
                    bottom: 15
                  }}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div>
                      <div className="flex items-center gap-1.5 text-indigo-600 text-[11px] font-bold">
                        <Briefcase size={12} />
                        <span className="uppercase tracking-wider">
                          {activeInspectLevel === 'root'
                            ? 'ENTERPRISE CORE'
                            : activeInspectLevel === 'sales'
                            ? 'NATIONAL SALES'
                            : activeInspectLevel === 'branch'
                            ? 'REGIONAL BRANCH'
                            : activeInspectLevel === 'tl'
                            ? 'TEAM LEADER'
                            : 'SALES BDM'}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 leading-snug truncate" title={inspectedEntity.name}>
                        {inspectedEntity.name}
                      </h3>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-emerald-700 font-bold">Active</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] text-slate-400">Live Zoho CRM</span>
                        </div>
                        <button
                          onClick={() => {
                            if (inspectedEntity.deals?.[0]?.id) {
                              window.open(`/crm/deals/${inspectedEntity.deals[0].id}`, '_blank');
                            }
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 text-[10px] cursor-pointer"
                        >
                          <span>Explore deals</span>
                          <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Sentiment Rate Card */}
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
                        <span>Sentiment / Achievement Rate</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          isSurplus
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {isSurplus ? 'Target Met' : 'Moderate'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-900 tracking-tight">
                              {sentimentRate}%
                            </span>
                            <span className={`text-xs font-bold ${isSurplus ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {isSurplus ? '+14% vs Target' : '-4% Last month'}
                            </span>
                          </div>
                        </div>

                        {/* Equalizer Sparkline */}
                        <div className="flex items-end gap-[2px] h-7">
                          {waveformBars.map((h, bIdx) => (
                            <span
                              key={bIdx}
                              style={{ height: `${h}%` }}
                              className={`w-1 rounded-full transition-all ${
                                bIdx >= 8 && bIdx <= 15
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
                          {inspectedEntity.wonCount || inspectedEntity.dealsCount || 0}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-purple-50/70 border border-purple-100">
                        <div className="flex items-center gap-1 text-[10px] text-purple-700 font-bold">
                          <FileText size={11} className="text-purple-600" />
                          <span>Quoted Value</span>
                        </div>
                        <p className="text-base font-black text-purple-950 mt-0.5">
                          {formatCompactRupee(inspectedEntity.bookedAmount || inspectedEntity.achievement)}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                        <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                          <Sparkles size={11} className="text-emerald-600" />
                          <span>Received</span>
                        </div>
                        <p className="text-base font-black text-emerald-800 mt-0.5">
                          {formatCompactRupee(inspectedEntity.achievement)}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-rose-50/70 border border-rose-100">
                        <div className="flex items-center gap-1 text-[10px] text-rose-700 font-bold">
                          <Target size={11} className="text-rose-600" />
                          <span>Shortfall Gap</span>
                        </div>
                        <p className="text-base font-black text-rose-800 mt-0.5">
                          {formatCompactRupee(inspectedEntity.shortfall)}
                        </p>
                      </div>
                    </div>

                    {/* RI Analysis Box */}
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                        <Zap size={12} className="text-amber-500" />
                        <span>RI Executive Intelligence</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900">
                        {isSurplus ? 'Propose Quota Scaling' : 'Target Gap Closure Strategy'}
                      </p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                        {isSurplus
                          ? `Target successfully achieved with ${formatCompactRupee(inspectedEntity.achievement)} received. Expanding bandwidth to capture enterprise deals.`
                          : `Current shortfall gap is ${formatCompactRupee(inspectedEntity.shortfall)}. Recommended action: Accelerate verification on active stage deals.`}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Floating Prompt Pill */}
                  <div className="mt-3 p-2 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 shadow-inner">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-700">
                        AI Agent
                      </span>
                      <input
                        type="text"
                        placeholder="Ask a question..."
                        className="bg-transparent text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none w-full font-medium"
                      />
                    </div>
                    <button
                      title="Send query"
                      className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer flex-shrink-0 shadow-xs"
                    >
                      <Send size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 4. MASTER TARGET & ACHIEVEMENT BAR VIEW (LIGHT THEME) */}
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
                className="p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${st.color}`} />
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">{st.name}</h5>
                    <p className="text-[11px] text-slate-500">
                      Total Quoted: {formatCompactRupee(st.amount)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-900">{st.count} Deals</span>
                  <p className="text-[11px] font-bold text-emerald-600">
                    Rec: {formatCompactRupee(st.received)}
                  </p>
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
              { stage: '1. Quotations Generated', count: Math.max(liveQuotations.length, filteredDeals.length * 2), color: 'bg-blue-500', pct: 100 },
              { stage: '2. Deal Contracts Booked', count: filteredDeals.length, color: 'bg-indigo-500', pct: Math.round((filteredDeals.length / Math.max(1, liveQuotations.length)) * 100) },
              { stage: '3. Accounts Verified', count: filteredDeals.filter(d => isDealPaymentVerified(d)).length, color: 'bg-purple-500', pct: Math.round((filteredDeals.filter(d => isDealPaymentVerified(d)).length / Math.max(1, filteredDeals.length)) * 100) },
              { stage: '4. Legal / Operations', count: filteredDeals.filter(d => !String(d.stage || '').toLowerCase().includes('sales')).length, color: 'bg-cyan-500', pct: 75 },
              { stage: '5. Closed Won Delivery', count: filteredDeals.filter(d => String(d.stage || '').toLowerCase().includes('won')).length, color: 'bg-emerald-500', pct: 45 }
            ].map(fn => (
              <div key={fn.stage} className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700">{fn.stage}</span>
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
        {/* Top Selling Services Strip */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-7 shadow-[0_4px_25px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                Top Selling Services
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Highest revenue generating services and schemes booked this period.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">{topServices.length} Top Services</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {topServices.map((srv, idx) => (
              <div
                key={srv.name}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-500">{srv.count} deals</span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-900 truncate" title={srv.name}>
                    {srv.name}
                  </h5>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Revenue:</span>
                  <span className="font-black text-emerald-700">{formatCompactRupee(srv.received)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BDM Matrix Table */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-7 shadow-[0_4px_25px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                BDM-Wise Performance Matrix
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Individual Business Development Manager targets, revenue achievement and shortfall gaps.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  placeholder="Search BDM, TL, Branch..."
                  className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 w-56 font-medium"
                />
              </div>
              <button
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Download size={13} />
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">BDM Name</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Team Leader</th>
                  <th className="px-5 py-3.5 text-right">Target</th>
                  <th className="px-5 py-3.5 text-right">Achieved</th>
                  <th className="px-5 py-3.5 text-right">Shortfall</th>
                  <th className="px-5 py-3.5 text-center">Progress</th>
                  <th className="px-5 py-3.5">Top Selling Service</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {bdmList.slice(0, 25).map(bdm => (
                  <tr key={bdm.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-900">{bdm.name}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {bdm.branch}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{bdm.tl}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-500">{formatCompactRupee(bdm.target)}</td>
                    <td className="px-5 py-3 text-right font-black text-emerald-700">{formatCompactRupee(bdm.achievement)}</td>
                    <td className="px-5 py-3 text-right font-bold text-rose-600">
                      {bdm.shortfall === 0 ? <span className="text-emerald-600 font-extrabold">Met 👍</span> : formatCompactRupee(bdm.shortfall)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        bdm.pct >= 100
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : bdm.pct >= 50
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {bdm.pct}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 truncate max-w-[180px]">{bdm.topService}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bdmList.length > 25 && (
            <p className="text-xs text-slate-400 text-center mt-3 font-medium">
              Showing top 25 of {bdmList.length} Sales BDMs. Use search or click Export for full roster.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
