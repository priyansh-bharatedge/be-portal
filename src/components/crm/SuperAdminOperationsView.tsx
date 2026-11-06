import React, { useMemo, useState } from 'react';
import {
  Zap,
  Shield,
  FolderKanban,
  Award,
  Activity,
  AlertCircle,
  Users,
  RefreshCw,
  Layers,
  UserCheck,
  Calendar,
  X,
  Search,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Clock,
  Briefcase,
  Flame,
  Crown
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
  CartesianGrid,
  PieChart,
  Pie,
  AreaChart,
  Area
} from 'recharts';
import type { InternalOperationRecord } from '../../types/operations';
import type {
  DashboardViewType,
  DashboardTeamType,
  FileAgeBucket
} from './OperationsDashboardView';
import { DASHBOARD_TEAM_OPTIONS } from './OperationsDashboardView';

export interface SuperAdminOperationsViewProps {
  viewType: DashboardViewType;
  setViewType: (v: DashboardViewType) => void;
  teamType: DashboardTeamType;
  setTeamType: (t: DashboardTeamType) => void;
  isLoading: boolean;
  lastRefreshed: Date;
  loadData: () => void;
  allRecords: InternalOperationRecord[];

  // Records & Wing Stats
  totalTeamRecords: number;
  pendingCasesCount: number;
  distinctTLsCount: number;
  distinctTMsCount: number;

  // Group Homepage Component Data
  comp1Data: Array<{ stage: string; count: number; latestDateDisplay: string }>;
  comp1DateFilter: string;
  setComp1DateFilter: (val: string) => void;

  comp2Data: Array<{ bucket: FileAgeBucket; count: number; latestDateDisplay: string }>;
  comp2DateFilter: string;
  setComp2DateFilter: (val: string) => void;

  comp3Data: Array<{ tl: string; tm: string; count: number }>;
  comp4Data: Array<{ tm: string; bucket: FileAgeBucket; count: number }>;
  comp5Data: Array<{ tl: string; scheme: string; count: number }>;
  comp6Data: Array<{ scheme: string; count: number }>;

  comp7Data: Array<{ tm: string; assignMonth: string; scheme: string; bookingDateDisplay: string; count: number }>;
  comp7DateFilter: string;
  setComp7DateFilter: (val: string) => void;

  comp8Data: Array<{ scheme: string; count: number }>;
  comp8DateFilter: string;
  setComp8DateFilter: (val: string) => void;
  comp8SearchQuery: string;
  setComp8SearchQuery: (val: string) => void;
  comp8MonthDisplayName: string;

  // Individual Homepage Component Data
  indTotalApps: number;
  indDistinctSubmitters: number;
  indDistinctSections: number;
  indDistinctTLs: number;

  indComp1Data: Array<{
    applicationDateDisplay: string;
    rawDateMs: number | null;
    sectionName: string;
    submitterName: string;
    count: number;
  }>;
  indComp1DateFilter: string;
  setIndComp1DateFilter: (val: string) => void;
  indComp1Search: string;
  setIndComp1Search: (val: string) => void;

  indComp2Data: Array<{ submitterName: string; count: number }>;
  indComp2Mode: 'daily' | 'monthly';
  setIndComp2Mode: (mode: 'daily' | 'monthly') => void;
  indComp2DateFilter: string;
  setIndComp2DateFilter: (val: string) => void;
  indComp2Search: string;
  setIndComp2Search: (val: string) => void;

  indComp3Data: Array<{ tl: string; tm: string; count: number }>;
  indComp3Mode: 'daily' | 'monthly';
  setIndComp3Mode: (mode: 'daily' | 'monthly') => void;
  indComp3DateFilter: string;
  setIndComp3DateFilter: (val: string) => void;
  indComp3Search: string;
  setIndComp3Search: (val: string) => void;
}

// Warm luxury fin-tech chromatic colors for the 8 file age buckets (zero green)
const BUCKET_CHROMA_LIGHT: Record<FileAgeBucket, {
  color: string;
  cardBg: string;
  badgeBg: string;
  badgeBorder: string;
  barBg: string;
  fillHex: string;
  level: string;
}> = {
  '0-31': {
    color: 'text-sky-800',
    cardBg: 'bg-sky-50/70 hover:bg-sky-50 border-sky-200',
    badgeBg: 'bg-sky-100 text-sky-800',
    badgeBorder: 'border-sky-300',
    barBg: 'from-sky-500 to-blue-500',
    fillHex: '#0284C7',
    level: 'Optimal'
  },
  '31-62': {
    color: 'text-cyan-800',
    cardBg: 'bg-cyan-50/70 hover:bg-cyan-50 border-cyan-200',
    badgeBg: 'bg-cyan-100 text-cyan-800',
    badgeBorder: 'border-cyan-300',
    barBg: 'from-cyan-500 to-blue-600',
    fillHex: '#0891B2',
    level: 'Normal'
  },
  '62-93': {
    color: 'text-indigo-800',
    cardBg: 'bg-indigo-50/70 hover:bg-indigo-50 border-indigo-200',
    badgeBg: 'bg-indigo-100 text-indigo-800',
    badgeBorder: 'border-indigo-300',
    barBg: 'from-indigo-500 to-violet-600',
    fillHex: '#4F46E5',
    level: 'Attention'
  },
  '93-124': {
    color: 'text-stone-800',
    cardBg: 'bg-stone-100/70 hover:bg-stone-100 border-stone-300',
    badgeBg: 'bg-stone-200 text-stone-800',
    badgeBorder: 'border-stone-400',
    barBg: 'from-stone-500 to-stone-700',
    fillHex: '#8C6D58',
    level: 'Elevated'
  },
  '124-155': {
    color: 'text-amber-800',
    cardBg: 'bg-amber-50/70 hover:bg-amber-50 border-amber-200',
    badgeBg: 'bg-amber-100 text-amber-800',
    badgeBorder: 'border-amber-300',
    barBg: 'from-amber-500 to-orange-500',
    fillHex: '#D97706',
    level: 'High'
  },
  '155-186': {
    color: 'text-orange-900',
    cardBg: 'bg-orange-50/70 hover:bg-orange-50 border-orange-200',
    badgeBg: 'bg-orange-100 text-orange-900',
    badgeBorder: 'border-orange-300',
    barBg: 'from-orange-500 to-rose-500',
    fillHex: '#EA580C',
    level: 'Critical'
  },
  '186-217': {
    color: 'text-rose-900',
    cardBg: 'bg-rose-50/70 hover:bg-rose-50 border-rose-200',
    badgeBg: 'bg-rose-100 text-rose-900',
    badgeBorder: 'border-rose-300',
    barBg: 'from-rose-500 to-pink-600',
    fillHex: '#E11D48',
    level: 'Severe'
  },
  'Others': {
    color: 'text-red-950',
    cardBg: 'bg-red-50/70 hover:bg-red-50 border-red-200',
    badgeBg: 'bg-red-100 text-red-950',
    badgeBorder: 'border-red-300',
    barBg: 'from-red-600 to-rose-700',
    fillHex: '#991B1B',
    level: 'Exceeded'
  }
};

