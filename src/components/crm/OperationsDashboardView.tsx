import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Search, Filter, Clock, Users, Layers,
  ChevronDown, Briefcase, Shield, ArrowUpRight, CheckCircle2,
  AlertCircle, RefreshCw, FileText, X, FolderKanban, UserCheck,
  TrendingUp, BarChart3, ChevronRight, User
} from 'lucide-react';
import type { InternalOperationRecord, OperationStage } from '../../types/operations';
import { getOperationStagesForTeamType } from '../../types/operations';
import { getStoredInternalOperations, fetchInternalOperations } from '../../services/internalOperationsService';
import { parseAnyDateToMs } from '../../services/zohoRbacService';
import { useAuth } from '../../context/AuthContext';

// ============================================================================
// CONSTANTS & MAPPINGS
// ============================================================================

export type DashboardViewType = 'Group Homepage' | 'Individual Homepage';
export type DashboardTeamType = 'Funding' | 'Compliance' | 'Incorporation' | 'Certificate';

export const DASHBOARD_VIEW_OPTIONS: DashboardViewType[] = ['Group Homepage', 'Individual Homepage'];
export const DASHBOARD_TEAM_OPTIONS: DashboardTeamType[] = ['Funding', 'Compliance', 'Incorporation', 'Certificate'];

/**
 * Pendency Stage Mappings defined exactly as requested:
 * - Funding: ['document pending from client', 'Draft work in progress', 'Draft in review to client', 'Draft approved from client']
 * - Compliance: ['Document pending from client', 'Incorporation pending from client', 'Director ITR', 'Accounting', 'Audit', 'Company ITR', 'ADT1-PVT-LTD/Section8', 'INC 20A-PVT-LTD/Section8', 'Form3-LLP', 'DPT-3-PVT-LTD/Section8', 'AOC-4-PVT-LTD/Section8', 'MGT7-PVT-LTD/Section8', 'Form11-LLP', 'Form8-LLP']
 * - Incorporation: ['Document pending from client', 'name application filling', 'dsc creation', 'final filling', 'board resolution preparation', 'msme certificate', 'adt 1 filling - pvt-ltd/sec8', 'inc 201- pvt-ltd/sec8', 'form3 - llp']
 * - Certificate: ['document pending from client', 'dsc work in process', 'draft work in process', 'draft in review to client', 'draft approved from client']
 */
export const PENDENCY_STAGE_MAPPINGS: Record<DashboardTeamType, string[]> = {
  Funding: [
    'document pending from client',
    'Draft work in progress',
    'Draft in review to client',
    'Draft approved from client'
  ],
  Compliance: [
    'Document pending from client',
    'Incorporation pending from client',
    'Director ITR',
    'Accounting',
    'Audit',
    'Company ITR',
    'ADT1-PVT-LTD/Section8',
    'INC 20A-PVT-LTD/Section8',
    'Form3-LLP',
    'DPT-3-PVT-LTD/Section8',
    'AOC-4-PVT-LTD/Section8',
    'MGT7-PVT-LTD/Section8',
    'Form11-LLP',
    'Form8-LLP'
  ],
  Incorporation: [
    'Document pending from client',
    'name application filling',
    'dsc creation',
    'final filling',
    'board resolution preparation',
    'msme certificate',
    'adt 1 filling - pvt-ltd/sec8',
    'inc 201- pvt-ltd/sec8',
    'form3 - llp'
  ],
  Certificate: [
    'document pending from client',
    'dsc work in process',
    'draft work in process',
    'draft in review to client',
    'draft approved from client'
  ]
};

export const FILE_AGE_BUCKETS = [
  '0-31',
  '31-62',
  '62-93',
  '93-124',
  '124-155',
  '155-186',
  '186-217',
  'Others'
] as const;

export type FileAgeBucket = typeof FILE_AGE_BUCKETS[number];

/**
 * Normalizes text for comparison (removes non-alphanumeric, accounts for typos like filling/filing, process/progress)
 */
function normalizeStageName(str: string): string {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/filling/g, 'filing')
    .replace(/process/g, 'progress')
    .replace(/201/g, '20a')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Checks whether an operation record stage matches the pending array for the team type
 */
