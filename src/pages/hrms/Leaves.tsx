import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Search, Plus, Filter, Check, X, Calendar as CalendarIcon, Briefcase, Info, Users, User, Clock, CheckCircle2, XCircle, AlertCircle, Sparkles, ChevronRight, Trash2, RefreshCw, Cloud, CloudCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { saveOrUpdateZohoLeave, deleteZohoLeave, updateZohoLeave, insertZohoLeave, fetchZohoLeaves } from '../../services/zohoService';
import { DeleteConfirmModal } from '../../components/ui/DeleteConfirmModal';

interface LeaveRequest {
  id: string;
  empId: string;
  empName: string;
  dept?: string;
  teamLeaderId?: string;
  teamLeaderName?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending TL' | 'Pending HR' | 'Approved' | 'Rejected by TL' | 'Rejected by HR';
  appliedOn: string;
  zohoId?: string;
  employeeZohoId?: string;
  email?: string;
  secondaryEmail?: string;
}

export const Leaves = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { currentUser, isTM, isSuperAdmin, isHR, isTL, isHOD } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || location.state?.search || '');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const s = searchParams.get('status') || location.state?.status;
    if (s === 'Approved') return 'Approved';
    if (s === 'Pending' || s === 'Pending TL' || s === 'Pending HR') return s;
    return 'All';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingLeave, setViewingLeave] = useState<LeaveRequest | null>(null);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' | 'error' } | null>(null);
  const [syncingLeaveId, setSyncingLeaveId] = useState<string | null>(null);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; leave: LeaveRequest | null; isDeleting: boolean }>({
    isOpen: false,
    leave: null,
    isDeleting: false
  });

  useEffect(() => {
    const s = searchParams.get('status') || location.state?.status;
    if (s) setStatusFilter(s);
    const q = searchParams.get('search') || location.state?.search;
    if (q) setSearchQuery(q);
  }, [searchParams, location.state]);

  const isTeamLeader = isTL || (currentUser.role as string) === 'TL';
  const isFullAdmin = isSuperAdmin || isHR;
  const isManagerOrAdmin = isTeamLeader || isFullAdmin || isHOD || (currentUser.role as string) === 'HOD';
  const isEmployeeSelfOnly = isTM || (!isManagerOrAdmin);

  // Tab State: 'team' (Team Requests), 'personal' (My Leaves), 'all' (Super Admin/HR All)
  const [activeTab, setActiveTab] = useState<'team' | 'personal' | 'all'>(() => {
    if (isFullAdmin) return 'all';
    if (isTeamLeader || isHOD) return 'team';
    return 'personal';
  });

  const [formData, setFormData] = useState({
    empId: currentUser.empId || currentUser.id || '',
    type: 'Sick Leave',
    startDate: '',
    endDate: '',
    reason: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const showToast = (message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') => {
    setSyncToast({ message, type });
    setTimeout(() => {
      setSyncToast(null);
    }, 4500);
  };

  const syncLeavesFromZoho = async (showNotification = false) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoLeaves();
      if (res.success && Array.isArray(res.data)) {
        const emps = getEmployees();
        const zohoLeaves: LeaveRequest[] = res.data.map((z: any) => {
          let status: LeaveRequest['status'] = 'Pending TL';
          if (z.Approved_by_HR === 'Approved') status = 'Approved';
          else if (z.Approved_by_HR === 'Rejected') status = 'Rejected by HR';
          else if (z.Approved_by_TL === 'Rejected') status = 'Rejected by TL';
          else if (z.Approved_by_TL === 'Approved') status = 'Pending HR';

          const targetEmp = emps.find((e: any) => (e.zohoId && z.Employee?.id && String(e.zohoId) === String(z.Employee.id)) || (e.email && z.Email && (e.email ?? '').toLowerCase() === z.Email.toLowerCase()));

          return {
            id: `LV-ZOHO-${String(z.id).slice(-4)}`,
            empId: targetEmp?.id || (z.Employee?.id ? String(z.Employee.id) : 'EMP'),
            empName: targetEmp?.name || z.Employee?.name || 'Employee',
            dept: targetEmp?.dept || 'Operations',
            teamLeaderName: targetEmp?.teamLeaderName || '',
            type: z.Leave_Type || 'Casual Leave',
            startDate: z.Start_Date || '',
            endDate: z.End_Date || '',
            reason: z.Name || 'Leave Application',
            status,
            appliedOn: z.Created_Time ? z.Created_Time.split('T')[0] : new Date().toISOString().split('T')[0],
            zohoId: String(z.id),
            employeeZohoId: z.Employee?.id ? String(z.Employee.id) : undefined,
            email: z.Email || targetEmp?.email || '',
            secondaryEmail: z.Secondary_Email || ''
          };
        });

        const saved = localStorage.getItem('be_leaves');
        const localList: LeaveRequest[] = saved ? JSON.parse(saved) : [];

        const seenZohoIds = new Set<string>();
        const mergedList: LeaveRequest[] = [];

        for (const zL of zohoLeaves) {
          if (zL.zohoId) seenZohoIds.add(zL.zohoId);
          mergedList.push(zL);
        }

        for (const lL of localList) {
          if (lL.zohoId && seenZohoIds.has(lL.zohoId)) continue;
          mergedList.push(lL);
        }

        setLeaves(mergedList);
        localStorage.setItem('be_leaves', JSON.stringify(mergedList));

        if (showNotification) {
          showToast(`Synced ${zohoLeaves.length} leave record(s) from database`, 'success');
        }
      } else if (showNotification) {
        showToast(res.message || 'No leave records found', 'info');
      }
    } catch (err: any) {
      console.warn('[Zoho CRM] Leave sync error:', err);
      if (showNotification) {
        showToast('Failed to fetch leaves from database', 'error');
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('be_leaves');
    if (saved) {
      try {
        setLeaves(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse leaves:', e);
      }
    }

    syncLeavesFromZoho(false);
  }, []);

  const saveToStorage = (newLeaves: LeaveRequest[]) => {
    setLeaves(newLeaves);
    localStorage.setItem('be_leaves', JSON.stringify(newLeaves));
  };

  const getEmployees = () => {
    const emps = localStorage.getItem('be_employees');
    return emps ? JSON.parse(emps) : [];
  };

  const employees = getEmployees();

  // Helper: check if leave belongs to current logged-in user
  const isOwnLeave = (l: LeaveRequest) => {
    const myId = currentUser.id ? String(currentUser.id).trim().toLowerCase() : '';
    const myEmpId = currentUser.empId ? String(currentUser.empId).trim().toLowerCase() : '';
    const lEmpId = l.empId ? String(l.empId).trim().toLowerCase() : '';
    const myName = currentUser.name ? (currentUser.name ?? '').trim().toLowerCase() : '';
    const lName = l.empName ? (l.empName ?? '').trim().toLowerCase() : '';

    return (myId && lEmpId === myId) ||
      (myEmpId && lEmpId === myEmpId) ||
      (myName && lName === myName);
  };

  // Helper: check if leave belongs to a team member reporting to this TL
  const isTeamMemberLeave = (l: LeaveRequest) => {
    if (isOwnLeave(l)) return false;
    if (isFullAdmin) return true;

    const myId = currentUser.id ? String(currentUser.id).trim().toLowerCase() : '';
    const myEmpId = currentUser.empId ? String(currentUser.empId).trim().toLowerCase() : '';
    const myName = currentUser.name ? (currentUser.name ?? '').trim().toLowerCase() : '';

    const tlId = l.teamLeaderId ? String(l.teamLeaderId).trim().toLowerCase() : '';
    const tlName = l.teamLeaderName ? l.teamLeaderName.trim().toLowerCase() : '';

    const isDirectTL = (myId && tlId === myId) ||
      (myEmpId && tlId === myEmpId) ||
      (tlName && myName && tlName.includes(myName));

    // Check employee record
    const emp = employees.find((e: any) =>
      (e.id && l.empId && String(e.id).trim().toLowerCase() === String(l.empId).trim().toLowerCase()) ||
      (e.name && l.empName && (e.name ?? '').trim().toLowerCase() === (l.empName ?? '').trim().toLowerCase())
    );

    const empReportsToTL = emp && (
      (myId && (emp.teamLeaderId === myId || emp.formData?.teamLeaderId === myId)) ||
      (myEmpId && (emp.teamLeaderId === myEmpId || emp.formData?.teamLeaderId === myEmpId)) ||
      (myName && (
        (emp.teamLeaderName && emp.teamLeaderName.toLowerCase().includes(myName)) ||
        (emp.formData?.teamLeaderName && emp.formData.teamLeaderName.toLowerCase().includes(myName))
      ))
    );

    const isSameDept = l.dept && currentUser.department && (l.dept ?? '').toLowerCase() === (currentUser.department ?? '').toLowerCase();

    return isDirectTL || empReportsToTL || isSameDept || !l.teamLeaderId;
  };

  const handleStatusChange = async (id: string, newStatus: LeaveRequest['status']) => {
    const leaveToUpdate = leaves.find(l => l.id === id);
    if (!leaveToUpdate) return;

    if (newStatus === 'Pending HR' || newStatus === 'Rejected by TL') {
      if (!isTeamLeader && !isSuperAdmin && !isHOD) {
        alert('Permission Denied: Only the Team Leader, HOD, or Super Admin can approve the initial TL step.');
        return;
      }
    }
    if (newStatus === 'Approved' || newStatus === 'Rejected by HR') {
      if (!isHR && !isSuperAdmin) {
        alert('Permission Denied: Only HR Admin or Super Admin can give final leave approval.');
        return;
      }
    }

    const updatedLeave: LeaveRequest = { ...leaveToUpdate, status: newStatus };
    const updatedLeavesList = leaves.map(l => l.id === id ? updatedLeave : l);
    saveToStorage(updatedLeavesList);

    // Sync status change to Zoho CRM
    try {
      setSyncingLeaveId(id);
      const zohoRes = await saveOrUpdateZohoLeave(updatedLeave);
      if (zohoRes.success) {
        if (zohoRes.zohoId && !leaveToUpdate.zohoId) {
          const withZohoId = updatedLeavesList.map(l => l.id === id ? { ...l, zohoId: zohoRes.zohoId } : l);
          saveToStorage(withZohoId);
        }
        showToast(`Leave status updated to ${newStatus}`, 'success');
      } else {
        console.warn('[Zoho CRM] Status sync warning:', zohoRes.message);
      }
    } catch (err: any) {
      console.error('[Zoho CRM] Error updating status in Zoho CRM:', err);
    } finally {
      setSyncingLeaveId(null);
    }
  };

  const handleDeleteLeave = (leave: LeaveRequest) => {
    setDeleteTarget({ isOpen: true, leave, isDeleting: false });
  };

  const confirmDeleteLeave = async () => {
    const leave = deleteTarget.leave;
    if (!leave) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));

    try {
      setSyncingLeaveId(leave.id);
      // If synced in Zoho CRM, delete from database
      if (leave.zohoId) {
        const delRes = await deleteZohoLeave(leave.zohoId);
        if (delRes.success) {
          showToast(`Deleted from database (ID: #${leave.zohoId})`, 'success');
        } else {
          console.warn('[Zoho CRM] Delete warning from database:', delRes.message);
        }
      }
      const filtered = leaves.filter(l => l.id !== leave.id);
      saveToStorage(filtered);
      showToast('Leave request deleted successfully', 'success');
    } catch (err: any) {
      console.error('[Zoho CRM] Error deleting leave request:', err);
      showToast('Deleted locally (Delete error: ' + err.message + ')', 'warning');
    } finally {
      setSyncingLeaveId(null);
      setDeleteTarget({ isOpen: false, leave: null, isDeleting: false });
    }
  };

  const handleManualSync = async (leave: LeaveRequest) => {
    try {
      setSyncingLeaveId(leave.id);
      const zohoRes = await saveOrUpdateZohoLeave(leave);
      if (zohoRes.success) {
        const zohoId = zohoRes.zohoId || leave.zohoId;
        const updated = leaves.map(l => l.id === leave.id ? { ...l, zohoId } : l);
        saveToStorage(updated);
        showToast(`Synced successfully (ID: #${zohoId})`, 'success');
      } else {
        showToast(`Sync failed: ${zohoRes.message}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error syncing leave: ${err.message}`, 'error');
    } finally {
      setSyncingLeaveId(null);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.empId) errors.empId = 'Employee is required';
    if (!formData.startDate) errors.startDate = 'Start date is required';
    if (!formData.endDate) errors.endDate = 'End date is required';
    if (!formData.reason) errors.reason = 'Reason is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const targetEmp = employees.find((e: any) => e.id === formData.empId) ||
      employees.find((e: any) => e.id === currentUser.id || e.id === currentUser.empId) ||
      { name: currentUser.name, dept: currentUser.department, teamLeaderId: currentUser.teamLeaderId, teamLeaderName: currentUser.teamLeaderName };

    const isApplyingForSelf = formData.empId === currentUser.id || formData.empId === currentUser.empId;

    const newLeave: LeaveRequest = {
      id: `LV-${Math.floor(1000 + Math.random() * 9000)}`,
      empId: formData.empId || currentUser.empId || currentUser.id,
      empName: isApplyingForSelf ? currentUser.name : (targetEmp ? targetEmp.name : currentUser.name),
      dept: targetEmp?.dept || targetEmp?.formData?.dept || currentUser.department || 'General',
      teamLeaderId: targetEmp?.teamLeaderId || targetEmp?.formData?.teamLeaderId || currentUser.teamLeaderId,
      teamLeaderName: targetEmp?.teamLeaderName || targetEmp?.formData?.teamLeaderName || currentUser.teamLeaderName,
      type: formData.type,
      startDate: formData.startDate,
      endDate: formData.endDate,
      reason: formData.reason,
      status: 'Pending TL',
      appliedOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      employeeZohoId: targetEmp?.zohoId || (isApplyingForSelf ? currentUser.zohoId : undefined),
      email: targetEmp?.formData?.workEmail || targetEmp?.formData?.email || targetEmp?.email || currentUser.email,
      secondaryEmail: targetEmp?.formData?.personalEmail || targetEmp?.formData?.secondaryEmail
    };

    const updatedList = [newLeave, ...leaves];
    saveToStorage(updatedList);
    closeModal();
    showToast('Leave request submitted successfully.', 'info');

    // Asynchronously sync to Zoho CRM Leave_Management module
    try {
      setSyncingLeaveId(newLeave.id);
      const zohoRes = await insertZohoLeave(newLeave);
      if (zohoRes.success && zohoRes.zohoId) {
        const syncedList = updatedList.map(l => l.id === newLeave.id ? { ...l, zohoId: zohoRes.zohoId } : l);
        saveToStorage(syncedList);
        showToast(`Leave request recorded (ID: #${zohoRes.zohoId})`, 'success');
      } else {
        showToast(`Saved locally (${zohoRes.message})`, 'warning');
      }
    } catch (err: any) {
      console.error('[Zoho CRM] Error inserting leave request:', err);
      showToast('Saved locally (Sync pending)', 'warning');
    } finally {
      setSyncingLeaveId(null);
    }
  };

  const openAddModal = (forPersonalOnly = false) => {
    const shouldDefaultToSelf = forPersonalOnly || activeTab === 'personal' || isEmployeeSelfOnly;
    setFormData({
      empId: shouldDefaultToSelf ? (currentUser.empId || currentUser.id || '') : (employees[0]?.id || currentUser.empId || currentUser.id || ''),
      type: 'Sick Leave',
      startDate: '',
      endDate: '',
      reason: ''
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ empId: currentUser.empId || currentUser.id || '', type: 'Sick Leave', startDate: '', endDate: '', reason: '' });
    setFormErrors({});
  };

  // Tab leaves filtering
  const currentTabLeaves = useMemo(() => {
    if (activeTab === 'personal') {
      return leaves.filter(l => isOwnLeave(l));
    }
    if (activeTab === 'team') {
      return leaves.filter(l => isTeamMemberLeave(l));
    }
    // 'all' tab for Super Admin & HR
    return leaves;
  }, [leaves, activeTab, currentUser, employees]);

  // Filtered by Search, Type, Status
  const filteredLeaves = useMemo(() => {
    return currentTabLeaves.filter(l => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (l.empName ?? '').toLowerCase().includes(q) ||
        (l.id ?? '').toLowerCase().includes(q) ||
        (l.type ?? '').toLowerCase().includes(q) ||
        (l.reason ?? '').toLowerCase().includes(q);

      const matchesType = typeFilter === 'All' || l.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || 
        l.status === statusFilter || 
        (statusFilter === 'Pending' && (l.status === 'Pending TL' || l.status === 'Pending HR'));

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [currentTabLeaves, searchQuery, typeFilter, statusFilter]);

  // Counts for badges
  const myLeavesCount = useMemo(() => leaves.filter(l => isOwnLeave(l)).length, [leaves, currentUser]);
  const teamLeavesCount = useMemo(() => leaves.filter(l => isTeamMemberLeave(l)).length, [leaves, currentUser, employees]);
  const pendingTeamCount = useMemo(() => leaves.filter(l => isTeamMemberLeave(l) && l.status === 'Pending TL').length, [leaves, currentUser, employees]);
  const pendingHRCount = useMemo(() => leaves.filter(l => l.status === 'Pending HR').length, [leaves]);
  const myPendingCount = useMemo(() => leaves.filter(l => isOwnLeave(l) && (l.status === 'Pending TL' || l.status === 'Pending HR')).length, [leaves, currentUser]);

  // Tab Stats Cards
  const stats = useMemo(() => {
    if (activeTab === 'team') {
      const teamList = leaves.filter(l => isTeamMemberLeave(l));
      return {
        total: teamList.length,
        pending: teamList.filter(l => l.status === 'Pending TL').length,
        approved: teamList.filter(l => l.status === 'Approved').length,
        rejected: teamList.filter(l => l.status === 'Rejected by TL' || l.status === 'Rejected by HR').length,
      };
    } else if (activeTab === 'personal') {
      const myList = leaves.filter(l => isOwnLeave(l));
      return {
        total: myList.length,
        pending: myList.filter(l => l.status === 'Pending TL' || l.status === 'Pending HR').length,
        approved: myList.filter(l => l.status === 'Approved').length,
        rejected: myList.filter(l => l.status === 'Rejected by TL' || l.status === 'Rejected by HR').length,
      };
    } else {
      return {
        total: leaves.length,
        pending: leaves.filter(l => l.status === 'Pending TL' || l.status === 'Pending HR').length,
        approved: leaves.filter(l => l.status === 'Approved').length,
        rejected: leaves.filter(l => l.status === 'Rejected by TL' || l.status === 'Rejected by HR').length,
      };
    }
  }, [leaves, activeTab, currentUser, employees]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'Rejected by TL':
      case 'Rejected by HR': return 'bg-red-100 text-red-800 border border-red-200';
      case 'Pending TL': return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Pending HR': return 'bg-blue-100 text-blue-800 border border-blue-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {syncToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-20 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center space-x-3 text-sm font-semibold max-w-md ${syncToast.type === 'success'
              ? 'bg-gray-900 text-white border-gray-800'
              : syncToast.type === 'warning'
                ? 'bg-amber-900 text-amber-100 border-amber-800'
                : syncToast.type === 'error'
                  ? 'bg-red-900 text-red-100 border-red-800'
                  : 'bg-blue-900 text-blue-100 border-blue-800'
              }`}
          >
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="flex-1">{syncToast.message}</span>
            <button onClick={() => setSyncToast(null)} className="text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 sm:p-7 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-orange-100/40 via-amber-50/20 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100 shadow-sm">
              <CalendarIcon size={22} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {isEmployeeSelfOnly ? 'My Leave Requests' : 'Leave Management'}
            </h1>
          </div>
          <p className="text-gray-500 text-sm max-w-xl font-medium">
            {isEmployeeSelfOnly
              ? `Apply for leave and track your 2-step approval flow (${currentUser.name}).`
              : isTeamLeader
                ? `Manage your team's leave applications and track your own personal leave requests.`
                : isFullAdmin
                  ? 'Comprehensive organizational leave tracking: Employee ➔ TL Approval ➔ HR Approval ➔ Leave Granted.'
                  : 'Review team leave requests and manage personal leave applications.'}
          </p>
          <div className="mt-2.5 flex items-center space-x-2 text-xs font-semibold text-gray-500">

          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <button
            onClick={() => syncLeavesFromZoho(true)}
            disabled={isFetchingZoho}
            title="Refresh & Sync from database"
            className="w-11 h-11 bg-white hover:bg-orange-50 text-gray-700 hover:text-be-orange border border-gray-200 hover:border-orange-300 rounded-2xl flex items-center justify-center transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={18} className={`text-be-orange ${isFetchingZoho ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => openAddModal(true)}
            className="bg-be-orange hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center transition-all shadow-md shadow-orange-500/20 hover:shadow-lg hover:-translate-y-0.5 text-sm"
          >
            <Plus size={18} className="mr-2" />
            Apply for Leave
          </button>
        </div>
      </div>

      {/* Tabs for TL / Admin / HOD */}
      {isManagerOrAdmin && (
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200/80 pb-3">
          {/* TL / HOD: Team Requests Tab */}
          {(isTeamLeader || isHOD) && (
            <button
              onClick={() => setActiveTab('team')}
              className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2.5 ${activeTab === 'team'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/80'
                }`}
            >
              <Users size={17} />
              <span>Team Leaves</span>
              {pendingTeamCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse">
                  {pendingTeamCount} Pending
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === 'team' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                  }`}>
                  {teamLeavesCount}
                </span>
              )}
            </button>
          )}

          {/* Super Admin & HR: All Requests Tab */}
          {isFullAdmin && (
            <button
              onClick={() => setActiveTab('all')}
              className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2.5 ${activeTab === 'all'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/80'
                }`}
            >
              <Briefcase size={17} />
              <span>All Company Leaves</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                {leaves.length}
              </span>
            </button>
          )}

          {/* Personal Leaves Tab (Available to everyone) */}
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2.5 ${activeTab === 'personal'
              ? 'bg-gray-900 text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/80'
              }`}
          >
            <User size={17} />
            <span>My Personal Leaves</span>
            {myPendingCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">
                {myPendingCount} Pending
              </span>
            ) : (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === 'personal' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                {myLeavesCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              {activeTab === 'team' ? 'Team Requests' : activeTab === 'personal' ? 'Personal Applied' : 'Total Requests'}
            </div>
            <div className="text-2xl font-black text-gray-900 mt-1">{stats.total}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <CalendarIcon size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              {activeTab === 'team' ? 'Pending TL Review' : 'Under Review'}
            </div>
            <div className="text-2xl font-black text-amber-600 mt-1">{stats.pending}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Leaves Granted</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{stats.approved}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Rejected</div>
            <div className="text-2xl font-black text-red-600 mt-1">{stats.rejected}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
            <XCircle size={20} />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={activeTab === 'personal' ? "Search your leaves by type, reason, or ID..." : "Search leaves by employee, type, or ID..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange focus:bg-white transition-all text-xs sm:text-sm font-medium text-gray-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-be-orange focus:bg-white transition-all"
          >
            <option value="All">All Leave Types</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Casual Leave">Casual Leave</option>
            <option value="Privilege Leave">Privilege Leave</option>
            <option value="Unpaid Leave">Unpaid Leave</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-be-orange focus:bg-white transition-all"
          >
            <option value="All">All Statuses</option>
            <option value="Pending TL">Pending TL Review</option>
            <option value="Pending HR">Pending HR Review</option>
            <option value="Approved">Approved / Granted</option>
            <option value="Rejected by TL">Rejected by TL</option>
            <option value="Rejected by HR">Rejected by HR</option>
          </select>
        </div>
      </div>

      {/* Main Leaves Table */}
      <div className="bg-transparent overflow-hidden">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">{activeTab === 'personal' ? 'Applicant (You)' : 'Employee'}</th>
                <th className="px-6 py-3">Leave Type & Dates</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3">Applied On</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredLeaves.map((leave) => {
                const isOwn = isOwnLeave(leave);
                const isSyncing = syncingLeaveId === leave.id;

                return (
                  <tr key={leave.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                    <td className="px-6 py-5 rounded-l-2xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">
                      <div className="flex items-center space-x-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${isOwn ? 'bg-orange-100 text-be-orange' : 'bg-gray-100 text-gray-700'
                          }`}>
                          {leave.empName ? leave.empName.slice(0, 2).toUpperCase() : 'EM'}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 flex items-center">
                            {leave.empName}
                            {isOwn && (
                              <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-800 rounded-md">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 text-xs font-medium flex items-center gap-2 mt-0.5">
                            <span>{leave.empId}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <div className="font-bold text-gray-800">{leave.type}</div>
                      <div className="text-gray-500 text-xs font-medium flex items-center mt-0.5">
                        <CalendarIcon size={12} className="mr-1 text-gray-400" />
                        {leave.startDate} to {leave.endDate}
                      </div>
                    </td>
                    <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 text-gray-600 max-w-xs truncate font-medium" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 text-gray-600 font-medium">
                      {leave.appliedOn}
                    </td>
                    <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm w-max inline-block ${getStatusColor(leave.status)}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right rounded-r-2xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setViewingLeave(leave)}
                          className="px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors font-bold flex items-center text-xs"
                          title="View Flow"
                        >
                          View Flow
                        </button>

                        {/* 1. Pending TL Stage */}
                        {leave.status === 'Pending TL' && (
                          <>
                            {/* If viewing team leaves and logged in as TL/SuperAdmin, can approve/reject */}
                            {((isTeamLeader || isSuperAdmin || isHOD) && !isOwn) ? (
                              <>
                                <button
                                  onClick={() => handleStatusChange(leave.id, 'Pending HR')}
                                  disabled={isSyncing}
                                  className="px-2.5 py-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors font-semibold flex items-center text-xs shadow-sm disabled:opacity-50"
                                  title="Approve as TL"
                                >
                                  <Check size={14} className="mr-1" /> Approve (TL)
                                </button>
                                <button
                                  onClick={() => handleStatusChange(leave.id, 'Rejected by TL')}
                                  disabled={isSyncing}
                                  className="px-2.5 py-1.5 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors font-semibold flex items-center text-xs shadow-sm disabled:opacity-50"
                                  title="Reject"
                                >
                                  <X size={14} className="mr-1" /> Reject
                                </button>
                              </>
                            ) : isHR ? (
                              <span className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl flex items-center">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1.5 animate-pulse" />
                                Waiting for TL Approval
                              </span>
                            ) : isOwn ? (
                              <span className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl flex items-center">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1.5 animate-pulse" />
                                Under TL / HOD Review
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 text-xs font-semibold text-amber-600 bg-amber-50/70 border border-amber-100 rounded-xl">
                                Under TL Review
                              </span>
                            )}
                          </>
                        )}

                        {/* 2. Pending HR Stage (Only accessible after TL approves) */}
                        {leave.status === 'Pending HR' && (
                          <>
                            {isFullAdmin ? (
                              <>
                                <button
                                  onClick={() => handleStatusChange(leave.id, 'Approved')}
                                  disabled={isSyncing}
                                  className="px-2.5 py-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors font-semibold flex items-center text-xs shadow-sm disabled:opacity-50"
                                  title="Approve as HR"
                                >
                                  <Check size={14} className="mr-1" /> Approve (HR)
                                </button>
                                <button
                                  onClick={() => handleStatusChange(leave.id, 'Rejected by HR')}
                                  disabled={isSyncing}
                                  className="px-2.5 py-1.5 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors font-semibold flex items-center text-xs shadow-sm disabled:opacity-50"
                                  title="Reject"
                                >
                                  <X size={14} className="mr-1" /> Reject
                                </button>
                              </>
                            ) : (
                              <span className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl flex items-center">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5 animate-pulse" />
                                Approved by TL • Waiting for HR
                              </span>
                            )}
                          </>
                        )}

                        {/* 3. Approved / Rejected Final Badges */}
                        {leave.status === 'Approved' && (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center">
                            <Check size={13} className="mr-1 text-emerald-600" /> Leave Granted
                          </span>
                        )}

                        {leave.status === 'Rejected by TL' && (
                          <span className="text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl text-xs font-semibold">
                            Rejected by TL
                          </span>
                        )}

                        {leave.status === 'Rejected by HR' && (
                          <span className="text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl text-xs font-semibold">
                            Rejected by HR
                          </span>
                        )}

                        {/* Delete Action Button (Super Admin / HR / Owner / TL) */}
                        {(isFullAdmin || isTeamLeader || isOwn) && (
                          <button
                            onClick={() => handleDeleteLeave(leave)}
                            disabled={isSyncing}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete Leave Request"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredLeaves.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center mx-auto mb-3 border border-orange-100">
                      {activeTab === 'team' ? <Users size={30} /> : <CalendarIcon size={30} />}
                    </div>
                    <p className="text-base font-bold text-gray-900">
                      {activeTab === 'team'
                        ? 'No team leave requests found'
                        : activeTab === 'personal'
                          ? 'No personal leave requests found'
                          : 'No leave requests found'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                      {activeTab === 'team'
                        ? 'Leave applications submitted by your team members will appear here for review.'
                        : 'You have not submitted any leave requests matching the filters.'}
                    </p>
                    {activeTab === 'personal' && (
                      <button
                        onClick={() => openAddModal(true)}
                        className="mt-4 inline-flex items-center px-4 py-2 bg-be-orange text-white text-xs font-bold rounded-xl shadow hover:bg-orange-600 transition-colors"
                      >
                        <Plus size={15} className="mr-1.5" />
                        Apply for Leave
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Leave Flow Modal */}
      <AnimatePresence>
        {viewingLeave && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setViewingLeave(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl z-10 flex flex-col overflow-hidden w-full max-w-md relative"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Leave Approval Flow</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Reference ID: {viewingLeave.id} {viewingLeave.zohoId && `• Sync ID: ${viewingLeave.zohoId}`}
                  </p>
                </div>
                <button type="button" onClick={() => setViewingLeave(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-6 bg-orange-50/60 p-4 rounded-2xl border border-orange-100/80">
                  <p className="font-bold text-gray-900 text-sm">{viewingLeave.empName} <span className="text-gray-500 font-normal">({viewingLeave.empId})</span></p>
                  <p className="text-xs text-be-orange font-semibold mt-0.5">{viewingLeave.type}</p>
                  <p className="text-xs text-gray-600 mt-1 flex items-center">
                    <CalendarIcon size={12} className="mr-1 text-gray-400" />
                    {viewingLeave.startDate} to {viewingLeave.endDate}
                  </p>
                  {viewingLeave.reason && (
                    <p className="text-xs text-gray-500 mt-2 bg-white/80 p-2.5 rounded-xl border border-orange-100 italic">
                      "{viewingLeave.reason}"
                    </p>
                  )}
                  {viewingLeave.zohoId && (
                    <div className="mt-2.5 flex items-center text-[11px] text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold">
                      <Sparkles size={12} className="mr-1.5 text-emerald-600" />
                      Synced with Zoho CRM Module: Leave_Management
                    </div>
                  )}
                </div>

                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">

                  {/* Step 1: Sent */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-emerald-100 text-emerald-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <Check size={16} />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-gray-100 bg-white shadow-sm z-10">
                      <div className="font-bold text-gray-900 text-sm">Leave Request Sent</div>
                      <div className="text-xs text-gray-500 mt-0.5">Applied on {viewingLeave.appliedOn}</div>
                    </div>
                  </div>

                  {/* Step 2: TL Approval */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${viewingLeave.status === 'Pending TL' ? 'bg-orange-100 text-orange-600' :
                      viewingLeave.status === 'Rejected by TL' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                      {viewingLeave.status === 'Pending TL' ? <span className="w-2 h-2 bg-orange-600 rounded-full animate-pulse" /> :
                        viewingLeave.status === 'Rejected by TL' ? <X size={16} /> : <Check size={16} />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-gray-100 bg-white shadow-sm z-10">
                      <div className="font-bold text-gray-900 text-sm">
                        {isOwnLeave(viewingLeave) ? 'Approval by HOD / TL' : 'Approval by TL'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {viewingLeave.status === 'Pending TL' ? 'Waiting for initial review...' :
                          viewingLeave.status === 'Rejected by TL' ? 'Rejected at TL Stage' : 'Approved by Team Leader'}
                      </div>
                    </div>
                  </div>

                  {/* Step 3: HR Approval */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${viewingLeave.status === 'Pending HR' ? 'bg-orange-100 text-orange-600' :
                      viewingLeave.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' :
                        viewingLeave.status === 'Rejected by HR' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                      {viewingLeave.status === 'Pending HR' ? <span className="w-2 h-2 bg-orange-600 rounded-full animate-pulse" /> :
                        viewingLeave.status === 'Approved' ? <Check size={16} /> :
                          viewingLeave.status === 'Rejected by HR' ? <X size={16} /> : <span className="w-2 h-2 bg-gray-400 rounded-full" />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-gray-100 bg-white shadow-sm z-10">
                      <div className="font-bold text-gray-900 text-sm">Final HR Authorization</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {viewingLeave.status === 'Pending HR' ? 'Waiting for HR Admin approval...' :
                          viewingLeave.status === 'Approved' ? 'Approved by HR • Leave Granted' :
                            viewingLeave.status === 'Rejected by HR' ? 'Rejected by HR Admin' :
                              viewingLeave.status === 'Rejected by TL' ? 'Cancelled (Rejected by TL)' : 'Pending prior TL step'}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Apply for Leave Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl shadow-2xl z-10 flex flex-col overflow-hidden w-full max-w-md relative max-h-[90vh]"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {activeTab === 'personal' || isEmployeeSelfOnly ? 'Apply for Leave' : 'Create Leave Request'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Submit request for multi-stage approval & synchronization</p>
                </div>
                <button type="button" onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form id="leave-form" onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      {activeTab === 'personal' || isEmployeeSelfOnly ? 'Applying Employee (You)' : 'Select Employee *'}
                    </label>
                    {(activeTab === 'personal' || isEmployeeSelfOnly) ? (
                      <div className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 font-bold text-gray-800 text-sm flex items-center justify-between">
                        <span>{currentUser.name}</span>
                        <span className="text-xs text-gray-400 font-medium">({currentUser.empId || currentUser.id})</span>
                      </div>
                    ) : (
                      <select
                        value={formData.empId}
                        onChange={e => setFormData({ ...formData, empId: e.target.value })}
                        className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all bg-white text-sm font-semibold text-gray-800 ${formErrors.empId ? 'border-red-500' : 'border-gray-200'}`}
                      >
                        <option value={currentUser.empId || currentUser.id || ''}>
                          {currentUser.name} (You)
                        </option>
                        {employees.filter((e: any) => e.id !== currentUser.id && e.id !== currentUser.empId).map((e: any) => (
                          <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
                        ))}
                      </select>
                    )}
                    {formErrors.empId && <p className="text-red-500 text-xs mt-1 font-medium">{formErrors.empId}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Leave Type *</label>
                    <select
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none bg-white transition-all text-sm font-semibold text-gray-800"
                    >
                      <option>Sick Leave</option>
                      <option>Casual Leave</option>
                      <option>Privilege Leave</option>
                      <option>Unpaid Leave</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Start Date *</label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                        className={`w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm font-semibold text-gray-800 ${formErrors.startDate ? 'border-red-500' : 'border-gray-200'}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">End Date *</label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                        className={`w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm font-semibold text-gray-800 ${formErrors.endDate ? 'border-red-500' : 'border-gray-200'}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Reason *</label>
                    <textarea
                      value={formData.reason}
                      onChange={e => setFormData({ ...formData, reason: e.target.value })}
                      rows={3}
                      placeholder="Explain the reason for leave..."
                      className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange outline-none transition-all text-sm font-medium text-gray-800 ${formErrors.reason ? 'border-red-500' : 'border-gray-200'}`}
                    />
                  </div>
                </form>
              </div>

              <div className="p-5 border-t border-gray-100 bg-gray-50/80 flex gap-3 sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 font-bold transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="leave-form"
                  className="flex-1 px-4 py-2.5 bg-be-orange hover:bg-orange-600 text-white rounded-xl font-bold transition-colors shadow-md shadow-orange-500/20 text-sm"
                >
                  Submit Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget.isOpen}
        onClose={() => !deleteTarget.isDeleting && setDeleteTarget({ isOpen: false, leave: null, isDeleting: false })}
        onConfirm={confirmDeleteLeave}
        title="Delete Leave Request"
        itemName={deleteTarget.leave ? `${deleteTarget.leave.id} (${deleteTarget.leave.empName})` : undefined}
        message={deleteTarget.leave ? `Are you sure you want to delete leave request "${deleteTarget.leave.id} (${deleteTarget.leave.empName})"?` : undefined}
        isDeleting={deleteTarget.isDeleting}
      />
    </div>
  );
};
