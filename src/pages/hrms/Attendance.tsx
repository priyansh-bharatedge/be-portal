import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import {
  Search,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Info,
  RefreshCw,
  Loader2,
  Cloud,
  X,
  Plus,
  Edit3,
  Download,
  Check,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  UserCheck,
  UserX,
  AlertTriangle,
  ArrowUpDown,
  Send,
  CalendarDays,
  Layers,
  User,
  History,
  FileSpreadsheet,
  Grid,
  List,
  BarChart3,
  Sparkles,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import {
  fetchZohoAttendance,
  saveOrUpdateZohoAttendance,
  deleteZohoAttendance,
  formatAttendanceTime,
  formatAttendanceDuration,
  parsePunchesTimeline,
  type ZohoAttendanceRecord,
  type ZohoAttendancePayload
} from '../../services/zohoService';


// ── Safe localStorage helper ─────────────────────────────────────────────────
// Keeps only the latest MAX_STORED_DAYS days of records to prevent QuotaExceededError.
const MAX_STORED_DAYS = 180;
function saveAttendanceSafely(records: AttendanceItem[]): void {
  try {
    // Trim to most recent MAX_STORED_DAYS unique dates
    const uniqueDates = [...new Set(records.map(r => r.date).filter(Boolean))]
      .sort()
      .reverse()
      .slice(0, MAX_STORED_DAYS);
    const dateSet = new Set(uniqueDates);
    const trimmed = records.filter(r => dateSet.has(r.date));
    localStorage.setItem('be_attendance', JSON.stringify(trimmed));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      console.warn('[Attendance] localStorage quota exceeded — clearing old data and retrying.');
      try {
        // Emergency: keep only last 30 days
        const last30 = [...new Set(records.map(r => r.date).filter(Boolean))]
          .sort()
          .reverse()
          .slice(0, 30);
        const dateSet30 = new Set(last30);
        const minimal = records.filter(r => dateSet30.has(r.date));
        localStorage.setItem('be_attendance', JSON.stringify(minimal));
      } catch {
        // If still failing, clear the key entirely to unblock the app
        console.error('[Attendance] Could not save even minimal data — clearing storage key.');
        localStorage.removeItem('be_attendance');
      }
    } else {
      console.error('[Attendance] localStorage write error:', err);
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceItem {
  id: string;
  zohoId?: string;
  name: string;
  empId: string;
  empName: string;
  date: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'Late' | 'On Duty' | 'Leave';
  punchStatus: 'Complete' | 'Single Punch' | 'Incomplete' | 'Absent' | string;
  punchCount: number;
  firstIn?: string;
  lastOut?: string;
  punches?: string;
  lateMinutes: number;
  earlyOutMinutes: number;
  totalMinutes: number;
  department?: string;
  email?: string;
  ownerName?: string;
  raw?: any;
}

export const Attendance = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { currentUser, isTM, isSuperAdmin, isHR, isTL, isHOD } = useAuth();
  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isAllDates, setIsAllDates] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || location.state?.search || '');
  const [statusFilter, setStatusFilter] = useState(() => {
    const s = searchParams.get('status') || location.state?.status;
    if (s && s !== 'ALL') return s;
    return 'ALL';
  });
  const [punchFilter, setPunchFilter] = useState('ALL');
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);

  useEffect(() => {
    const s = searchParams.get('status') || location.state?.status;
    if (s) setStatusFilter(s);
    const q = searchParams.get('search') || location.state?.search;
    if (q) setSearchQuery(q);
  }, [searchParams, location.state]);

  // Edit / Log Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Partial<AttendanceItem> | null>(null);

  // Employee Detail History View State (Opens when clicking any employee)
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string | null>(null);
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>('ALL');
  const [historyYearFilter, setHistoryYearFilter] = useState<string>('ALL');
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'calendar'>('table');
  const [historySearch, setHistorySearch] = useState('');

  const canMarkAttendance = isSuperAdmin || isHR;
  const isFullAdmin = isSuperAdmin || isHR;
  const isTeamLead = !isFullAdmin && (isTL || currentUser.role === 'TL');

  // Employee list from local storage
  const allEmployees = useMemo(() => {
    try {
      const emps = localStorage.getItem('be_employees');
      return emps ? JSON.parse(emps) : [];
    } catch {
      return [];
    }
  }, []);

  // Employee lookup map for fast name & dept resolution
  const employeeMap = useMemo(() => {
    const map = new Map<string, any>();
    allEmployees.forEach((emp: any) => {
      if (emp.id) map.set(String(emp.id).toLowerCase(), emp);
      if (emp.empId) map.set(String(emp.empId).toLowerCase(), emp);
      if (emp.Employment_ID) map.set(String(emp.Employment_ID).toLowerCase(), emp);
      if (emp.Employee_Code) map.set(String(emp.Employee_Code).toLowerCase(), emp);
      if (emp.formData?.employmentId) map.set(String(emp.formData.employmentId).toLowerCase(), emp);
      if (emp.formData?.employeeId) map.set(String(emp.formData.employeeId).toLowerCase(), emp);
    });
    return map;
  }, [allEmployees]);

  // Load from local storage and sync with Zoho
  const loadLocalAttendance = (): AttendanceItem[] => {
    try {
      const saved = localStorage.getItem('be_attendance');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeRecord);
        }
      }
    } catch (e) {
      console.error('Error reading local attendance:', e);
    }
    return [];
  };

  const normalizeRecord = (item: any): AttendanceItem => {
    const empCode = String(item.Employee_Code || item.empId || (item.Name ? item.Name.split(' - ')[0] : 'EMP')).trim();
    const attDate = String(item.Attendance_Date || item.date || (item.Name && item.Name.includes(' - ') ? item.Name.split(' - ')[1] : new Date().toISOString().split('T')[0])).trim();
    const name = item.Name || item.name || `${empCode} - ${attDate}`;
    
    // Resolve employee name from employeeMap or item
    const matchedEmp = employeeMap.get(empCode.toLowerCase());
    const empName = matchedEmp?.name || (item.Employee && item.Employee.name) || item.empName || `Employee ${empCode}`;
    const department = matchedEmp?.department || matchedEmp?.formData?.department || item.department || '';
    const email = matchedEmp?.email || matchedEmp?.formData?.email || item.Email || item.email || '';
    
    let status: AttendanceItem['status'] = 'Present';
    const markAtt = item.Mark_Attendance || item.status || '';
    if (markAtt === 'Absent') status = 'Absent';
    else if (markAtt === 'Half Day') status = 'Half Day';
    else if (markAtt === 'On Duty') status = 'On Duty';
    else if (markAtt === 'Leave') status = 'Leave';
    else if (markAtt === 'Late' || (Number(item.Late_Minutes || item.lateMinutes || 0) > 15)) status = 'Late';
    else status = 'Present';

    const lateMin = Number(item.Late_Minutes ?? item.lateMinutes ?? 0);
    const earlyOutMin = Number(item.Early_Out_Minutes ?? item.earlyOutMinutes ?? 0);
    const totalMin = Number(item.Total_Minutes ?? item.totalMinutes ?? 0);
    const punchCount = Number(item.Punch_Count ?? item.punchCount ?? (item.Last_Out || item.lastOut ? 2 : (item.First_In || item.firstIn ? 1 : 0)));
    const punchStat = item.Punch_Status || item.punchStatus || (punchCount >= 2 ? 'Complete' : punchCount === 1 ? 'Single Punch' : 'Incomplete');

    return {
      id: item.id ? String(item.id) : `ATT-${empCode}-${attDate}`,
      zohoId: item.zohoId || (item.id && /^\d+$/.test(String(item.id)) ? String(item.id) : undefined),
      name,
      empId: empCode,
      empName,
      date: attDate,
      status,
      punchStatus: punchStat,
      punchCount,
      firstIn: item.First_In || item.firstIn || undefined,
      lastOut: item.Last_Out || item.lastOut || undefined,
      punches: item.Punches || item.punches || '',
      lateMinutes: lateMin,
      earlyOutMinutes: earlyOutMin,
      totalMinutes: totalMin,
      department,
      email,
      ownerName: item.Owner?.name || item.ownerName || '',
      raw: item
    };
  };

  const handleFetchAttendance = async (showNotification = true, forceAll = true) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoAttendance({ fetch_all: forceAll });

      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const fetchedItems: AttendanceItem[] = res.data.map(normalizeRecord);

        setRecords(prev => {
          const keyMap = new Map<string, AttendanceItem>();
          prev.forEach(item => {
            const key = `${item.empId}_${item.date}`;
            keyMap.set(key, item);
          });
          fetchedItems.forEach(item => {
            const key = `${item.empId}_${item.date}`;
            keyMap.set(key, item);
          });

          const merged = Array.from(keyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
          saveAttendanceSafely(merged);
          return merged;
        });

        // Smart default: If selectedDate has no records or today has no records, select the latest date with records
        const uniqueDates = [...new Set(fetchedItems.map(r => r.date).filter(Boolean))].sort().reverse();
        if (uniqueDates.length > 0) {
          setSelectedDate(prev => {
            const hasPrev = fetchedItems.some(r => r.date === prev);
            return hasPrev ? prev : uniqueDates[0];
          });
        }

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Synced ${res.data.length} Attendance Records`,
            submessage: `Found records across ${uniqueDates.length} dates (Latest: ${uniqueDates[0] || 'N/A'})`
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'info',
          message: 'No Attendance Records Found',
          submessage: res.message || 'No attendance records returned from database'
        });
      }
    } catch (e: any) {
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Attendance Sync Error',
          submessage: e.message || 'Network communication error'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  useEffect(() => {
    const localData = loadLocalAttendance();
    if (localData.length > 0) {
      setRecords(localData);
      const uniqueDates = [...new Set(localData.map(r => r.date).filter(Boolean))].sort().reverse();
      if (uniqueDates.length > 0) {
        setSelectedDate(uniqueDates[0]);
      }
    }
    // Fetch live Zoho attendance on initial load
    handleFetchAttendance(false, true);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // List of all unique dates present in records with counts
  const availableDates = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach(r => {
      if (r.date) {
        map.set(r.date, (map.get(r.date) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  // Filter employees according to user's role permissions
  const visibleEmployees = useMemo(() => {
    if (isFullAdmin) return allEmployees;
    if (isHOD && currentUser.department) {
      return allEmployees.filter((e: any) => {
        const isSelf = e.id === currentUser.id || e.empId === currentUser.empId || (e.name && currentUser.name && e.name.toLowerCase() === currentUser.name.toLowerCase());
        const isDept = (e.dept || e.department || e.formData?.dept || e.formData?.department || '').toLowerCase() === currentUser.department.toLowerCase();
        const isSubordinate =
          e.teamLeaderId === currentUser.id ||
          e.teamLeaderId === currentUser.empId ||
          (e.teamLeaderName && currentUser.name && e.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
          (e.formData?.teamLeaderId && (e.formData.teamLeaderId === currentUser.id || e.formData.teamLeaderId === currentUser.empId)) ||
          (e.formData?.teamLeaderName && currentUser.name && e.formData.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase()));
        return isSelf || isDept || isSubordinate;
      });
    }
    if (isTeamLead) {
      return allEmployees.filter((e: any) => {
        const isSelf = e.id === currentUser.id || e.empId === currentUser.empId || e.name?.toLowerCase() === currentUser.name?.toLowerCase();
        const isSubordinate =
          e.teamLeaderId === currentUser.id ||
          e.teamLeaderId === currentUser.empId ||
          (e.teamLeaderName && currentUser.name && e.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
          (e.formData?.teamLeaderId && (e.formData.teamLeaderId === currentUser.id || e.formData.teamLeaderId === currentUser.empId)) ||
          (e.formData?.teamLeaderName && currentUser.name && e.formData.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase()));
        return isSelf || isSubordinate;
      });
    }
    const filtered = allEmployees.filter((e: any) =>
      e.id === currentUser.id ||
      e.empId === currentUser.empId ||
      (e.email && currentUser.email && (e.email ?? '').trim().toLowerCase() === (currentUser.email ?? '').trim().toLowerCase()) ||
      (e.name && currentUser.name && (e.name ?? '').trim().toLowerCase() === (currentUser.name ?? '').trim().toLowerCase())
    );
    return filtered.length > 0
      ? filtered
      : [{ id: currentUser.empId || currentUser.id || 'EMP-USER', name: currentUser.name || 'Employee' }];
  }, [allEmployees, currentUser, isFullAdmin, isTeamLead, isHOD]);

  // Main table displayed records (by selectedDate / searchQuery)
  const displayedRecords = useMemo(() => {
    let list = records;

    // Filter by date if not "All Dates"
    if (!isAllDates) {
      list = list.filter(r => r.date === selectedDate);
    }

    // Filter by Role / Access (if non-admin)
    if (!isFullAdmin && currentUser) {
      const allowedEmpIds = new Set(visibleEmployees.map((e: any) => String(e.id).toLowerCase()));
      const allowedCodes = new Set(visibleEmployees.map((e: any) => String(e.empId || e.Employment_ID || e.formData?.employmentId || '').toLowerCase()).filter(Boolean));
      const allowedNames = new Set(visibleEmployees.map((e: any) => (e.name || '').toLowerCase()));
      
      const filtered = list.filter(r => 
        allowedEmpIds.has(String(r.empId).toLowerCase()) || 
        allowedCodes.has(String(r.empId).toLowerCase()) ||
        allowedNames.has((r.empName || '').toLowerCase())
      );
      if (filtered.length > 0) {
        list = filtered;
      }
    }

    // Filter by Status
    if (statusFilter !== 'ALL') {
      list = list.filter(r => r.status === statusFilter);
    }

    // Filter by Punch Status
    if (punchFilter !== 'ALL') {
      list = list.filter(r => r.punchStatus === punchFilter);
    }

    // Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        r =>
          (r.empName || '').toLowerCase().includes(q) ||
          (r.empId || '').toLowerCase().includes(q) ||
          (r.name || '').toLowerCase().includes(q) ||
          (r.department || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [records, isAllDates, selectedDate, isFullAdmin, currentUser, visibleEmployees, statusFilter, punchFilter, searchQuery]);

  // Statistics calculation for Top KPI cards
  const stats = useMemo(() => {
    const scopeRecords = isAllDates ? records : records.filter(r => r.date === selectedDate);
    const totalStaff = scopeRecords.length || visibleEmployees.length || 0;
    const presentCount = scopeRecords.filter(r => r.status === 'Present' || r.status === 'Late' || r.status === 'On Duty').length;
    const lateCount = scopeRecords.filter(r => r.status === 'Late' || r.lateMinutes > 0).length;
    const earlyOutCount = scopeRecords.filter(r => r.earlyOutMinutes > 0).length;
    const singlePunchCount = scopeRecords.filter(r => r.punchStatus === 'Single Punch' || (r.firstIn && !r.lastOut)).length;
    const absentCount = scopeRecords.filter(r => r.status === 'Absent').length;

    const totalMinutesLogged = scopeRecords.reduce((sum, r) => sum + (r.totalMinutes || 0), 0);
    const avgMinutes = presentCount > 0 ? Math.round(totalMinutesLogged / presentCount) : 0;

    return {
      totalStaff,
      presentCount,
      presentPct: totalStaff > 0 ? Math.round((presentCount / totalStaff) * 100) : 0,
      lateCount,
      earlyOutCount,
      singlePunchCount,
      absentCount,
      avgWorkingHours: formatAttendanceDuration(avgMinutes)
    };
  }, [records, isAllDates, selectedDate, visibleEmployees]);

  // ==========================================
  // EMPLOYEE INDIVIDUAL HISTORY DATA & STATS
  // ==========================================
  const activeEmployeeDetails = useMemo(() => {
    if (!selectedEmployeeCode) return null;
    const empCode = selectedEmployeeCode.toLowerCase().trim();
    const matched = employeeMap.get(empCode);
    const sampleRecord = records.find(r => r.empId.toLowerCase() === empCode);

    return {
      empCode: selectedEmployeeCode,
      empName: matched?.name || sampleRecord?.empName || `Employee ${selectedEmployeeCode}`,
      department: matched?.department || matched?.formData?.department || sampleRecord?.department || 'General',
      designation: matched?.designation || matched?.formData?.designation || 'Staff',
      email: matched?.email || matched?.formData?.email || sampleRecord?.email || '',
      avatarChar: (matched?.name || sampleRecord?.empName || selectedEmployeeCode).charAt(0).toUpperCase()
    };
  }, [selectedEmployeeCode, employeeMap, records]);

  // All attendance records for the selected employee across all dates
  const employeeAllRecords = useMemo(() => {
    if (!selectedEmployeeCode) return [];
    const empCode = selectedEmployeeCode.toLowerCase().trim();
    return records
      .filter(r => r.empId.toLowerCase() === empCode)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, selectedEmployeeCode]);

  // Available Months & Years for the selected employee
  const employeeAvailableMonthsYears = useMemo(() => {
    const months = new Set<string>();
    const years = new Set<string>();
    employeeAllRecords.forEach(r => {
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
        const [yyyy, mm] = r.date.split('-');
        years.add(yyyy);
        months.add(`${yyyy}-${mm}`);
      }
    });
    return {
      months: Array.from(months).sort().reverse(),
      years: Array.from(years).sort().reverse()
    };
  }, [employeeAllRecords]);

  // Filtered records for the employee history drawer
  const employeeFilteredRecords = useMemo(() => {
    let list = employeeAllRecords;

    if (historyYearFilter !== 'ALL') {
      list = list.filter(r => r.date.startsWith(historyYearFilter));
    }
    if (historyMonthFilter !== 'ALL') {
      list = list.filter(r => r.date.startsWith(historyMonthFilter));
    }
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim();
      list = list.filter(
        r =>
          r.date.includes(q) ||
          r.status.toLowerCase().includes(q) ||
          r.punchStatus.toLowerCase().includes(q) ||
          (r.punches && r.punches.includes(q))
      );
    }
    return list;
  }, [employeeAllRecords, historyYearFilter, historyMonthFilter, historySearch]);

  // Summary stats for the selected employee
  const employeeStats = useMemo(() => {
    const totalDays = employeeFilteredRecords.length;
    const presentDays = employeeFilteredRecords.filter(r => r.status === 'Present' || r.status === 'Late' || r.status === 'On Duty').length;
    const lateDays = employeeFilteredRecords.filter(r => r.status === 'Late' || r.lateMinutes > 0).length;
    const totalLateMinutes = employeeFilteredRecords.reduce((sum, r) => sum + (r.lateMinutes || 0), 0);
    const earlyOutDays = employeeFilteredRecords.filter(r => r.earlyOutMinutes > 0).length;
    const totalWorkingMinutes = employeeFilteredRecords.reduce((sum, r) => sum + (r.totalMinutes || 0), 0);
    const avgMinutes = presentDays > 0 ? Math.round(totalWorkingMinutes / presentDays) : 0;
    const singlePunchDays = employeeFilteredRecords.filter(r => r.punchStatus === 'Single Punch' || (r.firstIn && !r.lastOut)).length;
    const absentDays = employeeFilteredRecords.filter(r => r.status === 'Absent').length;

    return {
      totalDays,
      presentDays,
      presentPct: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      lateDays,
      totalLateMinutes,
      earlyOutDays,
      singlePunchDays,
      absentDays,
      totalHoursFormatted: formatAttendanceDuration(totalWorkingMinutes),
      avgHoursFormatted: formatAttendanceDuration(avgMinutes)
    };
  }, [employeeFilteredRecords]);

  // Handle Quick Status Change
  const handleQuickStatusChange = async (item: AttendanceItem, newStatus: AttendanceItem['status']) => {
    if (!canMarkAttendance) {
      alert('Permission Denied: Only Super Admin and HR can mark attendance.');
      return;
    }

    const updatedItem: AttendanceItem = {
      ...item,
      status: newStatus,
      punchStatus: newStatus === 'Absent' ? 'Absent' : item.punchStatus,
    };

    const updated = records.map(r => (r.id === item.id || (r.empId === item.empId && r.date === item.date)) ? updatedItem : r);
    setRecords(updated);
    saveAttendanceSafely(updated);

    // Push to Zoho CRM
    try {
      const payload: ZohoAttendancePayload = {
        zohoId: item.zohoId,
        name: `${item.empId} - ${item.date}`,
        attendanceDate: item.date,
        employeeCode: item.empId,
        markAttendance: newStatus,
        punchStatus: updatedItem.punchStatus,
        firstIn: item.firstIn,
        lastOut: item.lastOut,
        punchCount: item.punchCount,
        punches: item.punches,
        lateMinutes: item.lateMinutes,
        earlyOutMinutes: item.earlyOutMinutes,
        totalMinutes: item.totalMinutes,
      };

      const res = await saveOrUpdateZohoAttendance(payload);
      if (res.success) {
        setToast({
          type: 'success',
          message: `Updated ${item.empName} to ${newStatus}`,
          submessage: 'Synced directly with attendance database'
        });
        if (res.zohoId && !item.zohoId) {
          updatedItem.zohoId = res.zohoId;
          const fresh = records.map(r => r.id === item.id ? updatedItem : r);
          setRecords(fresh);
          saveAttendanceSafely(fresh);
        }
      } else {
        setToast({
          type: 'error',
          message: 'Saved locally (sync pending)',
          submessage: res.message
        });
      }
    } catch (err: any) {
      console.error('Error updating Zoho attendance:', err);
    }
  };

  // Open Edit / Log Modal
  const handleOpenEditModal = (item?: AttendanceItem, prefillEmpCode?: string) => {
    if (item) {
      setEditingRecord({ ...item });
    } else {
      const targetEmpCode = prefillEmpCode || selectedEmployeeCode || visibleEmployees[0]?.id || '255';
      const targetEmp = employeeMap.get(targetEmpCode.toLowerCase());
      const targetEmpName = targetEmp?.name || `Employee ${targetEmpCode}`;

      setEditingRecord({
        empId: targetEmpCode,
        empName: targetEmpName,
        date: selectedDate,
        status: 'Present',
        punchStatus: 'Complete',
        punchCount: 2,
        firstIn: `${selectedDate}T09:30:00+05:30`,
        lastOut: `${selectedDate}T18:30:00+05:30`,
        lateMinutes: 0,
        earlyOutMinutes: 0,
        totalMinutes: 540,
        punches: '09:30:00, 18:30:00'
      });
    }
    setIsModalOpen(true);
  };

  // Save from Modal
  const handleSaveModalRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !editingRecord.empId || !editingRecord.date) return;

    setIsSaving(true);
    try {
      const empCode = editingRecord.empId;
      const attDate = editingRecord.date;
      const keyName = `${empCode} - ${attDate}`;

      const payload: ZohoAttendancePayload = {
        zohoId: editingRecord.zohoId,
        name: keyName,
        attendanceDate: attDate,
        employeeCode: empCode,
        markAttendance: editingRecord.status || 'Present',
        punchStatus: editingRecord.punchStatus || 'Complete',
        punchCount: Number(editingRecord.punchCount || 2),
        firstIn: editingRecord.firstIn,
        lastOut: editingRecord.lastOut,
        punches: editingRecord.punches,
        lateMinutes: Number(editingRecord.lateMinutes || 0),
        earlyOutMinutes: Number(editingRecord.earlyOutMinutes || 0),
        totalMinutes: Number(editingRecord.totalMinutes || 0),
      };

      const res = await saveOrUpdateZohoAttendance(payload);

      const savedItem: AttendanceItem = {
        id: editingRecord.id || `ATT-${empCode}-${attDate}`,
        zohoId: res.zohoId || editingRecord.zohoId,
        name: keyName,
        empId: empCode,
        empName: editingRecord.empName || `Employee ${empCode}`,
        date: attDate,
        status: (editingRecord.status as any) || 'Present',
        punchStatus: editingRecord.punchStatus || 'Complete',
        punchCount: Number(editingRecord.punchCount || 2),
        firstIn: editingRecord.firstIn,
        lastOut: editingRecord.lastOut,
        punches: editingRecord.punches || '',
        lateMinutes: Number(editingRecord.lateMinutes || 0),
        earlyOutMinutes: Number(editingRecord.earlyOutMinutes || 0),
        totalMinutes: Number(editingRecord.totalMinutes || 0),
      };

      setRecords(prev => {
        const existingIdx = prev.findIndex(r => (r.empId === empCode && r.date === attDate) || r.id === savedItem.id);
        let updatedList: AttendanceItem[];
        if (existingIdx >= 0) {
          updatedList = [...prev];
          updatedList[existingIdx] = savedItem;
        } else {
          updatedList = [savedItem, ...prev];
        }
        saveAttendanceSafely(updatedList);
        return updatedList;
      });

      setIsModalOpen(false);
      setEditingRecord(null);

      if (res.success) {
        setToast({
          type: 'success',
          message: 'Attendance Saved Successfully',
          submessage: `Record key: ${keyName}`
        });
      } else {
        setToast({
          type: 'info',
          message: 'Attendance Saved Locally',
          submessage: res.message || 'Attendance sync notice'
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        message: 'Failed to Save Attendance',
        submessage: err.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Date Navigation Helpers
  const shiftDate = (days: number) => {
    setIsAllDates(false);
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    const newDateStr = d.toISOString().split('T')[0];
    setSelectedDate(newDateStr);
  };

  // Export to CSV
  const handleExportCSV = (recordsToExport: AttendanceItem[], filename: string) => {
    if (recordsToExport.length === 0) {
      alert('No attendance records to export.');
      return;
    }

    const headers = [
      'Attendance Key',
      'Date',
      'Employee Code',
      'Employee Name',
      'Mark Attendance Status',
      'Punch Status',
      'First In (Punch In)',
      'Last Out (Punch Out)',
      'Total Working Minutes',
      'Total Hours Formatted',
      'Late Minutes',
      'Early Out Minutes',
      'Punches Log',
      'Record ID'
    ];

    const rows = recordsToExport.map(r => [
      `"${r.name}"`,
      `"${r.date}"`,
      `"${r.empId}"`,
      `"${r.empName}"`,
      `"${r.status}"`,
      `"${r.punchStatus}"`,
      `"${formatAttendanceTime(r.firstIn)}"`,
      `"${formatAttendanceTime(r.lastOut)}"`,
      r.totalMinutes,
      `"${formatAttendanceDuration(r.totalMinutes)}"`,
      r.lateMinutes,
      r.earlyOutMinutes,
      `"${(r.punches || '').replace(/"/g, '""')}"`,
      `"${r.zohoId || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Status Styling Badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Present':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Absent':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Half Day':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Late':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'On Duty':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'Leave':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const getPunchStatusBadge = (status: string) => {
    switch (status) {
      case 'Complete':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Single Punch':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Incomplete':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const formatMonthName = (yyyyMm: string) => {
    try {
      const [y, m] = yyyyMm.split('-');
      const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return yyyyMm;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[999] max-w-md p-4 rounded-2xl shadow-2xl border flex items-start space-x-3 backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-white border-emerald-500/30'
                : toast.type === 'error'
                ? 'bg-rose-950/90 text-white border-rose-500/30'
                : 'bg-slate-900/90 text-white border-slate-700'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <Cloud className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <p className="font-semibold text-white">{toast.message}</p>
              {toast.submessage && (
                <p className="text-xs text-gray-300 mt-1 font-mono break-all">{toast.submessage}</p>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Card */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {isFullAdmin ? 'Daily Attendance Management' : isTeamLead ? 'Team Daily Attendance' : 'My Daily Attendance'}
            </h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {isFullAdmin
              ? 'Click on any employee to view their full month/year historical attendance records and analytics.'
              : isTeamLead
              ? `Daily punch logs and check-in timeline for team reporting to ${currentUser.name}.`
              : `Daily punch logs, timestamps, and total working minutes for ${currentUser.name}.`}
          </p>
        </div>

        {/* Date Selector & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          {/* Date Picker with Prev/Next Controls */}
          <div className={`flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2 py-1 shadow-sm ${isAllDates ? 'opacity-50 pointer-events-none' : ''}`}>
            <button
              onClick={() => shiftDate(-1)}
              className="p-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center px-2 space-x-2">
              <CalendarIcon size={16} className="text-be-orange" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => {
                  setIsAllDates(false);
                  setSelectedDate(e.target.value);
                }}
                className="outline-none text-xs font-bold text-gray-800 bg-transparent cursor-pointer"
              />
            </div>
            <button
              onClick={() => shiftDate(1)}
              className="p-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Zoho Sync Button */}
          <button
            onClick={() => handleFetchAttendance(true, true)}
            disabled={isFetchingZoho}
            className="w-10 h-10 border border-orange-200 bg-orange-50/70 hover:bg-orange-100 text-orange-950 rounded-xl flex items-center justify-center shadow-sm transition-all disabled:opacity-60 shrink-0"
            title="Refresh & Sync"
          >
            <RefreshCw size={16} className={`text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
          </button>

          {/* Export CSV Button */}
          <button
            onClick={() => handleExportCSV(displayedRecords, `Daily_Attendance_${isAllDates ? 'All_Dates' : selectedDate}.csv`)}
            className="px-3.5 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold flex items-center shadow-sm transition-all"
            title="Export filtered records to CSV"
          >
            <Download size={14} className="mr-1.5 text-gray-500" /> Export CSV
          </button>

          {/* Log / Punch Attendance Modal Trigger */}
          {canMarkAttendance && (
            <button
              onClick={() => handleOpenEditModal()}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold flex items-center shadow-md transition-all"
            >
              <Plus size={15} className="mr-1.5" /> Log Attendance
            </button>
          )}
        </div>
      </div>

      {/* Available Dates Quick Filter Bar */}
      {availableDates.length > 0 && (
        <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-gray-500 flex items-center shrink-0 mr-1">
            <CalendarDays size={14} className="mr-1.5 text-be-orange" /> Available Dates:
          </span>
          <button
            onClick={() => setIsAllDates(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              isAllDates
                ? 'bg-be-orange text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Layers size={13} />
            All Dates ({records.length})
          </button>
          {availableDates.map(({ date, count }) => (
            <button
              key={date}
              onClick={() => {
                setIsAllDates(false);
                setSelectedDate(date);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                !isAllDates && selectedDate === date
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-gray-100/90 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {date} <span className="text-[10px] opacity-75 font-mono">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Staff</span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600"><UserCheck size={16} /></span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-gray-900">{stats.totalStaff}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{isAllDates ? 'All Dates Combined' : `Date: ${selectedDate}`}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Present</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={16} /></span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline space-x-2">
              <p className="text-2xl font-black text-emerald-600">{stats.presentCount}</p>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                {stats.presentPct}%
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Checked-in</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Late Arrivals</span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600"><Clock size={16} /></span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-amber-600">{stats.lateCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Late arrival minutes</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Early Out</span>
            <span className="p-2 rounded-xl bg-orange-50 text-orange-600"><TrendingUp size={16} /></span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-orange-600">{stats.earlyOutCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Early checkout</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Single Punch</span>
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600"><AlertTriangle size={16} /></span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-rose-600">{stats.singlePunchCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Pending Punch-Out</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Hours</span>
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><Clock size={16} /></span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-indigo-700">{stats.avgWorkingHours}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Working duration</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by Employee Name, Code (e.g. 255), Key..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs font-medium border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange transition-all bg-gray-50/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:border-be-orange shadow-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="Present">Present</option>
            <option value="Late">Late</option>
            <option value="Half Day">Half Day</option>
            <option value="Absent">Absent</option>
            <option value="On Duty">On Duty</option>
            <option value="Leave">Leave</option>
          </select>

          {/* Punch Status Filter */}
          <select
            value={punchFilter}
            onChange={e => setPunchFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:border-be-orange shadow-sm"
          >
            <option value="ALL">All Punch Types</option>
            <option value="Complete">Complete</option>
            <option value="Single Punch">Single Punch</option>
            <option value="Incomplete">Incomplete</option>
          </select>
        </div>
      </div>

      {/* Main Attendance Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-gray-50/80 text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-100">
              <tr>
                <th className="px-5 py-3.5">Employee (Click for History)</th>
                <th className="px-5 py-3.5">Date & Key</th>
                <th className="px-5 py-3.5">Mark Status</th>
                <th className="px-5 py-3.5">Punch Status</th>
                <th className="px-5 py-3.5">First In (In)</th>
                <th className="px-5 py-3.5">Last Out (Out)</th>
                <th className="px-5 py-3.5">Working Hours</th>
                <th className="px-5 py-3.5">Punches Log</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {displayedRecords.map(record => {
                const punchTimeline = parsePunchesTimeline(record.punches);

                return (
                  <tr
                    key={record.id}
                    className="hover:bg-orange-50/40 transition-colors duration-150 group cursor-pointer"
                    onClick={() => setSelectedEmployeeCode(record.empId)}
                  >
                    {/* Employee Col with interactive hover card */}
                    <td className="px-5 py-4 font-bold text-gray-900">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-400 to-amber-500 text-white flex items-center justify-center font-black text-xs shadow-sm group-hover:scale-105 transition-transform">
                          {record.empName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <p className="font-bold text-gray-900 group-hover:text-be-orange transition-colors">
                              {record.empName}
                            </p>
                            <ExternalLink size={12} className="text-gray-300 group-hover:text-be-orange opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className="inline-block text-[10px] font-mono text-gray-600 font-bold bg-gray-100 px-1.5 py-0.2 rounded border border-gray-200">
                              EMP {record.empId}
                            </span>
                            {record.department && (
                              <span className="text-[10px] text-gray-400 font-normal">
                                {record.department}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Date & Key */}
                    <td className="px-5 py-4">
                      <p className="font-bold text-gray-800">{record.date}</p>
                      <span className="text-[10px] font-mono text-gray-400 block truncate max-w-[140px]" title={record.name}>
                        {record.name}
                      </span>
                    </td>

                    {/* Mark Attendance Status Badge */}
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-xs ${getStatusBadge(record.status)}`}>
                        {record.status}
                      </span>
                    </td>

                    {/* Punch Status Badge */}
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${getPunchStatusBadge(record.punchStatus)}`}>
                        {record.punchStatus}
                      </span>
                    </td>

                    {/* First In */}
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1.5">
                        <Clock size={13} className="text-gray-400" />
                        <span className="font-semibold text-gray-800">
                          {formatAttendanceTime(record.firstIn)}
                        </span>
                      </div>
                      {record.lateMinutes > 0 && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                          +{record.lateMinutes}m Late
                        </span>
                      )}
                    </td>

                    {/* Last Out */}
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1.5">
                        <Clock size={13} className="text-gray-400" />
                        <span className="font-semibold text-gray-800">
                          {formatAttendanceTime(record.lastOut)}
                        </span>
                      </div>
                      {record.earlyOutMinutes > 0 && (
                        <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                          -{record.earlyOutMinutes}m Early
                        </span>
                      )}
                    </td>

                    {/* Working Hours */}
                    <td className="px-5 py-4">
                      <span className="font-bold text-gray-900 bg-gray-100/80 px-2 py-1 rounded-lg">
                        {record.totalMinutes > 0
                          ? formatAttendanceDuration(record.totalMinutes)
                          : '--'}
                      </span>
                      {record.totalMinutes > 0 && (
                        <span className="text-[10px] text-gray-400 block mt-0.5 font-mono">
                          {record.totalMinutes} min
                        </span>
                      )}
                    </td>

                    {/* Punches Log Chips */}
                    <td className="px-5 py-4">
                      {punchTimeline.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {punchTimeline.map((p, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">No logs</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-1">
                        {canMarkAttendance && (
                          <>
                            <button
                              onClick={() => handleQuickStatusChange(record, 'Present')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                record.status === 'Present'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title="Mark Present"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              onClick={() => handleQuickStatusChange(record, 'Late')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                record.status === 'Late'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title="Mark Late"
                            >
                              <Clock size={16} />
                            </button>
                            <button
                              onClick={() => handleQuickStatusChange(record, 'Half Day')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                record.status === 'Half Day'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
                              }`}
                              title="Mark Half Day"
                            >
                              <AlertCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleQuickStatusChange(record, 'Absent')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                record.status === 'Absent'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title="Mark Absent"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(record)}
                          className="p-1.5 text-gray-500 hover:text-be-orange hover:bg-orange-50 rounded-lg transition-colors"
                          title="Edit Punch Log / Attendance Details"
                        >
                          <Edit3 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayedRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-gray-500">
                    {isFetchingZoho ? (
                      <div className="flex flex-col items-center justify-center py-4">
                        <Loader2 className="w-8 h-8 animate-spin text-be-orange mb-3" />
                        <p className="text-sm font-bold text-gray-900">Synchronizing Daily Attendance...</p>
                        <p className="text-xs text-gray-400 mt-1">Fetching records across all pages</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-be-orange mb-3">
                          <CalendarIcon size={24} />
                        </div>
                        <p className="text-base font-bold text-gray-900">No Attendance Records for {selectedDate}</p>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm">
                          {availableDates.length > 0
                            ? `Found ${records.length} records on other dates (e.g. ${availableDates[0]?.date}). Click an available date button above or "All Dates".`
                            : 'No attendance records stored yet. Click refresh to load live records.'}
                        </p>
                        <div className="mt-4 flex items-center space-x-3">
                          <button
                            onClick={() => handleFetchAttendance(true, true)}
                            className="px-4 py-2 border border-orange-200 bg-orange-50 text-be-orange rounded-xl text-xs font-bold shadow-xs hover:bg-orange-100 transition-colors"
                          >
                            Sync from Zoho CRM
                          </button>
                          {availableDates.length > 0 && (
                            <button
                              onClick={() => {
                                setIsAllDates(false);
                                setSelectedDate(availableDates[0].date);
                              }}
                              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-slate-800 transition-colors"
                            >
                              View Latest Date ({availableDates[0].date})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* EMPLOYEE FULL MONTH & YEAR ATTENDANCE HISTORY MODAL / DRAWER */}
      {/* ============================================================== */}
      <AnimatePresence>
        {selectedEmployeeCode && activeEmployeeDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-md overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white rounded-3xl border border-gray-100 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Drawer Top Header */}
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center font-black text-2xl shadow-lg border-2 border-white/20">
                    {activeEmployeeDetails.avatarChar}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-black tracking-tight text-white">
                        {activeEmployeeDetails.empName}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-be-orange text-white">
                        EMP {activeEmployeeDetails.empCode}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300 mt-1 font-medium">
                      <span>Dept: <strong className="text-white">{activeEmployeeDetails.department}</strong></span>
                      {activeEmployeeDetails.email && (
                        <span>• Email: <strong className="text-white">{activeEmployeeDetails.email}</strong></span>
                      )}
                      <span>• Total History: <strong className="text-emerald-400">{employeeAllRecords.length} Days</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  {canMarkAttendance && (
                    <button
                      onClick={() => handleOpenEditModal(undefined, activeEmployeeDetails.empCode)}
                      className="px-3.5 py-2 bg-be-orange hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center shadow-sm transition-all"
                    >
                      <Plus size={14} className="mr-1.5" /> Log New Entry
                    </button>
                  )}
                  <button
                    onClick={() => handleExportCSV(employeeFilteredRecords, `Attendance_History_EMP_${activeEmployeeDetails.empCode}.csv`)}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center transition-all border border-white/10"
                    title="Export employee history to CSV"
                  >
                    <Download size={14} className="mr-1.5 text-gray-300" /> Export CSV
                  </button>
                  <button
                    onClick={() => setSelectedEmployeeCode(null)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Employee Summary Stats */}
              <div className="p-6 bg-slate-50 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-xs">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Days</span>
                  <p className="text-xl font-black text-gray-900 mt-1">{employeeStats.totalDays}</p>
                  <span className="text-[10px] text-gray-400">Filtered period</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-xs">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Present</span>
                  <div className="flex items-baseline space-x-1.5 mt-1">
                    <p className="text-xl font-black text-emerald-600">{employeeStats.presentDays}</p>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                      {employeeStats.presentPct}%
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400">Attendance rate</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-xs">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Hours</span>
                  <p className="text-xl font-black text-indigo-600 mt-1">{employeeStats.totalHoursFormatted}</p>
                  <span className="text-[10px] text-gray-400">Working duration</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-xs">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Avg Daily</span>
                  <p className="text-xl font-black text-slate-800 mt-1">{employeeStats.avgHoursFormatted}</p>
                  <span className="text-[10px] text-gray-400">Per present day</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-xs">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Late Days</span>
                  <p className="text-xl font-black text-amber-600 mt-1">{employeeStats.lateDays}</p>
                  <span className="text-[10px] text-amber-700 font-bold">({employeeStats.totalLateMinutes}m total)</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-xs">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Single Punch</span>
                  <p className="text-xl font-black text-rose-600 mt-1">{employeeStats.singlePunchDays}</p>
                  <span className="text-[10px] text-gray-400">Missed punch-out</span>
                </div>
              </div>

              {/* Month / Year Filter & View Controls */}
              <div className="px-6 py-3.5 bg-white border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-gray-600 flex items-center">
                    <CalendarDays size={14} className="mr-1.5 text-be-orange" /> Period:
                  </span>
                  
                  {/* Month Filter Dropdown */}
                  <select
                    value={historyMonthFilter}
                    onChange={e => setHistoryMonthFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50 text-gray-800 focus:outline-none focus:border-be-orange"
                  >
                    <option value="ALL">All Months ({employeeAllRecords.length} records)</option>
                    {employeeAvailableMonthsYears.months.map(m => (
                      <option key={m} value={m}>
                        {formatMonthName(m)}
                      </option>
                    ))}
                  </select>

                  {/* Year Filter Dropdown */}
                  {employeeAvailableMonthsYears.years.length > 1 && (
                    <select
                      value={historyYearFilter}
                      onChange={e => setHistoryYearFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50 text-gray-800 focus:outline-none focus:border-be-orange"
                    >
                      <option value="ALL">All Years</option>
                      {employeeAvailableMonthsYears.years.map(y => (
                        <option key={y} value={y}>Year {y}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Search within employee logs */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    placeholder="Search dates, times, status..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-medium border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50"
                  />
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Employee History Table Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200">
                      <tr>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Attendance Key</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Punch Type</th>
                        <th className="px-5 py-3">Punch In</th>
                        <th className="px-5 py-3">Punch Out</th>
                        <th className="px-5 py-3">Duration</th>
                        <th className="px-5 py-3">Punches Chain</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {employeeFilteredRecords.map(rec => {
                        const punchesArr = parsePunchesTimeline(rec.punches);

                        return (
                          <tr key={rec.id} className="hover:bg-orange-50/30 transition-colors">
                            <td className="px-5 py-3.5 font-bold text-gray-900">
                              {rec.date}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-gray-500 text-[11px]">
                              {rec.name}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(rec.status)}`}>
                                {rec.status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getPunchStatusBadge(rec.punchStatus)}`}>
                                {rec.punchStatus}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-semibold text-gray-800">
                                {formatAttendanceTime(rec.firstIn)}
                              </span>
                              {rec.lateMinutes > 0 && (
                                <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                                  +{rec.lateMinutes}m Late
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-semibold text-gray-800">
                                {formatAttendanceTime(rec.lastOut)}
                              </span>
                              {rec.earlyOutMinutes > 0 && (
                                <span className="ml-1.5 text-[10px] font-bold text-orange-700 bg-orange-50 px-1 py-0.2 rounded border border-orange-200">
                                  -{rec.earlyOutMinutes}m Early
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-gray-900">
                              {rec.totalMinutes > 0 ? (
                                <span>
                                  {formatAttendanceDuration(rec.totalMinutes)}
                                  <span className="text-[10px] text-gray-400 block font-normal font-mono">({rec.totalMinutes}m)</span>
                                </span>
                              ) : (
                                '--'
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              {punchesArr.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-[180px]">
                                  {punchesArr.map((p, idx) => (
                                    <span key={idx} className="text-[10px] font-mono bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded border border-gray-200">
                                      {p}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">No chain</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                onClick={() => handleOpenEditModal(rec)}
                                className="p-1.5 text-gray-400 hover:text-be-orange hover:bg-orange-50 rounded-lg transition-colors"
                                title="Edit this record"
                              >
                                <Edit3 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {employeeFilteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                            No attendance records match the selected month / search criteria for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Showing <strong>{employeeFilteredRecords.length}</strong> of <strong>{employeeAllRecords.length}</strong> total records for Employee {activeEmployeeDetails.empCode}
                </span>
                <button
                  onClick={() => setSelectedEmployeeCode(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================== */}
      {/* EDIT / LOG ATTENDANCE MODAL                                     */}
      {/* ============================================================== */}
      <AnimatePresence>
        {isModalOpen && editingRecord && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl border border-gray-100 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50/50 to-amber-50/50">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-be-orange/10 flex items-center justify-center text-be-orange">
                    <CalendarIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">
                      {editingRecord.id ? 'Edit Attendance Record' : 'Log Daily Attendance'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Upserts into attendance system
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSaveModalRecord} className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Employee Selection */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Employee Code / ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 255"
                      value={editingRecord.empId || ''}
                      onChange={e => {
                        const val = e.target.value;
                        const matched = employeeMap.get(val.toLowerCase());
                        setEditingRecord(prev => ({
                          ...prev,
                          empId: val,
                          empName: matched ? matched.name : prev?.empName
                        }));
                      }}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                      required
                    />
                  </div>

                  {/* Employee Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Employee Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Priyansh"
                      value={editingRecord.empName || ''}
                      onChange={e => setEditingRecord(prev => ({ ...prev, empName: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>

                  {/* Attendance Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Attendance Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editingRecord.date || ''}
                      onChange={e => setEditingRecord(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                      required
                    />
                  </div>

                  {/* Mark Attendance Status */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Mark Attendance (Status)
                    </label>
                    <select
                      value={editingRecord.status || 'Present'}
                      onChange={e => setEditingRecord(prev => ({ ...prev, status: e.target.value as any }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    >
                      <option value="Present">Present</option>
                      <option value="Late">Late</option>
                      <option value="Half Day">Half Day</option>
                      <option value="Absent">Absent</option>
                      <option value="On Duty">On Duty</option>
                      <option value="Leave">Leave</option>
                    </select>
                  </div>

                  {/* Punch Status */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Punch Status
                    </label>
                    <select
                      value={editingRecord.punchStatus || 'Complete'}
                      onChange={e => setEditingRecord(prev => ({ ...prev, punchStatus: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    >
                      <option value="Complete">Complete</option>
                      <option value="Single Punch">Single Punch</option>
                      <option value="Incomplete">Incomplete</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </div>

                  {/* First In (Punch In) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      First In (Punch In DateTime / ISO)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2026-09-30T09:30:00+05:30"
                      value={editingRecord.firstIn || ''}
                      onChange={e => setEditingRecord(prev => ({ ...prev, firstIn: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-xs font-mono border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>

                  {/* Last Out (Punch Out) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Last Out (Punch Out DateTime / ISO)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2026-09-30T18:30:00+05:30"
                      value={editingRecord.lastOut || ''}
                      onChange={e => setEditingRecord(prev => ({ ...prev, lastOut: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-xs font-mono border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>

                  {/* Late Minutes */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Late Minutes
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingRecord.lateMinutes ?? 0}
                      onChange={e => setEditingRecord(prev => ({ ...prev, lateMinutes: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>

                  {/* Early Out Minutes */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Early Out Minutes
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingRecord.earlyOutMinutes ?? 0}
                      onChange={e => setEditingRecord(prev => ({ ...prev, earlyOutMinutes: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>

                  {/* Total Minutes */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Total Working Minutes
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingRecord.totalMinutes ?? 0}
                      onChange={e => setEditingRecord(prev => ({ ...prev, totalMinutes: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>

                  {/* Punch Count */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Punch Count
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingRecord.punchCount ?? 2}
                      onChange={e => setEditingRecord(prev => ({ ...prev, punchCount: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                    />
                  </div>
                </div>

                {/* Punches Log string */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Punches Log (Comma-separated times, e.g. 09:30:00, 13:15:00, 14:00:00, 18:30:00)
                  </label>
                  <textarea
                    rows={2}
                    value={editingRecord.punches || ''}
                    onChange={e => setEditingRecord(prev => ({ ...prev, punches: e.target.value }))}
                    placeholder="09:30:00, 18:30:00"
                    className="w-full px-3.5 py-2.5 text-xs font-mono border border-gray-200 rounded-xl focus:outline-none focus:border-be-orange bg-gray-50/40"
                  />
                </div>

                {/* Info notice */}
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-start space-x-2 text-xs text-blue-800">
                  <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
                  <p>
                    Record Key format: <span className="font-mono font-bold">{editingRecord.empId || 'EMP'} - {editingRecord.date || 'YYYY-MM-DD'}</span>. Existing entries will be updated without duplicates.
                  </p>
                </div>

                {/* Modal Footer */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-be-orange hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center disabled:opacity-60"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={14} className="mr-2 animate-spin" /> Saving Attendance...
                      </>
                    ) : (
                      <>
                        <Send size={14} className="mr-2" /> Save & Sync
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