export function isRecordPendingForTeam(record: InternalOperationRecord, teamType: DashboardTeamType): boolean {
  const currentStage = String(record.Operation_Stage || record.Stage || '').trim();
  if (!currentStage) return false;

  const targetStages = PENDENCY_STAGE_MAPPINGS[teamType] || [];
  const normCurrent = normalizeStageName(currentStage);

  return targetStages.some(t => {
    if (t.toLowerCase() === currentStage.toLowerCase()) return true;
    return normalizeStageName(t) === normCurrent;
  });
}

/**
 * Determines which exact file age bucket an age in days falls into:
 * 0-31, 31-62, 62-93, 93-124, 124-155, 155-186, 186-217, Others
 */
export function getFileAgeBucket(ageInDays: number): FileAgeBucket {
  if (isNaN(ageInDays) || ageInDays < 0) return '0-31';
  if (ageInDays <= 31) return '0-31';
  if (ageInDays <= 62) return '31-62';
  if (ageInDays <= 93) return '62-93';
  if (ageInDays <= 124) return '93-124';
  if (ageInDays <= 155) return '124-155';
  if (ageInDays <= 186) return '155-186';
  if (ageInDays <= 217) return '186-217';
  return 'Others';
}

/**
 * Format a timestamp/ISO string to DD-MMM-YYYY or DD/MM/YYYY
 */
