import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, User, Phone, Briefcase, GraduationCap, Users, FileText, Building, 
  Crown, Shield, ArrowRight, UserCheck, Calendar, Clock, Check, X, Download, Eye, 
  AlertCircle, CheckCircle2, XCircle, Target, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { ROLE_DEFINITIONS } from '../../types/roles';
import type { SystemRole } from '../../types/roles';
import { getDocument } from '../../lib/db';
import { saveOrUpdateZohoEmployee } from '../../services/zohoService';

export const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, isTM, isSuperAdmin, isHR, isTL, isHOD } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'leaves' | 'attendance' | 'documents'>('profile');
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  // Target Edit Modal state for Super Admin & HOD
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [targetInputVal, setTargetInputVal] = useState('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  useEffect(() => {
    const savedEmps = localStorage.getItem('be_employees');
    if (savedEmps) setEmployees(JSON.parse(savedEmps));

    const savedLeaves = localStorage.getItem('be_leaves');
    if (savedLeaves) setLeaves(JSON.parse(savedLeaves));

    const savedAtt = localStorage.getItem('be_attendance');
    if (savedAtt) setAttendance(JSON.parse(savedAtt));

    const savedDocs = localStorage.getItem('be_emp_docs');
    if (savedDocs) setDocuments(JSON.parse(savedDocs));
  }, []);

  const employee = employees.find((e: any) => e.id === id);

  const isEmployeeSelfOnly = isTM || currentUser.role === 'TM' || (!isSuperAdmin && !isHR && !isTL && !isHOD && currentUser.role !== 'HOD');
  const isSelf = employee && (
    employee.id === currentUser.id ||
    employee.id === currentUser.empId ||
    (currentUser.id && employee.id && String(employee.id).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
    (currentUser.empId && employee.id && String(employee.id).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
    employee.email?.toLowerCase() === currentUser.email?.toLowerCase() ||
    employee.formData?.email?.toLowerCase() === currentUser.email?.toLowerCase() ||
    employee.formData?.workEmail?.toLowerCase() === currentUser.email?.toLowerCase() ||
    employee.name?.toLowerCase() === currentUser.name?.toLowerCase()
  );

  const isTeamLeaderOfEmployee = isTL && employee && (
    employee.teamLeaderId === currentUser.id ||
    employee.teamLeaderId === currentUser.empId ||
    (employee.teamLeaderName && currentUser.name && employee.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
    (employee.formData?.teamLeaderId && (employee.formData.teamLeaderId === currentUser.id || employee.formData.teamLeaderId === currentUser.empId)) ||
    (employee.formData?.teamLeaderName && currentUser.name && employee.formData.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase()))
  );

  if (isEmployeeSelfOnly && !isSelf && !isTeamLeaderOfEmployee) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-100 max-w-lg mx-auto mt-12 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 mb-4">You are only authorized to view your own employment profile or assigned reporting members.</p>
        <button onClick={() => navigate('/hrms/employees')} className="px-5 py-2.5 bg-be-orange text-white rounded-xl font-bold shadow-md hover:bg-orange-600 transition-colors">
          Back to Overview
        </button>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-100 max-w-lg mx-auto mt-12 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Employee Not Found</h2>
        <p className="text-sm text-gray-500 mb-4">The employee you are looking for does not exist or has been deleted.</p>
        <button onClick={() => navigate('/hrms/employees')} className="px-5 py-2.5 bg-be-orange text-white rounded-xl font-bold shadow-md hover:bg-orange-600 transition-colors">
          Back to Employees
        </button>
      </div>
    );
  }

  const fd = employee.formData || {};
  const languages = Array.isArray(fd.languages) ? fd.languages.join(', ') : fd.languages;
  const sRole: SystemRole = employee.systemRole || fd.systemRole || 'TM';
  const roleInfo = ROLE_DEFINITIONS[sRole] || ROLE_DEFINITIONS['TM'];

  // Subordinates list
  const subordinates = employees.filter((e: any) => {
    if (sRole === 'TL') {
      return e.teamLeaderId === employee.id || e.formData?.teamLeaderId === employee.id;
    }
    if (sRole === 'HOD') {
      return (e.reportingManagerId === employee.id || e.formData?.reportingManagerId === employee.id) && e.id !== employee.id;
    }
    if (sRole === 'Super Admin' || sRole === 'HR') {
      return e.id !== employee.id;
    }
    return false;
  });

  // Employee's Leaves
  const employeeLeaves = leaves.filter(l => 
    l.empId === employee.id || 
    l.empName?.toLowerCase() === employee.name?.toLowerCase()
  );

  // Employee's Attendance records
  const employeeAttendance = attendance.filter(a => 
    a.empId === employee.id || 
    a.empName?.toLowerCase() === employee.name?.toLowerCase()
  );

  // Employee's Documents
  const employeeDocs = documents.filter(d => 
    d.empId === employee.id || 
    d.empName?.toLowerCase() === employee.name?.toLowerCase()
  );

  const pendingLeavesCount = employeeLeaves.filter(l => l.status === 'Pending TL' || l.status === 'Pending HR').length;

  const handleLeaveAction = (leaveId: string, newStatus: any) => {
    const updated = leaves.map(l => l.id === leaveId ? { ...l, status: newStatus } : l);
    setLeaves(updated);
    localStorage.setItem('be_leaves', JSON.stringify(updated));
  };

  const handleOpenTargetModal = () => {
    setTargetInputVal(String(employee.monthlyTarget || employee.formData?.monthlyTarget || employee.target || employee.formData?.target || '').replace(/[^0-9]/g, ''));
    setIsTargetModalOpen(true);
  };

  const handleSaveTarget = async () => {
    if (!employee) return;
    setIsSavingTarget(true);

    const cleanTarget = targetInputVal.trim();
    const updatedEmp: any = {
      ...employee,
      monthlyTarget: cleanTarget,
      target: cleanTarget,
      formData: {
        ...(employee.formData || {}),
        monthlyTarget: cleanTarget,
        target: cleanTarget
      }
    };

    const updatedList = employees.map((e: any) => e.id === employee.id ? updatedEmp : e);
    setEmployees(updatedList);
    localStorage.setItem('be_employees', JSON.stringify(updatedList));
    window.dispatchEvent(new Event('be_employees_updated'));

    if (updatedEmp.zohoId) {
      saveOrUpdateZohoEmployee(updatedEmp).catch(err => console.warn('[Zoho CRM] Target sync error:', err));
    }

    setIsSavingTarget(false);
    setIsTargetModalOpen(false);
  };

  const handleDownloadDoc = async (fileId: string, fileName: string) => {
    const file = await getDocument(fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      alert("Document file not found in local storage.");
    }
  };

  const handleViewDoc = async (fileId: string) => {
    const file = await getDocument(fileId);
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    } else {
      alert("Document file not found in local storage.");
    }
  };

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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Profile Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-900 border border-gray-200">
            <ArrowLeft size={20} />
          </button>
          
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-orange-500/20 shrink-0">
            {(employee.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-gray-900">{employee.name}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${roleInfo.badgeClass} flex items-center`}>
                {sRole === 'Super Admin' && <Crown className="w-3.5 h-3.5 mr-1" />}
                {sRole === 'HR' && <UserCheck className="w-3.5 h-3.5 mr-1" />}
                {sRole === 'HOD' && <Shield className="w-3.5 h-3.5 mr-1" />}
                {sRole === 'TL' && <Briefcase className="w-3.5 h-3.5 mr-1" />}
                {sRole === 'TM' && <User className="w-3.5 h-3.5 mr-1" />}
                {roleInfo.label}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                employee.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 
                employee.status === 'On Leave' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-700'
              }`}>{employee.status}</span>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-1">
              <span className="font-mono text-gray-700 font-bold">{employee.id}</span> • {employee.dept} Department • {employee.role}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 self-end md:self-center">
          {isTL && (
            <Link
              to="/hrms/my-team"
              className="px-4 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors flex items-center"
            >
              <Users size={15} className="mr-1.5" /> My Team Hub
            </Link>
          )}
          <Link
            to="/hrms/employees"
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {isEmployeeSelfOnly && !isTL ? 'My Profile' : 'All Employees'}
          </Link>
        </div>
      </div>

      {/* 4-Tab Navigation Bar */}
      <div className="flex items-center space-x-2 border-b border-gray-200 bg-white px-6 pt-3 rounded-2xl shadow-sm">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center ${
            activeTab === 'profile'
              ? 'border-be-orange text-be-orange'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <User size={16} className="mr-2" />
          Overview & Profile
        </button>

        <button
          onClick={() => setActiveTab('leaves')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center ${
            activeTab === 'leaves'
              ? 'border-be-orange text-be-orange'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Briefcase size={16} className="mr-2" />
          Leave Requests
          {pendingLeavesCount > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-extrabold border border-amber-200 animate-pulse">
              {pendingLeavesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center ${
            activeTab === 'attendance'
              ? 'border-be-orange text-be-orange'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Calendar size={16} className="mr-2" />
          Attendance Log
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-bold">
            {employeeAttendance.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center ${
            activeTab === 'documents'
              ? 'border-be-orange text-be-orange'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <FileText size={16} className="mr-2" />
          Personal Documents
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-bold">
            {employeeDocs.length}
          </span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & PROFILE */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Role & Hierarchy Card */}
          <div className="bg-gradient-to-br from-orange-50/70 via-white to-blue-50/40 rounded-2xl border-2 border-orange-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-gray-900 flex items-center uppercase tracking-wider">
                <Crown size={18} className="mr-2 text-be-orange" /> Role-Based Access & Reporting Hierarchy
              </h2>
              <span className="text-xs font-bold text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                Level {roleInfo.level} Hierarchy
              </span>
            </div>

            {/* Visual Hierarchy Chain */}
            <div className="p-4 bg-white/90 backdrop-blur-sm rounded-xl border border-orange-100 mb-6 shadow-sm">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Organizational Reporting Line
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold">
                <div className={`px-3.5 py-2 rounded-xl flex items-center border ${
                  sRole === 'Super Admin' ? 'bg-purple-600 text-white ring-2 ring-purple-300 shadow-md' : 'bg-purple-50 text-purple-800 border-purple-200'
                }`}>
                  👑 Super Admin {sRole === 'Super Admin' ? `(${employee.name})` : ''}
                </div>

                {sRole === 'HR' && (
                  <>
                    <ArrowRight size={16} className="text-gray-400 shrink-0" />
                    <div className="px-3.5 py-2 rounded-xl flex items-center border bg-rose-600 text-white ring-2 ring-rose-300 shadow-md">
                      💼 HR Admin: {employee.name} (This Employee)
                    </div>
                  </>
                )}

                {sRole === 'HOD' && (
                  <>
                    <ArrowRight size={16} className="text-gray-400 shrink-0" />
                    <div className="px-3.5 py-2 rounded-xl flex items-center border bg-blue-600 text-white ring-2 ring-blue-300 shadow-md">
                      🏢 Admin (HOD): {employee.name} (This Employee)
                    </div>
                  </>
                )}

                {sRole === 'TL' && (
                  <>
                    <ArrowRight size={16} className="text-gray-400 shrink-0" />
                    {!employee.reportingManagerName?.includes('Super Admin') && (
                      <>
                        <div className="px-3.5 py-2 rounded-xl flex items-center border bg-blue-50 text-blue-800 border-blue-200">
                          🏢 Admin (HOD): {employee.reportingManagerName || 'Mishal (HOD)'}
                        </div>
                        <ArrowRight size={16} className="text-gray-400 shrink-0" />
                      </>
                    )}
                    <div className="px-3.5 py-2 rounded-xl flex items-center border bg-amber-600 text-white ring-2 ring-amber-300 shadow-md">
                      👔 TL: {employee.name} (This Employee)
                    </div>
                  </>
                )}

                {sRole === 'TM' && (
                  <>
                    <ArrowRight size={16} className="text-gray-400 shrink-0" />
                    {!employee.reportingManagerName?.includes('Super Admin') && employee.reportingManagerName && (
                      <>
                        <div className="px-3.5 py-2 rounded-xl flex items-center border bg-blue-50 text-blue-800 border-blue-200">
                          🏢 Admin (HOD): {employee.reportingManagerName}
                        </div>
                        <ArrowRight size={16} className="text-gray-400 shrink-0" />
                      </>
                    )}
                    <div className="px-3.5 py-2 rounded-xl flex items-center border bg-amber-50 text-amber-800 border-amber-200">
                      👔 TL: {employee.teamLeaderName || 'Team Leader'}
                    </div>
                    <ArrowRight size={16} className="text-gray-400 shrink-0" />
                    <div className="px-3.5 py-2 rounded-xl flex items-center border bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-md">
                      👤 TM: {employee.name} (This Employee)
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Hierarchy Detail Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">System Role</div>
                <div className="text-base font-bold text-gray-900 mb-1">{roleInfo.label}</div>
                <p className="text-xs text-gray-500">{roleInfo.description}</p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Assigned Team Leader (TL)</div>
                <div className="text-base font-bold text-amber-800">{employee.teamLeaderName || (sRole === 'TL' ? 'Self (Team Leader)' : 'Not Assigned')}</div>
                <div className="text-xs text-gray-400 mt-1">Direct supervisor for daily assignments & leaves</div>
              </div>

              <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Reporting Manager</div>
                <div className="text-base font-bold text-purple-800">{employee.reportingManagerName || 'Managing Director (Super Admin)'}</div>
                <div className="text-xs text-gray-400 mt-1">Higher approval & organizational authority</div>
              </div>

              <div className="p-4 bg-white rounded-xl border border-amber-200 shadow-sm bg-gradient-to-br from-white to-amber-50/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Monthly Target</span>
                    <Target size={15} className="text-be-orange" />
                  </div>
                  <div className="text-lg font-black text-gray-900">
                    {employee.monthlyTarget || employee.target ? (
                      `₹${Number(String(employee.monthlyTarget || employee.target).replace(/[^0-9.]/g, '')).toLocaleString('en-IN')}`
                    ) : (
                      <span className="text-xs text-gray-400 font-medium italic">Not Assigned</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Assigned monthly sales target</p>
                </div>
                {(isSuperAdmin || isHOD) && (
                  <button
                    onClick={handleOpenTargetModal}
                    className="mt-3 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-be-orange hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-orange-500/20 flex items-center w-max"
                  >
                    <Target size={13} className="mr-1.5" />
                    {employee.monthlyTarget || employee.target ? 'Update Target' : '+ Assign Target'}
                  </button>
                )}
              </div>
            </div>

            {/* Direct Reports if any */}
            {(sRole === 'TL' || sRole === 'HOD' || sRole === 'HR' || sRole === 'Super Admin') && subordinates.length > 0 && (
              <div className="mt-6 pt-4 border-t border-orange-200/60">
                <div className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center">
                  <Users size={14} className="mr-1.5 text-be-orange" />
                  Direct Reports ({subordinates.length} Employees)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {subordinates.map((sub: any) => (
                    <div
                      key={sub.id}
                      onClick={() => navigate(`/hrms/employees/${sub.id}`)}
                      className="p-3 bg-white rounded-xl border border-gray-200 hover:border-be-orange cursor-pointer transition-all shadow-sm flex items-center space-x-3 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-be-orange flex items-center justify-center font-bold text-xs">
                        {(sub.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate group-hover:text-be-orange">
                          {sub.name}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {sub.id} • {sub.role || sub.systemRole}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center">
                  <User size={18} className="mr-2 text-be-orange" /> Personal Information
                </h2>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Full Name</span><span className="font-semibold text-gray-900">{fd.firstName} {fd.middleName} {fd.lastName}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Date of Birth</span><span className="font-semibold text-gray-900">{fd.dob || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Gender</span><span className="font-semibold text-gray-900">{fd.gender || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Blood Group</span><span className="font-semibold text-gray-900">{fd.bloodGroup || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Nationality</span><span className="font-semibold text-gray-900">{fd.nationality || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Marital Status</span><span className="font-semibold text-gray-900">{fd.maritalStatus || '-'}</span></div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center">
                  <Phone size={18} className="mr-2 text-be-orange" /> Contact Information
                </h2>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Personal Email</span><span className="font-semibold text-gray-900">{employee.email || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Mobile Number</span><span className="font-semibold text-gray-900">{employee.mobile || '-'}</span></div>
                <div className="col-span-2"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Current Address</span><span className="font-semibold text-gray-900">{fd.currentAddress || '-'}</span></div>
                <div className="col-span-2"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Permanent Address</span><span className="font-semibold text-gray-900">{fd.permanentAddress || '-'}</span></div>
              </div>
            </div>

            {/* Educational Info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center">
                  <GraduationCap size={18} className="mr-2 text-be-orange" /> Educational & Skills
                </h2>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Education Qualification</span><span className="font-semibold text-gray-900">{fd.education || '-'}</span></div>
                <div className="col-span-2"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Professional Certifications</span><span className="font-semibold text-gray-900">{fd.certifications || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Skills</span><span className="font-semibold text-gray-900">{fd.skills || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Languages Known</span><span className="font-semibold text-gray-900">{languages || '-'}</span></div>
              </div>
            </div>

            {/* Department Details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center">
                  <Building size={18} className="mr-2 text-be-orange" /> Department Details
                </h2>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Employee ID</span><span className="font-mono font-bold text-gray-900">{fd.empId || employee.id || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Date of Joining</span><span className="font-semibold text-gray-900">{fd.doj || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Department</span><span className="font-semibold text-gray-900">{fd.dept || employee.dept || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Designation</span><span className="font-semibold text-gray-900">{fd.role || employee.role || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Employment Type</span><span className="font-semibold text-gray-900">{fd.employmentType || '-'}</span></div>
                <div className="col-span-2 md:col-span-1"><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Work Email</span><span className="font-semibold text-gray-900">{fd.workEmail || '-'}</span></div>
              </div>
            </div>

            {/* Document Details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden md:col-span-2">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center">
                  <FileText size={18} className="mr-2 text-be-orange" /> Document & Bank Details
                </h2>
              </div>
              <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Bank Account Number</span><span className="font-mono font-semibold text-gray-900">{fd.bankAccount || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Bank Name</span><span className="font-semibold text-gray-900">{fd.bankName || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">IFSC Code</span><span className="font-mono font-semibold text-gray-900">{fd.ifsc || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">PAN Number</span><span className="font-mono font-semibold text-gray-900">{fd.panNumber || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">Aadhaar Number</span><span className="font-mono font-semibold text-gray-900">{fd.aadhaarNumber || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-400 block mb-1 uppercase">UAN Number</span><span className="font-mono font-semibold text-gray-900">{fd.uanNumber || '-'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LEAVE REQUESTS */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Leave Requests for {employee.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Review leave applications and approve/reject according to organizational hierarchy.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-be-orange border border-orange-200">
              {employeeLeaves.length} Total Requests
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-xs border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3.5">Leave Type</th>
                  <th className="px-6 py-3.5">Duration & Dates</th>
                  <th className="px-6 py-3.5">Reason</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Approval Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {employeeLeaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{leave.type}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">
                      <div>{leave.startDate} to {leave.endDate}</div>
                      <div className="text-[11px] text-gray-400">Applied on {leave.appliedOn}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate" title={leave.reason}>{leave.reason}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getStatusColor(leave.status)}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Pending TL Stage */}
                        {leave.status === 'Pending TL' && (
                          <>
                            {(isTL || isSuperAdmin) ? (
                              <>
                                <button 
                                  onClick={() => handleLeaveAction(leave.id, 'Pending HR')}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center transition-colors shadow-sm"
                                >
                                  <Check size={13} className="mr-1" /> Approve (TL)
                                </button>
                                <button 
                                  onClick={() => handleLeaveAction(leave.id, 'Rejected by TL')}
                                  className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center transition-colors"
                                >
                                  <X size={13} className="mr-1" /> Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg font-semibold border border-amber-200">
                                Awaiting TL Approval
                              </span>
                            )}
                          </>
                        )}

                        {/* Pending HR Stage */}
                        {leave.status === 'Pending HR' && (
                          <>
                            {(isHR || isSuperAdmin) ? (
                              <>
                                <button 
                                  onClick={() => handleLeaveAction(leave.id, 'Approved')}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center transition-colors shadow-sm"
                                >
                                  <Check size={13} className="mr-1" /> Approve (HR)
                                </button>
                                <button 
                                  onClick={() => handleLeaveAction(leave.id, 'Rejected by HR')}
                                  className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center transition-colors"
                                >
                                  <X size={13} className="mr-1" /> Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg font-semibold border border-blue-200">
                                Approved by TL • Awaiting HR
                              </span>
                            )}
                          </>
                        )}

                        {leave.status === 'Approved' && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center">
                            <Check size={12} className="mr-1" /> Leave Granted
                          </span>
                        )}

                        {leave.status.startsWith('Rejected') && (
                          <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                            {leave.status}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {employeeLeaves.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      <Briefcase size={36} className="mx-auto text-gray-300 mb-2" />
                      <p className="font-bold text-gray-700">No leave requests found</p>
                      <p className="text-xs text-gray-400 mt-1">This employee has not submitted any leave applications.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE RECORDS */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Attendance Log for {employee.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Historical daily check-in and check-out logs on record.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {employeeAttendance.length} Logged Entries
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-xs border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Check In Time</th>
                  <th className="px-6 py-3.5">Check Out Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {employeeAttendance.map((att) => (
                  <tr key={att.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{att.date}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                        att.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                        att.status === 'Late' ? 'bg-orange-100 text-orange-800' :
                        att.status === 'Half Day' ? 'bg-purple-100 text-purple-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {att.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-800">{att.checkIn || '--'}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">{att.checkOut || '--'}</td>
                  </tr>
                ))}

                {employeeAttendance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      <Calendar size={36} className="mx-auto text-gray-300 mb-2" />
                      <p className="font-bold text-gray-700">No attendance records found</p>
                      <p className="text-xs text-gray-400 mt-1">Daily attendance has not been recorded yet for this employee.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PERSONAL DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Personal & Verification Documents</h2>
              <p className="text-xs text-gray-500 mt-0.5">Official documents uploaded during onboarding and HR verification.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {employeeDocs.length} Documents On Record
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employeeDocs.map((doc) => (
              <div key={doc.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:border-orange-200 transition-all">
                <div className="flex items-start space-x-3 mb-4">
                  <div className="p-3 bg-orange-50 text-be-orange rounded-xl shrink-0">
                    <FileText size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-sm truncate">{doc.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.fileName}</p>
                    <span className="text-[11px] text-gray-400 block mt-1">Uploaded: {doc.date}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button 
                    onClick={() => handleViewDoc(doc.fileId)}
                    className="flex-1 py-1.5 bg-gray-50 hover:bg-orange-50 text-gray-700 hover:text-be-orange rounded-lg text-xs font-bold flex items-center justify-center transition-colors border border-gray-200"
                  >
                    <Eye size={13} className="mr-1" /> View
                  </button>
                  <button 
                    onClick={() => handleDownloadDoc(doc.fileId, doc.fileName)}
                    className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center justify-center transition-colors"
                  >
                    <Download size={13} className="mr-1" /> Download
                  </button>
                </div>
              </div>
            ))}

            {employeeDocs.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                <FileText size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-gray-700">No documents found</p>
                <p className="text-xs text-gray-400 mt-1">HR has not uploaded any personal verification documents for this employee yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TARGET EDIT MODAL (FOR SUPER ADMIN & HOD) */}
      <AnimatePresence>
        {isTargetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-200"
            >
              <div className="flex items-center justify-between p-6 border-b border-amber-100 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-white">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold border border-amber-200 shadow-sm">
                    <Target size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Assign Monthly Target</h3>
                    <p className="text-xs text-gray-500 font-medium">Update sales target for {employee.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTargetModalOpen(false)}
                  className="text-gray-400 hover:text-gray-700 p-2 hover:bg-white rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Monthly Target Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-extrabold text-base">₹</span>
                    <input
                      type="text"
                      value={targetInputVal}
                      onChange={(e) => setTargetInputVal(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g. 500000"
                      className="w-full pl-9 pr-4 py-3 bg-white border border-gray-300 rounded-2xl text-base font-extrabold text-gray-900 outline-none focus:ring-2 focus:ring-be-orange focus:border-be-orange shadow-sm font-mono"
                      autoFocus
                    />
                  </div>
                  {targetInputVal && !isNaN(Number(targetInputVal)) && Number(targetInputVal) > 0 && (
                    <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center">
                      <CheckCircle2 size={13} className="mr-1" />
                      Target: ₹{Number(targetInputVal).toLocaleString('en-IN')} per month
                    </p>
                  )}
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Quick Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '₹1 Lakh', val: '100000' },
                      { label: '₹2.5 Lakh', val: '250000' },
                      { label: '₹5 Lakh', val: '500000' },
                      { label: '₹10 Lakh', val: '1000000' },
                      { label: '₹20 Lakh', val: '2000000' },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setTargetInputVal(preset.val)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          targetInputVal === preset.val
                            ? 'bg-be-orange text-white border-be-orange shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400 hover:bg-amber-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    {targetInputVal && (
                      <button
                        type="button"
                        onClick={() => setTargetInputVal('')}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        Clear Target
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
                  <strong>Authority Note:</strong> Only Super Admin and Department HODs can assign and modify employee targets.
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsTargetModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingTarget}
                  onClick={handleSaveTarget}
                  className="px-6 py-2.5 bg-gradient-to-r from-be-orange to-amber-600 text-white rounded-xl text-sm font-bold hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/30 flex items-center disabled:opacity-60"
                >
                  {isSavingTarget ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} className="mr-1.5" />
                      <span>Save Target</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
