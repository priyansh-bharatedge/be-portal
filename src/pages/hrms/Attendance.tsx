import { useState, useEffect } from 'react';
import { Search, Filter, Calendar as CalendarIcon, CheckCircle2, XCircle, Clock, AlertCircle, Info, RefreshCw, Loader2, Cloud, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { fetchZohoAttendance } from '../../services/zohoService';

interface AttendanceRecord {
  id: string;
  empId: string;
  empName: string;
  date: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'Late';
  checkIn?: string;
  checkOut?: string;
  zohoId?: string;
}

export const Attendance = () => {
  const { currentUser, isTM, isSuperAdmin, isHR, isTL } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);

  const canMarkAttendance = isSuperAdmin || isHR;

  const handleFetchAttendance = async (showNotification = true) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoAttendance();
      if (res.success && Array.isArray(res.data)) {
        const mappedRecords: AttendanceRecord[] = res.data.map((item: any) => {
          const empCode = item.Employee_Code || (item.Name ? item.Name.split(' - ')[0] : 'EMP');
          const attDate = item.Attendance_Date || (item.Name && item.Name.includes(' - ') ? item.Name.split(' - ')[1] : new Date().toISOString().split('T')[0]);
          
          let checkInStr = '--';
          if (item.First_In) {
            try {
              checkInStr = new Date(item.First_In).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            } catch (e) {
              checkInStr = item.First_In;
            }
          }
          let checkOutStr = '--';
          if (item.Last_Out) {
            try {
              checkOutStr = new Date(item.Last_Out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            } catch (e) {
              checkOutStr = item.Last_Out;
            }
          }

          let status: AttendanceRecord['status'] = 'Present';
          if (item.Punch_Status === 'Absent') status = 'Absent';
          else if (item.Punch_Status === 'Half Day') status = 'Half Day';
          else if (item.Late_Minutes && item.Late_Minutes > 15) status = 'Late';

          return {
            id: `ATT-${item.id || Date.now()}`,
            empId: empCode,
            empName: item.Employee?.name || `Employee ${empCode}`,
            date: attDate,
            status,
            checkIn: checkInStr,
            checkOut: checkOutStr,
            zohoId: String(item.id),
          };
        });

        setRecords(prev => {
          const existingZoho = new Set(prev.map(r => r.zohoId).filter(Boolean));
          const newOnly = mappedRecords.filter(r => r.zohoId && !existingZoho.has(r.zohoId));
          const merged = [...newOnly, ...prev];
          localStorage.setItem('be_attendance', JSON.stringify(merged));
          return merged;
        });

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Fetched ${res.data.length} Attendance Records from Zoho CRM`,
            submessage: 'Daily Attendance synchronized with live database'
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'error',
          message: 'Failed to fetch attendance records',
          submessage: res.message || 'Check connection or Zoho CRM rate limits'
        });
      }
    } catch (e: any) {
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Error connecting to Zoho CRM',
          submessage: e.message || 'Network communication error'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('be_attendance');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {}
    }

    // Auto-fetch live attendance from Zoho CRM on mount
    handleFetchAttendance(false);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveToStorage = (newRecords: AttendanceRecord[]) => {
    setRecords(newRecords);
    localStorage.setItem('be_attendance', JSON.stringify(newRecords));
  };

  const handleMarkAttendance = (empId: string, empName: string, status: AttendanceRecord['status']) => {
    if (!canMarkAttendance) {
      alert('Permission Denied: Only Super Admin and HR can mark employee attendance.');
      return;
    }

    const existingIndex = records.findIndex(r => r.empId === empId && r.date === selectedDate);
    const newRecord: AttendanceRecord = {
      id: existingIndex >= 0 ? records[existingIndex].id : `ATT-${Date.now()}-${empId}`,
      empId,
      empName,
      date: selectedDate,
      status,
      checkIn: status === 'Present' || status === 'Late' ? '09:00 AM' : undefined,
      checkOut: status === 'Present' || status === 'Late' ? '06:00 PM' : undefined,
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...records];
      updated[existingIndex] = newRecord;
    } else {
      updated = [...records, newRecord];
    }
    saveToStorage(updated);
  };

  // Get employees from localStorage to show in attendance list
  const getEmployees = () => {
    const emps = localStorage.getItem('be_employees');
    return emps ? JSON.parse(emps) : [];
  };

  const allEmployees = getEmployees();
  const isFullAdmin = isSuperAdmin || isHR;
  const isTeamLead = !isFullAdmin && (isTL || currentUser.role === 'TL');

  const matchedEmployees = isFullAdmin
    ? allEmployees
    : isTeamLead
    ? allEmployees.filter((e: any) => {
        const isSelf = e.id === currentUser.id || e.id === currentUser.empId || e.name?.toLowerCase() === currentUser.name?.toLowerCase();
        const isSubordinate = e.teamLeaderId === currentUser.id || 
                              e.teamLeaderId === currentUser.empId || 
                              (e.teamLeaderName && currentUser.name && e.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                              (e.formData?.teamLeaderId && (e.formData.teamLeaderId === currentUser.id || e.formData.teamLeaderId === currentUser.empId)) ||
                              (e.formData?.teamLeaderName && currentUser.name && e.formData.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase()));
        return isSelf || isSubordinate;
      })
    : allEmployees.filter((e: any) => 
        e.id === currentUser.id || 
        e.id === currentUser.empId || 
        (currentUser.id && e.id && String(e.id).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
        (currentUser.empId && e.id && String(e.id).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
        (e.email && currentUser.email && e.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
        (e.formData?.email && currentUser.email && e.formData.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
        (e.formData?.workEmail && currentUser.email && e.formData.workEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
        (e.name && currentUser.name && e.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      );

  const visibleEmployees = (!isFullAdmin && matchedEmployees.length === 0)
    ? [{ id: currentUser.empId || currentUser.id || 'EMP-USER', name: currentUser.name || 'Employee' }]
    : matchedEmployees;

  const currentRecords = visibleEmployees.map((emp: any) => {
    const record = records.find(r => (r.empId === emp.id || r.empName === emp.name) && r.date === selectedDate);
    return {
      empId: emp.id,
      empName: emp.name,
      status: record?.status || 'Not Marked',
      checkIn: record?.checkIn || '--',
      checkOut: record?.checkOut || '--'
    };
  }).filter((r: any) => r.empName.toLowerCase().includes(searchQuery.toLowerCase()));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present': return 'bg-emerald-100 text-emerald-700';
      case 'Absent': return 'bg-red-100 text-red-700';
      case 'Half Day': return 'bg-purple-100 text-purple-700';
      case 'Late': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[999] max-w-md p-4 rounded-xl shadow-2xl border flex items-start space-x-3 backdrop-blur-md ${
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isFullAdmin ? 'Attendance Management' : isTeamLead ? 'Team Attendance Log' : 'My Attendance'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isFullAdmin 
              ? 'Track and manage daily employee attendance across the organization.'
              : isTeamLead 
              ? `Daily attendance status for team members reporting to ${currentUser.name}.`
              : `Daily attendance log and check-in history for ${currentUser.name}.`}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleFetchAttendance(true)}
            disabled={isFetchingZoho}
            className="px-3.5 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold flex items-center shadow-sm transition-all disabled:opacity-60"
            title="Fetch live attendance records from Zoho CRM"
          >
            <RefreshCw size={14} className={`mr-2 text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
            {isFetchingZoho ? 'Syncing...' : 'Fetch Zoho CRM'}
          </button>
          {!canMarkAttendance && (
            <div className="text-xs text-gray-500 bg-gray-50 px-3.5 py-2 rounded-xl font-medium border border-gray-200 flex items-center">
              <Info size={14} className="mr-1.5 text-gray-400" /> View-only Mode
            </div>
          )}
          <div className="flex items-center space-x-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
            <CalendarIcon size={18} className="text-gray-400" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="outline-none text-sm font-semibold text-gray-700 bg-transparent"
            />
          </div>
        </div>
      </div>

      {!isTM && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-transparent mt-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search employees..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange transition-all shadow-sm bg-white"
            />
          </div>
        </div>
      )}

      <div className="bg-transparent overflow-hidden mt-6">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Check In</th>
                <th className="px-6 py-3">Check Out</th>
                {canMarkAttendance && (
                  <th className="px-6 py-3 text-right">Mark Attendance</th>
                )}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {currentRecords.map((record: any) => (
                <tr key={record.empId} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">
                    {record.empName} <span className="text-gray-500 font-medium text-xs ml-2">({record.empId})</span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm w-max ${getStatusColor(record.status)}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">{record.checkIn}</td>
                  <td className={`px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800 ${!canMarkAttendance ? 'rounded-r-xl border-r' : ''}`}>
                    {record.checkOut}
                  </td>
                  {canMarkAttendance && (
                    <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                      <div className="flex items-center justify-end space-x-2 transition-opacity">
                        <button onClick={() => handleMarkAttendance(record.empId, record.empName, 'Present')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Mark Present"><CheckCircle2 size={18} /></button>
                        <button onClick={() => handleMarkAttendance(record.empId, record.empName, 'Late')} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors" title="Mark Late"><Clock size={18} /></button>
                        <button onClick={() => handleMarkAttendance(record.empId, record.empName, 'Half Day')} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors" title="Mark Half Day"><AlertCircle size={18} /></button>
                        <button onClick={() => handleMarkAttendance(record.empId, record.empName, 'Absent')} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Mark Absent"><XCircle size={18} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {currentRecords.length === 0 && (
                <tr>
                  <td colSpan={canMarkAttendance ? 5 : 4} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    {isFetchingZoho ? (
                      <div className="flex flex-col items-center justify-center py-4">
                        <Loader2 className="w-7 h-7 animate-spin text-be-orange mb-2" />
                        <p className="text-sm font-semibold text-gray-800">Fetching live attendance records from Zoho CRM...</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-lg font-medium text-gray-900">No employees found</p>
                        <p className="text-xs text-gray-400 mt-1">No attendance records found for this date.</p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
