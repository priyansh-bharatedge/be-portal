import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserCheck, Calendar, Briefcase, FileText, 
  ArrowRight, ArrowLeft, Eye, Check, X, Search, Phone, 
  Mail, Clock, AlertCircle, Sparkles, ChevronRight, 
  ShieldCheck, User, Building2, Layers, Crown, Shield,
  ArrowUpRight, ChevronDown, CheckCircle2, Award, UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import type { EmployeeData } from '../../utils/initialData';

export const MyTeam = () => {
  const navigate = useNavigate();
  const { currentUser, isTL, isSuperAdmin, isHR, isHOD } = useAuth();
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 3-Level Hierarchy Drilldown States
  const [selectedHOD, setSelectedHOD] = useState<EmployeeData | null>(null);
  const [selectedTL, setSelectedTL] = useState<EmployeeData | null>(null);
  const [viewTab, setViewTab] = useState<'hierarchy' | 'all-tls' | 'all-members'>('hierarchy');

  const isExecutiveAdmin = isSuperAdmin || (currentUser.role as string) === 'Super Admin' || isHR;

  useEffect(() => {
    const loadData = () => {
      const savedEmps = localStorage.getItem('be_employees');
      if (savedEmps) {
        try {
          const parsed = JSON.parse(savedEmps);
          if (Array.isArray(parsed)) {
            const seenIds = new Set<string>();
            const unique: EmployeeData[] = [];
            for (const emp of parsed) {
              const idKey = emp.id ? String(emp.id).trim().toLowerCase() : '';
              if (idKey && seenIds.has(idKey)) continue;
              if (idKey) seenIds.add(idKey);
              unique.push(emp);
            }
            setEmployees(unique);
          }
        } catch (e) {}
      }

      const savedLeaves = localStorage.getItem('be_leaves');
      if (savedLeaves) {
        try {
          setLeaves(JSON.parse(savedLeaves));
        } catch (e) {}
      }

      const savedAtt = localStorage.getItem('be_attendance');
      if (savedAtt) {
        try {
          setAttendance(JSON.parse(savedAtt));
        } catch (e) {}
      }
    };

    loadData();
    window.addEventListener('be_employees_updated', loadData);
    window.addEventListener('storage', loadData);
    return () => {
      window.removeEventListener('be_employees_updated', loadData);
      window.removeEventListener('storage', loadData);
    };
  }, []);

  const saveLeaves = (updatedLeaves: any[]) => {
    setLeaves(updatedLeaves);
    localStorage.setItem('be_leaves', JSON.stringify(updatedLeaves));
  };

  const handleLeaveAction = (leaveId: string, newStatus: 'Pending HR' | 'Rejected by TL') => {
    const updated = leaves.map(l => l.id === leaveId ? { ...l, status: newStatus } : l);
    saveLeaves(updated);
  };

  const today = new Date().toISOString().split('T')[0];

  // Helper: check if a Team Leader belongs to / reports to a given HOD
  const isTLOfHOD = (tl: EmployeeData, hod: EmployeeData) => {
    if (tl.id === hod.id || tl.id === hod.formData?.empId) return false;
    // An HOD or HR is never a subordinate TL of another HOD
    if (tl.systemRole === 'HOD' || tl.systemRole === 'HR' || tl.systemRole === 'Super Admin') return false;

    const hodId = hod.id ? String(hod.id).trim().toLowerCase() : '';
    const hodEmpId = hod.formData?.empId ? String(hod.formData.empId).trim().toLowerCase() : '';
    const hodName = hod.name ? (hod.name ?? '').trim().toLowerCase() : '';

    const tlMgrId = tl.reportingManagerId ? String(tl.reportingManagerId).trim().toLowerCase() : '';
    const tlFormMgrId = tl.formData?.reportingManagerId ? String(tl.formData.reportingManagerId).trim().toLowerCase() : '';
    const tlMgrName = tl.reportingManagerName ? tl.reportingManagerName.trim().toLowerCase() : '';
    const tlFormMgrName = tl.formData?.reportingManagerName ? tl.formData.reportingManagerName.trim().toLowerCase() : '';

    // Direct reporting ID/Name match
    if (hodId && (tlMgrId === hodId || tlFormMgrId === hodId)) return true;
    if (hodEmpId && (tlMgrId === hodEmpId || tlFormMgrId === hodEmpId)) return true;
    if (hodName && (tlMgrName.includes(hodName) || tlFormMgrName.includes(hodName))) return true;

    // Same Department match
    if (tl.dept && hod.dept && (tl.dept ?? '').toLowerCase().trim() === (hod.dept ?? '').toLowerCase().trim()) return true;

    return false;
  };

  // Helper: check if a member reports to a given TL
  const isMemberOfTL = (member: EmployeeData, tl: EmployeeData) => {
    if (member.id === tl.id || member.id === tl.formData?.empId) return false;
    // HODs, HR, Super Admin are never team members under a TL
    if (member.systemRole === 'HOD' || member.systemRole === 'Super Admin' || member.systemRole === 'HR') return false;

    const tlId = tl.id ? String(tl.id).trim().toLowerCase() : '';
    const tlEmpId = tl.formData?.empId ? String(tl.formData.empId).trim().toLowerCase() : '';
    const tlName = tl.name ? (tl.name ?? '').trim().toLowerCase() : '';

    const mTLId = member.teamLeaderId ? String(member.teamLeaderId).trim().toLowerCase() : '';
    const mFormTLId = member.formData?.teamLeaderId ? String(member.formData.teamLeaderId).trim().toLowerCase() : '';
    const mTLName = member.teamLeaderName ? member.teamLeaderName.trim().toLowerCase() : '';
    const mFormTLName = member.formData?.teamLeaderName ? member.formData.teamLeaderName.trim().toLowerCase() : '';

    const matchId = (tlId && (mTLId === tlId || mFormTLId === tlId)) ||
                    (tlEmpId && (mTLId === tlEmpId || mFormTLId === tlEmpId));
    const matchName = (tlName && (mTLName.includes(tlName) || mFormTLName.includes(tlName)));

    if (matchId || matchName) return true;

    // Fallback by department if not explicitly assigned to another TL
    if (!mTLId && !mFormTLId && !mTLName && !mFormTLName) {
      if (member.dept && tl.dept && (member.dept ?? '').toLowerCase().trim() === (tl.dept ?? '').toLowerCase().trim() && (member.systemRole === 'TM' || !member.systemRole)) {
        return true;
      }
    }

    return false;
  };

  // Helper: check if an employee belongs to an HOD's departmental sphere
  const isMemberOfHOD = (member: EmployeeData, hod: EmployeeData) => {
    if (member.id === hod.id || member.id === hod.formData?.empId) return false;
    if (member.systemRole === 'Super Admin' || member.systemRole === 'HOD' || member.systemRole === 'HR') return false;

    const hodId = hod.id ? String(hod.id).trim().toLowerCase() : '';
    const hodEmpId = hod.formData?.empId ? String(hod.formData.empId).trim().toLowerCase() : '';
    const hodName = hod.name ? (hod.name ?? '').trim().toLowerCase() : '';

    const mMgrId = member.reportingManagerId ? String(member.reportingManagerId).trim().toLowerCase() : '';
    const mFormMgrId = member.formData?.reportingManagerId ? String(member.formData.reportingManagerId).trim().toLowerCase() : '';
    const mMgrName = member.reportingManagerName ? member.reportingManagerName.trim().toLowerCase() : '';
    const mFormMgrName = member.formData?.reportingManagerName ? member.formData.reportingManagerName.trim().toLowerCase() : '';

    const mTLId = member.teamLeaderId ? String(member.teamLeaderId).trim().toLowerCase() : '';
    const mTLName = member.teamLeaderName ? member.teamLeaderName.trim().toLowerCase() : '';

    // If member explicitly assigned HOD as leader/manager
    if (hodId && (mMgrId === hodId || mFormMgrId === hodId || mTLId === hodId)) return true;
    if (hodEmpId && (mMgrId === hodEmpId || mFormMgrId === hodEmpId || mTLId === hodEmpId)) return true;
    if (hodName && (mMgrName.includes(hodName) || mFormMgrName.includes(hodName) || mTLName.includes(hodName))) return true;

    // Check if member's TL reports to this HOD
    const memberTL = allTeamLeadersList.find(tl => isMemberOfTL(member, tl));
    if (memberTL && isTLOfHOD(memberTL, hod)) return true;

    // Fallback: same department
    if (member.dept && hod.dept && (member.dept ?? '').toLowerCase().trim() === (hod.dept ?? '').toLowerCase().trim()) return true;

    return false;
  };

  // Extract all HODs (Department Heads) under MD Sir
  const hodsList = useMemo(() => {
    return employees.filter(e => {
      const isSelfAdmin = e.id === currentUser.id || e.id === currentUser.empId || e.systemRole === 'Super Admin' || e.role?.toLowerCase().includes('managing director');
      if (isSelfAdmin) return false;

      const isHODRole = e.systemRole === 'HOD' || e.systemRole === 'HR';
      return isHODRole;
    });
  }, [employees, currentUser]);

  // Extract all Team Leaders (STRICT: Must be systemRole === 'TL', NEVER HOD or HR)
  const allTeamLeadersList = useMemo(() => {
    return employees.filter(e => {
      const isSelfAdmin = e.id === currentUser.id || e.id === currentUser.empId || e.systemRole === 'Super Admin';
      if (isSelfAdmin) return false;

      // An HOD or HR Admin is NEVER a Team Leader!
      if (e.systemRole === 'HOD' || e.systemRole === 'HR' || e.systemRole === 'Super Admin') return false;

      const isTLRole = e.systemRole === 'TL';
      return isTLRole;
    });
  }, [employees, currentUser]);

  // Direct TLs (Real TLs who don't have an intermediate HOD in their department)
  const directTLsUnderMD = useMemo(() => {
    if (hodsList.length === 0) return allTeamLeadersList;
    return allTeamLeadersList.filter(tl => !hodsList.some(hod => isTLOfHOD(tl, hod)));
  }, [allTeamLeadersList, hodsList]);

  // For logged-in HOD, automatically lock HOD scope
  useEffect(() => {
    if (isHOD && !selectedHOD) {
      const myHOD = employees.find(e => e.id === currentUser.id || e.id === currentUser.empId) || {
        id: currentUser.id || currentUser.empId,
        name: currentUser.name,
        dept: currentUser.department || 'Operations',
        systemRole: 'HOD',
        role: 'Department Head'
      } as EmployeeData;
      setSelectedHOD(myHOD);
    }
  }, [isHOD, employees, currentUser, selectedHOD]);

  // TLs for the currently active HOD
  const activeTLsList = useMemo(() => {
    if (selectedHOD) {
      return allTeamLeadersList.filter(tl => isTLOfHOD(tl, selectedHOD));
    }
    return allTeamLeadersList;
  }, [allTeamLeadersList, selectedHOD]);

  // Direct Staff for currently active HOD (strictly Team Members who are NOT Team Leaders)
  const activeHODDirectMembers = useMemo(() => {
    if (!selectedHOD) return [];
    return employees.filter(e => {
      // Must NOT be a TL, HOD, HR, or Super Admin
      if (e.systemRole === 'TL' || e.systemRole === 'HOD' || e.systemRole === 'HR' || e.systemRole === 'Super Admin') return false;
      if (!isMemberOfHOD(e, selectedHOD)) return false;

      // If this member is already under one of this HOD's TLs, they belong inside that TL's team (Level 3)
      const underTL = activeTLsList.some(tl => isMemberOfTL(e, tl));
      return !underTL;
    });
  }, [employees, selectedHOD, activeTLsList]);

  // Team Members for currently active TL (or HOD/MD scope)
  const activeMembersList = useMemo(() => {
    if (selectedTL) {
      return employees.filter(e => isMemberOfTL(e, selectedTL));
    }
    if (selectedHOD) {
      return employees.filter(e => isMemberOfHOD(e, selectedHOD));
    }
    if (isTL) {
      const currentTL = employees.find(e => e.id === currentUser.id || e.id === currentUser.empId) || {
        id: currentUser.id || currentUser.empId,
        name: currentUser.name,
      } as EmployeeData;
      return employees.filter(e => isMemberOfTL(e, currentTL));
    }
    return employees.filter(e => e.systemRole !== 'Super Admin');
  }, [employees, selectedTL, selectedHOD, isTL, currentUser]);

  // Filtered lists based on search query
  const filteredHODs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return hodsList.filter(hod => 
      (hod.name ?? '').toLowerCase().includes(q) ||
      (hod.id ?? '').toLowerCase().includes(q) ||
      (hod.dept ?? '').toLowerCase().includes(q) ||
      (hod.role ?? '').toLowerCase().includes(q)
    );
  }, [hodsList, searchQuery]);

  const filteredTeamLeaders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return activeTLsList.filter(tl => 
      (tl.name ?? '').toLowerCase().includes(q) ||
      (tl.id ?? '').toLowerCase().includes(q) ||
      (tl.dept ?? '').toLowerCase().includes(q) ||
      (tl.role ?? '').toLowerCase().includes(q)
    );
  }, [activeTLsList, searchQuery]);

  const filteredDirectTLs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return directTLsUnderMD.filter(tl => 
      (tl.name ?? '').toLowerCase().includes(q) ||
      (tl.id ?? '').toLowerCase().includes(q) ||
      (tl.dept ?? '').toLowerCase().includes(q) ||
      (tl.role ?? '').toLowerCase().includes(q)
    );
  }, [directTLsUnderMD, searchQuery]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return activeMembersList.filter(e =>
      (e.name ?? '').toLowerCase().includes(q) ||
      (e.id ?? '').toLowerCase().includes(q) ||
      (e.role ?? '').toLowerCase().includes(q) ||
      (e.dept ?? '').toLowerCase().includes(q)
    );
  }, [activeMembersList, searchQuery]);

  const filteredDirectHODMembers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return activeHODDirectMembers.filter(e =>
      (e.name ?? '').toLowerCase().includes(q) ||
      (e.id ?? '').toLowerCase().includes(q) ||
      (e.role ?? '').toLowerCase().includes(q) ||
      (e.dept ?? '').toLowerCase().includes(q)
    );
  }, [activeHODDirectMembers, searchQuery]);

  // Overall Stats
  const totalHODsCount = hodsList.length;
  const totalTLsCount = allTeamLeadersList.length;
  const totalMembersCount = employees.filter(e => e.systemRole !== 'Super Admin').length;

  const currentLevelMembers = selectedTL
    ? employees.filter(e => isMemberOfTL(e, selectedTL))
    : selectedHOD
    ? employees.filter(e => isMemberOfHOD(e, selectedHOD))
    : employees.filter(e => e.systemRole !== 'Super Admin');

  const pendingLeavesForView = leaves.filter(l =>
    (l.status === 'Pending TL' || l.status === 'Pending HR') &&
    currentLevelMembers.some(m => m.id === l.empId || m.name === l.empName)
  );

  const presentTodayForView = currentLevelMembers.filter(m => {
    const record = attendance.find(a => (a.empId === m.id || a.empName === m.name) && a.date === today);
    return record?.status === 'Present' || record?.status === 'Late';
  }).length;

  // Determine current active level in the 3-Tier Hierarchy
  const currentHierarchyLevel = selectedTL ? 3 : selectedHOD ? 2 : 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-orange-100/40 via-amber-50/20 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100 shadow-sm">
                <Crown size={22} className="text-be-orange" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {isExecutiveAdmin
                  ? (selectedTL 
                      ? `${selectedTL.name}'s Team Members`
                      : selectedHOD 
                      ? `${selectedHOD.name} (${selectedHOD.dept} HOD)`
                      : 'Managing Director Team Hub')
                  : isHOD
                  ? (selectedTL ? `${selectedTL.name}'s Team` : `${currentUser.name} (Department Team Hub)`)
                  : 'My Team Management Hub'}
              </h1>
            </div>
            
            <p className="text-gray-500 text-sm font-medium">
              Manage organization reporting structure, department team leaders, and team members.
            </p>
          </div>

          {/* Top Actions / Back Navigation */}
          <div className="flex items-center space-x-2 shrink-0">
            {selectedTL && (
              <button
                onClick={() => {
                  setSelectedTL(null);
                  setSearchQuery('');
                }}
                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md flex items-center transition-all hover:-translate-y-0.5"
              >
                <ArrowLeft size={16} className="mr-2" />
                {selectedHOD ? `Back to ${selectedHOD.name}'s Department` : 'Back to Team Leaders'}
              </button>
            )}

            {!selectedTL && selectedHOD && !isHOD && (
              <button
                onClick={() => {
                  setSelectedHOD(null);
                  setSearchQuery('');
                }}
                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md flex items-center transition-all hover:-translate-y-0.5"
              >
                <ArrowLeft size={16} className="mr-2" />
                Back to All HODs
              </button>
            )}

            {pendingLeavesForView.length > 0 && (
              <div className="px-3.5 py-2.5 bg-amber-500 text-white rounded-2xl text-xs font-bold shadow-md shadow-amber-500/20 flex items-center animate-pulse">
                <AlertCircle size={15} className="mr-1.5" />
                {pendingLeavesForView.length} Leave {pendingLeavesForView.length === 1 ? 'Request' : 'Requests'} Pending
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              {currentHierarchyLevel === 1 ? 'Department HODs' : currentHierarchyLevel === 2 ? 'Team Leaders (TL)' : 'Team Members'}
            </span>
            <span className="text-2xl font-black text-gray-900">
              {currentHierarchyLevel === 1 ? totalHODsCount : currentHierarchyLevel === 2 ? activeTLsList.length : currentLevelMembers.length}
            </span>
            <span className="text-[11px] text-gray-400 font-medium block mt-0.5">
              {currentHierarchyLevel === 1 ? `${totalTLsCount} TLs organization-wide` : currentHierarchyLevel === 2 ? `In ${selectedHOD?.dept || 'department'}` : `Under ${selectedTL?.name || 'TL'}`}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            {currentHierarchyLevel === 1 ? <Building2 size={24} /> : currentHierarchyLevel === 2 ? <Shield size={24} /> : <Users size={24} />}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Staff Count</span>
            <span className="text-2xl font-black text-gray-900">
              {currentLevelMembers.length}
            </span>
            <span className="text-[11px] text-gray-400 font-medium block mt-0.5">
              {currentHierarchyLevel === 1 ? `${totalMembersCount} total employees` : `Active in this branch`}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100">
            <Users size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Present Today</span>
            <span className="text-2xl font-black text-emerald-600">
              {presentTodayForView} <span className="text-xs text-gray-400 font-medium">/ {currentLevelMembers.length}</span>
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">
              {currentLevelMembers.length > 0 ? `${Math.round((presentTodayForView / currentLevelMembers.length) * 100)}% attendance rate` : 'No members'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <UserCheck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Pending Leaves</span>
            <span className="text-2xl font-black text-amber-600">{pendingLeavesForView.length}</span>
            <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
              {pendingLeavesForView.length > 0 ? 'Requires attention' : 'All leaves updated'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Briefcase size={24} />
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation & View Tabs */}
      {(isExecutiveAdmin || selectedHOD || selectedTL) && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-3">
          {/* Active Breadcrumb Trail when drilled into HOD or TL */}
          {(selectedHOD || selectedTL) ? (
            <div className="flex items-center flex-wrap gap-2 text-xs sm:text-sm font-bold">
              {!isHOD && (
                <button
                  onClick={() => {
                    setSelectedHOD(null);
                    setSelectedTL(null);
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors font-bold flex items-center"
                >
                  <Building2 size={14} className="mr-1.5 text-gray-600" />
                  All HODs
                </button>
              )}

              {selectedHOD && (
                <>
                  {!isHOD && <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                  <button
                    onClick={() => {
                      setSelectedTL(null);
                      setSearchQuery('');
                    }}
                    className={`px-3 py-1.5 rounded-xl transition-all flex items-center ${
                      selectedHOD && !selectedTL
                        ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-300 font-extrabold shadow-xs'
                        : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    <Building2 size={14} className="mr-1.5 text-blue-600" />
                    {selectedHOD.name} ({selectedHOD.dept})
                  </button>
                </>
              )}

              {selectedTL && (
                <>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  <div className="px-3 py-1.5 rounded-xl bg-orange-100 text-orange-900 ring-2 ring-orange-300 font-extrabold flex items-center shadow-xs">
                    <ShieldCheck size={14} className="mr-1.5 text-orange-600" />
                    {selectedTL.name}'s Team
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Root View Header Label */
            <div className="flex items-center space-x-2 text-sm font-extrabold text-gray-800">
              <Building2 size={16} className="text-be-orange" />
              <span>Department Overview</span>
            </div>
          )}

          {/* View Switchers for Super Admin & HR (Root Level) */}
          {isExecutiveAdmin && !selectedHOD && !selectedTL && (
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setViewTab('hierarchy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewTab === 'hierarchy' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🏢 By HOD Hierarchy
              </button>
              <button
                onClick={() => setViewTab('all-tls')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewTab === 'all-tls' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                👔 All Team Leaders ({totalTLsCount})
              </button>
              <button
                onClick={() => setViewTab('all-members')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewTab === 'all-members' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                👥 All Employees ({totalMembersCount})
              </button>
            </div>
          )}

        {/* Quick Switchers when drilled down */}
        {selectedHOD && !selectedTL && hodsList.length > 1 && !isHOD && (
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-gray-500">Switch HOD:</span>
            <select
              value={selectedHOD.id}
              onChange={(e) => {
                const found = hodsList.find(h => h.id === e.target.value);
                if (found) {
                  setSelectedHOD(found);
                  setSelectedTL(null);
                }
              }}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-be-orange"
            >
              {hodsList.map(h => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.dept} HOD)
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedTL && activeTLsList.length > 1 && (
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-gray-500">Switch TL:</span>
            <select
              value={selectedTL.id}
              onChange={(e) => {
                const found = activeTLsList.find(t => t.id === e.target.value);
                if (found) setSelectedTL(found);
              }}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-be-orange"
            >
              {activeTLsList.map(tl => (
                <option key={tl.id} value={tl.id}>
                  {tl.name} ({tl.dept})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={
              currentHierarchyLevel === 1 && viewTab === 'hierarchy'
                ? "Search HODs by name, department, or ID..."
                : currentHierarchyLevel === 2 || viewTab === 'all-tls'
                ? "Search Team Leaders by name, department, or ID..."
                : "Search team members by name, role, or ID..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange focus:bg-white transition-all text-xs sm:text-sm font-medium"
          />
        </div>

        <div className="text-xs font-semibold text-gray-500 flex items-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
          {currentHierarchyLevel === 1 && viewTab === 'hierarchy' && (
            <span>Showing <strong>{filteredHODs.length}</strong> HODs reporting directly to MD Sir</span>
          )}
          {currentHierarchyLevel === 2 && (
            <span>Showing <strong>{filteredTeamLeaders.length}</strong> TLs & <strong>{filteredDirectHODMembers.length}</strong> Direct Staff in {selectedHOD?.dept}</span>
          )}
          {currentHierarchyLevel === 3 && (
            <span>Showing <strong>{filteredMembers.length}</strong> Team Members under {selectedTL?.name}</span>
          )}
          {viewTab === 'all-tls' && !selectedHOD && (
            <span>Showing <strong>{filteredTeamLeaders.length}</strong> Team Leaders organization-wide</span>
          )}
          {viewTab === 'all-members' && !selectedHOD && (
            <span>Showing <strong>{filteredMembers.length}</strong> Total Employees</span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LEVEL 1: HODs Grid (Under MD Sir) */}
      {/* ========================================================================= */}
      {currentHierarchyLevel === 1 && viewTab === 'hierarchy' && (
        <div className="space-y-8">
          <div>
            <div className="flex items-center space-x-2 text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-4">
              <Building2 size={18} className="text-blue-600" />
              <span>Department Heads & Admins (Reporting directly to MD Sir)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredHODs.map((hod) => {
                const hodTLs = allTeamLeadersList.filter(tl => isTLOfHOD(tl, hod));
                const hodStaff = employees.filter(e => isMemberOfHOD(e, hod) && e.systemRole !== 'TL');
                const hodTotalPeople = [...hodTLs, ...hodStaff];
                const hodPendingLeaves = leaves.filter(l =>
                  (l.status === 'Pending TL' || l.status === 'Pending HR') &&
                  hodTotalPeople.some(m => m.id === l.empId || m.name === l.empName)
                );
                const hodPresentCount = hodTotalPeople.filter(m => {
                  const record = attendance.find(a => (a.empId === m.id || a.empName === m.name) && a.date === today);
                  return record?.status === 'Present' || record?.status === 'Late';
                }).length;

                return (
                  <div 
                    key={hod.id} 
                    onClick={() => {
                      setSelectedHOD(hod);
                      setSelectedTL(null);
                      setSearchQuery('');
                    }}
                    className="bg-white rounded-3xl border border-blue-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-xl hover:border-blue-300 transition-all duration-300 group cursor-pointer relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-bl from-blue-100/40 via-indigo-50/20 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />

                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3.5">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                            {(hod.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-extrabold text-gray-900 text-base group-hover:text-blue-600 transition-colors">
                              {hod.name}
                            </h3>
                            <p className="text-xs text-gray-400 font-mono font-semibold mt-0.5">
                              {hod.id} • <span className="text-blue-600 font-bold">{hod.dept} Department</span>
                            </p>
                          </div>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shadow-xs ${
                          hod.systemRole === 'HR'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {hod.systemRole === 'HR' ? 'HR Admin' : 'Admin (HOD)'}
                        </span>
                      </div>

                      {/* HOD Info Box */}
                      <div className="space-y-2 text-xs text-gray-600 mb-4 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium">Designation</span>
                          <span className="font-bold text-gray-800">{hod.role}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium">Email</span>
                          <span className="font-medium text-gray-700 truncate max-w-[170px]">{hod.email || hod.formData?.workEmail || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium">Contact</span>
                          <span className="font-medium text-gray-700">{hod.mobile || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                          <span className="text-gray-400 font-medium">Reporting Line</span>
                          <span className="font-extrabold text-purple-700 flex items-center">
                            <Crown size={12} className="mr-1 text-purple-600" />
                            MD Sir (Super Admin)
                          </span>
                        </div>
                      </div>

                      {/* Subordinates & Team Stats Grid */}
                      <div className="grid grid-cols-4 gap-2 mb-4">
                        <div className="bg-blue-50/80 p-2 rounded-xl border border-blue-100 text-center">
                          <div className="text-[10px] font-bold text-blue-700 uppercase">TLs</div>
                          <div className="text-base font-black text-gray-900 mt-0.5">{hodTLs.length}</div>
                        </div>
                        <div className="bg-orange-50/80 p-2 rounded-xl border border-orange-100 text-center">
                          <div className="text-[10px] font-bold text-orange-700 uppercase">Staff</div>
                          <div className="text-base font-black text-gray-900 mt-0.5">{hodStaff.length}</div>
                        </div>
                        <div className="bg-emerald-50/80 p-2 rounded-xl border border-emerald-100 text-center">
                          <div className="text-[10px] font-bold text-emerald-700 uppercase">Present</div>
                          <div className="text-base font-black text-emerald-700 mt-0.5">{hodPresentCount}</div>
                        </div>
                        <div className="bg-amber-50/80 p-2 rounded-xl border border-amber-100 text-center">
                          <div className="text-[10px] font-bold text-amber-700 uppercase">Leaves</div>
                          <div className="text-base font-black text-amber-700 mt-0.5">{hodPendingLeaves.length}</div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-600 group-hover:text-blue-700 transition-colors flex items-center">
                        {hodTLs.length > 0 ? `Explore ${hodTLs.length} TLs & Department Team` : `Explore ${hodStaff.length} Department Staff`}
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-all shadow-sm">
                        <ArrowRight size={15} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredHODs.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
                  <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
                  <h3 className="text-lg font-bold text-gray-800">No Department HODs Found</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                    No employees are currently configured with the Admin (HOD) role. You can create an HOD in the Employees directory.
                  </p>
                  <button
                    onClick={() => navigate('/hrms/employees')}
                    className="mt-4 px-4 py-2 bg-be-orange text-white rounded-xl text-xs font-bold shadow hover:bg-orange-600 transition-colors"
                  >
                    Go to Employee Directory
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Direct Team Leaders under MD Sir (Only real TLs with systemRole === 'TL' without an intermediate HOD) */}
          {filteredDirectTLs.length > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-2 text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-4">
                <ShieldCheck size={18} className="text-amber-600" />
                <span>Direct Team Leaders (Reporting directly to MD Sir)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDirectTLs.map((tl) => {
                  const tlMembers = employees.filter(e => isMemberOfTL(e, tl));
                  const tlPendingLeaves = leaves.filter(l => 
                    l.status === 'Pending TL' && 
                    tlMembers.some(m => m.id === l.empId || m.name === l.empName)
                  );
                  const tlPresentCount = tlMembers.filter(m => {
                    const record = attendance.find(a => (a.empId === m.id || a.empName === m.name) && a.date === today);
                    return record?.status === 'Present' || record?.status === 'Late';
                  }).length;

                  return (
                    <div 
                      key={tl.id} 
                      onClick={() => {
                        setSelectedTL(tl);
                        setSearchQuery('');
                      }}
                      className="bg-white rounded-3xl border border-amber-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-xl hover:border-amber-300 transition-all duration-300 group cursor-pointer relative overflow-hidden"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3.5">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-be-orange to-amber-500 text-white flex items-center justify-center font-extrabold text-lg shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                              {(tl.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-gray-900 text-base group-hover:text-be-orange transition-colors">
                                {tl.name}
                              </h3>
                              <p className="text-xs text-gray-400 font-mono font-semibold mt-0.5">
                                {tl.id} • <span className="text-orange-600 font-bold">{tl.dept}</span>
                              </p>
                            </div>
                          </div>

                          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shadow-sm">
                            Team Leader
                          </span>
                        </div>

                        <div className="space-y-2 text-xs text-gray-600 mb-4 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Designation</span>
                            <span className="font-bold text-gray-800">{tl.role}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Email</span>
                            <span className="font-medium text-gray-700 truncate max-w-[170px]">{tl.email || tl.formData?.workEmail || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Reporting</span>
                            <span className="font-extrabold text-purple-700">MD Sir (Direct)</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-orange-50/70 p-2.5 rounded-xl border border-orange-100 text-center">
                            <div className="text-[10px] font-bold text-orange-700 uppercase">Team Size</div>
                            <div className="text-base font-black text-gray-900 mt-0.5">{tlMembers.length}</div>
                          </div>
                          <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100 text-center">
                            <div className="text-[10px] font-bold text-emerald-700 uppercase">Present</div>
                            <div className="text-base font-black text-emerald-700 mt-0.5">{tlPresentCount}</div>
                          </div>
                          <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-100 text-center">
                            <div className="text-[10px] font-bold text-amber-700 uppercase">Leaves</div>
                            <div className="text-base font-black text-amber-700 mt-0.5">{tlPendingLeaves.length}</div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 group-hover:text-be-orange transition-colors">
                          Click to view {tlMembers.length} employees
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-orange-50 text-be-orange group-hover:bg-be-orange group-hover:text-white flex items-center justify-center transition-all shadow-sm">
                          <ArrowRight size={15} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 2: Inside Selected HOD (TLs Grid + Direct Staff) */}
      {/* ========================================================================= */}
      {((currentHierarchyLevel === 2) || (currentHierarchyLevel === 1 && viewTab === 'all-tls')) && (
        <div className="space-y-8">
          {selectedHOD && (
            <div className="bg-blue-50/70 p-5 rounded-3xl border border-blue-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shadow-blue-600/20">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-blue-950">
                    {selectedHOD.dept} Department Overview
                  </h2>
                  <p className="text-xs text-blue-700 font-medium mt-0.5">
                    Admin (HOD): <strong>{selectedHOD.name}</strong> • Reporting to <strong>MD Sir (Super Admin)</strong> • Contact: {selectedHOD.mobile || selectedHOD.email || '-'}
                  </p>
                </div>
              </div>

              {!isHOD && (
                <button
                  onClick={() => {
                    setSelectedHOD(null);
                    setSelectedTL(null);
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 bg-white text-blue-900 hover:bg-blue-100 border border-blue-300 rounded-xl text-xs font-bold transition-colors flex items-center shadow-xs"
                >
                  <ArrowLeft size={14} className="mr-1.5" />
                  All HODs
                </button>
              )}
            </div>
          )}

          {/* Section 1: Team Leaders in this Department (if any) */}
          {filteredTeamLeaders.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-4">
                <ShieldCheck size={18} className="text-amber-600" />
                <span>Team Leaders in {selectedHOD ? selectedHOD.dept : 'Organization'} ({filteredTeamLeaders.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTeamLeaders.map((tl) => {
                  const tlMembers = employees.filter(e => isMemberOfTL(e, tl));
                  const tlPendingLeaves = leaves.filter(l => 
                    l.status === 'Pending TL' && 
                    tlMembers.some(m => m.id === l.empId || m.name === l.empName)
                  );
                  const tlPresentCount = tlMembers.filter(m => {
                    const record = attendance.find(a => (a.empId === m.id || a.empName === m.name) && a.date === today);
                    return record?.status === 'Present' || record?.status === 'Late';
                  }).length;

                  return (
                    <div 
                      key={tl.id} 
                      onClick={() => {
                        setSelectedTL(tl);
                        setSearchQuery('');
                      }}
                      className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-xl hover:border-orange-200 transition-all duration-300 group cursor-pointer relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-orange-100/40 via-amber-50/20 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />

                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3.5">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-be-orange to-amber-500 text-white flex items-center justify-center font-extrabold text-lg shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                              {(tl.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-gray-900 text-base group-hover:text-be-orange transition-colors">
                                {tl.name}
                              </h3>
                              <p className="text-xs text-gray-400 font-mono font-semibold mt-0.5">
                                {tl.id} • <span className="text-orange-600 font-bold">{tl.dept}</span>
                              </p>
                            </div>
                          </div>

                          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shadow-sm">
                            Team Leader
                          </span>
                        </div>

                        <div className="space-y-2 text-xs text-gray-600 mb-4 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Designation</span>
                            <span className="font-bold text-gray-800">{tl.role}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Email</span>
                            <span className="font-medium text-gray-700 truncate max-w-[170px]">{tl.email || tl.formData?.workEmail || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Contact</span>
                            <span className="font-medium text-gray-700">{tl.mobile || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                            <span className="text-gray-400 font-medium">Supervising HOD</span>
                            <span className="font-bold text-blue-700">{selectedHOD ? selectedHOD.name : (tl.reportingManagerName || 'Admin HOD')}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-orange-50/70 p-2.5 rounded-xl border border-orange-100 text-center">
                            <div className="text-[10px] font-bold text-orange-700 uppercase">Team Size</div>
                            <div className="text-base font-black text-gray-900 mt-0.5">{tlMembers.length}</div>
                          </div>
                          <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100 text-center">
                            <div className="text-[10px] font-bold text-emerald-700 uppercase">Present</div>
                            <div className="text-base font-black text-emerald-700 mt-0.5">{tlPresentCount}</div>
                          </div>
                          <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-100 text-center">
                            <div className="text-[10px] font-bold text-amber-700 uppercase">Leaves</div>
                            <div className="text-base font-black text-amber-700 mt-0.5">{tlPendingLeaves.length}</div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 group-hover:text-be-orange transition-colors">
                          Click to view {tlMembers.length} employees
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-orange-50 text-be-orange group-hover:bg-be-orange group-hover:text-white flex items-center justify-center transition-all shadow-sm">
                          <ArrowRight size={15} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Direct Department Staff (Reporting directly to HOD or members in this dept) */}
          {selectedHOD && filteredDirectHODMembers.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-4">
                <Users size={18} className="text-blue-600" />
                <span>Department Staff (Reporting directly to HOD {selectedHOD.name}) ({filteredDirectHODMembers.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDirectHODMembers.map((member) => {
                  const memberLeaves = leaves.filter(l => l.empId === member.id || l.empName === member.name);
                  const memberPendingLeaves = memberLeaves.filter(l => l.status === 'Pending TL' || l.status === 'Pending HR');
                  const todayAtt = attendance.find(a => (a.empId === member.id || a.empName === member.name) && a.date === today);

                  return (
                    <div 
                      key={member.id} 
                      className="bg-white rounded-3xl border border-blue-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md hover:border-blue-300 transition-all duration-200"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-md shadow-blue-500/20">
                              {(member.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-gray-900 text-base">{member.name}</h3>
                              <p className="text-xs text-gray-400 font-mono font-medium">{member.id} • {member.dept}</p>
                            </div>
                          </div>

                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            todayAtt?.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            todayAtt?.status === 'Late' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                            todayAtt?.status === 'Absent' ? 'bg-red-50 text-red-700 border border-red-200' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {todayAtt?.status || 'Not Marked'}
                          </span>
                        </div>

                        <div className="space-y-2 text-xs text-gray-600 mb-4 bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Designation</span>
                            <span className="font-bold text-gray-800">{member.role}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Email</span>
                            <span className="font-medium text-gray-700 truncate max-w-[170px]">{member.email || member.formData?.workEmail || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Contact</span>
                            <span className="font-medium text-gray-700">{member.mobile || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                            <span className="text-gray-400 font-medium">Direct HOD</span>
                            <span className="font-extrabold text-blue-700">{selectedHOD.name}</span>
                          </div>
                        </div>

                        {/* Pending Leave Requests */}
                        {memberPendingLeaves.length > 0 && (
                          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-amber-900 flex items-center">
                                <Clock size={12} className="mr-1 text-amber-600 animate-spin" />
                                Pending Leave Request
                              </span>
                              <span className="text-[10px] font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                                HOD Approval Required
                              </span>
                            </div>
                            {memberPendingLeaves.map((pl: any) => (
                              <div key={pl.id} className="text-xs text-gray-700 space-y-1.5 pt-1">
                                <div className="font-semibold text-gray-900">{pl.type} ({pl.startDate} to {pl.endDate})</div>
                                <div className="text-[11px] text-gray-500 italic truncate">"{pl.reason}"</div>
                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={() => handleLeaveAction(pl.id, 'Pending HR')}
                                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center transition-colors shadow-sm"
                                  >
                                    <Check size={13} className="mr-1" /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleLeaveAction(pl.id, 'Rejected by TL')}
                                    className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center justify-center transition-colors"
                                  >
                                    <X size={13} className="mr-1" /> Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex gap-2">
                        <button
                          onClick={() => navigate(`/hrms/employees/${member.id}`)}
                          className="w-full py-2.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center transition-colors border border-gray-200"
                        >
                          <Eye size={14} className="mr-1.5" />
                          View Profile & Records
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State for Department */}
          {filteredTeamLeaders.length === 0 && filteredDirectHODMembers.length === 0 && (
            <div className="py-16 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <Users size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-gray-800">No Staff or TLs Found in {selectedHOD ? selectedHOD.dept : 'Department'}</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                {selectedHOD 
                  ? `No Team Leaders or staff members are currently assigned under ${selectedHOD.name} in the ${selectedHOD.dept} department.`
                  : `No employees matching the search criteria found.`}
              </p>
              {selectedHOD && !isHOD && (
                <button
                  onClick={() => setSelectedHOD(null)}
                  className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold shadow hover:bg-black transition-colors"
                >
                  Back to All HODs
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 3: Team Members Grid (Under Selected TL or All Members Flat) */}
      {/* ========================================================================= */}
      {((currentHierarchyLevel === 3) || (currentHierarchyLevel === 1 && viewTab === 'all-members')) && (
        <div className="space-y-6">
          {selectedTL && (
            <div className="bg-orange-50/70 p-4 rounded-2xl border border-orange-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-be-orange text-white flex items-center justify-center font-bold">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-orange-950">
                    Team Members under TL {selectedTL.name}
                  </h2>
                  <p className="text-xs text-orange-800">
                    Chain: 👑 MD Sir ➔ 🏢 {selectedHOD ? selectedHOD.name : (selectedTL.reportingManagerName || 'HOD')} ➔ 👔 <strong>{selectedTL.name}</strong> ({selectedTL.dept})
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedTL(null);
                  setSearchQuery('');
                }}
                className="px-3.5 py-1.5 bg-white text-orange-900 hover:bg-orange-100 border border-orange-300 rounded-xl text-xs font-bold transition-colors flex items-center"
              >
                <ArrowLeft size={14} className="mr-1.5" />
                {selectedHOD ? `Back to ${selectedHOD.name}'s Department` : 'Back to Team Leaders'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMembers.map((member) => {
              const memberLeaves = leaves.filter(l => l.empId === member.id || l.empName === member.name);
              const memberPendingLeaves = memberLeaves.filter(l => l.status === 'Pending TL');
              const todayAtt = attendance.find(a => (a.empId === member.id || a.empName === member.name) && a.date === today);

              return (
                <div 
                  key={member.id} 
                  className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md hover:border-orange-200 transition-all duration-200"
                >
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-400 to-amber-500 text-white flex items-center justify-center font-bold text-base shadow-md shadow-orange-500/20">
                          {(member.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-gray-900 text-base">{member.name}</h3>
                          <p className="text-xs text-gray-400 font-mono font-medium">{member.id} • {member.dept}</p>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        todayAtt?.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        todayAtt?.status === 'Late' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        todayAtt?.status === 'Absent' ? 'bg-red-50 text-red-700 border border-red-200' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {todayAtt?.status || 'Not Marked'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-gray-600 mb-4 bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-medium">Designation</span>
                        <span className="font-bold text-gray-800">{member.role}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-medium">Email</span>
                        <span className="font-medium text-gray-700 truncate max-w-[170px]">{member.email || member.formData?.workEmail || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-medium">Contact</span>
                        <span className="font-medium text-gray-700">{member.mobile || '-'}</span>
                      </div>
                      {selectedTL && (
                        <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                          <span className="text-gray-400 font-medium">Assigned TL</span>
                          <span className="font-extrabold text-be-orange">{selectedTL.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Pending Leave Requests for this Member */}
                    {memberPendingLeaves.length > 0 && (
                      <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-amber-900 flex items-center">
                            <Clock size={12} className="mr-1 text-amber-600 animate-spin" />
                            Pending Leave Request
                          </span>
                          <span className="text-[10px] font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                            TL Approval Required
                          </span>
                        </div>
                        {memberPendingLeaves.map((pl: any) => (
                          <div key={pl.id} className="text-xs text-gray-700 space-y-1.5 pt-1">
                            <div className="font-semibold text-gray-900">{pl.type} ({pl.startDate} to {pl.endDate})</div>
                            <div className="text-[11px] text-gray-500 italic truncate">"{pl.reason}"</div>
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => handleLeaveAction(pl.id, 'Pending HR')}
                                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center transition-colors shadow-sm"
                              >
                                <Check size={13} className="mr-1" /> Approve (TL)
                              </button>
                              <button
                                onClick={() => handleLeaveAction(pl.id, 'Rejected by TL')}
                                className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center justify-center transition-colors"
                              >
                                <X size={13} className="mr-1" /> Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={() => navigate(`/hrms/employees/${member.id}`)}
                      className="w-full py-2.5 bg-gray-50 hover:bg-orange-50 hover:text-be-orange text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center transition-colors border border-gray-200"
                    >
                      <Eye size={14} className="mr-1.5" />
                      View Profile & Records
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredMembers.length === 0 && (
              <div className="col-span-full py-16 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <Users size={48} className="mx-auto text-gray-300 mb-3" />
                <h3 className="text-lg font-bold text-gray-800">No Team Members Found</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  {selectedTL 
                    ? `No subordinates are currently assigned under Team Leader ${selectedTL.name}.`
                    : `No team members matching the search criteria found.`}
                </p>
                {selectedTL && (
                  <button
                    onClick={() => setSelectedTL(null)}
                    className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold shadow hover:bg-black transition-colors"
                  >
                    {selectedHOD ? `Back to ${selectedHOD.name}'s Department` : 'Back to Team Leaders'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
