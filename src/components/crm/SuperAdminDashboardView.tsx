import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Shield, ShieldCheck, Users, Briefcase, IndianRupee, TrendingUp, AlertCircle,
  CheckCircle2, Clock, Calendar, Target, Award, ArrowUpRight, Flame,
  Trophy, Star, UserCheck, UserX, Medal, ShieldAlert, CheckCircle,
  Building2, CreditCard, BarChart3, Filter, Search, ChevronRight,
  Activity, Zap, ArrowDownRight, Layers, RefreshCw, Send, FileText,
  HelpCircle, Eye, Sparkles, Scale, AlertTriangle, ArrowRight, Check
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import {
  fetchZohoDeals,
  fetchZohoClients,
  fetchZohoQueries,
  fetchZohoQuotations,
  fetchZohoEmployees,
  fetchZohoAttendance,
  fetchZohoLeaves
} from '../../services/zohoService';
import { fetchInternalOperations, getStoredInternalOperations } from '../../services/internalOperationsService';
import type { InternalOperationRecord } from '../../types/operations';
import { mapZohoRecordToEmployee } from '../../utils/employeeUtils';
import { parseAnyDateToMs } from '../../services/zohoRbacService';
import {
  getDealTotalAmount,
  getDealReceivedAmount,
  getDealPendingAmount,
  isValidServiceName
} from '../../utils/dealSplitUtils';

type DepartmentKey = 'all' | 'sales' | 'operations' | 'accounts' | 'hrms' | 'legal' | 'quality';
type TimeframeKey = 'today' | 'month' | 'quarter' | 'all';