function formatDateDisplay(rawDate?: string | number | null): string {
  if (!rawDate) return '-';
  const ms = typeof rawDate === 'number' ? rawDate : parseAnyDateToMs(rawDate);
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonthYearDisplay(rawDate?: string | number | null): string {
  if (!rawDate) return 'Unknown Month';
  const ms = typeof rawDate === 'number' ? rawDate : parseAnyDateToMs(rawDate);
  if (!ms) return 'Unknown Month';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const OperationsDashboardView: React.FC = () => {
  const { currentUser, isSuperAdmin, isOperationsHOD, isLegalHOD } = useAuth();

  // 1. Top-Level UI Controls State
  const [viewType, setViewType] = useState<DashboardViewType>('Group Homepage');
  const [teamType, setTeamType] = useState<DashboardTeamType>('Funding');

  // Filter states for individual components
  const [comp1DateFilter, setComp1DateFilter] = useState<string>(''); // YYYY-MM or YYYY-MM-DD
  const [comp2DateFilter, setComp2DateFilter] = useState<string>('');
  const [comp7DateFilter, setComp7DateFilter] = useState<string>('');
  const [comp8SearchQuery, setComp8SearchQuery] = useState<string>('');

  // Data states
  const [records, setRecords] = useState<InternalOperationRecord[]>(() => getStoredInternalOperations());
  const [dealsMap, setDealsMap] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Load Deals lookup map to enrich Booking Date & Project Assign Date
  const loadDealsLookup = () => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const map: Record<string, any> = {};
          parsed.forEach((d: any) => {
            if (d.id) map[String(d.id).toLowerCase()] = d;
            if (d.zohoId) map[String(d.zohoId).toLowerCase()] = d;
            if (d.name) map[String(d.name).toLowerCase()] = d;
          });
          setDealsMap(map);
        }
      }
    } catch (_) {}
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      loadDealsLookup();
      const fresh = await fetchInternalOperations();
      setRecords(fresh);
      setLastRefreshed(new Date());
    } catch (err) {
      console.warn('[OperationsDashboardView] Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => {
      setRecords(getStoredInternalOperations());
      loadDealsLookup();
    };
    window.addEventListener('be_internal_operations_updated', handleUpdate);
    return () => window.removeEventListener('be_internal_operations_updated', handleUpdate);
  }, []);

  // Helper to extract Project Assign Date from record or parent deal
  const getProjectAssignDate = (r: InternalOperationRecord): { raw: string; ms: number | null } => {
    const parentDeal = r.Deal_ID ? dealsMap[String(r.Deal_ID).toLowerCase()] : null;
    const raw =
      (r as any).Project_assign_Date ||
      (r as any).Projects_assign_date ||
      r.Allocated_At ||
      parentDeal?.Project_assign_Date ||
      parentDeal?.Projects_assign_date ||
      r.Created_Time ||
      parentDeal?.Booking_Date ||
      '';

    const ms = raw ? parseAnyDateToMs(raw) : null;
    return { raw, ms };
  };

  // Helper to extract Booking Date from parent deal or record
  const getBookingDate = (r: InternalOperationRecord): { raw: string; ms: number | null } => {
    const parentDeal = r.Deal_ID ? dealsMap[String(r.Deal_ID).toLowerCase()] : null;
    const raw =
      parentDeal?.Booking_Date ||
      (r as any).Booking_Date ||
      parentDeal?.Payment_Date ||
      parentDeal?.Closing_Date ||
      parentDeal?.Created_Time ||
      r.Created_Time ||
      '';

    const ms = raw ? parseAnyDateToMs(raw) : null;
    return { raw, ms };
  };

  // Helper to get or calculate File Age in days
  const getRecordFileAge = (r: InternalOperationRecord): number => {
    if ((r as any).File_Age !== undefined && !isNaN(Number((r as any).File_Age))) {
      return Number((r as any).File_Age);
    }
    if ((r as any).file_age !== undefined && !isNaN(Number((r as any).file_age))) {
      return Number((r as any).file_age);
    }
    const assignInfo = getProjectAssignDate(r);
    if (assignInfo.ms) {
      const diffMs = Date.now() - assignInfo.ms;
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
    return 0;
  };

  // --------------------------------------------------------------------------
  // DYNAMIC FILTERING BY TEAM TYPE
  // --------------------------------------------------------------------------
  const teamFilteredRecords = useMemo(() => {
    const teamTarget = teamType.toLowerCase();
    return records.filter(r => {
      const t = String(r.Team_Type || r.Internal_Team_Type || '').toLowerCase();
      if (teamTarget === 'funding') return t.includes('funding');
      if (teamTarget === 'compliance') return t.includes('compliance');
      if (teamTarget === 'incorporation') return t.includes('incorporation');
      if (teamTarget === 'certificate') return t.includes('certif');
      return true;
    });
  }, [records, teamType]);

  // Overall quick stats
  const totalTeamRecords = teamFilteredRecords.length;
  const pendingCasesCount = useMemo(() => {
    return teamFilteredRecords.filter(r => isRecordPendingForTeam(r, teamType)).length;
  }, [teamFilteredRecords, teamType]);

  // Distinct TL and TM counts
  const distinctTLsCount = useMemo(() => {
    const set = new Set<string>();
    teamFilteredRecords.forEach(r => {
      const name = r.Team_Leader_Name || r.Team_Leader?.name;
      if (name) set.add(name.trim());
    });
    return set.size;
  }, [teamFilteredRecords]);

  const distinctTMsCount = useMemo(() => {
    const set = new Set<string>();
    teamFilteredRecords.forEach(r => {
      const name = r.Team_Member_Name || r.Team_Member?.name;
      if (name) set.add(name.trim());
    });
    return set.size;
  }, [teamFilteredRecords]);

  // ==========================================================================
  // COMPONENT 1: Stage-wise record counts
  // Columns: Operation stages | Record counts | Project Assign date
  // Filter: Calendar/Date-picker icon to filter by Date/Month
  // ==========================================================================
  const comp1Data = useMemo(() => {
    let filtered = teamFilteredRecords;

    if (comp1DateFilter) {
      filtered = filtered.filter(r => {
        const { ms } = getProjectAssignDate(r);
        if (!ms) return false;
        const d = new Date(ms);
        const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const yyyyMmDd = `${yyyyMm}-${String(d.getDate()).padStart(2, '0')}`;
        return comp1DateFilter.length === 7 ? yyyyMm === comp1DateFilter : yyyyMmDd === comp1DateFilter;
      });
    }

    const stagesForTeam = getOperationStagesForTeamType(teamType);
    const map = new Map<string, { count: number; assignDates: number[] }>();

    // Initialize all canonical stages for this team type
    stagesForTeam.forEach(stg => {
      map.set(stg, { count: 0, assignDates: [] });
    });

    filtered.forEach(r => {
      const stage = (r.Operation_Stage || r.Stage || 'Document pending from client') as string;
      const { ms } = getProjectAssignDate(r);

      // Find matching stage or add
      const existing = map.get(stage);
      if (existing) {
        existing.count += 1;
        if (ms) existing.assignDates.push(ms);
      } else {
        map.set(stage, { count: 1, assignDates: ms ? [ms] : [] });
      }
    });

    return Array.from(map.entries()).map(([stage, info]) => {
      const latestDateMs = info.assignDates.length > 0 ? Math.max(...info.assignDates) : null;
      return {
        stage,
        count: info.count,
        latestDateDisplay: formatDateDisplay(latestDateMs),
        rawLatestDateMs: latestDateMs
      };
    });
  }, [teamFilteredRecords, teamType, comp1DateFilter, dealsMap]);

  // ==========================================================================
  // COMPONENT 2: File ageing record counts
  // Logic: Group records by the File Age into exact buckets:
  // 0-31, 31-62, 62-93, 93-124, 124-155, 155-186, 186-217, Others
  // Columns: File ageing (bucket) | Record counts | Project Assign date
  // Filter: Calendar/Date-picker icon to filter by Date/Month
  // ==========================================================================
  const comp2Data = useMemo(() => {
    let filtered = teamFilteredRecords;

    if (comp2DateFilter) {
      filtered = filtered.filter(r => {
        const { ms } = getProjectAssignDate(r);
        if (!ms) return false;
        const d = new Date(ms);
        const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const yyyyMmDd = `${yyyyMm}-${String(d.getDate()).padStart(2, '0')}`;
        return comp2DateFilter.length === 7 ? yyyyMm === comp2DateFilter : yyyyMmDd === comp2DateFilter;
      });
    }

    const map = new Map<FileAgeBucket, { count: number; assignDates: number[] }>();
    FILE_AGE_BUCKETS.forEach(b => map.set(b, { count: 0, assignDates: [] }));

    filtered.forEach(r => {
      const age = getRecordFileAge(r);
      const bucket = getFileAgeBucket(age);
      const { ms } = getProjectAssignDate(r);

      const entry = map.get(bucket)!;
      entry.count += 1;
      if (ms) entry.assignDates.push(ms);
    });

    return FILE_AGE_BUCKETS.map(bucket => {
      const entry = map.get(bucket)!;
      const latestDateMs = entry.assignDates.length > 0 ? Math.max(...entry.assignDates) : null;
      return {
        bucket,
        count: entry.count,
        latestDateDisplay: formatDateDisplay(latestDateMs)
      };
    });
  }, [teamFilteredRecords, comp2DateFilter, dealsMap]);

  // ==========================================================================
  // COMPONENT 3: Pending cases by Employee
  // Logic: ONLY include records where Operation Stage matches the active
  // Team Type's "Pendency" array.
  // Columns: Team Leader (TL) | Team Member (TM - grouped under their TL) | Record counts
  // ==========================================================================
  const comp3Data = useMemo(() => {
    const pendingRecords = teamFilteredRecords.filter(r => isRecordPendingForTeam(r, teamType));

    // Group by TL -> TM
    const tlMap = new Map<string, Map<string, number>>();

    pendingRecords.forEach(r => {
      const tl = (r.Team_Leader_Name || r.Team_Leader?.name || 'Unassigned TL').trim();
      const tm = (r.Team_Member_Name || r.Team_Member?.name || 'Unassigned TM').trim();

      if (!tlMap.has(tl)) {
        tlMap.set(tl, new Map<string, number>());
      }
      const tmMap = tlMap.get(tl)!;
      tmMap.set(tm, (tmMap.get(tm) || 0) + 1);
    });

    const rows: { tl: string; tm: string; count: number; isTlTotal?: boolean }[] = [];

    Array.from(tlMap.entries()).forEach(([tl, tmMap]) => {
      let tlTotal = 0;
      Array.from(tmMap.entries()).forEach(([tm, count]) => {
        tlTotal += count;
        rows.push({ tl, tm, count });
      });
    });

    return rows;
  }, [teamFilteredRecords, teamType]);

  // ==========================================================================
  // COMPONENT 4: Ageing count TM-wise
  // Columns: File ageing (use the same 8 buckets) | Record counts | Team Member (TM)
  // ==========================================================================
  const comp4Data = useMemo(() => {
    // Breakdown by Bucket and TM
    const map = new Map<string, { bucket: FileAgeBucket; tm: string; count: number }>();

    teamFilteredRecords.forEach(r => {
      const age = getRecordFileAge(r);
      const bucket = getFileAgeBucket(age);
      const tm = (r.Team_Member_Name || r.Team_Member?.name || 'Unassigned TM').trim();
      const key = `${bucket}___${tm}`;

      if (!map.has(key)) {
        map.set(key, { bucket, tm, count: 0 });
      }
      map.get(key)!.count += 1;
    });

    // Sort by bucket order first, then count descending
    return Array.from(map.values()).sort((a, b) => {
      const bIdxA = FILE_AGE_BUCKETS.indexOf(a.bucket);
      const bIdxB = FILE_AGE_BUCKETS.indexOf(b.bucket);
      if (bIdxA !== bIdxB) return bIdxA - bIdxB;
      return b.count - a.count;
    });
  }, [teamFilteredRecords, dealsMap]);

  // ==========================================================================
  // COMPONENT 5: Pending cases by TL and Scheme
  // Logic: Filter using Pendency array
  // Columns: Team Leader (TL) | Scheme (Services) | Record counts
  // ==========================================================================
  const comp5Data = useMemo(() => {
    const pendingRecords = teamFilteredRecords.filter(r => isRecordPendingForTeam(r, teamType));
    const map = new Map<string, { tl: string; scheme: string; count: number }>();

    pendingRecords.forEach(r => {
      const tl = (r.Team_Leader_Name || r.Team_Leader?.name || 'Unassigned TL').trim();
      const scheme = (r.Service_Scheme || r.Name || 'General Service').trim();
      const key = `${tl}___${scheme}`;

      if (!map.has(key)) {
        map.set(key, { tl, scheme, count: 0 });
      }
      map.get(key)!.count += 1;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.tl !== b.tl) return a.tl.localeCompare(b.tl);
      return b.count - a.count;
    });
  }, [teamFilteredRecords, teamType]);

  // ==========================================================================
  // COMPONENT 6: All-over Pending cases Scheme-wise
  // Logic: Filter using Pendency array
  // Columns: Scheme (Services) | Record counts
  // ==========================================================================
  const comp6Data = useMemo(() => {
    const pendingRecords = teamFilteredRecords.filter(r => isRecordPendingForTeam(r, teamType));
    const map = new Map<string, number>();

    pendingRecords.forEach(r => {
      const scheme = (r.Service_Scheme || r.Name || 'General Service').trim();
      map.set(scheme, (map.get(scheme) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([scheme, count]) => ({ scheme, count }))
      .sort((a, b) => b.count - a.count);
  }, [teamFilteredRecords, teamType]);

  // ==========================================================================
  // COMPONENT 7: Month/Year Pending cases
  // Logic: Filter using Pendency array. Group Project Assign date by Month/Year
  // Columns: Team Member (TM) | Project Assign date (Month-wise) | Booking Date | Scheme (Services) | Record counts
  // Filter: Calendar/Date-picker icon at top to filter by Date/Month
  // ==========================================================================
  const comp7Data = useMemo(() => {
    let pendingRecords = teamFilteredRecords.filter(r => isRecordPendingForTeam(r, teamType));

    if (comp7DateFilter) {
      pendingRecords = pendingRecords.filter(r => {
        const { ms } = getProjectAssignDate(r);
        if (!ms) return false;
        const d = new Date(ms);
        const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const yyyyMmDd = `${yyyyMm}-${String(d.getDate()).padStart(2, '0')}`;
        return comp7DateFilter.length === 7 ? yyyyMm === comp7DateFilter : yyyyMmDd === comp7DateFilter;
      });
    }

    const map = new Map<string, {
      tm: string;
      assignMonth: string;
      bookingDateDisplay: string;
      scheme: string;
      count: number;
    }>();

    pendingRecords.forEach(r => {
      const tm = (r.Team_Member_Name || r.Team_Member?.name || 'Unassigned TM').trim();
      const assignInfo = getProjectAssignDate(r);
      const assignMonth = formatMonthYearDisplay(assignInfo.ms);
      const bookingInfo = getBookingDate(r);
      const bookingDateDisplay = formatDateDisplay(bookingInfo.ms);
      const scheme = (r.Service_Scheme || r.Name || 'General Service').trim();

      const key = `${tm}___${assignMonth}___${bookingDateDisplay}___${scheme}`;
      if (!map.has(key)) {
        map.set(key, { tm, assignMonth, bookingDateDisplay, scheme, count: 0 });
      }
      map.get(key)!.count += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [teamFilteredRecords, teamType, comp7DateFilter, dealsMap]);

  // ==========================================================================
  // COMPONENT 8: Scheme booking current month
  // Columns: Scheme (Services) names | Record counts
  // Filter: Search bar/icon at top to filter table by Scheme name
  // ==========================================================================
  const comp8Data = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Filter records booked or assigned in the current calendar month
    const monthRecords = teamFilteredRecords.filter(r => {
      const bInfo = getBookingDate(r);
      const aInfo = getProjectAssignDate(r);
      const targetMs = bInfo.ms || aInfo.ms;
      if (!targetMs) return false;
      const d = new Date(targetMs);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    const map = new Map<string, number>();
    monthRecords.forEach(r => {
      const scheme = (r.Service_Scheme || r.Name || 'General Service').trim();
      map.set(scheme, (map.get(scheme) || 0) + 1);
    });

    let list = Array.from(map.entries()).map(([scheme, count]) => ({ scheme, count }));

    if (comp8SearchQuery.trim()) {
      const q = comp8SearchQuery.trim().toLowerCase();
      list = list.filter(item => item.scheme.toLowerCase().includes(q));
    }

    return list.sort((a, b) => b.count - a.count);
  }, [teamFilteredRecords, comp8SearchQuery, dealsMap]);

  const currentMonthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // --------------------------------------------------------------------------
  // RENDER: INDIVIDUAL HOMEPAGE PLACEHOLDER (when toggled)
  // --------------------------------------------------------------------------
  if (viewType === 'Individual Homepage') {
    return (
      <div className="space-y-6">
        {/* Top Controls Bar */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-be-orange to-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-orange-500/20">
              <UserCheck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Operations Individual Homepage</h1>
              <p className="text-xs text-gray-500 font-medium">Personal workload, individual execution tracking & delegated cases</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Switcher Dropdown */}
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2">View:</span>
              <select
                value={viewType}
                onChange={(e) => setViewType(e.target.value as DashboardViewType)}
                className="bg-transparent text-xs font-bold text-gray-900 outline-none cursor-pointer"
              >
                {DASHBOARD_VIEW_OPTIONS.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Team Type Dropdown */}
            <div className="flex items-center bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5">
              <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider mr-2">Team:</span>
              <select
                value={teamType}
                onChange={(e) => setTeamType(e.target.value as DashboardTeamType)}
                className="bg-transparent text-xs font-bold text-be-orange outline-none cursor-pointer"
              >
                {DASHBOARD_TEAM_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Individual Content Banner */}
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <User size={32} />
          </div>
          <h2 className="text-xl font-black text-gray-900">Individual Homepage Workspace</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            You are viewing the Individual Homepage view for <strong>{currentUser?.name || 'User'}</strong> ({teamType}).
            Switch to <strong>Group Homepage</strong> in the top dropdown to view all 8 HOD department widgets.
          </p>
          <div>
            <button
              onClick={() => setViewType('Group Homepage')}
              className="px-5 py-2.5 bg-gradient-to-r from-be-orange to-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-700 transition-all cursor-pointer"
            >
              Open Group Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: GROUP HOMEPAGE DASHBOARD (Full Implementation)
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* 1. GLOBAL DASHBOARD CONTROLS (State & UI) */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/5 to-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-be-orange to-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-orange-500/25">
                <Layers size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                    Operations HOD Dashboard
                  </h1>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-orange-100 text-be-orange border border-orange-200">
                    Group Homepage
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Team: {teamType}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-medium mt-1">
                  Executive operational workload monitor, pending file stages, ageing buckets, and scheme bookings for <strong>{teamType}</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Top-Level Controls: Dashboard View Dropdown & Team Type Dropdown */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Control 1: Dashboard View Dropdown */}
            <div className="flex flex-col">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">
                Dashboard View
              </label>
              <div className="relative">
                <select
                  value={viewType}
                  onChange={(e) => setViewType(e.target.value as DashboardViewType)}
                  className="appearance-none pl-3.5 pr-8 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none transition-all cursor-pointer shadow-2xs"
                >
                  {DASHBOARD_VIEW_OPTIONS.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Control 2: Team Type Dropdown */}
            <div className="flex flex-col">
              <label className="text-[10px] font-black uppercase text-orange-600 tracking-wider mb-1">
                Team Type
              </label>
              <div className="relative">
                <select
                  value={teamType}
                  onChange={(e) => setTeamType(e.target.value as DashboardTeamType)}
                  className="appearance-none pl-3.5 pr-8 py-2 bg-orange-50 hover:bg-orange-100/70 border border-orange-200 rounded-xl text-xs font-black text-be-orange outline-none transition-all cursor-pointer shadow-2xs"
                >
                  {DASHBOARD_TEAM_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-orange-400 pointer-events-none" />
              </div>
            </div>

            {/* Refresh Button */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-transparent select-none mb-1">Action</span>
              <button
                onClick={loadData}
                disabled={isLoading}
                title="Refresh Live Operations Data"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin text-be-orange' : 'text-gray-500'} />
                <span>Sync</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-gray-100 relative z-10">
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Active Cases</span>
            <span className="text-xl font-black text-gray-900 tracking-tight">{totalTeamRecords}</span>
            <span className="text-[10px] text-gray-500 block mt-0.5">Team: {teamType}</span>
          </div>
          <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-100">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Total Pending Cases</span>
            <span className="text-xl font-black text-amber-900 tracking-tight">{pendingCasesCount}</span>
            <span className="text-[10px] text-amber-700 block mt-0.5">{totalTeamRecords > 0 ? Math.round((pendingCasesCount / totalTeamRecords) * 100) : 0}% of all cases</span>
          </div>
          <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-100">
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Team Leaders</span>
            <span className="text-xl font-black text-blue-900 tracking-tight">{distinctTLsCount}</span>
            <span className="text-[10px] text-blue-600 block mt-0.5">Supervising execution</span>
          </div>
          <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-100">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Team Members</span>
            <span className="text-xl font-black text-emerald-900 tracking-tight">{distinctTMsCount}</span>
            <span className="text-[10px] text-emerald-600 block mt-0.5">Active executors</span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. GROUP HOMEPAGE 8 COMPONENTS GRID */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ----------------------------------------------------------------- */}
        {/* COMP 1: Stage-wise record counts */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-orange-50 text-be-orange rounded-xl">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Stage-wise Record Counts</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Operation stages and assignment timing</p>
                </div>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
                  <Calendar size={13} className="text-gray-400 mr-1.5 shrink-0" />
                  <input
                    type="month"
                    value={comp1DateFilter}
                    onChange={(e) => setComp1DateFilter(e.target.value)}
                    className="bg-transparent text-xs text-gray-700 font-semibold outline-none cursor-pointer"
                    title="Filter by Project Assign Date Month"
                  />
                  {comp1DateFilter && (
                    <button
                      onClick={() => setComp1DateFilter('')}
                      className="ml-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                      title="Clear date filter"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">Operation Stages</th>
                    <th className="px-3.5 py-2.5 text-center">Record Counts</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Project Assign Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp1Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-orange-50/40 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-800">
                        {row.stage}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black ${
                          row.count > 0 ? 'bg-orange-50 text-be-orange border border-orange-200' : 'text-gray-400'
                        }`}>
                          {row.count}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-gray-500">
                        {row.latestDateDisplay}
                      </td>
                    </tr>
                  ))}
                  {comp1Data.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-xs text-gray-400">
                        No stage records found for {teamType}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Total Stages: {comp1Data.length}</span>
            <span>Total Records: {comp1Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 2: File ageing record counts */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">File Ageing Record Counts</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Standardized 31-day age buckets</p>
                </div>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
                  <Calendar size={13} className="text-gray-400 mr-1.5 shrink-0" />
                  <input
                    type="month"
                    value={comp2DateFilter}
                    onChange={(e) => setComp2DateFilter(e.target.value)}
                    className="bg-transparent text-xs text-gray-700 font-semibold outline-none cursor-pointer"
                    title="Filter by Project Assign Date Month"
                  />
                  {comp2DateFilter && (
                    <button
                      onClick={() => setComp2DateFilter('')}
                      className="ml-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                      title="Clear date filter"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">File Ageing (Bucket)</th>
                    <th className="px-3.5 py-2.5 text-center">Record Counts</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Project Assign Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp2Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span>{row.bucket} Days</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black ${
                          row.count > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'text-gray-400'
                        }`}>
                          {row.count}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-gray-500">
                        {row.latestDateDisplay}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Buckets: {comp2Data.length}</span>
            <span>Total Aged Records: {comp2Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 3: Pending cases by Employee */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Pending Cases by Employee</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Team Member grouped under Team Leader</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200">
                Filtered: Pendency Only
              </span>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">Team Leader (TL)</th>
                    <th className="px-3.5 py-2.5">Team Member (TM)</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Record Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp3Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-900">
                        {row.tl}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-gray-700">
                        {row.tm}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {comp3Data.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-xs text-gray-400">
                        No pending cases found for {teamType}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Distinct Rows: {comp3Data.length}</span>
            <span>Total Pending: {comp3Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 4: Ageing count TM-wise */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Ageing Count TM-wise</h3>
                  <p className="text-[11px] text-gray-500 font-medium">File ageing buckets per Team Member</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full">
                8 Standard Buckets
              </span>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">File Ageing</th>
                    <th className="px-3.5 py-2.5 text-center">Record Counts</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Team Member (TM)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp4Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-800">
                        {row.bucket} Days
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {row.count}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-gray-900">
                        {row.tm}
                      </td>
                    </tr>
                  ))}
                  {comp4Data.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-xs text-gray-400">
                        No ageing records found for {teamType}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Breakdowns: {comp4Data.length}</span>
            <span>Total Aged: {comp4Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 5: Pending cases by TL and Scheme */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Pending Cases by TL & Scheme</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Team Leader distribution across active services</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                Filtered: Pendency Only
              </span>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">Team Leader (TL)</th>
                    <th className="px-3.5 py-2.5">Scheme (Services)</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Record Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp5Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-900">
                        {row.tl}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-gray-700">
                        {row.scheme}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {comp5Data.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-xs text-gray-400">
                        No pending cases by TL & Scheme found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Distinct Rows: {comp5Data.length}</span>
            <span>Total Pending: {comp5Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 6: All-over Pending cases Scheme-wise */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <FolderKanban size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">All-over Pending Cases Scheme-wise</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Departmental backlog summary by service/scheme</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-full border border-purple-200">
                Filtered: Pendency Only
              </span>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">Scheme (Services)</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Record Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp6Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-800">
                        {row.scheme}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {comp6Data.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-xs text-gray-400">
                        No pending scheme cases found for {teamType}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Total Schemes: {comp6Data.length}</span>
            <span>Total Backlog: {comp6Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 7: Month/Year Pending cases */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between lg:col-span-2">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Month/Year Pending Cases</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Pending cases timeline grouped by Project Assign month</p>
                </div>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
                  <Calendar size={13} className="text-gray-400 mr-1.5 shrink-0" />
                  <input
                    type="month"
                    value={comp7DateFilter}
                    onChange={(e) => setComp7DateFilter(e.target.value)}
                    className="bg-transparent text-xs text-gray-700 font-semibold outline-none cursor-pointer"
                    title="Filter by Project Assign Date Month"
                  />
                  {comp7DateFilter && (
                    <button
                      onClick={() => setComp7DateFilter('')}
                      className="ml-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                      title="Clear date filter"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">Team Member (TM)</th>
                    <th className="px-3.5 py-2.5">Project Assign Date (Month-wise)</th>
                    <th className="px-3.5 py-2.5">Booking Date</th>
                    <th className="px-3.5 py-2.5">Scheme (Services)</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Record Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp7Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-rose-50/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-900">
                        {row.tm}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-rose-700">
                        {row.assignMonth}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-600 font-medium">
                        {row.bookingDateDisplay}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-gray-700">
                        {row.scheme}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {comp7Data.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                        No pending month records found for {teamType}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Total Combinations: {comp7Data.length}</span>
            <span>Total Pending: {comp7Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* COMP 8: Scheme booking current month */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex flex-col justify-between lg:col-span-2">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Scheme Booking Current Month ({currentMonthName})</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Services booked in the current calendar month</p>
                </div>
              </div>

              {/* Search Bar / Icon */}
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 w-full sm:w-72">
                <Search size={14} className="text-gray-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search scheme name..."
                  value={comp8SearchQuery}
                  onChange={(e) => setComp8SearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-gray-800 placeholder-gray-400 outline-none w-full font-medium"
                />
                {comp8SearchQuery && (
                  <button
                    onClick={() => setComp8SearchQuery('')}
                    className="ml-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/80 sticky top-0 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 rounded-l-xl">Scheme (Services) Names</th>
                    <th className="px-3.5 py-2.5 rounded-r-xl text-right">Record Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {comp8Data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-teal-50/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-800">
                        {row.scheme}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-50 text-teal-700 border border-teal-200">
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {comp8Data.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-xs text-gray-400">
                        No bookings found for {teamType} in {currentMonthName}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-semibold">
            <span>Booked Schemes: {comp8Data.length}</span>
            <span>Month Bookings Total: {comp8Data.reduce((sum, r) => sum + r.count, 0)}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OperationsDashboardView;
