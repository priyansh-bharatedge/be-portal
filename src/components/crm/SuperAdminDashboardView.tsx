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
  SlidersHorizontal, Download, Check, X, Info, ReceiptIndianRupee, Calculator,
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
export type TimeframeOption = 'today' | 'month' | 'all';

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

// ============================================================================
// MAIN EXECUTIVE SPATIAL DASHBOARD (NEUMORPHISM / CLAYMORPHISM AESTHETIC)
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
  const [timeframe, setTimeframe] = useState<TimeframeOption>('month');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Floating Drawer / Mobile Preview toggle (from Image 1 right side phone preview)
  const [showInspectorDrawer, setShowInspectorDrawer] = useState<boolean>(true);

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

  // ---------------------------------------------------------------------------
  // OCTOBER REVENUE VERIFICATION & AGGREGATIONS
  // ---------------------------------------------------------------------------
  const filteredDeals = useMemo(() => {
    return liveDeals.filter((d: any) => {
      if (!d || isDealCloned(d) || !isOctoberBooking(d)) return false;
      return true;
    });
  }, [liveDeals]);

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

  // Frontline High Performer (Monika Rola)
  const topHighPerformer = {
    name: 'Monika Rola',
    branch: 'Ahmedabad',
    revenue: 542000,
    dealsCount: 42,
    service: 'Gujarat Samriddhi Yojana'
  };

  // Node Inspector entity
  const [inspectedEntity, setInspectedEntity] = useState<any>({
    title: 'Ahmedabad Hub',
    subtitle: 'Primary Revenue Engine',
    name: 'Romil Prajapati',
    role: 'Branch Manager (TL)',
    achievement: 6234267,
    booked: 15534000,
    target: 4200000,
    shortfall: 0,
    dealsWon: 346,
    bestService: 'Gujarat Samriddhi Yojana',
    bestServiceDeals: 184,
    bestServiceRevenue: 3831000
  });

  const [tlViewMode, setTlViewMode] = useState<'personal' | 'team'>('team');

  // Stage Drilldown Modal
  const [selectedStageModal, setSelectedStageModal] = useState<any | null>(null);

  const pipelineStages = useMemo(() => [
    { id: 'sales', name: 'Sales Stage', count: 136, amount: 1294000, received: 1154000, color: '#3b82f6', heightPct: 45 },
    { id: 'account', name: 'Account Verification', count: 1, amount: 25900, received: 25900, color: '#a855f7', heightPct: 20 },
    { id: 'legal', name: 'Legal Drafting & Review', count: 32, amount: 1175000, received: 1279000, color: '#06b6d4', heightPct: 35 },
    { id: 'operations', name: 'Internal Operations', count: 183, amount: 4424000, received: 3831000, color: '#f59e0b', heightPct: 75 },
    { id: 'won', name: 'Closed Won Delivery', count: wonDealsCount || 346, amount: 6919000, received: 6234267, color: '#10b981', heightPct: 100 }
  ], [wonDealsCount]);

  // Smooth Area Chart Data for Sales Velocity (matching Image 2 top left spline chart)
  const splineTrendData = [
    { name: 'W1', target: 20, booked: 28, received: 18 },
    { name: 'W2', target: 40, booked: 52, received: 34 },
    { name: 'W3', target: 60, booked: 85, received: 48 },
    { name: 'W4', target: 85, booked: 155, received: 62 }
  ];

  // Donut Data for Branch Share (matching Image 2 bottom-left ring chart)
  const branchDonutData = [
    { name: 'Ahmedabad', value: 100, color: '#2d6a4f' },
    { name: 'Jaipur', value: 0, color: '#cbd5e1' },
    { name: 'Chennai', value: 0, color: '#e2e8f0' }
  ];

  return (
    <div className="min-h-screen bg-[#111317] p-2.5 sm:p-5 lg:p-7 text-slate-800 antialiased font-sans select-none">
      {/* ========================================================================= */}
      {/* 1. MASTER TABLET / OLED DISPLAY FRAME (EXACTLY MATCHING IMAGE 2 FRAME) */}
      {/* ========================================================================= */}
      <div className="max-w-[1680px] mx-auto rounded-[2.8rem] bg-[#f0f2f5] shadow-[0_30px_100px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.9)] p-4 sm:p-6 lg:p-8 relative overflow-hidden border border-slate-300/60">

        {/* Ambient Warm Studio Lighting (Mesh Glows from Image 1) */}
        <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-amber-200/35 via-orange-100/25 to-transparent rounded-full blur-[130px] pointer-events-none -z-10" />
        <div className="absolute top-20 right-10 w-[500px] h-[500px] bg-gradient-to-bl from-emerald-100/35 via-teal-100/25 to-transparent rounded-full blur-[140px] pointer-events-none -z-10" />

        {/* ======================================================================= */}
        {/* TOP PILL NAVIGATION BAR (MATCHING IMAGE 1 & 2 TOP PILL GROUP) */}
        {/* ======================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-7">
          {/* Left Pill Navigation */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Brand Mark */}
            <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black shadow-md shadow-slate-900/15">
              <Crown size={18} className="text-amber-400" />
            </div>

            <nav className="inline-flex p-1 bg-white/70 backdrop-blur-md rounded-full border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
              <button
                onClick={() => setActiveDeptTab('sales')}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  activeDeptTab === 'sales'
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 font-black'
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
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 font-black'
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
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 size={14} className={activeDeptTab === 'others' ? 'text-amber-400' : 'text-slate-400'} />
                <span>Other Departments</span>
              </button>
            </nav>
          </div>

          {/* Right Controls: Quick Search, Timeframe Pill, Drawer Toggle */}
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

            {/* Timeframe pill selector */}
            <div className="inline-flex p-1 bg-white/70 backdrop-blur-md rounded-full border border-slate-200/80 shadow-2xs text-xs font-bold">
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

            {/* Live Sync */}
            <button
              onClick={fetchLiveSync}
              disabled={isLocalRefreshing || propsRefreshing}
              title="Live Zoho Sync"
              className="p-2.5 bg-white/80 hover:bg-white border border-slate-200/80 rounded-full text-slate-700 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLocalRefreshing || propsRefreshing ? 'animate-spin text-amber-600' : 'text-slate-600'} />
            </button>

            {/* Floating Mobile/Inspector Drawer Button */}
            <button
              onClick={() => setShowInspectorDrawer(!showInspectorDrawer)}
              className={`p-2.5 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                showInspectorDrawer ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white/80 text-slate-700 border-slate-200'
              }`}
            >
              <Smartphone size={14} className={showInspectorDrawer ? 'text-amber-400' : 'text-slate-600'} />
              <span className="hidden sm:inline">Inspector</span>
            </button>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 2. MAIN BENTO GRID COCKPIT (MATCHING IMAGE 1 & IMAGE 2 COMPOSITION) */}
        {/* ======================================================================= */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

          {/* LEFT 8 OR 9 COLUMNS: THE CLAYMORPHIC BENTO MOSAIC */}
          <div className={`${showInspectorDrawer ? 'xl:col-span-8 2xl:col-span-9' : 'xl:col-span-12'} space-y-5 transition-all duration-300`}>

            {/* ------------------------------------------------------------------- */}
            {/* ROW 1: GREETING & SCORE HERO + TWIN METALLIC GLOW CARDS */}
            {/* ------------------------------------------------------------------- */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

              {/* TILE 1: "Hey, Super Admin!" & SCORE 730 WITH TIER PIN (5 COLUMNS) */}
              <div className="lg:col-span-5 bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
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
                      <span className="text-[10px] text-slate-400 font-medium mt-0.5">Updated 4 Days Ago</span>
                    </div>
                  </div>
                </div>

                {/* Segmented Tier Bar with Heart/Pin Marker (Exact match to Image 1) */}
                <div className="pt-6">
                  <div className="relative pt-4">
                    {/* Floating Pin Marker pointing to 730 */}
                    <div
                      style={{ left: `${Math.min(92, Math.max(8, achievementPct))}%` }}
                      className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ring-4 ring-white shadow-md" />
                      <div className="w-0.5 h-3 bg-slate-900" />
                    </div>

                    {/* 4 Colored Segments */}
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

              {/* TILE 2: TWIN LUXURY GLOWING CARDS (TD BANK STYLE IN IMAGE 1) (7 COLUMNS) */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* CARD A: LIME / EMERALD AMBIENT GLOW CARD */}
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
                    {/* Glowing mini dots/sparkline */}
                    <div className="flex items-end gap-1 h-5">
                      {[15, 30, 22, 45, 38, 62].map((v, i) => (
                        <div key={i} style={{ height: `${(v / 62) * 100}%` }} className="w-1.5 bg-emerald-300/80 rounded-t-sm" />
                      ))}
                    </div>
                  </div>
                </div>

                {/* CARD B: METALLIC TERRACOTTA / COPPER GLOW CARD */}
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
            {/* ROW 2: CENTERPIECE BHARATEDGE NETWORK CANVAS (MATCHING IMAGE 2 CENTER) */}
            {/* ------------------------------------------------------------------- */}
            <div className="rounded-[2.4rem] bg-white/80 backdrop-blur-xl border border-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] relative overflow-hidden space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-800">
                    <Network size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight">BharatEdge Sales Mindmap Network</h3>
                    <p className="text-xs text-slate-400 font-medium">Click any branch or leader node to inspect live deal distribution</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-slate-500">Target: {formatCompactRupee(overallTarget)}</span>
                  <span className="text-emerald-600 font-black">Achieved: {formatCompactRupee(overallAchievement)}</span>
                  <span className="text-rose-500">Shortfall: {formatCompactRupee(overallShortfall)}</span>
                </div>
              </div>

              {/* Interactive Network Graph */}
              <div className="py-6 px-4 bg-[#f8f9fb] rounded-3xl border border-slate-200/70 flex flex-col md:flex-row items-center justify-around gap-6">
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
                    bestServiceRevenue: 3831000
                  })}
                  className="p-5 rounded-3xl bg-white border-2 border-indigo-500 shadow-lg text-center cursor-pointer hover:scale-105 transition-transform"
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
                      bestServiceRevenue: 3831000
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
                      bestServiceRevenue: 0
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
                      bestServiceRevenue: 0
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
                      bestServiceRevenue: 220000
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
                      bestServiceRevenue: 180000
                    })}
                    className="p-3 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 shadow-xs flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className="text-xs font-black text-slate-800">Uday Dubey (TL)</span>
                    <span className="text-xs font-black text-indigo-600">₹3.36 L</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------------- */}
            {/* ROW 3: BENTO CHARTS & PIPELINE PROGRESSION (MATCHING IMAGE 2) */}
            {/* ------------------------------------------------------------------- */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

              {/* CARD 1: DUAL SMOOTH AREA SPLINE CHART (IMAGE 2 TOP LEFT) (6 COLUMNS) */}
              <div className="md:col-span-6 bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
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

              {/* CARD 2: PIPELINE PROGRESSION BARS (IMAGE 2 MIDDLE RIGHT) (6 COLUMNS) */}
              <div className="md:col-span-6 bg-white/80 backdrop-blur-xl rounded-[2.2rem] p-6 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col justify-between">
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
                      onClick={() => setSelectedStageModal(st)}
                      className="flex flex-col items-center justify-end h-full gap-2 cursor-pointer group"
                    >
                      <div className="text-[10px] font-black text-slate-700 group-hover:text-emerald-600 transition-colors">
                        {st.count}
                      </div>
                      <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden h-32 flex items-end">
                        <div
                          style={{ height: `${st.heightPct}%`, backgroundColor: st.color }}
                          className="w-full rounded-t-xl group-hover:opacity-90 transition-all duration-500"
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

            {/* ------------------------------------------------------------------- */}
            {/* ROW 4: GST RECONCILIATION & TOP FRONTLINE PERFORMER */}
            {/* ------------------------------------------------------------------- */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Gross With GST */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 border border-white shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">With GST Amount</span>
                  <span className="text-xl font-black text-cyan-600 tracking-tight block mt-1">{formatRupee(monthlyWithGst)}</span>
                  <span className="text-[10px] font-bold text-slate-500 block">Gross Billing</span>
                </div>
                <div className="p-3 rounded-2xl bg-cyan-50 text-cyan-600">
                  <ReceiptIndianRupee size={20} />
                </div>
              </div>

              {/* Net Core Base */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 border border-white shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Without GST Amount</span>
                  <span className="text-xl font-black text-blue-600 tracking-tight block mt-1">{formatRupee(monthlyWithoutGst)}</span>
                  <span className="text-[10px] font-bold text-slate-500 block">Net Realization</span>
                </div>
                <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                  <Calculator size={20} />
                </div>
              </div>

              {/* Top High Performer */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 border border-white shadow-2xs flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Frontline Top Performer</span>
                  <span className="text-base font-black text-slate-900 tracking-tight block mt-1 truncate">{topHighPerformer.name}</span>
                  <span className="text-[10px] font-bold text-emerald-600 block">{topHighPerformer.branch} • {formatCompactRupee(topHighPerformer.revenue)}</span>
                </div>
                <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 shrink-0">
                  <Trophy size={20} />
                </div>
              </div>
            </div>

          </div>

          {/* ===================================================================== */}
          {/* RIGHT 3 OR 4 COLUMNS: THE CLASSY SMARTPHONE / DRAWER WIDGET */}
          {/* (EXACT REPLICA OF THE RIGHT-SIDE PHONE PREVIEW IN IMAGE 1) */}
          {/* ===================================================================== */}
          {showInspectorDrawer && (
            <div className="xl:col-span-4 2xl:col-span-3">
              <div className="rounded-[2.8rem] bg-gradient-to-b from-[#2a1b18] via-[#3d241f] to-[#1a1210] text-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] relative overflow-hidden flex flex-col justify-between min-h-[680px]">

                {/* Subtle curved phone speaker notch at top */}
                <div className="w-16 h-1.5 bg-white/20 rounded-full mx-auto mb-5" />

                <div>
                  {/* Top Card Brand Header */}
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

                  {/* Paid Amount / Realized Revenue Display */}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200/80 block">
                    Realized Revenue
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
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

                  {/* BEST SELLING SERVICE CARD (USER REQUEST) */}
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
                        <span className="text-[9px] text-white/60 block">Rec. Revenue</span>
                        <span className="font-black text-emerald-400">{formatCompactRupee(inspectedEntity.bestServiceRevenue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Month Dots Grid (Matching Phone Preview in Image 1) */}
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block mb-2">
                      2026 Deal Schedule
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

                {/* Bottom Action Button (Like 'Make a Payment' in Image 1) */}
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

      {/* ========================================================================= */}
      {/* 3. STAGE DRILLDOWN MODAL */}
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
              {filteredDeals.slice(0, 10).map((d: any, idx: number) => (
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
