import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Search, Filter, TrendingUp, TrendingDown, Users,
  Layers, ChevronRight, ChevronDown, Award, Trophy, Target,
  DollarSign, PieChart as PieChartIcon, BarChart3, ArrowUpRight,
  Shield, CheckCircle2, Clock, AlertTriangle, Building2, MapPin,
  Sparkles, RefreshCw, Briefcase, Zap, Flame, UserCheck, Eye,
  Maximize2, Minimize2, Compass, Activity, FileText,
  GitBranch, Network, Share2, Send, ZoomIn, ZoomOut, RotateCcw, SlidersHorizontal
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
  const [flowSelectedCategory, setFlowSelectedCategory] = useState<string>('branch_ahmedabad');
  const [flowSelectedLeafId, setFlowSelectedLeafId] = useState<string>('');
  const [flowZoom, setFlowZoom] = useState<number>(1.0);
  const [flowViewMode, setFlowViewMode] = useState<'network' | 'tree' | 'services'>('network');
  const [flowSearchQuery, setFlowSearchQuery] = useState<string>('');

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


  // ============================================================================
  // FLOW CANVAS COMPUTATIONS (EXACT MATCH FOR USER SCREENSHOT)
  // ============================================================================
  const flowCategories = useMemo(() => {
    const branches = salesTree.children?.[0]?.children || [];
    const ahmedabad = branches.find(b => b.id === 'branch_ahmedabad') || {
      id: 'branch_ahmedabad',
      name: 'Ahmedabad Branch',
      subtitle: 'HQ & West Region Cluster',
      target: TARGET_BENCHMARKS.branchAhmedabad,
      achievement: 0,
      shortfall: TARGET_BENCHMARKS.branchAhmedabad,
      dealsCount: 0,
      children: []
    };
    const jaipur = branches.find(b => b.id === 'branch_jaipur') || {
      id: 'branch_jaipur',
      name: 'Jaipur Branch',
      subtitle: 'North Region Cluster',
      target: TARGET_BENCHMARKS.branchJaipur,
      achievement: 0,
      shortfall: TARGET_BENCHMARKS.branchJaipur,
      dealsCount: 0,
      children: []
    };
    const chennai = branches.find(b => b.id === 'branch_chennai') || {
      id: 'branch_chennai',
      name: 'Chennai Branch',
      subtitle: 'South Region Cluster',
      target: TARGET_BENCHMARKS.branchChennai,
      achievement: 0,
      shortfall: TARGET_BENCHMARKS.branchChennai,
      dealsCount: 0,
      children: []
    };

    const countBdm = (b: any) => {
      return (b.children || []).reduce((acc: number, tl: any) => acc + (tl.children?.length || 0), 0);
    };

    return [
      {
        id: 'branch_ahmedabad',
        name: 'Ahmedabad Branch',
        countLabel: `${countBdm(ahmedabad) || 19} BDMs`,
        countNum: countBdm(ahmedabad) || 19,
        subtitle: 'HQ & Western Region Cluster',
        icon: MapPin,
        target: ahmedabad.target,
        achievement: ahmedabad.achievement,
        shortfall: ahmedabad.shortfall,
        dealsCount: ahmedabad.dealsCount,
        data: ahmedabad
      },
      {
        id: 'branch_jaipur',
        name: 'Jaipur Branch',
        countLabel: `${countBdm(jaipur) || 7} BDMs`,
        countNum: countBdm(jaipur) || 7,
        subtitle: 'North Region Cluster',
        icon: MapPin,
        target: jaipur.target,
        achievement: jaipur.achievement,
        shortfall: jaipur.shortfall,
        dealsCount: jaipur.dealsCount,
        data: jaipur
      },
      {
        id: 'branch_chennai',
        name: 'Chennai Branch',
        countLabel: `${countBdm(chennai) || 13} BDMs`,
        countNum: countBdm(chennai) || 13,
        subtitle: 'South Region Cluster',
        icon: MapPin,
        target: chennai.target,
        achievement: chennai.achievement,
        shortfall: chennai.shortfall,
        dealsCount: chennai.dealsCount,
        data: chennai
      },
      {
        id: 'dept_sales',
        name: 'National Sales Head',
        countLabel: '48 BDMs',
        countNum: 48,
        subtitle: 'Mishal Bhatia (National Sales Head)',
        icon: Trophy,
        target: overallTarget,
        achievement: overallAchievement,
        shortfall: overallShortfall,
        dealsCount: filteredDeals.length,
        data: salesTree.children?.[0] || salesTree
      },
      {
        id: 'services_portfolio',
        name: 'Executive Portfolio',
        countLabel: '131 Services',
        countNum: 131,
        subtitle: 'Active Revenue & Advisory Lines',
        icon: Layers,
        target: overallTarget,
        achievement: overallAchievement,
        shortfall: 0,
        dealsCount: filteredDeals.length,
        data: {
          id: 'services_portfolio',
          name: 'Executive Services Portfolio',
          subtitle: '131 Active Product & Advisory Lines',
          target: overallTarget,
          achievement: overallAchievement,
          shortfall: 0,
          dealsCount: filteredDeals.length,
          roleType: 'department',
          wonCount: filteredDeals.length,
          bookedAmount: totalBookedValue,
          deals: filteredDeals,
          children: []
        }
      }
    ];
  }, [salesTree, overallTarget, overallAchievement, overallShortfall, filteredDeals.length, totalBookedValue, filteredDeals]);

  const activeCategoryIndex = useMemo(() => {
    const idx = flowCategories.findIndex(c => c.id === flowSelectedCategory);
    return idx >= 0 ? idx : 0;
  }, [flowCategories, flowSelectedCategory]);

  const activeCategory = flowCategories[activeCategoryIndex] || flowCategories[0];

  const flowLeafItems = useMemo(() => {
    if (!activeCategory) return [];

    // 1. If Services Portfolio:
    if (activeCategory.id === 'services_portfolio') {
      return topServices.slice(0, 18).map((s: any, idx: number) => ({
        id: `service_${idx}`,
        name: s.name,
        role: 'Service Line',
        metricPill: `${formatCompactRupee(s.received)} (${s.count} deals)`,
        status: s.received > 100000 ? 'fire' : 'up',
        target: 500000,
        achievement: s.received,
        shortfall: Math.max(0, 500000 - s.received),
        dealsCount: s.count,
        data: {
          id: `service_${idx}`,
          name: s.name,
          roleType: 'service',
          subtitle: `${s.count} Active Zoho Deals Closed`,
          target: 500000,
          achievement: s.received,
          shortfall: Math.max(0, 500000 - s.received),
          dealsCount: s.count,
          wonCount: s.count,
          topService: s.name,
          bookedAmount: s.booked || s.received,
          deals: filteredDeals.filter((d: any) => String(d.service || d.Service_Name || '').trim() === s.name)
        }
      }));
    }

    // 2. If National Sales Head:
    if (activeCategory.id === 'dept_sales') {
      const tls: any[] = [];
      (salesTree.children?.[0]?.children || []).forEach(br => {
        (br.children || []).forEach(tl => {
          const pct = tl.target > 0 ? Math.round((tl.achievement / tl.target) * 100) : 0;
          tls.push({
            id: tl.id,
            name: `${tl.name} (${br.name.split(' ')[0]})`,
            role: 'Team Leader',
            metricPill: `${formatCompactRupee(tl.achievement)} (${pct}%)`,
            status: tl.shortfall === 0 ? 'fire' : 'up',
            target: tl.target,
            achievement: tl.achievement,
            shortfall: tl.shortfall,
            dealsCount: tl.dealsCount,
            data: tl
          });
        });
      });
      return tls;
    }

    // 3. For a specific Branch (Ahmedabad, Jaipur, Chennai):
    const branchData: any = activeCategory.data;
    const items: any[] = [];

    (branchData.children || []).forEach((tl: any) => {
      // Add TL
      const tlPct = tl.target > 0 ? Math.round((tl.achievement / tl.target) * 100) : 0;
      items.push({
        id: tl.id,
        name: `TL: ${tl.name}`,
        role: 'Team Leader',
        metricPill: `${formatCompactRupee(tl.achievement)} (${tlPct}%)`,
        status: tl.shortfall === 0 ? 'fire' : 'up',
        target: tl.target,
        achievement: tl.achievement,
        shortfall: tl.shortfall,
        dealsCount: tl.dealsCount,
        isTl: true,
        data: tl
      });

      // Add all BDMs under this TL
      (tl.children || []).forEach((tm: any) => {
        const pct = tm.target > 0 ? Math.round((tm.achievement / tm.target) * 100) : 0;
        items.push({
          id: tm.id,
          name: tm.name,
          role: 'Sales BDM',
          metricPill: `${formatCompactRupee(tm.achievement)} (${pct}%)`,
          status: pct >= 100 ? 'fire' : pct >= 50 ? 'up' : 'down',
          target: tm.target,
          achievement: tm.achievement,
          shortfall: tm.shortfall,
          dealsCount: tm.dealsCount,
          isTl: false,
          data: tm
        });
      });
    });

    return items;
  }, [activeCategory, topServices, salesTree, filteredDeals]);

  const filteredFlowLeaves = useMemo(() => {
    if (!flowSearchQuery.trim()) return flowLeafItems;
    const q = flowSearchQuery.toLowerCase();
    return flowLeafItems.filter((item: any) =>
      item.name.toLowerCase().includes(q) ||
      item.role.toLowerCase().includes(q) ||
      item.metricPill.toLowerCase().includes(q)
    );
  }, [flowLeafItems, flowSearchQuery]);

  const activeLeaf = useMemo(() => {
    if (flowSelectedLeafId) {
      const found = filteredFlowLeaves.find((item: any) => item.id === flowSelectedLeafId);
      if (found) return found;
    }
    return filteredFlowLeaves[0] || null;
  }, [filteredFlowLeaves, flowSelectedLeafId]);

  const inspectedEntity = useMemo(() => {
    if (flowSelectedCategory === 'root') {
      return salesTree;
    }
    if (activeLeaf && activeLeaf.data) {
      return activeLeaf.data;
    }
    return activeCategory?.data || salesTree;
  }, [flowSelectedCategory, activeLeaf, activeCategory, salesTree]);

  // Waveform equalizer bars for sentiment/performance visualization (matching screenshot)
  const waveformBars = useMemo(() => {
    return [24, 38, 48, 32, 60, 75, 90, 65, 42, 80, 95, 100, 92, 82, 68, 52, 42, 62, 78, 52, 38, 28, 42, 32];
  }, []);

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
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${timeframe === 'today'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeframe('week')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${timeframe === 'week'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                This Week
              </button>
              <button
                onClick={() => setTimeframe('month')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${timeframe === 'month'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 font-extrabold'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                October 2026
              </button>
              <button
                onClick={() => setTimeframe('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${timeframe === 'all'
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
      {/* 4. INTERACTIVE 3D BRANCHING MINDMAP GRAPH (EXACT MATCH FOR USER SCREENSHOT) */}
      {(() => {
        const itemStep = 34;
        const M = filteredFlowLeaves.length;
        const canvasHeight = Math.max(700, M * itemStep + 100);

        // Orb center & right socket
        const orbSocketX = 165;
        const orbSocketY = canvasHeight / 2;

        // Col 1 Cards
        const col1Left = 230;
        const col1Width = 190;
        const col1Right = col1Left + col1Width; // 420
        const cardHeight = 52;
        const cardGap = 14;
        const totalCol1Height = 5 * cardHeight + 4 * cardGap; // 316
        const col1StartY = (canvasHeight - totalCol1Height) / 2;

        // Active Col 1 Card center Y
        const activeCardCenterY = col1StartY + activeCategoryIndex * (cardHeight + cardGap) + cardHeight / 2;

        // Col 2 Leaf items
        const col2Left = 560;
        const col2Width = 270;
        const totalCol2Height = M * itemStep;
        const col2StartY = Math.max(25, (canvasHeight - totalCol2Height) / 2);

        // Inspector card metrics
        const sentimentRate = inspectedEntity.target > 0
          ? Math.min(150, Math.round((inspectedEntity.achievement / inspectedEntity.target) * 100))
          : 0;
        const isSurplus = (inspectedEntity.shortfall || 0) === 0;

        return (
          <div className="rounded-3xl bg-[#060b14] border border-cyan-500/20 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
            {/* Background Starfield & Subtle Grid */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* TOP HEADER CONTROLS (MATCHING SCREENSHOT CONTROL AI BAR) */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
              {/* Brand / Title on Left */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                    BharatEdge Sales Policy Platform
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                      Live AI Flow
                    </span>
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Interactive 3D Radial Mindmap & Dynamic Shortfall Network
                  </p>
                </div>
              </div>

              {/* Center Floating Pill Toolbar (Matching screenshot icons: branching, tree, zoom, filter) */}
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0d1626]/90 border border-white/10 shadow-lg">
                <button
                  onClick={() => setFlowViewMode('network')}
                  title="Branching Network View"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    flowViewMode === 'network'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <GitBranch size={13} />
                  <span className="hidden sm:inline">Radial Flow</span>
                </button>
                <button
                  onClick={() => setFlowViewMode('tree')}
                  title="Hierarchy Tree Mode"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    flowViewMode === 'tree'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Network size={13} />
                  <span className="hidden sm:inline">Tree Mode</span>
                </button>
                <div className="w-[1px] h-4 bg-white/10 mx-1" />
                <button
                  onClick={() => setFlowZoom(z => Math.min(1.3, z + 0.1))}
                  title="Zoom In"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={() => setFlowZoom(z => Math.max(0.7, z - 0.1))}
                  title="Zoom Out"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => { setFlowZoom(1.0); setFlowSearchQuery(''); }}
                  title="Reset Zoom & Filters"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {/* Right Action Buttons (Matching screenshot) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onRefresh}
                  disabled={propsRefreshing}
                  className="px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/60 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={propsRefreshing ? 'animate-spin' : ''} />
                  <span className="hidden md:inline">Sync Zoho</span>
                </button>
                <button
                  onClick={() => alert('Simulating 100% Target Achievement across all 3 Branches...')}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-xs font-bold shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:brightness-110 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>+ New Simulation</span>
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-black font-black text-xs flex items-center justify-center shadow-md">
                  MB
                </div>
              </div>
            </div>

            {/* SUB-HEADER BREADCRUMB & QUICK SWITCH BAR */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 mb-5 px-1">
              {/* Dynamic Breadcrumbs */}
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 overflow-x-auto py-1">
                <button
                  onClick={() => {
                    setFlowSelectedCategory('root');
                    setFlowSelectedLeafId('');
                  }}
                  className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                >
                  <span>🌐 BharatEdge Group</span>
                </button>
                <span className="text-gray-600">/</span>
                <button
                  onClick={() => {
                    setFlowSelectedCategory('dept_sales');
                    setFlowSelectedLeafId('');
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Sales & Growth
                </button>
                <span className="text-gray-600">/</span>
                <span className="text-amber-400 font-bold">{activeCategory.name}</span>
                {activeLeaf && (
                  <>
                    <span className="text-gray-600">/</span>
                    <span className="text-white font-extrabold truncate max-w-[150px]">{activeLeaf.name}</span>
                  </>
                )}
              </div>

              {/* Quick Filter Search in Leaf items */}
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-3 text-gray-400" />
                <input
                  type="text"
                  value={flowSearchQuery}
                  onChange={(e) => setFlowSearchQuery(e.target.value)}
                  placeholder="Filter leaf nodes..."
                  className="pl-8 pr-3 py-1 rounded-xl bg-[#0d1626] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 w-44 transition-all"
                />
              </div>
            </div>

            {/* ===================================================================== */}
            {/* MAIN RADIAL CANVAS (HORIZONTAL SVG FLOW + NODES + INSPECTOR PANEL) */}
            {/* ===================================================================== */}
            <div className="overflow-x-auto pb-4">
              <div
                className="relative transition-transform duration-300 origin-top-left"
                style={{
                  minWidth: 1240,
                  height: canvasHeight,
                  transform: `scale(${flowZoom})`,
                  transformOrigin: '0 0'
                }}
              >
                {/* SVG LAYER */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ minWidth: 1240, height: canvasHeight }}
                >
                  <defs>
                    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="goldGlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
                      <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="fanGlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.8" />
                      <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.5" />
                    </linearGradient>
                  </defs>

                  {/* 1. Curved lines from Orb Right Socket (165, orbSocketY) to Col 1 Cards */}
                  {flowCategories.map((cat, i) => {
                    const cardCenterY = col1StartY + i * (cardHeight + cardGap) + cardHeight / 2;
                    const isCatActive = i === activeCategoryIndex;
                    const pathD = `M ${orbSocketX} ${orbSocketY} C ${orbSocketX + 35} ${orbSocketY}, ${col1Left - 35} ${cardCenterY}, ${col1Left} ${cardCenterY}`;

                    return (
                      <g key={cat.id}>
                        <path
                          d={pathD}
                          stroke={isCatActive ? 'url(#goldGlowGrad)' : '#334155'}
                          strokeWidth={isCatActive ? 2.5 : 1.2}
                          fill="none"
                          opacity={isCatActive ? 1 : 0.4}
                          filter={isCatActive ? 'url(#goldGlow)' : undefined}
                        />
                        <circle
                          cx={col1Left}
                          cy={cardCenterY}
                          r={isCatActive ? 3.5 : 2}
                          fill={isCatActive ? '#fbbf24' : '#64748b'}
                        />
                      </g>
                    );
                  })}

                  {/* Socket Bead on the Orb */}
                  <circle
                    cx={orbSocketX}
                    cy={orbSocketY}
                    r={4}
                    fill="#818cf8"
                    filter="url(#cyanGlow)"
                  />

                  {/* 2. Curved Fan-Out lines from Active Card Right Socket to Col 2 Leafs */}
                  {filteredFlowLeaves.map((leaf: any, j: number) => {
                    const leafCenterY = col2StartY + j * itemStep + 14;
                    const isLeafActive = activeLeaf?.id === leaf.id;
                    const dx = (col2Left - col1Right) * 0.5;
                    const pathD = `M ${col1Right} ${activeCardCenterY} C ${col1Right + dx} ${activeCardCenterY}, ${col2Left - dx} ${leafCenterY}, ${col2Left} ${leafCenterY}`;

                    return (
                      <g key={leaf.id}>
                        <path
                          d={pathD}
                          stroke={isLeafActive ? '#38bdf8' : 'url(#fanGlowGrad)'}
                          strokeWidth={isLeafActive ? 2.2 : 1.1}
                          fill="none"
                          opacity={isLeafActive ? 1 : 0.65}
                          filter={isLeafActive ? 'url(#cyanGlow)' : undefined}
                        />
                        <circle
                          cx={col2Left}
                          cy={leafCenterY}
                          r={isLeafActive ? 3.5 : 2}
                          fill={isLeafActive ? '#38bdf8' : '#38bdf8aa'}
                          filter={isLeafActive ? 'url(#cyanGlow)' : undefined}
                        />
                      </g>
                    );
                  })}

                  {/* Active Card Right Socket Glowing Bead */}
                  <circle
                    cx={col1Right}
                    cy={activeCardCenterY}
                    r={4.5}
                    fill="#fbbf24"
                    filter="url(#goldGlow)"
                  />
                </svg>

                {/* ================================================================= */}
                {/* COLUMN 0: THE 3D GLOWING SPHERE (MATCHING LEFT SIDE OF SCREENSHOT) */}
                {/* ================================================================= */}
                <div
                  onClick={() => {
                    setFlowSelectedCategory('root');
                    setFlowSelectedLeafId('');
                  }}
                  className="absolute cursor-pointer group"
                  style={{
                    left: 15,
                    top: orbSocketY - 85,
                    width: 150,
                    height: 170
                  }}
                  title="Click to view Full Enterprise Overview"
                >
                  <div className="w-36 h-36 mx-auto rounded-full bg-[#0a1224]/90 border border-indigo-500/20 shadow-[0_0_50px_rgba(99,102,241,0.25)] flex flex-col items-center justify-center relative group-hover:border-indigo-400/50 transition-all">
                    <div className="absolute inset-0 rounded-full border border-dashed border-indigo-400/30 animate-[spin_25s_linear_infinite]" />

                    <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-800 via-indigo-600 to-cyan-400 shadow-[inset_-4px_-4px_10px_rgba(0,0,0,0.9),inset_3px_3px_8px_rgba(255,255,255,0.7),0_0_30px_rgba(129,140,248,0.9)] flex items-center justify-center transform group-hover:scale-110 transition-transform">
                      <Sparkles size={16} className="text-white" />
                    </div>

                    <p className="text-[10px] font-black text-white mt-1.5 tracking-tight group-hover:text-cyan-300 transition-colors">
                      BharatEdge Group
                    </p>
                    <p className="text-[8px] text-gray-400 font-medium">Core Enterprise</p>
                  </div>

                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                      <span>TARGET: {formatCompactRupee(overallTarget)}</span>
                      <span>👍</span>
                    </span>
                  </div>
                </div>

                {/* ================================================================= */}
                {/* COLUMN 1: STACKED ROUNDED CARDS (MATCHING 5 CARDS IN SCREENSHOT) */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-3.5"
                  style={{
                    left: col1Left,
                    top: col1StartY,
                    width: col1Width
                  }}
                >
                  {flowCategories.map((cat, i) => {
                    const isCatActive = i === activeCategoryIndex;
                    const IconComp = cat.icon;

                    return (
                      <div
                        key={cat.id}
                        onClick={() => {
                          setFlowSelectedCategory(cat.id);
                          setFlowSelectedLeafId('');
                        }}
                        className={`relative rounded-2xl p-2.5 transition-all duration-300 cursor-pointer flex items-center justify-between gap-2.5 ${
                          isCatActive
                            ? 'bg-[#101c33] border-2 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.45)] ring-1 ring-amber-400 text-white'
                            : 'bg-[#0d1626]/85 hover:bg-[#121f36] border border-white/10 hover:border-cyan-500/40 text-gray-300'
                        }`}
                        style={{ height: cardHeight }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`p-1.5 rounded-xl border flex-shrink-0 ${
                              isCatActive
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-white/5 text-gray-400 border-white/10'
                            }`}
                          >
                            <IconComp size={15} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-black text-white">{cat.countNum}</span>
                              <span className="text-[10px] text-gray-400 truncate font-semibold">{cat.name.split(' ')[0]}</span>
                            </div>
                            <p className="text-[9px] text-gray-400 truncate">{cat.name}</p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className={`text-[10px] font-extrabold ${isCatActive ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {formatCompactRupee(cat.achievement)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 2: FANNED-OUT LEAF ITEMS (MATCHING FAN-OUT IN SCREENSHOT) */}
                {/* ================================================================= */}
                <div
                  className="absolute space-y-1.5"
                  style={{
                    left: col2Left + 12,
                    top: col2StartY,
                    width: col2Width
                  }}
                >
                  {filteredFlowLeaves.map((leaf: any) => {
                    const isLeafActive = activeLeaf?.id === leaf.id;

                    return (
                      <div
                        key={leaf.id}
                        onClick={() => setFlowSelectedLeafId(leaf.id)}
                        className={`group flex items-center justify-between px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-200 ${
                          isLeafActive
                            ? 'bg-[#142442] border border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                            : 'bg-[#0b1322]/80 hover:bg-[#101b2f] border border-white/5 text-gray-300 hover:text-white'
                        }`}
                        style={{ height: 28 }}
                      >
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              isLeafActive
                                ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                                : 'bg-gray-500 group-hover:bg-cyan-400'
                            }`}
                          />
                          <span className="text-xs font-bold truncate" title={leaf.name}>
                            {leaf.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px]">
                          <span className={`px-1.5 py-0.2 rounded font-bold ${
                            isLeafActive
                              ? 'bg-cyan-950 text-cyan-300'
                              : 'bg-white/5 text-gray-400'
                          }`}>
                            {leaf.metricPill}
                          </span>
                          <span className="text-xs">
                            {leaf.status === 'fire' ? '🔥' : leaf.status === 'up' ? '👍' : '⚠️'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ================================================================= */}
                {/* COLUMN 3: SLEEK GLASSMORPHIC INSPECTOR PANEL (MATCHING SCREENSHOT) */}
                {/* ================================================================= */}
                <div
                  className="absolute rounded-3xl bg-[#0c1527]/95 backdrop-blur-xl border border-white/10 p-5 shadow-2xl overflow-hidden flex flex-col justify-between"
                  style={{
                    left: 855,
                    top: 15,
                    width: 360,
                    bottom: 15
                  }}
                >
                  <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-cyan-400 text-[11px] font-bold">
                        <Briefcase size={12} />
                        <span className="uppercase tracking-wider">
                          {inspectedEntity.roleType === 'root'
                            ? 'Enterprise Core'
                            : inspectedEntity.roleType === 'department'
                            ? 'National Sales Head'
                            : inspectedEntity.roleType === 'branch'
                            ? 'Regional Branch'
                            : inspectedEntity.roleType === 'tl'
                            ? 'Team Leader'
                            : inspectedEntity.roleType === 'service'
                            ? 'Service Line'
                            : 'Sales BDM'}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-white mt-1 leading-snug truncate" title={inspectedEntity.name}>
                        {inspectedEntity.name}
                      </h3>
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-emerald-400 font-bold">Active</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-[10px] text-gray-400">Live Zoho CRM</span>
                        </div>
                        <button
                          onClick={() => {
                            if (inspectedEntity.deals?.[0]?.id) {
                              window.open(`/crm/deals/${inspectedEntity.deals[0].id}`, '_blank');
                            }
                          }}
                          className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-0.5 text-[10px] cursor-pointer"
                        >
                          <span>Explore deals</span>
                          <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Sentiment Rate / Target Achievement Card */}
                    <div className="p-4 rounded-2xl bg-[#091120] border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>Sentiment / Achievement Rate</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          isSurplus
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                        }`}>
                          {isSurplus ? 'Target Met' : 'Moderate'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white tracking-tight">
                              {sentimentRate}%
                            </span>
                            <span className={`text-xs font-bold ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isSurplus ? '+14% vs Target' : '-4% Last month'}
                            </span>
                          </div>
                        </div>

                        {/* Equalizer Waveform Sparkline */}
                        <div className="flex items-end gap-[2px] h-7">
                          {waveformBars.map((h, bIdx) => (
                            <span
                              key={bIdx}
                              style={{ height: `${h}%` }}
                              className={`w-1 rounded-full transition-all ${
                                bIdx >= 8 && bIdx <= 15
                                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                  : 'bg-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 2x2 Metric Grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-2xl bg-[#091120] border border-white/5">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                          <CheckCircle2 size={11} className="text-cyan-400" />
                          <span>Deals Won</span>
                        </div>
                        <p className="text-base font-black text-white mt-0.5">
                          {inspectedEntity.wonCount || inspectedEntity.dealsCount || 0}
                        </p>
                      </div>

                      <div className="p-3 rounded-2xl bg-[#091120] border border-white/5">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                          <FileText size={11} className="text-indigo-400" />
                          <span>Quoted Value</span>
                        </div>
                        <p className="text-base font-black text-white mt-0.5">
                          {formatCompactRupee(inspectedEntity.bookedAmount || inspectedEntity.achievement)}
                        </p>
                      </div>

                      <div className="p-3 rounded-2xl bg-[#091120] border border-white/5">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                          <Sparkles size={11} className="text-amber-400" />
                          <span>Received</span>
                        </div>
                        <p className="text-base font-black text-emerald-400 mt-0.5">
                          {formatCompactRupee(inspectedEntity.achievement)}
                        </p>
                      </div>

                      <div className="p-3 rounded-2xl bg-[#091120] border border-white/5">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                          <Target size={11} className="text-rose-400" />
                          <span>Shortfall Gap</span>
                        </div>
                        <p className="text-base font-black text-rose-400 mt-0.5">
                          {formatCompactRupee(inspectedEntity.shortfall)}
                        </p>
                      </div>
                    </div>

                    {/* RI Analysis Box */}
                    <div className="p-3.5 rounded-2xl bg-[#091120] border border-white/5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-400">
                        <Zap size={12} />
                        <span>RI Executive Intelligence</span>
                      </div>
                      <p className="text-xs font-bold text-white">
                        {isSurplus
                          ? 'Propose Quota Scaling'
                          : 'Target Gap Closure Strategy'}
                      </p>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                        {isSurplus
                          ? `Target successfully achieved with ${formatCompactRupee(inspectedEntity.achievement)} received. Expanding bandwidth to capture enterprise deals.`
                          : `Current shortfall gap is ${formatCompactRupee(inspectedEntity.shortfall)}. Recommended action: Accelerate verification on active stage deals.`}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Floating Input Pill */}
                  <div className="mt-3 p-2 rounded-2xl bg-[#091120] border border-white/10 flex items-center justify-between gap-2 shadow-inner">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                        AI Agent
                      </span>
                      <input
                        type="text"
                        placeholder="Ask a question..."
                        className="bg-transparent text-[11px] text-white placeholder-gray-500 focus:outline-none w-full"
                      />
                    </div>
                    <button
                      title="Send query"
                      className="p-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black transition-colors cursor-pointer flex-shrink-0"
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
                  <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${idx === 0 ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30' :
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