// Radiant luxury light pastel wing themes (Warm Amber, Glacier Sky, Amethyst Lavender, Rose Coral - ZERO BLACK, ZERO GREEN)
const WING_ACCENTS_LIGHT: Record<DashboardTeamType, {
  name: string;
  icon: React.ElementType;
  gradient: string;
  badge: string;
  text: string;
  glow: string;
  fillHex: string;
  description: string;
  // Active card styling
  activeCard: string;
  activeTitle: string;
  activeSubtitle: string;
  activeIconBg: string;
  activeIconText: string;
  activeBadge: string;
  // Inactive card styling (all 4 cards have beautiful light colors)
  inactiveCard: string;
  inactiveTitle: string;
  inactiveSubtitle: string;
  inactiveIconBg: string;
  inactiveIconText: string;
  inactiveBadge: string;
}> = {
  Funding: {
    name: 'Funding Wing',
    icon: Zap,
    gradient: 'from-[#FFF7ED] via-[#FFEDD5] to-[#FED7AA]',
    badge: 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]',
    text: 'text-[#9A3412]',
    glow: 'shadow-[0_12px_28px_rgba(249,115,22,0.18)]',
    fillHex: '#F97316',
    description: 'Pitch decks, DPR preparations, grant submissions, and debt financing pipelines.',
    activeCard: 'bg-gradient-to-br from-[#FFF7ED] via-[#FFEDD5] to-[#FED7AA] border-[#FB923C]/60 shadow-[0_12px_28px_rgba(249,115,22,0.18)] ring-2 ring-[#F97316]/50',
    activeTitle: 'text-[#7C2D12]',
    activeSubtitle: 'text-[#9A3412]',
    activeIconBg: 'bg-white/95 shadow-xs',
    activeIconText: 'text-[#EA580C]',
    activeBadge: 'bg-[#EA580C] text-white shadow-xs',
    inactiveCard: 'bg-white/90 hover:bg-[#FFF7ED] border-[#FED7AA]/60 hover:border-[#FB923C]/50 shadow-2xs hover:shadow-md',
    inactiveTitle: 'text-stone-800 group-hover:text-[#9A3412]',
    inactiveSubtitle: 'text-stone-500',
    inactiveIconBg: 'bg-[#FFF1E5]',
    inactiveIconText: 'text-[#EA580C]',
    inactiveBadge: 'bg-[#FFF1E5] text-[#C2410C] border border-[#FED7AA]'
  },
  Compliance: {
    name: 'Compliance Wing',
    icon: Shield,
    gradient: 'from-[#F0F9FF] via-[#E0F2FE] to-[#BAE6FD]',
    badge: 'bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]',
    text: 'text-[#0369A1]',
    glow: 'shadow-[0_12px_28px_rgba(2,132,199,0.18)]',
    fillHex: '#0284C7',
    description: 'ROC filings, Director/Company ITR, MCA disclosures, audit & annual compliance.',
    activeCard: 'bg-gradient-to-br from-[#F0F9FF] via-[#E0F2FE] to-[#BAE6FD] border-[#38BDF8]/60 shadow-[0_12px_28px_rgba(2,132,199,0.18)] ring-2 ring-[#0284C7]/50',
    activeTitle: 'text-[#0369A1]',
    activeSubtitle: 'text-[#0284C7]',
    activeIconBg: 'bg-white/95 shadow-xs',
    activeIconText: 'text-[#0284C7]',
    activeBadge: 'bg-[#0284C7] text-white shadow-xs',
    inactiveCard: 'bg-white/90 hover:bg-[#F0F9FF] border-[#BAE6FD]/60 hover:border-[#38BDF8]/50 shadow-2xs hover:shadow-md',
    inactiveTitle: 'text-stone-800 group-hover:text-[#0369A1]',
    inactiveSubtitle: 'text-stone-500',
    inactiveIconBg: 'bg-[#E0F2FE]',
    inactiveIconText: 'text-[#0284C7]',
    inactiveBadge: 'bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]'
  },
  Incorporation: {
    name: 'Incorporation Wing',
    icon: FolderKanban,
    gradient: 'from-[#FAF5FF] via-[#F3E8FF] to-[#DDD6FE]',
    badge: 'bg-[#FAF5FF] text-[#6B21A8] border-[#DDD6FE]',
    text: 'text-[#6B21A8]',
    glow: 'shadow-[0_12px_28px_rgba(147,51,234,0.18)]',
    fillHex: '#9333EA',
    description: 'Name reservations, SPICe+ entity registrations, DSC creation & board resolutions.',
    activeCard: 'bg-gradient-to-br from-[#FAF5FF] via-[#F3E8FF] to-[#DDD6FE] border-[#C084FC]/60 shadow-[0_12px_28px_rgba(147,51,234,0.18)] ring-2 ring-[#9333EA]/50',
    activeTitle: 'text-[#5B21B6]',
    activeSubtitle: 'text-[#6D28D9]',
    activeIconBg: 'bg-white/95 shadow-xs',
    activeIconText: 'text-[#9333EA]',
    activeBadge: 'bg-[#9333EA] text-white shadow-xs',
    inactiveCard: 'bg-white/90 hover:bg-[#FAF5FF] border-[#DDD6FE]/60 hover:border-[#C084FC]/50 shadow-2xs hover:shadow-md',
    inactiveTitle: 'text-stone-800 group-hover:text-[#5B21B6]',
    inactiveSubtitle: 'text-stone-500',
    inactiveIconBg: 'bg-[#EDE9FE]',
    inactiveIconText: 'text-[#9333EA]',
    inactiveBadge: 'bg-[#EDE9FE] text-[#6B21A8] border border-[#DDD6FE]'
  },
  Certificate: {
    name: 'Certificate Wing',
    icon: Award,
    gradient: 'from-[#FFF1F2] via-[#FFE4E6] to-[#FECDD3]',
    badge: 'bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]',
    text: 'text-[#9F1239]',
    glow: 'shadow-[0_12px_28px_rgba(225,29,72,0.18)]',
    fillHex: '#E11D48',
    description: 'ISO certifications, MSME/Udyam certificates, trademark filings & official stamps.',
    activeCard: 'bg-gradient-to-br from-[#FFF1F2] via-[#FFE4E6] to-[#FECDD3] border-[#FB7185]/60 shadow-[0_12px_28px_rgba(225,29,72,0.18)] ring-2 ring-[#E11D48]/50',
    activeTitle: 'text-[#881337]',
    activeSubtitle: 'text-[#9F1239]',
    activeIconBg: 'bg-white/95 shadow-xs',
    activeIconText: 'text-[#E11D48]',
    activeBadge: 'bg-[#E11D48] text-white shadow-xs',
    inactiveCard: 'bg-white/90 hover:bg-[#FFF1F2] border-[#FECDD3]/60 hover:border-[#FB7185]/50 shadow-2xs hover:shadow-md',
    inactiveTitle: 'text-stone-800 group-hover:text-[#881337]',
    inactiveSubtitle: 'text-stone-500',
    inactiveIconBg: 'bg-[#FFE4E6]',
    inactiveIconText: 'text-[#E11D48]',
    inactiveBadge: 'bg-[#FFE4E6] text-[#9F1239] border border-[#FECDD3]'
  }
};

// Radiant light pastel palette (ZERO BLACK, ZERO GREEN)
const CHART_PALETTE = ['#F25B22', '#0284C7', '#7C3AED', '#E11D48', '#D97706', '#0891B2', '#4F46E5', '#EA580C'];

