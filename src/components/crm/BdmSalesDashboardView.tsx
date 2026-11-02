import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Briefcase, IndianRupee, TrendingUp, AlertCircle,
  MoreHorizontal, FolderKanban, RefreshCw, CheckCircle2,
  FileText, Send, Sparkles, ArrowUpRight, Crown, Shield,
  Clock, Calendar, Target, Award, ArrowRight, Layers, Flame,
  Trophy, Star, UserCheck, Medal
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { parseAnyDateToMs } from '../../services/zohoRbacService';
import {
  getDealSplitBreakdown,
  getDealTotalAmount,
  getDealReceivedAmount,
  getDealPendingAmount,
  isValidServiceName
} from '../../utils/dealSplitUtils';

export interface BdmSalesDashboardViewProps {
  deals: any[];
  employees: any[];
  quotations: any[];
  clients: any[];
  queries?: any[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const BdmSalesDashboardView: React.FC<BdmSalesDashboardViewProps> = ({
  deals,
  employees = [],
  quotations = [],
  clients = [],
  queries = [],
  isRefreshing = false,
  onRefresh
}) => {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isHOD, isTL, currentRole, filterRecords } = useAuth();

  const [timeframe, setTimeframe] = useState<'today' | 'month' | 'all'>('month');
  const [recentTab, setRecentTab] = useState<'deals' | 'quotations'>('deals');

  const now = new Date();
  const todayYMD = now.toISOString().split('T')[0];
  const todayDMY = now.toLocaleDateString('en-GB');
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthName = monthNames[currentMonthIdx];

  const parseMoney = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatCurrencyShort = (val: number): string => {
    if (!val || val === 0) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)} K`;
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  const isDealToday = (deal: any): boolean => {
    if (!deal) return false;
    const raw = String(
      deal.Booking_Date ||
      deal.Payment_Date ||
      deal.date ||
      deal.Closing_Date ||
      deal.Created_Time ||
      ''
    );
    return raw.includes(todayYMD) || raw.includes(todayDMY);
  };

  const isDealThisMonth = (deal: any): boolean => {
    if (!deal) return false;
    const raw =
      deal.Booking_Date ||
      deal.rawZohoDeal?.Booking_Date ||
      deal.booking_date ||
      deal.Payment_Date ||
      deal.Closing_Date ||
      deal.date;
    if (!raw) return false;

    if (typeof raw === 'string') {
      const parts = raw.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return parseInt(parts[1], 10) === currentMonthIdx + 1 && parseInt(parts[0], 10) === currentYear;
        }
        return parseInt(parts[1], 10) === currentMonthIdx + 1 && parseInt(parts[2], 10) === currentYear;
      }
    }

    const dt = new Date(raw);
    return !isNaN(dt.getTime()) && dt.getMonth() === currentMonthIdx && dt.getFullYear() === currentYear;
  };

  // RBAC Scoping
  const rbacDeals = useMemo(() => {
    if (!deals || deals.length === 0) return [];
    return filterRecords ? filterRecords(deals, 'deal') : deals;
  }, [deals, filterRecords]);

  const rbacQuotations = useMemo(() => {
    if (!quotations || quotations.length === 0) return [];
    return filterRecords ? filterRecords(quotations, 'quotation') : quotations;
  }, [quotations, filterRecords]);

  const rbacQueries = useMemo(() => {
    if (!queries || queries.length === 0) return [];
    return filterRecords ? filterRecords(queries, 'query') : queries;
  }, [queries, filterRecords]);

  // Deal amount helpers
  const getUserDealAmount = (d: any): number => {
    if (!d) return 0;
    const breakdown = getDealSplitBreakdown(d, currentUser, isSuperAdmin || isHOD);
    return breakdown.displayAmount;
  };

  const getUserDealReceived = (d: any): number => {
    if (!d) return 0;
    const breakdown = getDealSplitBreakdown(d, currentUser, isSuperAdmin || isHOD);
    return breakdown.verifiedDisplayReceived;
  };

  const getUserDealPending = (d: any): number => {
    if (!d) return 0;
    const total = getUserDealAmount(d);
    const rec = getUserDealReceived(d);
    return Math.max(0, total - rec);
  };

  // 1. Quotation Analytics
  const totalQuotationsSent = useMemo(() => rbacQuotations.length, [rbacQuotations]);
  const totalQuotationsSentAmount = useMemo(() => {
    return rbacQuotations.reduce((sum, q) => sum + parseMoney(q.amount || q.totals?.grandTotal), 0);
  }, [rbacQuotations]);

  const quotationsConvertedInDeals = useMemo(() => {
    return rbacDeals.filter(d => {
      const qId = d.quotationId || d.Quotation?.id || d.quotation;
      return Boolean(qId && qId !== 'N/A' && qId !== '-');
    }).length;
  }, [rbacDeals]);

  const quotationConversionRate = totalQuotationsSent > 0
    ? Math.min(100, Math.round((quotationsConvertedInDeals / totalQuotationsSent) * 100))
    : 0;

  // 2. Revenue Calculations
  const todayDealsList = useMemo(() => rbacDeals.filter(isDealToday), [rbacDeals]);
  const todayRevenueReceived = useMemo(() => todayDealsList.reduce((sum, d) => sum + getUserDealReceived(d), 0), [todayDealsList, currentUser, isSuperAdmin, isHOD]);
  const todayRevenueBooked = useMemo(() => todayDealsList.reduce((sum, d) => sum + getUserDealAmount(d), 0), [todayDealsList, currentUser, isSuperAdmin, isHOD]);

  const monthDealsList = useMemo(() => rbacDeals.filter(isDealThisMonth), [rbacDeals]);
  const monthRevenueReceived = useMemo(() => monthDealsList.reduce((sum, d) => sum + getUserDealReceived(d), 0), [monthDealsList, currentUser, isSuperAdmin, isHOD]);
  const monthRevenueBooked = useMemo(() => monthDealsList.reduce((sum, d) => sum + getUserDealAmount(d), 0), [monthDealsList, currentUser, isSuperAdmin, isHOD]);

  const totalDealValue = useMemo(() => rbacDeals.reduce((sum, d) => sum + getUserDealAmount(d), 0), [rbacDeals, currentUser, isSuperAdmin, isHOD]);
  const totalReceivedValue = useMemo(() => rbacDeals.reduce((sum, d) => sum + getUserDealReceived(d), 0), [rbacDeals, currentUser, isSuperAdmin, isHOD]);
  const totalPendingValue = useMemo(() => rbacDeals.reduce((sum, d) => sum + getUserDealPending(d), 0), [rbacDeals, currentUser, isSuperAdmin, isHOD]);

  // 3. User Target
  const userMonthlyTarget = useMemo(() => {
    const matched = employees.find(e =>
      (e.email && currentUser?.email && e.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (e.name && currentUser?.name && e.name.toLowerCase() === currentUser.name.toLowerCase())
    );
    const targetVal = parseMoney(matched?.monthlyTarget || matched?.formData?.monthlyTarget || matched?.target || matched?.formData?.target);
    return targetVal > 0 ? targetVal : 250000; // Default ₹2.5 Lakh target benchmark
  }, [employees, currentUser]);

  const monthlyRevenueForTarget = monthRevenueBooked > 0 ? monthRevenueBooked : monthRevenueReceived;
  const targetAchievementPercent = userMonthlyTarget > 0
    ? Math.min(100, Math.round((monthlyRevenueForTarget / userMonthlyTarget) * 100))
    : 0;

  // 4. Top Services
  const top5Services = useMemo(() => {
    const servicesMap = new Map<string, { service: string; count: number; totalRevenue: number; receivedRevenue: number; latestDate: string }>();

    rbacDeals.forEach(d => {
      let s = d.service || d.Service_Name || d.Choose_Wisely || (d.servicesData?.[0]?.name) || 'Consulting Services';
      if (!s || s === 'N/A' || s === 'Choose Wisely' || s === 'Services') s = 'Business Advisory';
      s = s.trim();

      const amt = getUserDealAmount(d);
      const rec = getUserDealReceived(d);

      const current = servicesMap.get(s) || { service: s, count: 0, totalRevenue: 0, receivedRevenue: 0, latestDate: '' };
      servicesMap.set(s, {
        service: s,
        count: current.count + 1,
        totalRevenue: current.totalRevenue + amt,
        receivedRevenue: current.receivedRevenue + rec,
        latestDate: d.date || current.latestDate
      });
    });

    const list = Array.from(servicesMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.count - a.count)
      .slice(0, 5);

    const maxRevenue = list[0]?.totalRevenue || 1;

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      sharePercent: totalDealValue > 0 ? Math.round((item.totalRevenue / totalDealValue) * 100) : 0,
      relativePercent: Math.round((item.totalRevenue / maxRevenue) * 100)
    }));
  }, [rbacDeals, totalDealValue, currentUser, isSuperAdmin, isHOD]);

  // 5. Monthly Revenue Chart
  const monthlyRevenueMap = new Map<string, { received: number; pending: number; total: number }>();
  rbacDeals.forEach(d => {
    let monthLabel = '';
    if (d.date) {
      try {
        const parts = String(d.date).split('/');
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12) monthLabel = monthNames[mIdx];
        } else {
          const dt = new Date(d.date);
          if (!isNaN(dt.getTime())) monthLabel = monthNames[dt.getMonth()];
        }
      } catch (e) { }
    }
    if (!monthLabel) monthLabel = currentMonthName;

    const current = monthlyRevenueMap.get(monthLabel) || { received: 0, pending: 0, total: 0 };
    const rec = getUserDealReceived(d);
    const tot = getUserDealAmount(d);
    const pend = getUserDealPending(d);
    monthlyRevenueMap.set(monthLabel, {
      received: current.received + rec,
      pending: current.pending + pend,
      total: current.total + tot
    });
  });

  let revenueChartData = monthNames
    .filter(m => monthlyRevenueMap.has(m))
    .map(m => ({
      name: m,
      received: monthlyRevenueMap.get(m)!.received,
      pending: monthlyRevenueMap.get(m)!.pending,
      total: monthlyRevenueMap.get(m)!.total,
    }));

  if (revenueChartData.length === 0) {
    revenueChartData = [
      { name: currentMonthName, received: monthRevenueReceived, pending: monthRevenueBooked - monthRevenueReceived, total: monthRevenueBooked }
    ];
  }

  // 6. Pipeline Categories
  const pipelineCategories = [
    { label: 'Sales', matcher: (s: string) => s.toLowerCase().includes('sale') || s === 'new' },
    { label: 'Ops Allocator', matcher: (s: string) => s.toLowerCase().includes('allocat') },
    { label: 'Ops Executors', matcher: (s: string) => s.toLowerCase().includes('execut') },
    { label: 'Legal', matcher: (s: string) => s.toLowerCase().includes('legal') },
    { label: 'Account', matcher: (s: string) => s.toLowerCase().includes('account') },
    { label: 'Quality', matcher: (s: string) => s.toLowerCase().includes('qualit') },
    { label: 'Won / Closed', matcher: (s: string) => s.toLowerCase().includes('won') },
  ];

  const pipelineData = pipelineCategories.map(cat => ({
    name: cat.label,
    count: rbacDeals.filter(d => cat.matcher(d.stage || d.status || '')).length
  }));

  const recentDeals = rbacDeals.slice(0, 8);
  const recentQuotationsList = rbacQuotations.slice(0, 8);
  const openQueriesCount = rbacQueries.filter(q => q.status !== 'Resolved' && q.status !== 'Closed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Won': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Negotiation': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Proposal': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Operations executors':
      case 'Operations allocator': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'Sales': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: QUOTATIONS CONVERSION & REVENUE METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Quotations Sent */}
        <div
          onClick={() => navigate('/crm/quotations')}
          title="Click to view all Quotations in Quotation Hub"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-blue-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 transform group-hover:scale-110 transition-transform">
              <FileText size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              Quotation Hub <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-blue-600 transition-colors">
              {totalQuotationsSent.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Total Quotations Sent</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Total Quoted Value</span>
              <span className="font-extrabold text-gray-900">{formatCurrencyShort(totalQuotationsSentAmount)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Quotations Converted in Deals */}
        <div
          onClick={() => navigate('/crm/deals?tab=From%20Quotations&per_page=200', { state: { tab: 'From Quotations', per_page: 200 } })}
          title="Click to view all Deals converted from Quotations"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-emerald-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-emerald-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 transform group-hover:scale-110 transition-transform">
              <CheckCircle2 size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              {quotationConversionRate}% Converted <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-emerald-600 transition-colors">
              {quotationsConvertedInDeals.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Quotations Converted to Deals</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Conversion Rate</span>
              <span className="font-extrabold text-emerald-600">{quotationConversionRate}% Win Rate</span>
            </div>
          </div>
        </div>

        {/* Card 3: Today's Revenue */}
        <div
          onClick={() => navigate('/crm/deals?filter=today&per_page=200', { state: { filter: 'today', per_page: 200 } })}
          title="Click to view Today's Booked Deals"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-amber-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-amber-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 transform group-hover:scale-110 transition-transform">
              <Clock size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-100 flex items-center gap-1 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              Today: {todayDMY} <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-amber-600 transition-colors">
              {formatCurrencyShort(todayRevenueReceived > 0 ? todayRevenueReceived : todayRevenueBooked)}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Today's Revenue</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Booked Deals Today</span>
              <span className="font-extrabold text-amber-700">{todayDealsList.length} Deals ({formatCurrencyShort(todayRevenueBooked)})</span>
            </div>
          </div>
        </div>

        {/* Card 4: Monthly Revenue */}
        <div
          onClick={() => navigate('/crm/deals?filter=this_month&per_page=200', { state: { filter: 'this_month', per_page: 200 } })}
          title="Click to view This Month's Deals"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-purple-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-purple-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30 transform group-hover:scale-110 transition-transform">
              <Calendar size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-100 flex items-center gap-1 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              {currentMonthName} {currentYear} <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-purple-600 transition-colors">
              {formatCurrencyShort(monthRevenueReceived > 0 ? monthRevenueReceived : monthRevenueBooked)}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Monthly Revenue ({currentMonthName})</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Booked Total</span>
              <span className="font-extrabold text-purple-700">{formatCurrencyShort(monthRevenueBooked)} ({monthDealsList.length} deals)</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: BDM PERSONAL TARGET ACHIEVEMENT TRACKER */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-gray-700">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 mb-6 pb-6 border-b border-gray-700/60">
          <div>
            <div className="flex items-center space-x-2 text-be-orange font-bold text-xs uppercase tracking-wider mb-1">
              <Target size={16} />
              <span>Sales Quota & Performance Tracker</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Target Achievement: {currentMonthName} {currentYear}
            </h2>
            <p className="text-xs text-gray-400 mt-1 font-medium">
              Real-time revenue realization tracked against your monthly quota benchmark.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10">
              <div className="text-[10px] text-gray-300 font-bold uppercase">Monthly Target</div>
              <div className="text-lg font-black text-amber-400">₹{userMonthlyTarget.toLocaleString('en-IN')}</div>
            </div>
            <div
              onClick={() => navigate('/crm/deals?filter=this_month&per_page=200', { state: { filter: 'this_month', per_page: 200 } })}
              title="Click to view all deals booked this month"
              className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 hover:bg-white/20 transition-all cursor-pointer group"
            >
              <div className="text-[10px] text-gray-300 font-bold uppercase flex items-center gap-1">
                Revenue Booked <ArrowUpRight size={10} className="text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
              <div className="text-lg font-black text-emerald-400">{formatCurrencyShort(monthlyRevenueForTarget)}</div>
            </div>
          </div>
        </div>

        {/* Progress Bar & Status */}
        <div className="space-y-3 relative z-10">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="flex items-center text-gray-300">
              Progress to Target: <strong className="text-white ml-1">{targetAchievementPercent}%</strong>
            </span>
            <span className="text-gray-300">
              Remaining to Target: <strong className="text-amber-400">{formatCurrencyShort(Math.max(0, userMonthlyTarget - monthlyRevenueForTarget))}</strong>
            </span>
          </div>

          <div className="w-full h-4 bg-gray-700/80 rounded-full overflow-hidden p-0.5 shadow-inner border border-gray-600">
            <div
              className="h-full bg-gradient-to-r from-be-orange via-amber-400 to-emerald-400 rounded-full transition-all duration-1000 shadow-lg"
              style={{ width: `${Math.max(5, Math.min(100, targetAchievementPercent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
            <span>₹0</span>
            <span>₹{(userMonthlyTarget / 2).toLocaleString('en-IN')} (50%)</span>
            <span>₹{userMonthlyTarget.toLocaleString('en-IN')} (100% Target)</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: TOP 5 HIGHEST SELLING SERVICES */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center">
                <Flame size={22} className="text-be-orange mr-2" />
                Top 5 Highest Selling Services
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Top performing products and consulting packages across your closed deals.
            </p>
          </div>

          <button
            onClick={() => navigate('/crm/deals')}
            className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center self-start sm:self-center"
          >
            Explore all in Deals <ArrowRight size={14} className="ml-1" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {top5Services.map((srv) => {
            const rankColors = [
              'from-amber-500 to-yellow-600 ring-amber-300 text-amber-950 bg-amber-50 border-amber-200',
              'from-slate-400 to-gray-500 ring-gray-300 text-slate-900 bg-slate-50 border-slate-200',
              'from-amber-700 to-orange-800 ring-orange-300 text-orange-950 bg-orange-50 border-orange-200',
              'from-purple-500 to-indigo-600 ring-purple-300 text-purple-950 bg-purple-50 border-purple-200',
              'from-blue-500 to-cyan-600 ring-blue-300 text-blue-950 bg-blue-50 border-blue-200',
            ];
            const badgeStyle = rankColors[srv.rank - 1] || rankColors[0];

            return (
              <div
                key={srv.service}
                onClick={() => navigate('/crm/deals?search=' + encodeURIComponent(srv.service) + '&per_page=200', { state: { search: srv.service, per_page: 200 } })}
                title={`Click to view deals for "${srv.service}"`}
                className="bg-gradient-to-b from-gray-50/70 to-white rounded-2xl p-4 border border-gray-200/80 shadow-sm hover:shadow-xl hover:border-orange-400 hover:scale-[1.02] transition-all duration-300 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${badgeStyle.split(' ')[0]} ${badgeStyle.split(' ')[1]} text-white flex items-center justify-center font-black text-xs shadow-sm`}>
                      #{srv.rank}
                    </span>
                    <span className="text-[11px] font-extrabold text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-200 flex items-center gap-1 group-hover:border-orange-300 transition-colors">
                      {srv.count} Deals <ArrowUpRight size={10} className="text-be-orange opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </div>

                  <h3 className="font-extrabold text-gray-900 text-sm mb-2 line-clamp-2 min-h-[40px] group-hover:text-be-orange transition-colors">
                    {srv.service}
                  </h3>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <div className="text-[11px] text-gray-400 font-semibold uppercase">Total Deal Value</div>
                    <div className="text-base font-black text-gray-900">
                      {formatCurrencyShort(srv.totalRevenue)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-600">
                    <span>Market Share</span>
                    <span className="text-be-orange">{srv.sharePercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-be-orange to-amber-500 rounded-full"
                      style={{ width: `${Math.max(10, srv.relativePercent)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {top5Services.length === 0 && (
            <div className="col-span-5 text-center py-10 text-gray-400">
              <FolderKanban size={36} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-bold text-gray-500">No deal services recorded yet</p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: REVENUE ANALYTICS & DEAL PIPELINE CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Revenue Area Chart */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Revenue Breakdown Overview</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Received vs Pending amounts across deals</p>
            </div>
            <div className="flex items-center space-x-4 text-xs font-semibold">
              <span
                onClick={() => navigate('/crm/deals?filter=this_month&per_page=200', { state: { filter: 'this_month', per_page: 200 } })}
                title="Click to view this month's deals"
                className="flex items-center text-emerald-600 cursor-pointer hover:underline"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span>
                Received: {formatCurrencyShort(totalReceivedValue)}
              </span>
              <span
                onClick={() => navigate('/crm/deals?filter=pending&per_page=200', { state: { filter: 'pending', per_page: 200 } })}
                title="Click to view pending amount deals"
                className="flex items-center text-orange-600 cursor-pointer hover:underline"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mr-1.5"></span>
                Pending: {formatCurrencyShort(totalPendingValue)}
              </span>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center">
            {rbacDeals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bdmColorReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="bdmColorPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, undefined]}
                  />
                  <Area type="monotone" dataKey="received" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#bdmColorReceived)" name="Received" />
                  <Area type="monotone" dataKey="pending" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#bdmColorPending)" name="Pending" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <FolderKanban size={40} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-sm text-gray-500">No revenue data available yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Deals by Status & Pipeline Bar */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Deal Pipeline Stages</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Click any stage to filter deals</p>
              </div>
            </div>

            {/* Clickable Stage Badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {pipelineCategories.map(cat => {
                const count = rbacDeals.filter(d => cat.matcher(d.stage || d.status || '')).length;
                return (
                  <button
                    key={cat.label}
                    onClick={() => navigate('/crm/deals?search=' + encodeURIComponent(cat.label) + '&per_page=200', { state: { search: cat.label, per_page: 200 } })}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-gray-50 hover:bg-orange-50 text-gray-700 hover:text-be-orange border border-gray-200 hover:border-orange-200 transition-all flex items-center gap-1.5"
                  >
                    <span>{cat.label}</span>
                    <span className="px-1.5 py-0.2 bg-white rounded-full text-[10px] text-gray-500 font-extrabold border border-gray-100">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="w-full min-h-[190px] flex items-center justify-center">
              {rbacDeals.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={pipelineData} layout="vertical" margin={{ top: 0, right: 15, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bdmColorBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={100} />
                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" fill="url(#bdmColorBar)" radius={[0, 8, 8, 0]} barSize={16} background={{ fill: '#f1f5f9', radius: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="font-semibold text-xs text-gray-500">Pipeline is currently empty</p>
                </div>
              )}
            </div>
          </div>

          <div
            onClick={() => navigate('/quality/queries?status=Open')}
            title="Click to view all Open Quality Queries"
            className="mt-4 p-4 bg-gradient-to-r from-orange-50 to-rose-50 rounded-2xl border border-orange-100 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer flex items-start shadow-inner group"
          >
            <AlertCircle className="text-be-orange shrink-0 mt-0.5 mr-3 group-hover:scale-110 transition-transform" size={18} />
            <p className="text-xs text-gray-800 leading-relaxed font-medium flex-1">
              <strong>{openQueriesCount} active queries</strong> pending in the Quality module.
            </p>
            <ArrowUpRight size={14} className="text-be-orange opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>

      {/* SECTION 5: RECENT DEALS & RECENT QUOTATIONS TABBED TABLE */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center p-1 bg-gray-100 rounded-2xl border border-gray-200 text-xs font-bold">
              <button
                onClick={() => setRecentTab('deals')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${recentTab === 'deals' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                Recent Deals ({rbacDeals.length})
              </button>
              <button
                onClick={() => setRecentTab('quotations')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${recentTab === 'quotations' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                Recent Quotations ({rbacQuotations.length})
              </button>
            </div>
          </div>

          <button
            onClick={() => navigate(recentTab === 'deals' ? '/crm/deals' : '/crm/quotations')}
            className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center self-start sm:self-center"
          >
            View all {recentTab === 'deals' ? 'Deals' : 'Quotations'} <ArrowRight size={14} className="ml-1" />
          </button>
        </div>

        <div className="overflow-x-auto">
          {recentTab === 'deals' ? (
            recentDeals.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-xs">
                  <tr>
                    <th className="px-6 py-4">Deal / Client</th>
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Received</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                  {recentDeals.map((deal) => {
                    const breakdown = getDealSplitBreakdown(deal, currentUser, isSuperAdmin || isHOD);
                    const dispAmt = breakdown.displayAmount > 0 ? `₹${breakdown.displayAmount.toLocaleString('en-IN')}` : deal.amount;
                    const dispRec = breakdown.displayReceived > 0 ? `₹${breakdown.displayReceived.toLocaleString('en-IN')}` : deal.received;

                    return (
                      <tr
                        key={deal.id}
                        onClick={() => navigate(`/crm/deals/${deal.id}`)}
                        className="hover:bg-orange-50/40 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{deal.client || deal.dealName || deal.Deal_Name}</div>
                          <div className="text-xs text-gray-400">{deal.company}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 text-xs max-w-[200px] truncate" title={deal.service}>
                          {deal.service || 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-extrabold text-gray-900">{dispAmt}</div>
                          {breakdown.hasPartnerBdm && !isSuperAdmin && !isHOD && (
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5">50% Quota Split</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className={`font-bold ${breakdown.isPaymentVerified ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {dispRec}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {breakdown.isPaymentVerified ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Verified
                              </span>
                            ) : String(deal.stage || deal.status || '').toLowerCase().includes('account') ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Pending Verif.
                              </span>
                            ) : null}
                          </div>
                          {breakdown.hasPartnerBdm && !isSuperAdmin && !isHOD && (
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5">Pre-GST 50%</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(deal.status)}`}>
                            {deal.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs">{deal.date}</td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => navigate(`/crm/deals/${deal.id}`)} className="p-1.5 text-gray-400 hover:text-be-orange rounded-lg hover:bg-orange-50 transition-colors">
                            <MoreHorizontal size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold text-sm text-gray-500">No deals synchronized yet</p>
              </div>
            )
          ) : (
            recentQuotationsList.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-xs">
                  <tr>
                    <th className="px-6 py-4">Quotation ID</th>
                    <th className="px-6 py-4">Client / Company</th>
                    <th className="px-6 py-4">Quoted Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                  {recentQuotationsList.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => navigate(`/crm/quotations/${q.id}`)}
                      className="hover:bg-orange-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 font-bold text-gray-900 font-mono text-xs">{q.id}</td>
                      <td className="px-6 py-4">{q.client} {q.company && q.company !== 'N/A' ? `(${q.company})` : ''}</td>
                      <td className="px-6 py-4 font-bold text-gray-900">{q.amount}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                          {q.status || 'Sent'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{q.date}</td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => navigate(`/crm/quotations/${q.id}`)} className="p-1.5 text-gray-400 hover:text-be-orange rounded-lg hover:bg-orange-50 transition-colors">
                          <MoreHorizontal size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold text-sm text-gray-500">No quotations created yet</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