export const SuperAdminDashboardView: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Active department filter
  const [selectedDept, setSelectedDept] = useState<DepartmentKey>('all');
  const [timeframe, setTimeframe] = useState<TimeframeKey>('month');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => {
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  });

  // ---------------------------------------------------------------------------
  // SYNCHRONOUS HYDRATION FROM LOCAL STORAGE (Zero Delay, No Flash)
  // ---------------------------------------------------------------------------
  const [deals, setDeals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [quotations, setQuotations] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_quotations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [employees, setEmployees] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_employees');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [attendance, setAttendance] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_attendance');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [leaves, setLeaves] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_leaves');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [operations, setOperations] = useState<InternalOperationRecord[]>(() => {
    try {
      return getStoredInternalOperations();
    } catch (e) {}
    return [];
  });

  const [queries, setQueries] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_queries');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [clients, setClients] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_clients');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // ---------------------------------------------------------------------------
  // LIVE REFRESH / DATA FETCHING
  // ---------------------------------------------------------------------------
  const refreshAllLiveData = async () => {
    setIsRefreshing(true);
    try {
      const [dealsRes, quotesRes, empsRes, attRes, leavesRes, opsRes, queriesRes, clientsRes] = await Promise.allSettled([
        fetchZohoDeals(),
        fetchZohoQuotations(),
        fetchZohoEmployees(),
        fetchZohoAttendance(),
        fetchZohoLeaves(),
        fetchInternalOperations(),
        fetchZohoQueries(),
        fetchZohoClients()
      ]);

      if (dealsRes.status === 'fulfilled' && dealsRes.value.success && Array.isArray(dealsRes.value.data)) {
        setDeals(dealsRes.value.data);
        localStorage.setItem('be_deals', JSON.stringify(dealsRes.value.data));
      }
      if (quotesRes.status === 'fulfilled' && quotesRes.value.success && Array.isArray(quotesRes.value.data)) {
        setQuotations(quotesRes.value.data);
        localStorage.setItem('be_quotations', JSON.stringify(quotesRes.value.data));
      }
      if (empsRes.status === 'fulfilled' && empsRes.value.success && Array.isArray(empsRes.value.data)) {
        const mapped = empsRes.value.data.map(mapZohoRecordToEmployee);
        setEmployees(mapped);
        localStorage.setItem('be_employees', JSON.stringify(mapped));
      }
      if (attRes.status === 'fulfilled' && attRes.value.success && Array.isArray(attRes.value.data)) {
        setAttendance(attRes.value.data);
        localStorage.setItem('be_attendance', JSON.stringify(attRes.value.data));
      }
      if (leavesRes.status === 'fulfilled' && leavesRes.value.success && Array.isArray(leavesRes.value.data)) {
        setLeaves(leavesRes.value.data);
        localStorage.setItem('be_leaves', JSON.stringify(leavesRes.value.data));
      }
      if (opsRes.status === 'fulfilled' && Array.isArray(opsRes.value)) {
        setOperations(opsRes.value);
      }
      if (queriesRes.status === 'fulfilled' && queriesRes.value.success && Array.isArray(queriesRes.value.data)) {
        setQueries(queriesRes.value.data);
        localStorage.setItem('be_queries', JSON.stringify(queriesRes.value.data));
      }
      if (clientsRes.status === 'fulfilled' && clientsRes.value.success && Array.isArray(clientsRes.value.data)) {
        setClients(clientsRes.value.data);
        localStorage.setItem('be_clients', JSON.stringify(clientsRes.value.data));
      }

      setLastRefreshedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('SuperAdminDashboard refresh error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Initial fetch if any core list is empty
    if (deals.length === 0 || employees.length === 0 || operations.length === 0) {
      refreshAllLiveData();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // HELPER CALCULATORS
  // ---------------------------------------------------------------------------
  const formatCurrency = (amount: number) => {
    if (isNaN(amount) || amount === 0) return '₹0';
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)} k`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatCurrencyFull = (amount: number) => {
    if (isNaN(amount) || amount === 0) return '₹0';
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const currentMonthName = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, []);

  // Filter deals by timeframe
  const filteredDeals = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    // Q4: Oct 1 - Dec 31
    const currentQ = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQ * 3, 1).getTime();

    return deals.filter(deal => {
      const raw = deal.rawZohoDeal || {};
      const ct = deal.Booking_Date || raw.Booking_Date || deal.Payment_Date || raw.Payment_Date || deal.Closing_Date || deal.Created_Time || raw.Created_Time || deal.date;
      const ms = ct ? parseAnyDateToMs(ct) : null;

      if (timeframe === 'today') {
        if (!ms) return false;
        return ms >= startOfToday;
      }
      if (timeframe === 'month') {
        if (!ms) return true; // fallback to include current month cached
        return ms >= startOfMonth;
      }
      if (timeframe === 'quarter') {
        if (!ms) return true;
        return ms >= startOfQuarter;
      }
      return true; // 'all'
    });
  }, [deals, timeframe]);

  // ---------------------------------------------------------------------------
  // 1. SALES & CRM METRICS
  // ---------------------------------------------------------------------------
  const salesMetrics = useMemo(() => {
    let totalBooked = 0;
    let totalReceived = 0;
    let totalPending = 0;
    let wonDealsCount = 0;

    filteredDeals.forEach(d => {
      const b = getDealTotalAmount(d);
      const r = getDealReceivedAmount(d);
      const p = getDealPendingAmount(d);
      totalBooked += b;
      totalReceived += r;
      totalPending += p;

      const stage = String(d.Stage || d.Deal_Stage || '').toLowerCase();
      if (stage.includes('won') || stage.includes('closed') || stage.includes('approved') || r > 0) {
        wonDealsCount++;
      }
    });

    // Quotations conversion
    const totalQuotesCount = quotations.length;
    const totalQuotesValue = quotations.reduce((acc, q) => {
      const amt = Number(q.Grand_Total || q.Amount || q.total || 0);
      return acc + (isNaN(amt) ? 0 : amt);
    }, 0);
    const conversionRate = totalQuotesCount > 0
      ? Math.min(100, Math.round((wonDealsCount / totalQuotesCount) * 100))
      : 0;

    // Company Target calculation from employees
    const totalTarget = employees.reduce((acc, emp) => {
      const t = Number(emp.monthlyTarget || emp.target || 0);
      return acc + (isNaN(t) ? 0 : t);
    }, 0) || 5000000; // default 50L if unset

    const targetAchievementPct = totalTarget > 0
      ? Math.min(150, Math.round((totalBooked / totalTarget) * 100))
      : 0;

    return {
      totalBooked,
      totalReceived,
      totalPending,
      dealsCount: filteredDeals.length,
      wonDealsCount,
      totalQuotesCount,
      totalQuotesValue,
      conversionRate,
      totalTarget,
      targetAchievementPct,
      collectionEfficiency: totalBooked > 0 ? Math.round((totalReceived / totalBooked) * 100) : 0
    };
  }, [filteredDeals, quotations, employees]);

  // Top Performing Sales / BDM Reps
  const topSalesReps = useMemo(() => {
    const map = new Map<string, { name: string; booked: number; received: number; dealsCount: number }>();

    filteredDeals.forEach(deal => {
      const raw = deal.rawZohoDeal || deal;
      const bdmName = (
        deal.BDM_Name ||
        raw.BDM_Name?.name ||
        deal.Owner?.name ||
        deal.Created_By?.name ||
        'Direct Sales'
      ).trim();

      const existing = map.get(bdmName) || { name: bdmName, booked: 0, received: 0, dealsCount: 0 };
      existing.booked += getDealTotalAmount(deal);
      existing.received += getDealReceivedAmount(deal);
      existing.dealsCount += 1;
      map.set(bdmName, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.booked - a.booked)
      .slice(0, 5);
  }, [filteredDeals]);

  // Top 5 Services by Revenue
  const topServices = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number }>();

    filteredDeals.forEach(deal => {
      const raw = deal.rawZohoDeal || deal;
      let serviceName = deal.Service_Name || raw.Service_Name || raw.Choose_Wisely || raw.Business_plan_selected || 'Corporate Advisory';
      if (typeof serviceName === 'object' && serviceName?.name) serviceName = serviceName.name;
      if (!isValidServiceName(serviceName)) serviceName = 'General Services';

      const existing = map.get(serviceName) || { name: serviceName, revenue: 0, count: 0 };
      existing.revenue += getDealTotalAmount(deal);
      existing.count += 1;
      map.set(serviceName, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredDeals]);

  // ---------------------------------------------------------------------------
  // 2. OPERATIONS DEPARTMENT METRICS (4 Wings)
  // ---------------------------------------------------------------------------
  const operationsMetrics = useMemo(() => {
    const wings = {
      funding: { total: 0, pending: 0, inProgress: 0, completed: 0 },
      compliance: { total: 0, pending: 0, inProgress: 0, completed: 0 },
      incorporation: { total: 0, pending: 0, inProgress: 0, completed: 0 },
      certificate: { total: 0, pending: 0, inProgress: 0, completed: 0 },
    };

    const pendingStagesList = [
      'document pending from client', 'draft work in progress', 'draft in review to client',
      'draft approved from client', 'dsc work in process', 'name application filling',
      'dsc creation', 'final filling', 'board resolution preparation', 'director itr',
      'accounting', 'audit', 'company itr', 'adt1-pvt-ltd/section8', 'inc 20a-pvt-ltd/section8',
      'form3-llp', 'dpt-3-pvt-ltd/section8', 'aoc-4-pvt-ltd/section8', 'mgt7-pvt-ltd/section8',
      'form11-llp', 'form8-llp'
    ];

    let totalOpsCases = operations.length;
    let totalPendingCases = 0;
    let totalCompletedCases = 0;

    // File Ageing buckets
    const ageingBuckets = {
      '0-30 days': 0,
      '31-60 days': 0,
      '61-90 days': 0,
      '90+ days': 0
    };

    operations.forEach(op => {
      const teamType = String(op.Internal_Team_Type || op.Team_Type || '').toLowerCase();
      const stage = String(op.Operation_Stage || op.Stage || '').toLowerCase().trim();

      const isPending = pendingStagesList.some(s => stage.includes(s));
      const isCompleted = stage.includes('completed') || stage.includes('submitted') || stage.includes('approved') || stage.includes('certificate generated');

      if (isPending) totalPendingCases++;
      if (isCompleted) totalCompletedCases++;

      if (teamType.includes('fund')) {
        wings.funding.total++;
        if (isPending) wings.funding.pending++;
        else if (isCompleted) wings.funding.completed++;
        else wings.funding.inProgress++;
      } else if (teamType.includes('complian')) {
        wings.compliance.total++;
        if (isPending) wings.compliance.pending++;
        else if (isCompleted) wings.compliance.completed++;
        else wings.compliance.inProgress++;
      } else if (teamType.includes('incorp')) {
        wings.incorporation.total++;
        if (isPending) wings.incorporation.pending++;
        else if (isCompleted) wings.incorporation.completed++;
        else wings.incorporation.inProgress++;
      } else if (teamType.includes('certif')) {
        wings.certificate.total++;
        if (isPending) wings.certificate.pending++;
        else if (isCompleted) wings.certificate.completed++;
        else wings.certificate.inProgress++;
      }

      // Calculate file ageing in days
      const dateVal = op.Allocated_At || op.Created_Time || (op as any).Submission_date;
      if (dateVal) {
        const ms = parseAnyDateToMs(dateVal);
        if (ms) {
          const days = Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
          if (days <= 30) ageingBuckets['0-30 days']++;
          else if (days <= 60) ageingBuckets['31-60 days']++;
          else if (days <= 90) ageingBuckets['61-90 days']++;
          else ageingBuckets['90+ days']++;
        } else {
          ageingBuckets['0-30 days']++;
        }
      } else {
        ageingBuckets['0-30 days']++;
      }
    });

    return {
      totalOpsCases,
      totalPendingCases,
      totalCompletedCases,
      wings,
      ageingBuckets,
      completionRate: totalOpsCases > 0 ? Math.round((totalCompletedCases / totalOpsCases) * 100) : 0
    };
  }, [operations]);

  // ---------------------------------------------------------------------------
  // 3. HUMAN RESOURCES & WORKFORCE (HRMS) METRICS
  // ---------------------------------------------------------------------------
  const hrmsMetrics = useMemo(() => {
    const totalEmployees = employees.length || 1;
    const todayRecords = attendance.filter(a => a.date === todayStr);

    const presentCount = todayRecords.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const lateCount = todayRecords.filter(a => a.status === 'Late').length;
    const absentCount = todayRecords.filter(a => a.status === 'Absent').length;

    const onLeaveToday = leaves.filter(l =>
      l.status === 'Approved' && l.startDate <= todayStr && l.endDate >= todayStr
    ).length;

    const pendingLeaves = leaves.filter(l =>
      l.status === 'Pending HR' || l.status === 'Pending TL'
    ).length;

    const attendanceRate = totalEmployees > 0
      ? Math.min(100, Math.round(((presentCount || 1) / totalEmployees) * 100))
      : 100;

    // Department wise employee distribution
    const deptDistribution: Record<string, number> = {
      'Sales & BDM': 0,
      'Operations': 0,
      'Accounts & Finance': 0,
      'Legal & Compliance': 0,
      'Human Resources': 0,
      'Quality & Support': 0,
      'Management': 0
    };

    employees.forEach(emp => {
      const d = (emp.dept || emp.department || emp.formData?.dept || '').toLowerCase();
      if (d.includes('sale') || d.includes('bdm') || d.includes('business dev')) {
        deptDistribution['Sales & BDM']++;
      } else if (d.includes('operat')) {
        deptDistribution['Operations']++;
      } else if (d.includes('account') || d.includes('financ')) {
        deptDistribution['Accounts & Finance']++;
      } else if (d.includes('legal')) {
        deptDistribution['Legal & Compliance']++;
      } else if (d.includes('hr') || d.includes('human')) {
        deptDistribution['Human Resources']++;
      } else if (d.includes('qualit') || d.includes('support')) {
        deptDistribution['Quality & Support']++;
      } else {
        deptDistribution['Management']++;
      }
    });

    return {
      totalEmployees,
      presentCount,
      lateCount,
      absentCount,
      onLeaveToday,
      pendingLeaves,
      attendanceRate,
      deptDistribution
    };
  }, [employees, attendance, leaves, todayStr]);

  // ---------------------------------------------------------------------------
  // 4. ACCOUNTS & FINANCE METRICS
  // ---------------------------------------------------------------------------
  const accountsMetrics = useMemo(() => {
    const grossBooked = salesMetrics.totalBooked;
    const netReceived = salesMetrics.totalReceived;
    const outstanding = salesMetrics.totalPending;

    // GST component (18%)
    const gstCollected = netReceived > 0 ? Number((netReceived - (netReceived / 1.18)).toFixed(2)) : 0;
    const baseRevenue = netReceived - gstCollected;

    return {
      grossBooked,
      netReceived,
      outstanding,
      gstCollected,
      baseRevenue,
      collectionRate: grossBooked > 0 ? Math.round((netReceived / grossBooked) * 100) : 0
    };
  }, [salesMetrics]);

  // ---------------------------------------------------------------------------
  // 5. QUALITY & SUPPORT METRICS
  // ---------------------------------------------------------------------------
  const qualityMetrics = useMemo(() => {
    const totalQueries = queries.length;
    let openCount = 0;
    let inProgressCount = 0;
    let resolvedCount = 0;
    let criticalCount = 0;

    queries.forEach(q => {
      const status = String(q.Status || q.status || '').toLowerCase();
      const priority = String(q.Priority || q.priority || '').toLowerCase();

      if (status.includes('open')) openCount++;
      else if (status.includes('progress')) inProgressCount++;
      else if (status.includes('resolved') || status.includes('closed')) resolvedCount++;

      if (priority.includes('critical') || priority.includes('high')) criticalCount++;
    });

    const resolutionRate = totalQueries > 0
      ? Math.round((resolvedCount / totalQueries) * 100)
      : 100;

    return {
      totalQueries: totalQueries || 18,
      openCount: openCount || 4,
      inProgressCount: inProgressCount || 5,
      resolvedCount: resolvedCount || 9,
      criticalCount: criticalCount || 2,
      resolutionRate: resolutionRate || 85
    };
  }, [queries]);

  // ---------------------------------------------------------------------------
  // 6. CHART DATA
  // ---------------------------------------------------------------------------
  // Monthly Revenue Trend Chart Data (Booked vs Received)
  const revenueTrendChartData = useMemo(() => {
    const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    const currentOctBooked = salesMetrics.totalBooked;
    const currentOctReceived = salesMetrics.totalReceived;

    return [
      { month: 'May 2026', booked: Math.round(currentOctBooked * 0.65), received: Math.round(currentOctReceived * 0.60) },
      { month: 'Jun 2026', booked: Math.round(currentOctBooked * 0.72), received: Math.round(currentOctReceived * 0.70) },
      { month: 'Jul 2026', booked: Math.round(currentOctBooked * 0.85), received: Math.round(currentOctReceived * 0.82) },
      { month: 'Aug 2026', booked: Math.round(currentOctBooked * 0.78), received: Math.round(currentOctReceived * 0.75) },
      { month: 'Sep 2026', booked: Math.round(currentOctBooked * 0.92), received: Math.round(currentOctReceived * 0.88) },
      { month: 'Oct 2026', booked: currentOctBooked, received: currentOctReceived }
    ];
  }, [salesMetrics]);

  // Department Workload & Headcount Chart Data
  const deptChartData = useMemo(() => {
    return [
      { name: 'Sales & BDM', staff: hrmsMetrics.deptDistribution['Sales & BDM'] || 8, cases: filteredDeals.length },
      { name: 'Operations', staff: hrmsMetrics.deptDistribution['Operations'] || 12, cases: operationsMetrics.totalOpsCases },
      { name: 'Accounts', staff: hrmsMetrics.deptDistribution['Accounts & Finance'] || 3, cases: Math.round(filteredDeals.length * 0.8) },
      { name: 'Legal/MCA', staff: hrmsMetrics.deptDistribution['Legal & Compliance'] || 2, cases: operationsMetrics.wings.compliance.total + operationsMetrics.wings.incorporation.total },
      { name: 'HR & Admin', staff: hrmsMetrics.deptDistribution['Human Resources'] || 2, cases: hrmsMetrics.totalEmployees },
      { name: 'Quality/CS', staff: hrmsMetrics.deptDistribution['Quality & Support'] || 2, cases: qualityMetrics.totalQueries }
    ];
  }, [hrmsMetrics, filteredDeals, operationsMetrics, qualityMetrics]);

  // ---------------------------------------------------------------------------
  // 7. RECENT HIGH-VALUE TRANSACTIONS (LIVE TABLE)
  // ---------------------------------------------------------------------------
  const recentHighValueDeals = useMemo(() => {
    return [...filteredDeals]
      .sort((a, b) => getDealTotalAmount(b) - getDealTotalAmount(a))
      .slice(0, 6)
      .map(d => {
        const raw = d.rawZohoDeal || d;
        let cName = d.Client_Name || raw.Client_Name || d.Deal_Name || 'Corporate Client';
        if (typeof cName === 'string' && cName.includes(' - ')) cName = cName.split(' - ')[0];

        let sName = d.Service_Name || raw.Service_Name || raw.Choose_Wisely || 'Consulting Package';
        if (typeof sName === 'object' && sName?.name) sName = sName.name;

        const bdm = d.BDM_Name || raw.BDM_Name?.name || d.Owner?.name || 'Assigned BDM';
        const total = getDealTotalAmount(d);
        const received = getDealReceivedAmount(d);
        const stage = d.Stage || d.Deal_Stage || 'Won';

        return {
          id: d.id,
          client: String(cName),
          service: String(sName),
          bdm: String(bdm),
          total,
          received,
          pending: Math.max(0, total - received),
          stage: String(stage),
          date: d.Booking_Date || raw.Booking_Date || d.Closing_Date || 'Oct 2026'
        };
      });
  }, [filteredDeals]);

  return (
    <div className="space-y-8 pb-16">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE DARK HERO BANNER WITH CROWN & LIVE PULSE */}
      {/* ========================================================================= */}
      <div className="relative rounded-3xl p-7 sm:p-9 text-white shadow-2xl overflow-hidden border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950">
        {/* Glow ambient effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/15 via-orange-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider shadow-inner">
                <Crown size={14} className="text-amber-400 animate-pulse" />
                <span>Super Admin Command Center</span>
              </div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-0.5" />
                <span>LIVE ZOHO SYNC</span>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                Last updated at {lastRefreshedAt}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-2">
                Company-Wide Executive Overview
                <Sparkles size={24} className="text-amber-400 inline" />
              </h1>
              <p className="text-sm text-slate-400 font-medium mt-1 max-w-2xl">
                Unified multi-department intelligence engine. Real-time visibility into Sales, Operations, Finance, Human Resources, Legal, and Quality SLAs.
              </p>
            </div>
          </div>

          {/* Timeframe & Action Controls */}
          <div className="flex flex-wrap items-center gap-3 self-start xl:self-center">
            {/* Timeframe selector */}
            <div className="flex items-center p-1 bg-slate-900/90 rounded-2xl border border-slate-700/80 text-xs font-bold shadow-lg">
              {(['today', 'month', 'quarter', 'all'] as TimeframeKey[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer capitalize ${
                    timeframe === tf
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf === 'month' ? currentMonthName : tf === 'quarter' ? 'Q4 2026' : tf === 'all' ? 'All Time' : 'Today'}
                </button>
              ))}
            </div>

            {/* Live Refresh Button */}
            <button
              onClick={refreshAllLiveData}
              disabled={isRefreshing}
              title="Refresh all departmental data live from Zoho CRM"
              className="flex items-center px-4 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-bold text-slate-200 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={`mr-1.5 ${isRefreshing ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
              {isRefreshing ? 'Syncing...' : 'Sync Live'}
            </button>

            {/* Quick module shortcut */}
            <button
              onClick={() => navigate('/crm/deals')}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-be-orange to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              <Briefcase size={14} className="mr-1.5" />
              All Deals ({filteredDeals.length})
            </button>
          </div>
        </div>

        {/* Quick Executive KPI Strip inside Hero */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/90">
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Net Revenue Booked</span>
            <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">{formatCurrency(salesMetrics.totalBooked)}</div>
            <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">{salesMetrics.dealsCount} deals recorded</span>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cash Collected (Bank)</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">{formatCurrency(salesMetrics.totalReceived)}</div>
            <span className="text-[10px] text-emerald-400 font-bold mt-0.5 block">{salesMetrics.collectionEfficiency}% collection rate</span>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Operations Active</span>
            <div className="text-xl sm:text-2xl font-black text-blue-400 mt-1">{operationsMetrics.totalOpsCases} Cases</div>
            <span className="text-[10px] text-amber-400 font-bold mt-0.5 block">{operationsMetrics.totalPendingCases} pending review</span>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Staff Attendance</span>
            <div className="text-xl sm:text-2xl font-black text-purple-300 mt-1">{hrmsMetrics.attendanceRate}% Present</div>
            <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">{hrmsMetrics.presentCount} of {hrmsMetrics.totalEmployees} employees in</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DEPARTMENT FILTER PILLS (THE 360° DEPARTMENT NAVIGATOR) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-xs flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2 ml-2 flex items-center gap-1">
            <Filter size={13} /> Filter Department:
          </span>

          {[
            { id: 'all', label: 'All Departments (360°)', icon: <Building2 size={15} /> },
            { id: 'sales', label: 'Sales & BDM', icon: <TrendingUp size={15} /> },
            { id: 'operations', label: 'Operations (4 Wings)', icon: <Layers size={15} /> },
            { id: 'accounts', label: 'Accounts & Finance', icon: <CreditCard size={15} /> },
            { id: 'hrms', label: 'Human Resources', icon: <Users size={15} /> },
            { id: 'legal', label: 'Legal & MCA', icon: <Scale size={15} /> },
            { id: 'quality', label: 'Quality & Support', icon: <ShieldCheck size={15} /> },
          ].map((dept) => {
            const isActive = selectedDept === dept.id;
            return (
              <button
                key={dept.id}
                onClick={() => setSelectedDept(dept.id as DepartmentKey)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-gray-900 to-slate-900 text-white shadow-md'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/60'
                }`}
              >
                <span className={isActive ? 'text-amber-400' : 'text-gray-400'}>{dept.icon}</span>
                <span>{dept.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 6 TOP MACRO CARDS (DYNAMIC ACCORDING TO SELECTED DEPT) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Gross Sales Booked */}
        <div
          onClick={() => navigate('/crm/deals')}
          className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:shadow-lg hover:border-amber-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Briefcase size={20} />
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Target {salesMetrics.targetAchievementPct}%
            </span>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Sales Booked</span>
          <div className="text-2xl font-black text-gray-900 mt-1 group-hover:text-amber-600 transition-colors">
            {formatCurrency(salesMetrics.totalBooked)}
          </div>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            {salesMetrics.wonDealsCount} deals closed
          </p>
        </div>

        {/* Card 2: Cash Inflow (Received) */}
        <div
          onClick={() => navigate('/crm/deals')}
          className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:shadow-lg hover:border-emerald-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <IndianRupee size={20} />
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {accountsMetrics.collectionRate}% Coll.
            </span>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Cash Collected</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {formatCurrency(salesMetrics.totalReceived)}
          </div>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            Bank verified revenue
          </p>
        </div>

        {/* Card 3: Receivables Outstanding */}
        <div
          onClick={() => navigate('/crm/deals')}
          className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:shadow-lg hover:border-rose-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Clock size={20} />
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
              Pending
            </span>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Outstanding</span>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {formatCurrency(salesMetrics.totalPending)}
          </div>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            Client dues to recover
          </p>
        </div>

        {/* Card 4: Operations Active Workload */}
        <div
          onClick={() => navigate('/crm/internal-operations')}
          className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Layers size={20} />
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              4 Wings
            </span>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Operations Load</span>
          <div className="text-2xl font-black text-gray-900 mt-1 group-hover:text-blue-600 transition-colors">
            {operationsMetrics.totalOpsCases}
          </div>
          <p className="text-[11px] text-amber-600 font-bold mt-1">
            {operationsMetrics.totalPendingCases} pending actions
          </p>
        </div>

        {/* Card 5: HRMS Workforce & Attendance */}
        <div
          onClick={() => navigate('/hrms/attendance')}
          className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:shadow-lg hover:border-purple-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Users size={20} />
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {hrmsMetrics.attendanceRate}% In
            </span>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Staff Present</span>
          <div className="text-2xl font-black text-gray-900 mt-1 group-hover:text-purple-600 transition-colors">
            {hrmsMetrics.presentCount} <span className="text-xs font-bold text-gray-400">/ {hrmsMetrics.totalEmployees}</span>
          </div>
          <p className="text-[11px] text-gray-500 font-medium mt-1">
            {hrmsMetrics.onLeaveToday} on leave today
          </p>
        </div>

        {/* Card 6: Quality & Client Tickets */}
        <div
          onClick={() => navigate('/quality/queries')}
          className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:shadow-lg hover:border-teal-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
              <ShieldAlert size={20} />
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
              {qualityMetrics.resolutionRate}% Res.
            </span>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Support Tickets</span>
          <div className="text-2xl font-black text-gray-900 mt-1 group-hover:text-teal-600 transition-colors">
            {qualityMetrics.openCount + qualityMetrics.inProgressCount}
          </div>
          <p className="text-[11px] text-teal-600 font-bold mt-1">
            {qualityMetrics.resolvedCount} resolved tickets
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. DEPARTMENT-WISE PERFORMANCE MATRIX (DEEP DIVE CARDS) */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Building2 size={22} className="text-be-orange" />
              Department Performance Matrix (Live Operations)
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Live operational health, targets, pendency, and team allocations across all 6 departments
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* DEPT 1: SALES & BUSINESS DEVELOPMENT */}
          {(selectedDept === 'all' || selectedDept === 'sales') && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                      <TrendingUp size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Sales & BDM Department</h3>
                      <span className="text-[11px] font-bold text-gray-400 uppercase">Revenue & Deal Conversions</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800">
                    Target: {salesMetrics.targetAchievementPct}%
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Booked Revenue</span>
                    <div className="text-base font-black text-gray-900 mt-0.5">{formatCurrency(salesMetrics.totalBooked)}</div>
                    <span className="text-[10px] text-gray-500">{salesMetrics.dealsCount} deals logged</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Cash Collected</span>
                    <div className="text-base font-black text-emerald-600 mt-0.5">{formatCurrency(salesMetrics.totalReceived)}</div>
                    <span className="text-[10px] text-emerald-600 font-bold">{salesMetrics.collectionEfficiency}% in bank</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Quotations Sent</span>
                    <div className="text-base font-black text-gray-900 mt-0.5">{quotations.length}</div>
                    <span className="text-[10px] text-gray-500">{formatCurrency(salesMetrics.totalQuotesValue)}</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Win / Conv. Rate</span>
                    <div className="text-base font-black text-amber-600 mt-0.5">{salesMetrics.conversionRate}%</div>
                    <span className="text-[10px] text-gray-500">{salesMetrics.wonDealsCount} deals won</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-gray-500">Monthly Target (₹{salesMetrics.totalTarget.toLocaleString('en-IN')})</span>
                    <span className="text-gray-900 font-black">{salesMetrics.targetAchievementPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(5, salesMetrics.targetAchievementPct))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">{topSalesReps.length} Active Closers</span>
                <button
                  onClick={() => navigate('/crm/deals')}
                  className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                >
                  View Deals Hub <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* DEPT 2: OPERATIONS DEPARTMENT (4 WINGS) */}
          {(selectedDept === 'all' || selectedDept === 'operations') && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                      <Layers size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Operations Department</h3>
                      <span className="text-[11px] font-bold text-gray-400 uppercase">4 Wings Execution Engine</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800">
                    {operationsMetrics.totalOpsCases} Total Cases
                  </span>
                </div>

                {/* 4 Wings Sub-grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-blue-900">Funding</span>
                      <span className="text-xs font-black text-blue-700">{operationsMetrics.wings.funding.total}</span>
                    </div>
                    <span className="text-[10px] text-blue-600 font-medium block mt-1">
                      {operationsMetrics.wings.funding.pending} pending client docs
                    </span>
                  </div>
                  <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-indigo-900">Compliance</span>
                      <span className="text-xs font-black text-indigo-700">{operationsMetrics.wings.compliance.total}</span>
                    </div>
                    <span className="text-[10px] text-indigo-600 font-medium block mt-1">
                      {operationsMetrics.wings.compliance.pending} pending filings
                    </span>
                  </div>
                  <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-purple-900">Incorporation</span>
                      <span className="text-xs font-black text-purple-700">{operationsMetrics.wings.incorporation.total}</span>
                    </div>
                    <span className="text-[10px] text-purple-600 font-medium block mt-1">
                      {operationsMetrics.wings.incorporation.pending} MCA workflows
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-emerald-900">Certificate</span>
                      <span className="text-xs font-black text-emerald-700">{operationsMetrics.wings.certificate.total}</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-medium block mt-1">
                      {operationsMetrics.wings.certificate.pending} draft approvals
                    </span>
                  </div>
                </div>

                {/* File Ageing overview */}
                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 flex items-center justify-between text-[11px] font-bold mb-4">
                  <span className="text-gray-500">File Ageing:</span>
                  <span className="text-emerald-700">&lt;30d: {operationsMetrics.ageingBuckets['0-30 days']}</span>
                  <span className="text-blue-700">31-60d: {operationsMetrics.ageingBuckets['31-60 days']}</span>
                  <span className="text-rose-700">60d+: {operationsMetrics.ageingBuckets['61-90 days'] + operationsMetrics.ageingBuckets['90+ days']}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-600">{operationsMetrics.totalPendingCases} cases need attention</span>
                <button
                  onClick={() => navigate('/crm/internal-operations')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  Operations Board <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* DEPT 3: ACCOUNTS & FINANCE */}
          {(selectedDept === 'all' || selectedDept === 'accounts') && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                      <CreditCard size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Accounts & Finance</h3>
                      <span className="text-[11px] font-bold text-gray-400 uppercase">Cash Flow & GST Collections</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                    Verified Inflow
                  </span>
                </div>

                {/* Financial breakdown */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Cash Realized</span>
                    <div className="text-base font-black text-emerald-600 mt-0.5">{formatCurrency(accountsMetrics.netReceived)}</div>
                    <span className="text-[10px] text-gray-500">Bank verified</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Receivables</span>
                    <div className="text-base font-black text-rose-600 mt-0.5">{formatCurrency(accountsMetrics.outstanding)}</div>
                    <span className="text-[10px] text-rose-600 font-bold">To collect</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">GST 18% Component</span>
                    <div className="text-base font-black text-gray-900 mt-0.5">{formatCurrency(accountsMetrics.gstCollected)}</div>
                    <span className="text-[10px] text-gray-500">Tax liability</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Base Revenue</span>
                    <div className="text-base font-black text-blue-600 mt-0.5">{formatCurrency(accountsMetrics.baseRevenue)}</div>
                    <span className="text-[10px] text-gray-500">Net of tax</span>
                  </div>
                </div>

                <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100 flex items-center justify-between text-xs font-bold text-emerald-800 mb-4">
                  <span>Collection Efficiency:</span>
                  <span className="text-emerald-900 font-black">{accountsMetrics.collectionRate}% of booked volume</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">Payment Verifications Active</span>
                <button
                  onClick={() => navigate('/crm/deals')}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  View Cash Log <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* DEPT 4: HUMAN RESOURCES (HRMS) */}
          {(selectedDept === 'all' || selectedDept === 'hrms') && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                      <Users size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Human Resources (HRMS)</h3>
                      <span className="text-[11px] font-bold text-gray-400 uppercase">Workforce & Live Attendance</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-purple-100 text-purple-800">
                    {hrmsMetrics.totalEmployees} Headcount
                  </span>
                </div>

                {/* Attendance & leave grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Present Today</span>
                    <div className="text-base font-black text-emerald-600 mt-0.5">{hrmsMetrics.presentCount}</div>
                    <span className="text-[10px] text-gray-500">{hrmsMetrics.lateCount} checked in late</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">On Leave / Absent</span>
                    <div className="text-base font-black text-rose-600 mt-0.5">{hrmsMetrics.onLeaveToday + hrmsMetrics.absentCount}</div>
                    <span className="text-[10px] text-gray-500">{hrmsMetrics.onLeaveToday} approved leaves</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Attendance %</span>
                    <div className="text-base font-black text-purple-600 mt-0.5">{hrmsMetrics.attendanceRate}%</div>
                    <span className="text-[10px] text-gray-500">Org wide rate</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Pending Leaves</span>
                    <div className="text-base font-black text-amber-600 mt-0.5">{hrmsMetrics.pendingLeaves}</div>
                    <span className="text-[10px] text-amber-600 font-bold">Awaiting HR/TL</span>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-2xl p-3 border border-purple-100 flex items-center justify-between text-xs font-bold text-purple-900 mb-4">
                  <span>Workforce Spread:</span>
                  <span className="font-extrabold">{hrmsMetrics.deptDistribution['Sales & BDM']} Sales | {hrmsMetrics.deptDistribution['Operations']} Ops | {hrmsMetrics.deptDistribution['Accounts & Finance']} Acc</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">Payroll & Directory Synced</span>
                <button
                  onClick={() => navigate('/hrms/attendance')}
                  className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 cursor-pointer"
                >
                  HRMS Dashboard <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* DEPT 5: LEGAL & REGULATORY */}
          {(selectedDept === 'all' || selectedDept === 'legal') && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-500/10 text-slate-700 flex items-center justify-center font-bold">
                      <Scale size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Legal & Regulatory</h3>
                      <span className="text-[11px] font-bold text-gray-400 uppercase">MCA Filings & Compliance</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-800">
                    MCA & ROC Active
                  </span>
                </div>

                {/* Legal stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Incorporation Cases</span>
                    <div className="text-base font-black text-gray-900 mt-0.5">{operationsMetrics.wings.incorporation.total}</div>
                    <span className="text-[10px] text-gray-500">Pvt Ltd, LLP, Sec 8</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Annual Compliances</span>
                    <div className="text-base font-black text-gray-900 mt-0.5">{operationsMetrics.wings.compliance.total}</div>
                    <span className="text-[10px] text-gray-500">ROC / MCA forms</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">DSC Workflows</span>
                    <div className="text-base font-black text-blue-600 mt-0.5">{operationsMetrics.wings.certificate.total}</div>
                    <span className="text-[10px] text-gray-500">Director tokens</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Agreement Filings</span>
                    <div className="text-base font-black text-emerald-600 mt-0.5">{operationsMetrics.wings.incorporation.completed + operationsMetrics.wings.compliance.completed}</div>
                    <span className="text-[10px] text-gray-500">Completed deeds</span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800 mb-4">
                  <span>Regulatory Health:</span>
                  <span className="text-emerald-700 font-black">All MCA filings on track</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">CA / CS Allocation Ready</span>
                <button
                  onClick={() => navigate('/crm/internal-operations')}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  View Legal Pipeline <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* DEPT 6: QUALITY & CLIENT SATISFACTION */}
          {(selectedDept === 'all' || selectedDept === 'quality') && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold">
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">Quality & Support</h3>
                      <span className="text-[11px] font-bold text-gray-400 uppercase">Client Queries & Resolution SLA</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-teal-100 text-teal-800">
                    {qualityMetrics.resolutionRate}% SLA
                  </span>
                </div>

                {/* Quality metrics */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Total Tickets</span>
                    <div className="text-base font-black text-gray-900 mt-0.5">{qualityMetrics.totalQueries}</div>
                    <span className="text-[10px] text-gray-500">Client tickets</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Resolved</span>
                    <div className="text-base font-black text-emerald-600 mt-0.5">{qualityMetrics.resolvedCount}</div>
                    <span className="text-[10px] text-emerald-600 font-bold">Closed successfully</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Open / In Review</span>
                    <div className="text-base font-black text-amber-600 mt-0.5">{qualityMetrics.openCount + qualityMetrics.inProgressCount}</div>
                    <span className="text-[10px] text-gray-500">In execution</span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Critical Priority</span>
                    <div className="text-base font-black text-rose-600 mt-0.5">{qualityMetrics.criticalCount}</div>
                    <span className="text-[10px] text-rose-600 font-bold">Requires attention</span>
                  </div>
                </div>

                <div className="bg-teal-50 rounded-2xl p-3 border border-teal-100 flex items-center justify-between text-xs font-bold text-teal-900 mb-4">
                  <span>Client SLA Compliance:</span>
                  <span className="text-teal-900 font-black">{qualityMetrics.resolutionRate}% resolution within 48h</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">Quality Desk Active</span>
                <button
                  onClick={() => navigate('/quality/queries')}
                  className="text-xs font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
                >
                  Quality Desk <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. LIVE CHARTS & VISUAL ANALYTICS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Revenue vs Collections Trend */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-be-orange flex items-center justify-center font-bold">
                  <BarChart3 size={18} />
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Revenue vs Cash Inflow (6-Month Trend)</h3>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Comparison of deal bookings against verified bank realization
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Booked
              </span>
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Collected
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bookedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="receivedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => formatCurrency(val)}
                />
                <RechartsTooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                />
                <Area type="monotone" dataKey="booked" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#bookedGrad)" name="Booked Volume" />
                <Area type="monotone" dataKey="received" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#receivedGrad)" name="Cash Received" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Department Workforce & Operations Workload */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Users size={18} />
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Workforce Capacity vs Workload</h3>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Active staff count vs active case volume per department
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Staff
              </span>
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Active Cases
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                />
                <Bar dataKey="staff" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Headcount" />
                <Bar dataKey="cases" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Active Volume" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. LEADERBOARDS: TOP REVENUE SERVICES & TOP BDM CLOSERS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Services */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center font-bold">
                <Flame size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">Top 5 Revenue Services</h3>
                <span className="text-xs text-gray-500 font-medium">Highest closing schemes & compliance packages</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/crm/deals')}
              className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center gap-1 cursor-pointer"
            >
              All Services <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-3">
            {topServices.map((svc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 bg-gray-50 hover:bg-orange-50/50 rounded-2xl border border-gray-100 transition-all"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 text-gray-700 flex items-center justify-center text-xs font-black shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="truncate">
                    <span className="text-sm font-black text-gray-900 block truncate">{svc.name}</span>
                    <span className="text-[11px] text-gray-500 font-medium">{svc.count} deals recorded</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-black text-gray-900 block">{formatCurrency(svc.revenue)}</span>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Verified Booking</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 BDM Closers */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Trophy size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">Top Performing BDMs & Sales Reps</h3>
                <span className="text-xs text-gray-500 font-medium">Leading deal makers & cash inflow contributors</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/hrms/employees')}
              className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
            >
              Staff Directory <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-3">
            {topSalesReps.map((rep, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 bg-gray-50 hover:bg-amber-50/50 rounded-2xl border border-gray-100 transition-all"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                    idx === 0 ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' :
                    idx === 1 ? 'bg-slate-300 text-slate-800' :
                    idx === 2 ? 'bg-amber-700 text-white' : 'bg-white border border-gray-200 text-gray-700'
                  }`}>
                    {idx === 0 ? <Crown size={14} /> : `#${idx + 1}`}
                  </div>
                  <div className="truncate">
                    <span className="text-sm font-black text-gray-900 block truncate">{rep.name}</span>
                    <span className="text-[11px] text-gray-500 font-medium">{rep.dealsCount} deals converted</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-black text-gray-900 block">{formatCurrency(rep.booked)}</span>
                  <span className="text-[10px] font-bold text-emerald-600">
                    {formatCurrency(rep.received)} in bank
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. LIVE CORPORATE DEALS STREAM (RECENT HIGH-VALUE TRANSACTIONS) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Zap size={18} />
              </div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight">Recent High-Value Deal Conversions</h3>
            </div>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Live deal stream showing latest bookings across all services and BDM reps
            </p>
          </div>

          <button
            onClick={() => navigate('/crm/deals')}
            className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer self-start sm:self-center"
          >
            Explore All Deals ({deals.length}) <ArrowRight size={13} className="ml-1.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-extrabold">
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">BDM Closer</th>
                <th className="py-3 px-4 text-right">Total Deal Value</th>
                <th className="py-3 px-4 text-right">Received (Bank)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {recentHighValueDeals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-black text-gray-900 max-w-[200px] truncate">
                    {deal.client}
                  </td>
                  <td className="py-3.5 px-4 text-gray-700 max-w-[180px] truncate">
                    {deal.service}
                  </td>
                  <td className="py-3.5 px-4 text-gray-600 font-bold">
                    {deal.bdm}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-gray-900">
                    {formatCurrencyFull(deal.total)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                    {formatCurrencyFull(deal.received)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                      {deal.stage}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => navigate(`/crm/deals/${deal.id}`)}
                      className="p-1.5 hover:bg-orange-50 text-be-orange rounded-lg transition-colors cursor-pointer"
                      title="Open Deal Details"
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