// Custom Recharts Frosted Tooltip
const CustomLightTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-white/95 backdrop-blur-xl px-3.5 py-2.5 rounded-2xl border border-stone-200/80 shadow-[0_12px_36px_rgba(0,0,0,0.08)] text-xs z-50">
        <p className="font-bold text-[#191919] mb-1">{label || data.name || data.payload?.name || data.payload?.stage || data.payload?.bucket || data.payload?.scheme}</p>
        <div className="flex items-center space-x-2 text-stone-600 font-mono">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.fill || data.color || '#F25B22' }} />
          <span>Volume:</span>
          <strong className="text-[#191919] font-black">{data.value}</strong>
        </div>
      </div>
    );
  }
  return null;
};

export const SuperAdminOperationsView: React.FC<SuperAdminOperationsViewProps> = (props) => {
  const {
    viewType, setViewType,
    teamType, setTeamType,
    isLoading, loadData,
    allRecords,
    totalTeamRecords, pendingCasesCount, distinctTLsCount, distinctTMsCount,
    comp1Data, comp1DateFilter, setComp1DateFilter,
    comp2Data, comp2DateFilter, setComp2DateFilter,
    comp3Data,
    comp4Data,
    comp5Data,
    comp6Data,
    comp7Data, comp7DateFilter, setComp7DateFilter,
    comp8Data, comp8DateFilter, setComp8DateFilter,
    comp8SearchQuery, setComp8SearchQuery,
    comp8MonthDisplayName,
    indTotalApps, indDistinctSubmitters, indDistinctSections, indDistinctTLs,
    indComp1Data, indComp1DateFilter, setIndComp1DateFilter, indComp1Search, setIndComp1Search,
    indComp2Data, indComp2Mode, setIndComp2Mode, indComp2DateFilter, setIndComp2DateFilter, indComp2Search, setIndComp2Search,
    indComp3Data, indComp3Mode, setIndComp3Mode, indComp3DateFilter, setIndComp3DateFilter, indComp3Search, setIndComp3Search
  } = props;

  // Visual toggle states for charts vs lists in cards
  const [showComp1Chart, setShowComp1Chart] = useState<boolean>(true);
  const [comp1ViewFilter, setComp1ViewFilter] = useState<'all' | 'active'>('all');
  const [comp1Search, setComp1Search] = useState<string>('');
  const [showComp2Chart, setShowComp2Chart] = useState<boolean>(true);
  const [showComp6Chart, setShowComp6Chart] = useState<boolean>(true);
  const [showComp8Chart, setShowComp8Chart] = useState<boolean>(true);

  // Component 1 Executive Calculations
  const comp1TotalCount = useMemo(() => comp1Data.reduce((acc, c) => acc + c.count, 0), [comp1Data]);
  const comp1ActiveStagesCount = useMemo(() => comp1Data.filter(c => c.count > 0).length, [comp1Data]);
  const comp1Bottleneck = useMemo(() => {
    const sorted = [...comp1Data].sort((a, b) => b.count - a.count);
    return sorted.length > 0 && sorted[0].count > 0 ? sorted[0] : null;
  }, [comp1Data]);

  // All stages filtered and sorted descending so top active stages are at the top
  const comp1StagesFiltered = useMemo(() => {
    let list = [...comp1Data].sort((a, b) => b.count - a.count);
    if (comp1ViewFilter === 'active') {
      list = list.filter(item => item.count > 0);
    }
    if (comp1Search.trim()) {
      const q = comp1Search.toLowerCase().trim();
      list = list.filter(item => item.stage.toLowerCase().includes(q));
    }
    return list;
  }, [comp1Data, comp1ViewFilter, comp1Search]);

  // Compute live counts for each of the 4 Wings
  const wingCounts = useMemo(() => {
    const counts: Record<DashboardTeamType, number> = {
      Funding: 0,
      Compliance: 0,
      Incorporation: 0,
      Certificate: 0
    };
    allRecords.forEach(r => {
      const t = String(r.Team_Type || r.Internal_Team_Type || '').toLowerCase();
      if (t.includes('funding')) counts.Funding += 1;
      else if (t.includes('compliance')) counts.Compliance += 1;
      else if (t.includes('incorporation')) counts.Incorporation += 1;
      else if (t.includes('certif')) counts.Certificate += 1;
    });
    return counts;
  }, [allRecords]);

  // Data for 4-Wing Multi-Fleet Pie Chart
  const wingFleetPieData = useMemo(() => {
    return DASHBOARD_TEAM_OPTIONS.map(w => ({
      name: w,
      value: wingCounts[w] || 0,
      fill: WING_ACCENTS_LIGHT[w].fillHex
    }));
  }, [wingCounts]);

  const activeWing = WING_ACCENTS_LIGHT[teamType];

  // Max count helpers for proportional bar charts
  const maxComp1 = useMemo(() => Math.max(1, ...comp1Data.map(d => d.count)), [comp1Data]);
  const maxComp2 = useMemo(() => Math.max(1, ...comp2Data.map(d => d.count)), [comp2Data]);
  const maxComp6 = useMemo(() => Math.max(1, ...comp6Data.map(d => d.count)), [comp6Data]);
  const maxComp8 = useMemo(() => Math.max(1, ...comp8Data.map(d => d.count)), [comp8Data]);
  const maxInd2 = useMemo(() => Math.max(1, ...indComp2Data.map(d => d.count)), [indComp2Data]);
  const maxInd3 = useMemo(() => Math.max(1, ...indComp3Data.map(d => d.count)), [indComp3Data]);

  // Grouped comp3 by TL for hierarchy
  const comp3ByTL = useMemo(() => {
    const map = new Map<string, { tl: string; total: number; members: Array<{ tm: string; count: number }> }>();
    comp3Data.forEach(item => {
      const existing = map.get(item.tl) || { tl: item.tl, total: 0, members: [] };
      existing.total += item.count;
      existing.members.push({ tm: item.tm, count: item.count });
      map.set(item.tl, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [comp3Data]);

  // Aggregated data for Comp 7 Chronological Monthly Trend Chart
  const comp7MonthTrendData = useMemo(() => {
    const map = new Map<string, number>();
    comp7Data.forEach(item => {
      const m = item.assignMonth || 'Unknown';
      map.set(m, (map.get(m) || 0) + item.count);
    });
    return Array.from(map.entries()).map(([month, count]) => ({
      month,
      count
    }));
  }, [comp7Data]);

  return (
    <div className="relative min-h-screen bg-[#F5F3EF] rounded-[36px] p-5 sm:p-7 lg:p-8 space-y-7 text-stone-800 font-sans overflow-hidden border border-stone-200/60 shadow-[0_20px_60px_rgba(0,0,0,0.03)] transition-all duration-300">

      {/* Atmospheric blurred ambient mesh washes (warm peach, sand, almond - zero green) */}
      <div className="absolute -top-24 right-0 w-[650px] h-[650px] bg-gradient-to-br from-[#FCECDD]/70 via-[#F7D8C5]/35 to-transparent rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-1/3 -left-24 w-[600px] h-[600px] bg-gradient-to-tr from-[#FDE6D2]/60 via-[#F5EAD9]/40 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-24 right-1/4 w-[700px] h-[700px] bg-gradient-to-tl from-[#EFE5D8]/70 via-[#F9EFE4]/40 to-transparent rounded-full blur-[140px] pointer-events-none" />

      {/* =================================================================== */}
      {/* 1. TOP HEADER & EXECUTIVE GREETING                                 */}
      {/* =================================================================== */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-5 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA] shadow-2xs flex items-center gap-1.5">
              <Crown size={12} className="text-[#EA580C] fill-[#EA580C]/20" /> Super Admin
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#191919] tracking-tight">
            Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1 font-medium">
            Live pipeline flow, ageing distribution & delivery analytics for <strong>{teamType}</strong>. {activeWing.description}
          </p>
        </div>

        {/* View Mode Segmented Pill & Sync Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented View Mode Switcher */}
          <div className="flex items-center bg-white/90 p-1.5 rounded-full border border-stone-200/80 shadow-xs backdrop-blur-md">
            <button
              onClick={() => setViewType('Group Homepage')}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewType === 'Group Homepage'
                  ? 'bg-[#F25B22] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Layers size={14} className={viewType === 'Group Homepage' ? 'text-white' : 'text-stone-400'} />
              <span>Group Homepage</span>
            </button>
            <button
              onClick={() => setViewType('Individual Homepage')}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewType === 'Individual Homepage'
                  ? 'bg-[#F25B22] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <UserCheck size={14} className={viewType === 'Individual Homepage' ? 'text-white' : 'text-stone-400'} />
              <span>Individual Homepage</span>
            </button>
          </div>

          {/* Sync Live Data Button */}
          <button
            onClick={loadData}
            disabled={isLoading}
            title="Refresh Live Operations Data"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/90 hover:bg-white text-stone-700 hover:text-[#F25B22] border border-stone-200/70 text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-[#F25B22]' : 'text-stone-600'} />
            <span className="hidden sm:inline">Sync</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. 4-WINGS CARDS (LIGHT COLORS, GENEROUS PADDING, ZERO TEXT CLIPPING) */}
      {/* =================================================================== */}
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {DASHBOARD_TEAM_OPTIONS.map((wing) => {
          const info = WING_ACCENTS_LIGHT[wing];
          const Icon = info.icon;
          const isSelected = teamType === wing;
          const count = wingCounts[wing];

          return (
            <button
              key={wing}
              onClick={() => setTeamType(wing)}
              className={`group relative p-5 rounded-[24px] border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[120px] ${
                isSelected ? info.activeCard : info.inactiveCard
              }`}
            >
              {/* Top row: Icon and count pill */}
              <div className="flex items-center justify-between w-full">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isSelected ? `${info.activeIconBg} ${info.activeIconText}` : `${info.inactiveIconBg} ${info.inactiveIconText}`
                }`}>
                  <Icon size={17} />
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold transition-all ${
                  isSelected ? info.activeBadge : info.inactiveBadge
                }`}>
                  {count}
                </span>
              </div>

              {/* Bottom row: Wing name & active cases */}
              <div className="pt-3">
                <h4 className={`text-base font-extrabold tracking-tight transition-colors ${
                  isSelected ? info.activeTitle : info.inactiveTitle
                }`}>
                  {wing}
                </h4>
                <p className={`text-xs font-medium mt-0.5 transition-colors ${
                  isSelected ? info.activeSubtitle : info.inactiveSubtitle
                }`}>
                  {count} active cases
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* 3. KPI RIBBON (FLOATING SOFT WHITE CARDS)                           */}
      {/* =================================================================== */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {viewType === 'Group Homepage' ? (
          <>
            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Total Active Cases</span>
                <span className="w-8 h-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center">
                  <Activity size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{totalTeamRecords}</div>
              <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between font-medium">
                <span>{teamType} wing</span>
                <span className="text-[#F25B22] font-bold">100%</span>
              </div>
            </div>

            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#A3593D] uppercase tracking-wider">Total Pending Cases</span>
                <span className="w-8 h-8 rounded-full bg-[#FCEAE3] text-[#A3593D] flex items-center justify-center">
                  <AlertCircle size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{pendingCasesCount}</div>
              <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between font-medium">
                <span>In progress</span>
                <span className="text-[#A3593D] font-mono font-bold">
                  {totalTeamRecords > 0 ? Math.round((pendingCasesCount / totalTeamRecords) * 100) : 0}%
                </span>
              </div>
            </div>

            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#863E8C] uppercase tracking-wider">Team Leaders</span>
                <span className="w-8 h-8 rounded-full bg-[#F7E7F8] text-[#863E8C] flex items-center justify-center">
                  <Shield size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{distinctTLsCount}</div>
              <div className="text-[11px] text-stone-500 mt-1 font-medium">Supervising execution</div>
            </div>

            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#0284C7] uppercase tracking-wider">Team Members</span>
                <span className="w-8 h-8 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center">
                  <Users size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{distinctTMsCount}</div>
              <div className="text-[11px] text-stone-500 mt-1 font-medium">Active members</div>
            </div>

            {/* 5th Visual Widget: 4-Wings Mini Donut Breakdown */}
            <div className="p-4 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] col-span-2 sm:col-span-4 lg:col-span-1 flex items-center justify-between">
              <div className="w-20 h-20 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={wingFleetPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={22}
                      outerRadius={36}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {wingFleetPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomLightTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-right pl-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">All Wings</span>
                <span className="text-base font-extrabold text-[#191919] font-mono">{allRecords.length} Total</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#334155] uppercase tracking-wider">Total Applications</span>
                <span className="w-8 h-8 rounded-full bg-[#E0EFF8] text-[#1E293B] flex items-center justify-center">
                  <Activity size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{indTotalApps}</div>
              <div className="text-[11px] text-stone-500 mt-1">Across all sections ({teamType})</div>
            </div>

            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#F25B22] uppercase tracking-wider">Active Submitters</span>
                <span className="w-8 h-8 rounded-full bg-orange-50 text-[#F25B22] flex items-center justify-center">
                  <UserCheck size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{indDistinctSubmitters}</div>
              <div className="text-[11px] text-stone-500 mt-1">Logging daily filings</div>
            </div>

            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#863E8C] uppercase tracking-wider">Workflow Sections</span>
                <span className="w-8 h-8 rounded-full bg-[#F7E7F8] text-[#582A5D] flex items-center justify-center">
                  <Layers size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{indDistinctSections}</div>
              <div className="text-[11px] text-stone-500 mt-1">Active specialized stages</div>
            </div>

            <div className="p-5 rounded-[26px] bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.025)] relative overflow-hidden group hover:shadow-md transition-all col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-stone-500 mb-2">
                <span className="text-[11px] font-bold text-[#B86B4F] uppercase tracking-wider">Team Leaders</span>
                <span className="w-8 h-8 rounded-full bg-[#FCEAE3] text-[#5C2B1E] flex items-center justify-center">
                  <Shield size={15} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#191919] font-mono tracking-tight">{indDistinctTLs}</div>
              <div className="text-[11px] text-stone-500 mt-1">Leading section teams</div>
            </div>
          </>
        )}
      </div>

      {/* =================================================================== */}
      {/* 4. COMPONENT GRIDS (GROUP HOMEPAGE OR INDIVIDUAL HOMEPAGE)          */}
      {/* =================================================================== */}
      {viewType === 'Group Homepage' ? (
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 1: STAGE-WISE RECORD COUNTS - GRAPH TYPE               */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-[#EA580C] shadow-2xs">
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">Stage-wise Record Counts</h3>
                    <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                      {teamType} Wing • Live Pipeline Distribution Graph
                    </p>
                  </div>
                </div>

                {/* Filter Controls: All/Active Switcher & Date Filter */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Segmented Filter: All vs Active */}
                  <div className="flex items-center bg-[#F5F3EF] p-1 rounded-full border border-stone-200/70 text-xs font-bold shadow-2xs">
                    <button
                      onClick={() => setComp1ViewFilter('active')}
                      className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                        comp1ViewFilter === 'active'
                          ? 'bg-[#F25B22] text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Active ({comp1ActiveStagesCount})
                    </button>
                    <button
                      onClick={() => setComp1ViewFilter('all')}
                      className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                        comp1ViewFilter === 'all'
                          ? 'bg-[#F25B22] text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      All ({comp1Data.length})
                    </button>
                  </div>

                  {/* Date Filter */}
                  <div className="flex items-center bg-[#F5F3EF] hover:bg-white border border-stone-200/70 rounded-full px-3 py-1.5 text-xs transition-colors shadow-2xs">
                    <Calendar size={12} className="text-stone-400 mr-2 shrink-0" />
                    <input
                      type="date"
                      value={comp1DateFilter}
                      onChange={(e) => setComp1DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {comp1DateFilter && (
                      <button
                        onClick={() => setComp1DateFilter('')}
                        className="ml-1 text-stone-400 hover:text-stone-700"
                        title="Clear filter"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Unique Visual Graph Canvas (Vertical BarChart with full left names) */}
              <div className="p-3 sm:p-4 bg-[#FAF9F6] rounded-2xl border border-stone-200/70 shadow-2xs">
                {comp1StagesFiltered.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">
                    No stage records found matching current filter.
                  </div>
                ) : (
                  <div className="w-full overflow-y-auto max-h-[460px] pr-1">
                    <div style={{ height: `${Math.max(300, comp1StagesFiltered.length * 48)}px`, minWidth: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={comp1StagesFiltered}
                          layout="vertical"
                          margin={{ top: 12, right: 75, left: 20, bottom: 12 }}
                          barCategoryGap="25%"
                        >
                          <defs>
                            <linearGradient id="comp1BarGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#F25B22" stopOpacity={0.9} />
                              <stop offset="50%" stopColor="#FB923C" stopOpacity={0.95} />
                              <stop offset="100%" stopColor="#F59E0B" stopOpacity={1} />
                            </linearGradient>
                            <linearGradient id="comp1BarIdle" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#E7E5E4" stopOpacity={0.5} />
                              <stop offset="100%" stopColor="#D6D3D1" stopOpacity={0.8} />
                            </linearGradient>
                          </defs>

                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E0D8" />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 10, fill: '#78716C' }}
                            allowDecimals={false}
                            axisLine={{ stroke: '#E5E0D8' }}
                            tickLine={false}
                          />
                          <YAxis
                            dataKey="stage"
                            type="category"
                            width={195}
                            interval={0}
                            axisLine={{ stroke: '#E5E0D8' }}
                            tickLine={false}
                            tick={(tickProps) => {
                              const { x, y, payload } = tickProps;
                              const stageName = String(payload?.value || '');
                              // Word wrapping so long names wrap into 2 lines cleanly without cutting off
                              const words = stageName.split(' ');
                              let l1 = '';
                              let l2 = '';
                              for (let i = 0; i < words.length; i++) {
                                const cand = l1 ? `${l1} ${words[i]}` : words[i];
                                if (cand.length <= 18 || l1 === '') {
                                  l1 = cand;
                                } else {
                                  l2 = words.slice(i).join(' ');
                                  break;
                                }
                              }

                              return (
                                <g transform={`translate(${x},${y})`}>
                                  {l2 ? (
                                    <text x={-12} y={0} textAnchor="end" fill="#292524" fontSize={11} fontWeight={600} fontFamily="sans-serif">
                                      <tspan x={-12} dy="-0.32em">{l1}</tspan>
                                      <tspan x={-12} dy="1.2em">{l2}</tspan>
                                    </text>
                                  ) : (
                                    <text x={-12} y={4} textAnchor="end" fill="#292524" fontSize={11} fontWeight={600} fontFamily="sans-serif">
                                      {l1}
                                    </text>
                                  )}
                                </g>
                              );
                            }}
                          />
                          <RechartsTooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                const total = comp1TotalCount > 0 ? comp1TotalCount : 1;
                                const share = Math.round((data.count / total) * 100);
                                return (
                                  <div className="bg-white/95 backdrop-blur-xl px-4 py-3 rounded-2xl border border-stone-200/80 shadow-[0_12px_36px_rgba(0,0,0,0.08)] text-xs z-50">
                                    <p className="font-extrabold text-[#191919] mb-1.5">{data.stage}</p>
                                    <div className="space-y-1 font-mono text-stone-600">
                                      <div className="flex items-center justify-between gap-4">
                                        <span>Active Cases:</span>
                                        <strong className="text-[#F25B22] font-black">{data.count}</strong>
                                      </div>
                                      <div className="flex items-center justify-between gap-4 text-[11px]">
                                        <span>Workload Share:</span>
                                        <strong className="text-stone-800">{share}%</strong>
                                      </div>
                                      <div className="flex items-center justify-between gap-4 text-[11px] text-stone-400">
                                        <span>Latest Date:</span>
                                        <span>{data.latestDateDisplay !== '-' ? data.latestDateDisplay : 'No date'}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="count"
                            barSize={18}
                            radius={[0, 8, 8, 0]}
                            label={(lblProps: any) => {
                              const { x, y, width, height, value } = lblProps;
                              if (!value || value === 0) return null;
                              return (
                                <text
                                  x={x + width + 8}
                                  y={y + height / 2 + 4}
                                  fill="#C2410C"
                                  fontSize={11}
                                  fontWeight={800}
                                  fontFamily="monospace"
                                >
                                  {value}
                                </text>
                              );
                            }}
                          >
                            {comp1StagesFiltered.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.count > 0 ? 'url(#comp1BarGrad)' : 'url(#comp1BarIdle)'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>Showing {comp1StagesFiltered.length} stages on graph</span>
              <span className="text-[#F25B22] font-bold">{comp1TotalCount} total records</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 2: FILE AGEING HEATMAP WITH CHROMATIC BAR CHART       */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">File Ageing Record Counts</h3>
                  </div>
                </div>

                {/* Filter & Chart Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowComp2Chart(!showComp2Chart)}
                    className="p-2 rounded-full bg-[#F5F3EF] hover:bg-stone-200/60 text-stone-600 transition-colors border border-stone-200/50"
                    title={showComp2Chart ? "Hide Chart" : "Show Visual Chart"}
                  >
                    <BarChart3 size={14} className={showComp2Chart ? 'text-[#0284C7]' : ''} />
                  </button>

                  <div className="flex items-center bg-[#F5F3EF] hover:bg-white border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs transition-colors shadow-2xs">
                    <Calendar size={13} className="text-stone-400 mr-2 shrink-0" />
                    <input
                      type="date"
                      value={comp2DateFilter}
                      onChange={(e) => setComp2DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {comp2DateFilter && (
                      <button
                        onClick={() => setComp2DateFilter('')}
                        className="ml-2 text-stone-400 hover:text-stone-700"
                        title="Clear filter"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 8-Bucket Visual Chromatic Chart */}
              {showComp2Chart && (
                <div className="mb-4 p-3 bg-[#FAF9F6] rounded-2xl border border-stone-100">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comp2Data} barCategoryGap="25%" margin={{ top: 8, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE6DF" />
                        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#78716C' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#78716C' }} />
                        <RechartsTooltip content={<CustomLightTooltip />} />
                        <Bar dataKey="count" barSize={20} radius={[6, 6, 0, 0]}>
                          {comp2Data.map((entry) => (
                            <Cell key={`comp2-cell-${entry.bucket}`} fill={BUCKET_CHROMA_LIGHT[entry.bucket].fillHex} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* 8 Buckets Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {comp2Data.map((item) => {
                  const chroma = BUCKET_CHROMA_LIGHT[item.bucket];
                  const pct = Math.round((item.count / maxComp2) * 100);

                  return (
                    <div
                      key={item.bucket}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${chroma.cardBg}`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${chroma.badgeBg} ${chroma.badgeBorder}`}>
                            {item.bucket} d
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-stone-500">{chroma.level}</span>
                        </div>
                        <div className={`text-2xl font-black font-mono mt-1 ${item.count > 0 ? chroma.color : 'text-stone-400'}`}>
                          {item.count}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="h-1.5 w-full bg-stone-200/80 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${chroma.barBg} rounded-full`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[9px] font-mono text-stone-500 mt-1 truncate">
                          {item.latestDateDisplay !== '-' ? item.latestDateDisplay : 'No data'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>Standard 8-bucket chronological ageing</span>
              <span className="text-[#0284C7] font-bold">{comp2Data.reduce((acc, c) => acc + c.count, 0)} total files</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 3: PENDING CASES BY EMPLOYEE (TL -> TM HIERARCHY)     */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-stone-100">
                <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#191919]">Pending Cases by Employee</h3>
                </div>
              </div>

              {/* Hierarchy Display */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {comp3ByTL.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No pending cases detected.</div>
                ) : (
                  comp3ByTL.map((tlGroup, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:border-stone-300 transition-all shadow-2xs"
                    >
                      {/* TL Header */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/60">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#F7E7F8] text-[#863E8C] border border-[#E8BFEC] flex items-center justify-center text-xs font-black">
                            TL
                          </div>
                          <span className="text-xs font-black text-stone-900 tracking-tight">{tlGroup.tl}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#F7E7F8] text-[#863E8C] border border-[#E8BFEC]">
                          {tlGroup.total} Pending
                        </span>
                      </div>

                      {/* TM Chips */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {tlGroup.members.map((m, mIdx) => (
                          <div
                            key={mIdx}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white border border-stone-200/70 text-xs shadow-2xs"
                          >
                            <span className="text-stone-700 font-medium truncate max-w-[140px]">{m.tm}</span>
                            <span className="font-mono font-bold text-[#A3593D] ml-2">{m.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{comp3ByTL.length} team leaders</span>
              <span className="text-[#863E8C] font-bold">{comp3Data.reduce((acc, c) => acc + c.count, 0)} total pending</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 4: AGEING COUNT TM-WISE (8 BUCKETS MATRIX)            */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-stone-100">
                <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#191919]">Ageing Count TM-wise</h3>
                </div>
              </div>

              {/* Table / List */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {comp4Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No ageing breakdown available.</div>
                ) : (
                  comp4Data.slice(0, 15).map((item, idx) => {
                    const chroma = BUCKET_CHROMA_LIGHT[item.bucket];
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all shadow-2xs"
                      >
                        <div className="flex items-center space-x-2.5 max-w-[60%]">
                          <span className="font-bold text-stone-800 truncate">{item.tm}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${chroma.badgeBg} ${chroma.color} ${chroma.badgeBorder} border`}>
                          {item.bucket}: <strong className="font-black">{item.count}</strong>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>Showing top {Math.min(15, comp4Data.length)} of {comp4Data.length} records</span>
              <span className="text-stone-800 font-bold">{comp4Data.reduce((acc, c) => acc + c.count, 0)} total cases</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 5: PENDING CASES BY TL AND SCHEME                     */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-stone-100">
                <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                  <Briefcase size={18} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#191919]">Pending Cases by TL & Scheme</h3>
                </div>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {comp5Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No pending schemes found.</div>
                ) : (
                  comp5Data.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all shadow-2xs"
                    >
                      <div className="flex items-center space-x-2.5 max-w-[70%]">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FCEAE3] text-[#5C2B1E] border border-[#F4C5B3] shrink-0">
                          {item.tl}
                        </span>
                        <span className="font-semibold text-stone-700 truncate">{item.scheme}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#FCEAE3] text-[#A3593D] border border-[#F4C5B3]">
                        {item.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{comp5Data.length} TL/Scheme combinations</span>
              <span className="text-[#B86B4F] font-bold">{comp5Data.reduce((acc, c) => acc + c.count, 0)} total pending</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 6: ALL-OVER PENDING CASES SCHEME-WISE WITH CHART      */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <Flame size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">All-over Pending Cases Scheme-wise</h3>
                  </div>
                </div>

                <button
                  onClick={() => setShowComp6Chart(!showComp6Chart)}
                  className="p-2 rounded-full bg-[#F5F3EF] hover:bg-stone-200/60 text-stone-600 transition-colors border border-stone-200/50 self-start sm:self-auto"
                  title={showComp6Chart ? "Hide Chart" : "Show Visual Chart"}
                >
                  <BarChart3 size={14} className={showComp6Chart ? 'text-[#B86B4F]' : ''} />
                </button>
              </div>

              {/* Visual Horizontal Ranking Chart */}
              {showComp6Chart && comp6Data.length > 0 && (
                <div className="mb-4 p-4 bg-[#FAF9F6] rounded-2xl border border-stone-200/60 shadow-2xs">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={comp6Data.slice(0, 6)}
                        layout="vertical"
                        margin={{ top: 10, right: 25, left: 15, bottom: 10 }}
                        barCategoryGap="30%"
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EAE6DF" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#78716C' }} allowDecimals={false} />
                        <YAxis
                          dataKey="scheme"
                          type="category"
                          width={140}
                          tick={{ fontSize: 10, fill: '#44403C' }}
                          tickFormatter={(val: string) => (val && val.length > 22 ? `${val.slice(0, 20)}...` : val)}
                        />
                        <RechartsTooltip content={<CustomLightTooltip />} />
                        <Bar dataKey="count" barSize={16} radius={[0, 8, 8, 0]}>
                          {comp6Data.slice(0, 6).map((_, index) => (
                            <Cell key={`comp6-cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Ranked Scheme Tiles */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {comp6Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No pending schemes identified.</div>
                ) : (
                  comp6Data.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all shadow-2xs"
                    >
                      <div className="flex items-center space-x-2.5 max-w-[75%]">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          idx === 0
                            ? 'bg-[#F25B22] text-white shadow-2xs'
                            : idx === 1
                            ? 'bg-[#FCEAE3] text-[#5C2B1E]'
                            : idx === 2
                            ? 'bg-[#E0EFF8] text-[#1E293B]'
                            : 'bg-stone-200 text-stone-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-stone-800 truncate">{item.scheme}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#FAF9F6] text-stone-900 border border-stone-200 shadow-2xs">
                        {item.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{comp6Data.length} unique scheme programs</span>
              <span className="text-[#B86B4F] font-bold">{comp6Data.reduce((acc, c) => acc + c.count, 0)} total pending</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 7: MONTH/YEAR PENDING CASES WITH AREA TREND CHART     */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">Month/Year Pending Cases</h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-[#F5F3EF] hover:bg-white border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs transition-colors shadow-2xs">
                    <Calendar size={13} className="text-stone-400 mr-2 shrink-0" />
                    <input
                      type="date"
                      value={comp7DateFilter}
                      onChange={(e) => setComp7DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {comp7DateFilter && (
                      <button
                        onClick={() => setComp7DateFilter('')}
                        className="ml-2 text-stone-400 hover:text-stone-700"
                        title="Clear filter"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Monthly Flow Area Trend Chart */}
              {comp7MonthTrendData.length > 1 && (
                <div className="mb-4 p-3 bg-[#FAF9F6] rounded-2xl border border-stone-100">
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={comp7MonthTrendData} margin={{ top: 8, right: 10, left: -20, bottom: 5 }}>
                        <defs>
                          <linearGradient id="warmTerracottaTrend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#B86B4F" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#B86B4F" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE6DF" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#78716C' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#78716C' }} />
                        <RechartsTooltip content={<CustomLightTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="#B86B4F" strokeWidth={2.5} fillOpacity={1} fill="url(#warmTerracottaTrend)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {comp7Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No pending cases match calendar filters.</div>
                ) : (
                  comp7Data.slice(0, 20).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all space-y-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-stone-900">{item.tm}</span>
                          <span className="text-[10px] text-stone-300">•</span>
                          <span className="text-[11px] font-mono text-[#B86B4F] font-bold">{item.assignMonth}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#FCEAE3] text-[#5C2B1E] border border-[#F4C5B3]">
                          {item.count}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-stone-500 font-mono">
                        <span className="truncate max-w-[200px] text-stone-700 font-medium">{item.scheme}</span>
                        <span>Booked: {item.bookingDateDisplay}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>Showing {Math.min(20, comp7Data.length)} of {comp7Data.length} records</span>
              <span className="text-[#B86B4F] font-bold">{comp7Data.reduce((acc, c) => acc + c.count, 0)} total pending</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COMPONENT 8: SCHEME BOOKING CURRENT MONTH WITH DONUT CHART     */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">Scheme Booking Current Month ({comp8MonthDisplayName})</h3>
                  </div>
                </div>

                {/* Filters: Month picker & Search & Chart Toggle */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowComp8Chart(!showComp8Chart)}
                    className="p-2 rounded-full bg-[#F5F3EF] hover:bg-stone-200/60 text-stone-600 transition-colors border border-stone-200/50"
                    title={showComp8Chart ? "Hide Chart" : "Show Visual Chart"}
                  >
                    <PieChartIcon size={14} className={showComp8Chart ? 'text-[#F25B22]' : ''} />
                  </button>

                  <div className="flex items-center bg-[#F5F3EF] hover:bg-white border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs transition-colors shadow-2xs">
                    <Calendar size={13} className="text-stone-400 mr-2 shrink-0" />
                    <input
                      type="month"
                      value={comp8DateFilter}
                      onChange={(e) => setComp8DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {comp8DateFilter && (
                      <button
                        onClick={() => setComp8DateFilter('')}
                        className="ml-2 text-stone-400 hover:text-stone-700"
                        title="Reset to current month"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Donut Chart Visual Breakdown */}
              {showComp8Chart && comp8Data.length > 0 && (
                <div className="mb-4 p-3 bg-[#FAF9F6] rounded-2xl border border-stone-100 flex flex-col sm:flex-row items-center justify-around gap-4">
                  <div className="w-36 h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={comp8Data.slice(0, 5)}
                          cx="50%"
                          cy="50%"
                          innerRadius={32}
                          outerRadius={55}
                          paddingAngle={3}
                          dataKey="count"
                        >
                          {comp8Data.slice(0, 5).map((_, index) => (
                            <Cell key={`comp8-cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomLightTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-1.5 max-w-[200px]">
                    {comp8Data.slice(0, 4).map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }} />
                          <span className="truncate max-w-[120px] text-stone-700">{entry.scheme}</span>
                        </div>
                        <span className="font-bold text-stone-900">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search input */}
              <div className="mb-3">
                <div className="flex items-center bg-[#F5F3EF] border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs shadow-2xs">
                  <Search size={13} className="text-stone-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search active month schemes..."
                    value={comp8SearchQuery}
                    onChange={(e) => setComp8SearchQuery(e.target.value)}
                    className="bg-transparent text-stone-800 text-xs outline-none w-full"
                  />
                  {comp8SearchQuery && (
                    <button onClick={() => setComp8SearchQuery('')} className="text-stone-400 hover:text-stone-700">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {comp8Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No schemes booked this month.</div>
                ) : (
                  comp8Data.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all shadow-2xs"
                    >
                      <span className="font-semibold text-stone-800 truncate max-w-[80%]">{item.scheme}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-orange-50 text-[#F25B22] border border-orange-200">
                        {item.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{comp8Data.length} active schemes booked</span>
              <span className="text-[#F25B22] font-bold">{comp8Data.reduce((acc, c) => acc + c.count, 0)} total booked deals</span>
            </div>
          </div>

        </div>
      ) : (
        /* =================================================================== */
        /* INDIVIDUAL HOMEPAGE COMPONENTS (3 DISTINCT SECTIONS)               */
        /* =================================================================== */
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* --------------------------------------------------------------- */}
          {/* INDIVIDUAL COMP 1: DAILY APPLICATIONS (FULL WIDTH)              */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all lg:col-span-2">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">Daily Applications</h3>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center bg-[#F5F3EF] hover:bg-white border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs transition-colors shadow-2xs">
                    <Calendar size={13} className="text-stone-400 mr-2 shrink-0" />
                    <input
                      type="date"
                      value={indComp1DateFilter}
                      onChange={(e) => setIndComp1DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {indComp1DateFilter && (
                      <button
                        onClick={() => setIndComp1DateFilter('')}
                        className="ml-2 text-stone-400 hover:text-stone-700"
                        title="Clear filter"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center bg-[#F5F3EF] hover:bg-white border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs w-48 transition-colors shadow-2xs">
                    <Search size={13} className="text-stone-400 mr-1.5 shrink-0" />
                    <input
                      type="text"
                      placeholder="Filter submitter..."
                      value={indComp1Search}
                      onChange={(e) => setIndComp1Search(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs outline-none w-full"
                    />
                    {indComp1Search && (
                      <button onClick={() => setIndComp1Search('')} className="text-stone-400 hover:text-stone-700">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Submissions Cards List */}
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {indComp1Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No daily applications match filter.</div>
                ) : (
                  indComp1Data.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-[#E0EFF8] text-[#1E293B] flex items-center justify-center font-bold text-xs shrink-0">
                          {item.submitterName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h5 className="font-extrabold text-sm text-stone-900">{item.submitterName}</h5>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 font-mono mt-0.5">
                            <span>{item.sectionName}</span>
                            <span>•</span>
                            <span>{item.applicationDateDisplay}</span>
                          </div>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-[#E0EFF8] text-[#1E293B] border border-[#B5D7EC] self-start sm:self-auto">
                        {item.count} applications
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{indComp1Data.length} submissions logged</span>
              <span className="text-[#0284C7] font-bold">{indComp1Data.reduce((acc, c) => acc + c.count, 0)} total applications</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* INDIVIDUAL COMP 2: MONTHLY APPLICATIONS                         */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <UserCheck size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">Monthly Applications</h3>
                  </div>
                </div>

                {/* Mode toggle & Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1 rounded-full bg-[#F5F3EF] border border-stone-200/70 flex items-center text-[10px] font-bold">
                    <button
                      onClick={() => setIndComp2Mode('daily')}
                      className={`px-3 py-1 rounded-full transition-all ${indComp2Mode === 'daily' ? 'bg-[#F25B22] text-white shadow-xs font-bold' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setIndComp2Mode('monthly')}
                      className={`px-3 py-1 rounded-full transition-all ${indComp2Mode === 'monthly' ? 'bg-[#F25B22] text-white shadow-xs font-bold' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      Monthly
                    </button>
                  </div>

                  <div className="flex items-center bg-[#F5F3EF] border border-stone-200/70 rounded-full px-3 py-1 text-xs">
                    <input
                      type={indComp2Mode === 'monthly' ? 'month' : 'date'}
                      value={indComp2DateFilter}
                      onChange={(e) => setIndComp2DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {indComp2DateFilter && (
                      <button onClick={() => setIndComp2DateFilter('')} className="ml-1 text-stone-400 hover:text-stone-700">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Submitter Performance Bar Chart */}
              {indComp2Data.length > 0 && (
                <div className="mb-4 p-3 bg-[#FAF9F6] rounded-2xl border border-stone-100">
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={indComp2Data.slice(0, 6)} barCategoryGap="25%" margin={{ top: 8, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE6DF" />
                        <XAxis dataKey="submitterName" interval={0} tick={{ fontSize: 9, fill: '#78716C' }} angle={-15} textAnchor="end" />
                        <YAxis tick={{ fontSize: 10, fill: '#78716C' }} />
                        <RechartsTooltip content={<CustomLightTooltip />} />
                        <Bar dataKey="count" barSize={18} radius={[6, 6, 0, 0]}>
                          {indComp2Data.slice(0, 6).map((_, index) => (
                            <Cell key={`ind2-cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-3">
                <div className="flex items-center bg-[#F5F3EF] border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs shadow-2xs">
                  <Search size={13} className="text-stone-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search submitter..."
                    value={indComp2Search}
                    onChange={(e) => setIndComp2Search(e.target.value)}
                    className="bg-transparent text-stone-800 text-xs outline-none w-full"
                  />
                  {indComp2Search && (
                    <button onClick={() => setIndComp2Search('')} className="text-stone-400 hover:text-stone-700">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Ranked Output List */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {indComp2Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No submitters for selected interval.</div>
                ) : (
                  indComp2Data.map((item, idx) => {
                    const pct = Math.round((item.count / maxInd2) * 100);
                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-[10px] font-mono font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-stone-800">{item.submitterName}</span>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#E0EFF8] text-[#1E293B] border border-[#B5D7EC]">
                            {item.count}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-200/60 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{indComp2Data.length} ranked submitters</span>
              <span className="text-[#0284C7] font-bold">{indComp2Data.reduce((acc, c) => acc + c.count, 0)} total filings</span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* INDIVIDUAL COMP 3: TOTAL APPLICATION TEAM (TL) WISE             */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-[30px] p-6 sm:p-7 bg-white/95 border border-stone-200/60 shadow-[0_10px_32px_rgba(0,0,0,0.025)] backdrop-blur-md flex flex-col justify-between hover:shadow-md hover:border-stone-300 transition-all">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-stone-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F5F3EF] border border-stone-200/70 flex items-center justify-center text-stone-800 shadow-2xs">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191919]">Total Application Team (TL) Wise</h3>
                  </div>
                </div>

                {/* Mode toggle & Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1 rounded-full bg-[#F5F3EF] border border-stone-200/70 flex items-center text-[10px] font-bold">
                    <button
                      onClick={() => setIndComp3Mode('daily')}
                      className={`px-3 py-1 rounded-full transition-all ${indComp3Mode === 'daily' ? 'bg-[#F25B22] text-white shadow-xs font-bold' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setIndComp3Mode('monthly')}
                      className={`px-3 py-1 rounded-full transition-all ${indComp3Mode === 'monthly' ? 'bg-[#F25B22] text-white shadow-xs font-bold' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      Monthly
                    </button>
                  </div>

                  <div className="flex items-center bg-[#F5F3EF] border border-stone-200/70 rounded-full px-3 py-1 text-xs">
                    <input
                      type={indComp3Mode === 'monthly' ? 'month' : 'date'}
                      value={indComp3DateFilter}
                      onChange={(e) => setIndComp3DateFilter(e.target.value)}
                      className="bg-transparent text-stone-800 text-xs font-mono outline-none cursor-pointer"
                    />
                    {indComp3DateFilter && (
                      <button onClick={() => setIndComp3DateFilter('')} className="ml-1 text-stone-400 hover:text-stone-700">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Team Leader Comparison Bar Chart */}
              {indComp3Data.length > 0 && (
                <div className="mb-4 p-3 bg-[#FAF9F6] rounded-2xl border border-stone-100">
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={indComp3Data.slice(0, 6)} barCategoryGap="25%" margin={{ top: 8, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE6DF" />
                        <XAxis dataKey="tl" interval={0} tick={{ fontSize: 9, fill: '#78716C' }} angle={-15} textAnchor="end" />
                        <YAxis tick={{ fontSize: 10, fill: '#78716C' }} />
                        <RechartsTooltip content={<CustomLightTooltip />} />
                        <Bar dataKey="count" barSize={18} radius={[6, 6, 0, 0]}>
                          {indComp3Data.slice(0, 6).map((_, index) => (
                            <Cell key={`ind3-cell-${index}`} fill={CHART_PALETTE[(index + 2) % CHART_PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-3">
                <div className="flex items-center bg-[#F5F3EF] border border-stone-200/70 rounded-full px-3.5 py-1.5 text-xs shadow-2xs">
                  <Search size={13} className="text-stone-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search TL or team..."
                    value={indComp3Search}
                    onChange={(e) => setIndComp3Search(e.target.value)}
                    className="bg-transparent text-stone-800 text-xs outline-none w-full"
                  />
                  {indComp3Search && (
                    <button onClick={() => setIndComp3Search('')} className="text-stone-400 hover:text-stone-700">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {indComp3Data.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs">No team records found.</div>
                ) : (
                  indComp3Data.map((item, idx) => {
                    const pct = Math.round((item.count / maxInd3) * 100);
                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-2xl bg-[#FAF9F6] border border-stone-200/60 hover:bg-white text-xs transition-all shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-stone-900">{item.tl}</span>
                            {item.tm && (
                              <>
                                <span className="text-stone-300">•</span>
                                <span className="text-stone-500 font-medium">{item.tm}</span>
                              </>
                            )}
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-[#F7E7F8] text-[#863E8C] border border-[#E8BFEC]">
                            {item.count}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-200/60 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#863E8C] to-[#A855F7] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>{indComp3Data.length} team application records</span>
              <span className="text-[#863E8C] font-bold">{indComp3Data.reduce((acc, c) => acc + c.count, 0)} total team volume</span>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
