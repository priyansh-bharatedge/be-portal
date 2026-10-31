import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Search, Filter, TrendingUp, TrendingDown, Users,
  Layers, ChevronRight, ChevronDown, Award, Trophy, Target,
  DollarSign, PieChart as PieChartIcon, BarChart3, ArrowUpRight,
  Shield, CheckCircle2, Clock, AlertTriangle, Building2, MapPin,
  Sparkles, RefreshCw, Briefcase, Zap, Flame, UserCheck, Eye,
  Maximize2, Minimize2, Compass, Activity, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getDealReceivedAmount,
  getDealPendingAmount,
  getDealTotalAmount,
  isDealPaymentVerified
} from '../../utils/dealSplitUtils';

// ============================================================================
// TYPES & HIERARCHY STRUCTURE
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
  roleType: 'root' | 'department' | 'branch' | 'tl' | 'tm';
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

// Preset Targets for hierarchy levels (realistic default benchmarks)
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

export const SalesHodDashboardView: React.FC<SalesHodDashboardViewProps> = ({
  deals: propsDeals,
  employees: propsEmployees,
  quotations: propsQuotations,
  isRefreshing: propsRefreshing,
  onRefresh
}) => {
  // Local state for fetched live data if not passed via props
  const [liveDeals, setLiveDeals] = useState<any[]>(propsDeals || []);
  const [liveEmployees, setLiveEmployees] = useState<any[]>(propsEmployees || []);
  const [liveQuotations, setLiveQuotations] = useState<any[]>(propsQuotations || []);
  const [isLoading, setIsLoading] = useState<boolean>(!propsDeals || propsDeals.length === 0);

  // Timeframe filter (daily, weekly, monthly, all)
  const [timeframe, setTimeframe] = useState<TimeframeOption>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // 0-indexed: 9 = October
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Interactive 3D Tree expansion state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['root', 'dept_sales', 'branch_ahmedabad'])
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>('dept_sales');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'pipeline' | 'bdm_matrix'>('hierarchy');

  // Load live data if props are not provided
  useEffect(() => {
    if (propsDeals && propsDeals.length > 0) {
      setLiveDeals(propsDeals);
    }
    if (propsEmployees && propsEmployees.length > 0) {
      setLiveEmployees(propsEmployees);
    }
    if (propsQuotations && propsQuotations.length > 0) {
      setLiveQuotations(propsQuotations);
    }
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

          if (dealsRes && Array.isArray(dealsRes.data)) {
            setLiveDeals(dealsRes.data);
          }
          if (empRes && Array.isArray(empRes.data)) {
            setLiveEmployees(empRes.data);
          }
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

      if (timeframe === 'today') {
        return isDealToday(d);
      }

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

      return true; // 'all'
    });
  }, [liveDeals, timeframe, selectedMonth, selectedYear]);

  // Today Deals (independent metric for today's revenue)
  const todayDeals = useMemo(() => {
    return liveDeals.filter(d => isDealToday(d));
  }, [liveDeals]);

  // Month Deals (independent metric for current month's revenue)
  const currentMonthDeals = useMemo(() => {
    return liveDeals.filter(d => {
      const ms = getDealDateMs(d);
      if (!ms) return false;
      const dt = new Date(ms);
      return dt.getMonth() === 9 && dt.getFullYear() === 2026; // October 2026
    });
  }, [liveDeals]);

  // 1. TODAY'S REVENUE
  const todayRevenue = useMemo(() => {
    return todayDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0);
  }, [todayDeals]);

  const todayBooked = useMemo(() => {
    return todayDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0);
  }, [todayDeals]);

  // 2. MONTHLY REVENUE
  const monthlyRevenue = useMemo(() => {
    return currentMonthDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0);
  }, [currentMonthDeals]);

  const monthlyBooked = useMemo(() => {
    return currentMonthDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0);
  }, [currentMonthDeals]);

  // 3. REVENUE BREAKDOWN (Received vs Pending for active filtered deals)
  const totalReceivedAmount = useMemo(() => {
    return filteredDeals.reduce((sum, d) => sum + getDealReceivedAmount(d), 0);
  }, [filteredDeals]);

  const totalPendingAmount = useMemo(() => {
    return filteredDeals.reduce((sum, d) => sum + getDealPendingAmount(d), 0);
  }, [filteredDeals]);

  const totalBookedValue = useMemo(() => {
    return filteredDeals.reduce((sum, d) => sum + getDealTotalAmount(d), 0);
  }, [filteredDeals]);

  // Overall Target for Sales Team
  const overallTarget = TARGET_BENCHMARKS.org;
  const overallAchievement = totalReceivedAmount;
  const overallShortfall = Math.max(0, overallTarget - overallAchievement);
  const overallAchievementPct = overallTarget > 0 ? Math.min(100, Math.round((overallAchievement / overallTarget) * 100)) : 0;

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

  // 5. BDM / SALES EMPLOYEE REVENUE ATTRIBUTION
  const bdmPerformance = useMemo(() => {
    const map = new Map<string, {
      name: string;
      cleanName: string;
      count: number;
      received: number;
      booked: number;
      pending: number;
      wonCount: number;
      deals: any[];
      topServiceMap: Map<string, number>;
    }>();

    filteredDeals.forEach(d => {
      const empRaw = String(
        d.employeeName ||
        d.salesEmployee ||
        d.Employee?.name ||
        d.owner ||
        d.Owner?.name ||
        'Unassigned'
      ).trim();

      const cleanName = empRaw.replace(/\s*\([^)]*\)/g, '').trim() || 'Sales BDM';
      const key = cleanName.toLowerCase();

      const item = map.get(key) || {
        name: cleanName,
        cleanName,
        count: 0,
        received: 0,
        booked: 0,
        pending: 0,
        wonCount: 0,
        deals: [],
        topServiceMap: new Map<string, number>()
      };

      const rec = getDealReceivedAmount(d);
      const book = getDealTotalAmount(d);
      const pend = getDealPendingAmount(d);

      item.count++;
      item.received += rec;
      item.booked += book;
      item.pending += pend;
      item.deals.push(d);

      const st = String(d.stage || d.Stage || d.status || '').toLowerCase();
      if (st.includes('won') || isDealPaymentVerified(d)) item.wonCount++;

      const s = String(d.service || d.Service_Name || d.Choose_Wisely || 'General Advisory').trim();
      item.topServiceMap.set(s, (item.topServiceMap.get(s) || 0) + 1);

      map.set(key, item);
    });

    return Array.from(map.values()).map(b => {
      let topS = 'Business Advisory';
      let maxC = 0;
      b.topServiceMap.forEach((cnt, s) => {
        if (cnt > maxC) {
          maxC = cnt;
          topS = s;
        }
      });
      return {
        ...b,
        topService: topS
      };
    }).sort((a, b) => b.received - a.received);
  }, [filteredDeals]);

  // TOP HIGH PERFORMER
  const topHighPerformer = useMemo(() => {
    return bdmPerformance[0] || null;
  }, [bdmPerformance]);

  // Helper to match a BDM record in deals to an employee
  const matchBdmDeals = (empName: string, tmDealsMap: Map<string, any>) => {
    const clean = empName.toLowerCase().trim().replace(/\s*\([^)]*\)/g, '');
    const tokens = clean.split(' ').filter(Boolean);

    let totalRec = 0;
    let totalBook = 0;
    let totalCount = 0;
    let matchedDeals: any[] = [];

    bdmPerformance.forEach(b => {
      const bClean = b.cleanName.toLowerCase();
      const isMatch =
        bClean === clean ||
        tokens.some(t => t.length > 2 && bClean.includes(t)) ||
        bClean.split(' ').some(bt => bt.length > 2 && clean.includes(bt));

      if (isMatch) {
        totalRec += b.received;
        totalBook += b.booked;
        totalCount += b.count;
        matchedDeals = [...matchedDeals, ...b.deals];
      }
    });

    return {
      received: totalRec,
      booked: totalBook,
      count: totalCount,
      deals: matchedDeals
    };
  };

  // ============================================================================
  // FULL ORGANIZATION HIERARCHICAL TREE BUILDING
  // BharatEdge -> Sales -> Branches (Ahmedabad, Jaipur, Chennai) -> TL -> TM
  // ============================================================================
  const salesTree: SalesTreeNode = useMemo(() => {
    // 1. Definition of Organization Hierarchy
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
              'Meet Yadav',
              'Daivik Patel',
              'Rutvik Patel',
              'Vijay Singh',
              'Ayushkumar Patel',
              'Umang Soni',
              'Nilesh Solanki',
              'Jitendra Rathore',
              'Naman Makkad'
            ]
          },
          {
            name: 'Uday Dubey',
            title: 'Vice Sales Head (TL)',
            target: 2000000,
            tms: [
              'Abhishek Harendra Singh',
              'Abhishek Prajapati',
              'Monika Rola',
              'Priyanshi Barmashe',
              'Rituraj Singh',
              'Jainam Patva',
              'Sayyam Jain',
              'Ayush Bhat',
              'Jainam Sompura',
              'Hetul Chiragbhai'
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
              'Aakash Goswami',
              'Arpit Sharma',
              'Harshita Manohar',
              'Monika Gurjar',
              'Punit Kumar Khaliya',
              'Akshat Mishra',
              'Konpal Sharma'
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
              'Palak Dubey',
              'Pratima Sahu',
              'Janvi Chabhadiya',
              'Kalash Srivastava',
              'Astha Chauhan',
              'Drashti Bhuva',
              'Muliyashiya Goganbhai',
              'Trivedi Bhavikkumar',
              'Chirag Navani'
            ]
          },
          {
            name: 'Amarnath C & Southern Cluster',
            title: 'Sr. BDM Cluster (TL)',
            target: 800000,
            tms: [
              'AMARNATH C',
              'Vaishnavi R',
              'Justin J',
              'Gokul G'
            ]
          }
        ]
      }
    ];

    // Build Branch Nodes with live calculated numbers
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
          const matched = matchBdmDeals(tmName, new Map());
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

        // Also check if TL themselves booked deals (e.g. Romil or Sourav)
        const tlDirect = matchBdmDeals(tl.name, new Map());
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

    // 2. Department Node (Sales & Growth)
    const deptReceived = branchNodes.reduce((sum, b) => sum + b.achievement, 0);
    const deptBooked = branchNodes.reduce((sum, b) => sum + b.bookedAmount, 0);
    const deptDealsCount = branchNodes.reduce((sum, b) => sum + b.dealsCount, 0);
    const deptShortfall = Math.max(0, TARGET_BENCHMARKS.department - deptReceived);

    const deptNode: SalesTreeNode = {
      id: 'dept_sales',
      name: 'Sales & Growth',
      roleType: 'department',
      subtitle: 'Head: Mishal Bhatia (National Sales Head)',
      target: TARGET_BENCHMARKS.department,
      achievement: deptReceived > 0 ? deptReceived : totalReceivedAmount,
      shortfall: Math.max(0, TARGET_BENCHMARKS.department - (deptReceived > 0 ? deptReceived : totalReceivedAmount)),
      bookedAmount: deptBooked > 0 ? deptBooked : totalBookedValue,
      dealsCount: deptDealsCount > 0 ? deptDealsCount : filteredDeals.length,
      wonCount: filteredDeals.filter(d => isDealPaymentVerified(d)).length,
      children: branchNodes,
      deals: filteredDeals
    };

    // 3. Root Node (BharatEdge Core)
    const rootNode: SalesTreeNode = {
      id: 'root',
      name: 'BharatEdge Group',
      roleType: 'root',
      subtitle: 'Central Enterprise Organization',
      target: TARGET_BENCHMARKS.org,
      achievement: deptNode.achievement,
      shortfall: Math.max(0, TARGET_BENCHMARKS.org - deptNode.achievement),
      bookedAmount: deptNode.bookedAmount,
      dealsCount: deptNode.dealsCount,
      wonCount: deptNode.wonCount,
      children: [deptNode],
      deals: filteredDeals
    };

    return rootNode;
  }, [filteredDeals, bdmPerformance, totalReceivedAmount, totalBookedValue]);

  // Lookup node by ID for right-hand inspector panel
  const findNodeById = (node: SalesTreeNode, id: string): SalesTreeNode | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNode = useMemo(() => {
    return findNodeById(salesTree, selectedNodeId) || salesTree;
  }, [salesTree, selectedNodeId]);

  // TOP HIGH TEAM & TOP HIGH BRANCH
  const topHighBranch = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    return [...branches].sort((a, b) => b.achievement - a.achievement)[0] || null;
  }, [salesTree]);

  const topHighTeam = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    const allTls: SalesTreeNode[] = [];
    branches.forEach(b => {
      if (b.children) allTls.push(...b.children);
    });
    return allTls.sort((a, b) => b.achievement - a.achievement)[0] || null;
  }, [salesTree]);

  // Toggle Node expansion in tree
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Expand / Collapse all
  const expandAll = () => {
    const allIds = new Set<string>();
    const collect = (n: SalesTreeNode) => {
      allIds.add(n.id);
      n.children?.forEach(collect);
    };
    collect(salesTree);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set(['root']));
  };

  // 6. PIPELINE VIEW STAGES
  const pipelineStages = useMemo(() => {
    const stages = [
      { id: 'sales', label: 'Sales / Open', color: 'from-amber-500 to-orange-500' },
      { id: 'account', label: 'Account Queue', color: 'from-blue-500 to-indigo-600' },
      { id: 'legal', label: 'Legal Clearance', color: 'from-purple-500 to-pink-600' },
      { id: 'operations', label: 'Operations', color: 'from-cyan-500 to-teal-600' },
      { id: 'won', label: 'Closed Won', color: 'from-emerald-500 to-green-600' }
    ];

    return stages.map(st => {
      const matched = filteredDeals.filter(d => {
        const s = String(d.stage || d.Stage || d.status || '').toLowerCase();
        if (st.id === 'sales') return s.includes('sale') || s.includes('draft') || s === 'new';
        if (st.id === 'account') return s.includes('account');
        if (st.id === 'legal') return s.includes('legal');
        if (st.id === 'operations') return s.includes('operat') || s.includes('allocat') || s.includes('execut');
        if (st.id === 'won') return s.includes('won');
        return false;
      });

      const count = matched.length;
      const amount = matched.reduce((sum, d) => sum + getDealTotalAmount(d), 0);
      const received = matched.reduce((sum, d) => sum + getDealReceivedAmount(d), 0);

      return {
        ...st,
        count,
        amount,
        received
      };
    });
  }, [filteredDeals]);

  // 7. SALES FUNNEL
  const salesFunnel = useMemo(() => {
    const totalQuotations = Math.max(liveQuotations.length, filteredDeals.length * 2);
    const activeDeals = filteredDeals.length;
    const accountVerified = filteredDeals.filter(d => isDealPaymentVerified(d) || !String(d.stage || '').toLowerCase().includes('account')).length;
    const legalPassed = filteredDeals.filter(d => {
      const s = String(d.stage || '').toLowerCase();
      return s.includes('operat') || s.includes('allocat') || s.includes('execut') || s.includes('won');
    }).length;
    const closedWon = filteredDeals.filter(d => String(d.stage || '').toLowerCase().includes('won')).length;

    return [
      { stage: '1. Quotations Generated', count: totalQuotations, color: 'bg-blue-500', pct: 100 },
      { stage: '2. Deal Contracts Booked', count: activeDeals, color: 'bg-indigo-500', pct: totalQuotations > 0 ? Math.round((activeDeals / totalQuotations) * 100) : 0 },
      { stage: '3. Accounts Verified', count: accountVerified, color: 'bg-purple-500', pct: totalQuotations > 0 ? Math.round((accountVerified / totalQuotations) * 100) : 0 },
      { stage: '4. Legal / Operations', count: legalPassed, color: 'bg-cyan-500', pct: totalQuotations > 0 ? Math.round((legalPassed / totalQuotations) * 100) : 0 },
      { stage: '5. Closed Won Delivery', count: closedWon, color: 'bg-emerald-500', pct: totalQuotations > 0 ? Math.round((closedWon / totalQuotations) * 100) : 0 }
    ];
  }, [liveQuotations, filteredDeals]);

  return (
    <div className="space-y-8 pb-16 font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP EXECUTIVE HEADER & TIME/CALENDAR FILTER CONTROLS */}
      {/* ========================================================================= */}
      <div className="relative rounded-3xl bg-gradient-to-r from-[#0a0f1d] via-[#0d1629] to-[#070b14] border border-cyan-500/20 p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.12)] overflow-hidden">
        {/* Futuristic glowing backdrop blurs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
                <Flame size={22} className="animate-pulse" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Sales HOD Executive Intelligence
                  </h1>
                  <span className="px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-cyan-950 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                    Live CRM 3D View
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">
                  Real-time revenue attribution, target vs achievement hierarchy, and branch-to-BDM shortfall analysis.
                </p>
              </div>
            </div>
          </div>

          {/* Timeframe & Calendar Filter Pill Tabs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1.5 rounded-2xl bg-[#111a2e]/90 border border-white/10 shadow-inner">
              <button
                onClick={() => setTimeframe('today')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'today'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeframe('week')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'week'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setTimeframe('month')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'month'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                October 2026
              </button>
              <button
                onClick={() => setTimeframe('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'all'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                All Time
              </button>
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={() => {
                if (onRefresh) onRefresh();
              }}
              disabled={propsRefreshing || isLoading}
              title="Force Sync Live Data"
              className="p-2.5 rounded-2xl bg-[#111a2e] border border-white/10 text-gray-300 hover:text-white hover:border-cyan-500/40 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={`${propsRefreshing || isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CORE REVENUE & KPI EXECUTIVE CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Today's Revenue */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#090e1a] border border-emerald-500/20 p-6 shadow-[0_4px_24px_rgba(16,185,129,0.08)] hover:border-emerald-400/40 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
              <Zap size={20} />
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
              Daily Booking Date
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Revenue</p>
            <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
              {formatRupee(todayRevenue)}
            </h3>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-3 pt-3 border-t border-white/5 font-medium">
              <span>Booked Deals: <strong className="text-white">{todayDeals.length}</strong></span>
              <span>Total Value: <strong className="text-emerald-400">{formatCompactRupee(todayBooked)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 2: Monthly Revenue */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#090e1a] border border-cyan-500/20 p-6 shadow-[0_4px_24px_rgba(6,182,212,0.08)] hover:border-cyan-400/40 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner">
              <Calendar size={20} />
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
              October 2026
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Monthly Revenue</p>
            <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
              {formatRupee(monthlyRevenue)}
            </h3>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-3 pt-3 border-t border-white/5 font-medium">
              <span>Deals: <strong className="text-white">{currentMonthDeals.length}</strong></span>
              <span>Total Contract: <strong className="text-cyan-400">{formatCompactRupee(monthlyBooked)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 3: Revenue Breakdown (Received vs Pending) */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#090e1a] border border-amber-500/20 p-6 shadow-[0_4px_24px_rgba(245,158,11,0.08)] hover:border-amber-400/40 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
              <PieChartIcon size={20} />
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-500/30">
              Breakdown
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Received vs Pending</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">
                {formatCompactRupee(totalReceivedAmount)}
              </h3>
              <span className="text-xs text-gray-500">rec /</span>
              <span className="text-base font-bold text-rose-400">
                {formatCompactRupee(totalPendingAmount)}
              </span>
              <span className="text-xs text-gray-500">pend</span>
            </div>
            {/* Visual Progress Ratio Bar */}
            <div className="w-full h-2 bg-gray-800 rounded-full mt-3 overflow-hidden flex">
              <div
                style={{ width: `${totalBookedValue > 0 ? (totalReceivedAmount / totalBookedValue) * 100 : 50}%` }}
                className="bg-emerald-500 h-full"
                title="Received Ratio"
              />
              <div
                style={{ width: `${totalBookedValue > 0 ? (totalPendingAmount / totalBookedValue) * 100 : 50}%` }}
                className="bg-rose-500 h-full"
                title="Pending Ratio"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2 font-medium">
              <span>Rec: <strong>{totalBookedValue > 0 ? Math.round((totalReceivedAmount / totalBookedValue) * 100) : 0}%</strong></span>
              <span>Total: <strong className="text-white">{formatCompactRupee(totalBookedValue)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 4: Top High Performer & Branch */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#090e1a] border border-purple-500/20 p-6 shadow-[0_4px_24px_rgba(168,85,247,0.08)] hover:border-purple-400/40 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
          <div className="flex justify-between items-start mb-3 relative z-10">
            <span className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-inner">
              <Trophy size={20} />
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-950/80 text-purple-400 border border-purple-500/30">
              Leaders
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Top High Performer</p>
            <h3 className="text-lg sm:text-xl font-black text-white mt-1 truncate" title={topHighPerformer?.name}>
              {topHighPerformer ? topHighPerformer.name : 'Calculating...'}
            </h3>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-3 pt-3 border-t border-white/5 font-medium">
              <span>Branch: <strong className="text-cyan-400">{topHighBranch?.name.split(' ')[0] || 'Ahmedabad'}</strong></span>
              <span>Revenue: <strong className="text-emerald-400">{formatCompactRupee(topHighPerformer?.received || 0)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TARGET & ACHIEVEMENT PROGRESS BAR VIEW WITH SHORTFALL */}
      {/* ========================================================================= */}
      <div className="rounded-3xl bg-[#0c1322] border border-white/10 p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Target size={18} className="text-cyan-400" />
              Target vs Achievement Overview (Entire Sales Team)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">
              Organizational sales target benchmark vs. actual revenue received with shortfall gap.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" /> Target: {formatCompactRupee(overallTarget)}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Achieved: {formatCompactRupee(overallAchievement)}
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Shortfall: {formatCompactRupee(overallShortfall)}
            </span>
          </div>
        </div>

        {/* Master Comparison Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-white">Full Sales Organization Progress</span>
            <span className="text-cyan-400 font-extrabold">{overallAchievementPct}% Achieved</span>
          </div>
          <div className="w-full h-4 bg-gray-900 rounded-full overflow-hidden p-0.5 border border-white/10 flex">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallAchievementPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.5)]"
            />
          </div>
        </div>

        {/* Branch-by-Branch Breakdown Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
          {(salesTree.children?.[0]?.children || []).map((br: SalesTreeNode) => {
            const pct = br.target > 0 ? Math.min(100, Math.round((br.achievement / br.target) * 100)) : 0;
            return (
              <div key={br.id} className="p-4 rounded-2xl bg-[#111929] border border-white/5">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <MapPin size={13} className="text-cyan-400" />
                    {br.name}
                  </span>
                  <span className="text-emerald-400 font-black">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex mb-2">
                  <div style={{ width: `${pct}%` }} className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full" />
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-400">
                  <span>Ach: <strong className="text-white">{formatCompactRupee(br.achievement)}</strong></span>
                  <span>Shortfall: <strong className="text-rose-400">{formatCompactRupee(br.shortfall)}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. INTERACTIVE 3D BRANCHING MINDMAP GRAPH (AS PER USER ATTACHED SCREENSHOT) */}
      {/* ========================================================================= */}
      <div className="rounded-3xl bg-gradient-to-b from-[#0a0f1d] via-[#080d19] to-[#050811] border border-cyan-500/20 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle glowing canvas grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

        {/* Header Controls for Tree Graph */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Compass size={18} />
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Organization Hierarchy & Shortfall Network
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 font-medium">
              Click any node to expand branches, TLs, and TMs. Select a node to inspect detailed KPIs on the right panel.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/60 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Maximize2 size={13} />
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 rounded-xl bg-gray-900 border border-white/10 text-gray-300 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Minimize2 size={13} />
              Collapse
            </button>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* NETWORK DIAGRAM CANVAS & INSPECTOR SPLIT */}
        {/* ===================================================================== */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT 8 COLS: INTERACTIVE TREE EXPANSION GRAPH */}
          <div className="lg:col-span-7 xl:col-span-8 overflow-x-auto pb-6">
            <div className="min-w-[580px] space-y-8 pl-4">
              {/* LEVEL 0: ROOT (BHARATEDGE CORE 3D ORB) */}
              <div className="flex items-center gap-4">
                <div
                  onClick={() => {
                    toggleNodeExpansion('root');
                    setSelectedNodeId('root');
                  }}
                  className={`group cursor-pointer relative flex items-center gap-4 p-3 rounded-3xl transition-all duration-300 ${
                    selectedNodeId === 'root'
                      ? 'bg-cyan-950/40 border-2 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.4)]'
                      : 'hover:bg-white/5 border border-white/10'
                  }`}
                >
                  {/* Glowing 3D Orb */}
                  <div className="relative w-16 h-16 rounded-full flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-dashed border-cyan-400/40 animate-[spin_15s_linear_infinite]" />
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-400 shadow-[inset_-3px_-3px_8px_rgba(0,0,0,0.8),inset_3px_3px_8px_rgba(255,255,255,0.4),0_0_25px_rgba(6,182,212,0.8)] flex items-center justify-center transform group-hover:scale-110 transition-transform">
                      <Sparkles size={18} className="text-white" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-white group-hover:text-cyan-400 transition-colors">
                        {salesTree.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                        HQ Core
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-medium">Enterprise Central Hub</p>
                    <div className="flex items-center gap-3 text-xs mt-1 font-bold">
                      <span className="text-emerald-400">{formatCompactRupee(salesTree.achievement)}</span>
                      <span className="text-gray-500">•</span>
                      <span className="text-rose-400">Shortfall: {formatCompactRupee(salesTree.shortfall)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LEVEL 1: SALES & GROWTH DEPARTMENT */}
              {expandedNodes.has('root') && salesTree.children?.map(dept => (
                <div key={dept.id} className="relative ml-8 pl-8 border-l-2 border-cyan-500/30 space-y-6">
                  {/* Dept Node Card */}
                  <div
                    onClick={() => {
                      toggleNodeExpansion(dept.id);
                      setSelectedNodeId(dept.id);
                    }}
                    className={`cursor-pointer inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all duration-300 ${
                      selectedNodeId === dept.id
                        ? 'bg-[#131d31] border-2 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.35)]'
                        : 'bg-[#0f172a]/90 hover:bg-[#131d31] border border-white/10'
                    }`}
                  >
                    <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      <Award size={18} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-white">{dept.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-950 text-amber-400 border border-amber-500/30">
                          Division
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">{dept.subtitle}</p>
                      <div className="flex items-center gap-2 text-xs font-bold mt-1">
                        <span className="text-emerald-400">{formatCompactRupee(dept.achievement)}</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-rose-400">Shortfall: {formatCompactRupee(dept.shortfall)}</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-gray-400 transition-transform ${expandedNodes.has(dept.id) ? 'rotate-90 text-amber-400' : ''}`}
                    />
                  </div>

                  {/* LEVEL 2: BRANCHES (AHMEDABAD, JAIPUR, CHENNAI) */}
                  {expandedNodes.has(dept.id) && (
                    <div className="ml-8 pl-8 border-l-2 border-amber-500/30 space-y-6">
                      {dept.children?.map(branch => {
                        const isBranchExpanded = expandedNodes.has(branch.id);
                        const isBranchSelected = selectedNodeId === branch.id;

                        return (
                          <div key={branch.id} className="space-y-4">
                            {/* Branch Card */}
                            <div
                              onClick={() => {
                                toggleNodeExpansion(branch.id);
                                setSelectedNodeId(branch.id);
                              }}
                              className={`cursor-pointer inline-flex items-center gap-3.5 px-5 py-3 rounded-2xl transition-all duration-300 ${
                                isBranchSelected
                                  ? 'bg-[#162238] border-2 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
                                  : 'bg-[#0f172a]/80 hover:bg-[#131d31] border border-white/10'
                              }`}
                            >
                              <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                <Building2 size={16} />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h5 className="text-xs font-black text-white">{branch.name}</h5>
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                                    Branch
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-semibold mt-0.5">
                                  <span className="text-emerald-400">{formatCompactRupee(branch.achievement)}</span>
                                  <span className="text-gray-500">•</span>
                                  <span className="text-rose-400">Gap: {formatCompactRupee(branch.shortfall)}</span>
                                </div>
                              </div>
                              <ChevronRight
                                size={14}
                                className={`text-gray-400 transition-transform ${isBranchExpanded ? 'rotate-90 text-cyan-400' : ''}`}
                              />
                            </div>

                            {/* LEVEL 3: TEAM LEADERS (TL) */}
                            {isBranchExpanded && (
                              <div className="ml-8 pl-8 border-l-2 border-cyan-500/30 space-y-4">
                                {branch.children?.map(tl => {
                                  const isTlExpanded = expandedNodes.has(tl.id);
                                  const isTlSelected = selectedNodeId === tl.id;

                                  return (
                                    <div key={tl.id} className="space-y-3">
                                      {/* TL Card */}
                                      <div
                                        onClick={() => {
                                          toggleNodeExpansion(tl.id);
                                          setSelectedNodeId(tl.id);
                                        }}
                                        className={`cursor-pointer inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all duration-300 ${
                                          isTlSelected
                                            ? 'bg-[#182640] border-2 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.3)]'
                                            : 'bg-[#0f172a]/70 hover:bg-[#142036] border border-white/10'
                                        }`}
                                      >
                                        <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                                          <Users size={14} />
                                        </span>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <h6 className="text-xs font-extrabold text-white">{tl.name}</h6>
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-400">
                                              TL
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                            <span className="text-emerald-400">{formatCompactRupee(tl.achievement)}</span>
                                            <span>•</span>
                                            <span className="text-rose-400">Shortfall: {formatCompactRupee(tl.shortfall)}</span>
                                          </div>
                                        </div>
                                        <ChevronRight
                                          size={13}
                                          className={`text-gray-400 transition-transform ${isTlExpanded ? 'rotate-90 text-amber-400' : ''}`}
                                        />
                                      </div>

                                      {/* LEVEL 4: TEAM MEMBERS (TM / BDMs) */}
                                      {isTlExpanded && (
                                        <div className="ml-6 pl-6 border-l-2 border-purple-500/30 grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                          {tl.children?.map(tm => {
                                            const isTmSelected = selectedNodeId === tm.id;
                                            return (
                                              <div
                                                key={tm.id}
                                                onClick={() => setSelectedNodeId(tm.id)}
                                                className={`cursor-pointer p-3 rounded-xl transition-all ${
                                                  isTmSelected
                                                    ? 'bg-[#1b2b48] border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                                                    : 'bg-[#0d1424] hover:bg-[#121c32] border border-white/5'
                                                }`}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs font-bold text-white truncate max-w-[120px]" title={tm.name}>
                                                    {tm.name}
                                                  </span>
                                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300">
                                                    BDM
                                                  </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5">
                                                  <span className="text-emerald-400 font-bold">{formatCompactRupee(tm.achievement)}</span>
                                                  <span className="text-rose-400">Gap: {formatCompactRupee(tm.shortfall)}</span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ===================================================================== */}
          {/* RIGHT 4-5 COLS: SLEEK GLASSMORPHIC INSPECTOR CARD (AS IN ATTACHED SCREENSHOT) */}
          {/* ===================================================================== */}
          <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
            <div className="rounded-3xl bg-[#0c1424]/90 backdrop-blur-xl border border-white/10 p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

              {/* Inspector Header */}
              <div className="relative z-10 flex items-start justify-between gap-3 mb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                    {selectedNode.roleType === 'root'
                      ? 'Enterprise Core'
                      : selectedNode.roleType === 'department'
                      ? 'Division HOD'
                      : selectedNode.roleType === 'branch'
                      ? 'Branch Office'
                      : selectedNode.roleType === 'tl'
                      ? 'Team Leader'
                      : 'Sales BDM'}
                  </span>
                  <h3 className="text-xl font-black text-white mt-2 leading-tight">
                    {selectedNode.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    {selectedNode.subtitle || selectedNode.branchName || 'Sales Operations'}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    selectedNode.shortfall === 0
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {selectedNode.shortfall === 0 ? 'On Track' : 'Shortfall Gap'}
                </span>
              </div>

              {/* Achievement Gauge / Sentiment Rate (As shown in screenshot) */}
              <div className="relative z-10 p-4 rounded-2xl bg-[#090f1b] border border-white/5 my-4">
                <div className="flex justify-between items-center text-xs text-gray-400 font-semibold mb-2">
                  <span>Achievement Performance Rate</span>
                  <span className="text-emerald-400">Target Benchmark</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white">
                      {selectedNode.target > 0
                        ? Math.min(100, Math.round((selectedNode.achievement / selectedNode.target) * 100))
                        : 0}%
                    </span>
                    <span className="text-xs text-emerald-400 font-bold flex items-center">
                      <TrendingUp size={12} className="mr-0.5" />
                      Live Rec
                    </span>
                  </div>
                  {/* Futuristic sparkline soundwave bars */}
                  <div className="flex items-end gap-1 h-6">
                    {[35, 60, 45, 80, 65, 90, 75, 100, 85].map((h, i) => (
                      <span
                        key={i}
                        style={{ height: `${h}%` }}
                        className={`w-1 rounded-full ${i >= 6 ? 'bg-cyan-400' : 'bg-gray-700'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 4 Core KPIs Grid */}
              <div className="relative z-10 grid grid-cols-2 gap-3 my-4">
                <div className="p-3 rounded-2xl bg-[#10192c] border border-white/5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Target</p>
                  <p className="text-sm font-extrabold text-cyan-400 mt-0.5">
                    {formatRupee(selectedNode.target)}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-[#10192c] border border-white/5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Achieved</p>
                  <p className="text-sm font-extrabold text-emerald-400 mt-0.5">
                    {formatRupee(selectedNode.achievement)}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-[#10192c] border border-white/5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Shortfall</p>
                  <p className="text-sm font-extrabold text-rose-400 mt-0.5">
                    {formatRupee(selectedNode.shortfall)}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-[#10192c] border border-white/5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Booked Deals</p>
                  <p className="text-sm font-extrabold text-white mt-0.5">
                    {selectedNode.dealsCount}
                  </p>
                </div>
              </div>

              {/* Comparative Progress Bar View with Shortfall */}
              <div className="relative z-10 my-4 space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-gray-300">
                  <span>Target vs Shortfall Bar</span>
                  <span className="text-rose-400 font-extrabold">Gap: {formatCompactRupee(selectedNode.shortfall)}</span>
                </div>
                <div className="w-full h-3 bg-gray-900 rounded-full overflow-hidden p-0.5 flex">
                  <div
                    style={{
                      width: `${selectedNode.target > 0 ? Math.min(100, (selectedNode.achievement / selectedNode.target) * 100) : 0}%`
                    }}
                    className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full rounded-full"
                    title="Achieved Portion"
                  />
                  <div
                    style={{
                      width: `${selectedNode.target > 0 ? Math.min(100, (selectedNode.shortfall / selectedNode.target) * 100) : 100}%`
                    }}
                    className="bg-rose-500/80 h-full rounded-full"
                    title="Shortfall Gap"
                  />
                </div>
              </div>

              {/* Sub-Entities / Deals List under selected Node */}
              <div className="relative z-10 pt-4 border-t border-white/10 mt-4">
                <p className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                  <span>
                    {selectedNode.children && selectedNode.children.length > 0
                      ? `Team Breakdown (${selectedNode.children.length})`
                      : `Active Deals Booked (${selectedNode.deals?.length || 0})`}
                  </span>
                  <span className="text-[10px] text-gray-400">Live Records</span>
                </p>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {selectedNode.children && selectedNode.children.length > 0 ? (
                    selectedNode.children.map(child => (
                      <div
                        key={child.id}
                        onClick={() => setSelectedNodeId(child.id)}
                        className="p-2.5 rounded-xl bg-[#0a101d] hover:bg-[#121c32] border border-white/5 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div className="truncate pr-2">
                          <p className="text-xs font-bold text-white truncate">{child.name}</p>
                          <p className="text-[10px] text-gray-400">{child.subtitle || child.roleType.toUpperCase()}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-extrabold text-emerald-400">{formatCompactRupee(child.achievement)}</p>
                          <p className="text-[10px] text-rose-400">Gap: {formatCompactRupee(child.shortfall)}</p>
                        </div>
                      </div>
                    ))
                  ) : selectedNode.deals && selectedNode.deals.length > 0 ? (
                    selectedNode.deals.slice(0, 15).map((d, i) => (
                      <div
                        key={d.id || i}
                        className="p-2.5 rounded-xl bg-[#0a101d] border border-white/5 flex items-center justify-between"
                      >
                        <div className="truncate pr-2">
                          <p className="text-xs font-bold text-white truncate">{d.client || d.Deal_Name || 'Deal Record'}</p>
                          <p className="text-[10px] text-gray-400 truncate">{d.service || d.Service_Name || 'Advisory'}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-extrabold text-emerald-400">{formatCompactRupee(getDealReceivedAmount(d))}</p>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300">
                            {d.stage || d.Stage || 'Active'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 py-3 text-center">No active deal records for this selection.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. DEAL PIPELINE VIEW STAGES & SALES FUNNEL */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deal Pipeline View Stages */}
        <div className="rounded-3xl bg-[#0c1322] border border-white/10 p-6 sm:p-7 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Layers size={18} className="text-cyan-400" />
                Deal Pipeline View Stages
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Active deals and total volume grouped by workflow stage.</p>
            </div>
            <span className="text-xs font-bold text-gray-400">Total: {filteredDeals.length} Deals</span>
          </div>

          <div className="space-y-3">
            {pipelineStages.map(stage => {
              const maxStageAmount = Math.max(...pipelineStages.map(s => s.amount), 1);
              const pct = Math.round((stage.amount / maxStageAmount) * 100);

              return (
                <div key={stage.id} className="p-3.5 rounded-2xl bg-[#111929] border border-white/5">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-bold text-white">{stage.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{stage.count} Deals</span>
                      <span className="font-extrabold text-cyan-400">{formatCompactRupee(stage.amount)}</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`bg-gradient-to-r ${stage.color} h-full rounded-full`}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5">
                    <span>Received: <strong className="text-emerald-400">{formatCompactRupee(stage.received)}</strong></span>
                    <span>Stage Volume: <strong>{formatRupee(stage.amount)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sales Conversion Funnel */}
        <div className="rounded-3xl bg-[#0c1322] border border-white/10 p-6 sm:p-7 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-400" />
                Sales Conversion Funnel
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Lead-to-closed won conversion efficiency across active pipeline.</p>
            </div>
            <span className="text-xs font-bold text-emerald-400">Live Conversion</span>
          </div>

          <div className="space-y-3.5 pt-2">
            {salesFunnel.map((step, idx) => (
              <div key={idx} className="relative">
                <div className="flex justify-between items-center text-xs font-semibold mb-1">
                  <span className="text-gray-300">{step.stage}</span>
                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-white">{step.count} Records</span>
                    <span className="text-cyan-400">{step.pct}%</span>
                  </div>
                </div>
                <div className="w-full h-3 bg-gray-900 rounded-full overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${step.pct}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className={`${step.color} h-full rounded-full shadow-[0_0_10px_rgba(6,182,212,0.4)]`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. TOP SELLING SERVICES & BDM-WISE TOP SERVICES MATRIX */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Selling Services Card */}
        <div className="lg:col-span-5 rounded-3xl bg-[#0c1322] border border-white/10 p-6 sm:p-7 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Award size={18} className="text-amber-400" />
                Top Selling Services
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Ranked by total received revenue & deal booking volume.</p>
            </div>
          </div>

          <div className="space-y-3">
            {topServices.map((srv, idx) => (
              <div
                key={srv.name}
                className="p-3 rounded-2xl bg-[#111929] border border-white/5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                    idx === 0 ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30' :
                    idx === 1 ? 'bg-gray-300 text-black' :
                    idx === 2 ? 'bg-amber-700 text-white' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    #{idx + 1}
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-white truncate max-w-[170px]" title={srv.name}>
                      {srv.name}
                    </h5>
                    <p className="text-[10px] text-gray-400">{srv.count} Deals Booked</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-extrabold text-emerald-400">{formatCompactRupee(srv.received)}</p>
                  <p className="text-[10px] text-gray-400">Total: {formatCompactRupee(srv.booked)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BDM-wise Top Selling Services Matrix / Table */}
        <div className="lg:col-span-7 rounded-3xl bg-[#0c1322] border border-white/10 p-6 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Users size={18} className="text-cyan-400" />
                BDM-Wise Performance & Top Selling Services
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Individual BDM closed revenue, deal counts, and primary service.</p>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search BDM..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 pl-8 rounded-xl bg-[#111929] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-colors w-40"
              />
              <Search size={13} className="absolute left-2.5 top-2.5 text-gray-500" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300 whitespace-nowrap">
              <thead className="text-[10px] font-black uppercase text-gray-500 border-b border-white/10 bg-[#090f1a]">
                <tr>
                  <th className="py-3 px-3">BDM Name</th>
                  <th className="py-3 px-3">Top Service</th>
                  <th className="py-3 px-3 text-center">Deals</th>
                  <th className="py-3 px-3 text-right">Received Revenue</th>
                  <th className="py-3 px-3 text-right">Shortfall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bdmPerformance
                  .filter(b => !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .slice(0, 10)
                  .map((bdm, idx) => {
                    const tmTarget = TARGET_BENCHMARKS.tm;
                    const shortfall = Math.max(0, tmTarget - bdm.received);

                    return (
                      <tr key={bdm.name} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30 flex items-center justify-center text-[10px] font-black">
                            {idx + 1}
                          </span>
                          <span className="truncate max-w-[140px]" title={bdm.name}>{bdm.name}</span>
                        </td>
                        <td className="py-3 px-3 text-gray-400 truncate max-w-[160px]" title={bdm.topService}>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/20">
                            {bdm.topService}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-white">{bdm.count}</td>
                        <td className="py-3 px-3 text-right font-extrabold text-emerald-400">
                          {formatRupee(bdm.received)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-rose-400">
                          {formatCompactRupee(shortfall)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SalesHodDashboardView;
