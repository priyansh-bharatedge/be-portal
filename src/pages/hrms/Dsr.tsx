import { useState, useEffect } from 'react';
import { 
  ClipboardList, Plus, Search, CheckCircle2, Clock, 
  AlertCircle, User, Eye, Send, Trash2, Edit3, 
  Calendar as CalendarIcon, Check, X, MessageSquare,
  Briefcase, Sparkles, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import type { DsrReport, DsrStatus } from '../../types/dsr';
import { INITIAL_DSR_REPORTS } from '../../utils/initialData';
import { 
  saveOrUpdateZohoDsr, 
  deleteZohoDsr, 
  fetchZohoDsr 
} from '../../services/zohoService';

export const DSR = () => {
  const { currentUser, isTL, isSuperAdmin, isHR, isHOD } = useAuth();

  const isTeamLeadOrAdmin = isTL || isSuperAdmin || isHR || isHOD || (currentUser.role as string) === 'TL';

  const [reports, setReports] = useState<DsrReport[]>([]);
  const [activeTab, setActiveTab] = useState<'my-reports' | 'team-reviews'>(() => {
    return (isTL || (currentUser.role as string) === 'TL') ? 'team-reviews' : 'my-reports';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Modal states
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<DsrReport | null>(null);
  const [reviewingReport, setReviewingReport] = useState<DsrReport | null>(null);
  const [tlFeedbackInput, setTlFeedbackInput] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form State: Date & DSR Description only
  const getTodayISO = () => new Date().toISOString().split('T')[0];
  const todayStr = getTodayISO();

  const [reportDate, setReportDate] = useState(todayStr);
  const [description, setDescription] = useState('');
  const [selectedTLId, setSelectedTLId] = useState('');
  const [selectedTLName, setSelectedTLName] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    if (isTL || (currentUser.role as string) === 'TL') {
      setActiveTab('team-reviews');
    }
  }, [isTL, currentUser.role]);

  useEffect(() => {
    // Load DSR reports
    const saved = localStorage.getItem('be_dsr_reports');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setReports(parsed);
        } else {
          setReports([]);
        }
      } catch (e) {
        setReports([]);
      }
    } else {
      setReports([]);
      localStorage.setItem('be_dsr_reports', JSON.stringify([]));
    }

    // Load employees
    const savedEmps = localStorage.getItem('be_employees');
    if (savedEmps) {
      try {
        const parsed = JSON.parse(savedEmps);
        setEmployees(parsed);
      } catch (e) {}
    }

    // Background fetch live Zoho CRM DSR records
    fetchZohoDsr().then(res => {
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setReports(prev => {
          const merged = [...prev];
          res.data.forEach((item: any) => {
            const zohoIdStr = String(item.id);
            const existsIndex = merged.findIndex(r => r.zohoId === zohoIdStr || (r.empEmail && item.Email && r.empEmail.toLowerCase() === item.Email.toLowerCase() && r.reportDate === item.Date));
            if (existsIndex >= 0) {
              merged[existsIndex] = {
                ...merged[existsIndex],
                zohoId: zohoIdStr,
                reportDate: item.Date || merged[existsIndex].reportDate,
                description: item.Description || merged[existsIndex].description,
                status: (item.Tag as DsrStatus) || merged[existsIndex].status,
              };
            } else if (item.Name || item.Date) {
              const matchedEmp = (savedEmps ? JSON.parse(savedEmps) : []).find((e: any) => e.email && item.Email && (e.email ?? '').toLowerCase() === item.Email.toLowerCase());
              merged.push({
                id: `DSR-ZOHO-${zohoIdStr.slice(-4)}`,
                empId: matchedEmp?.id || 'EMP-ZOHO',
                empName: matchedEmp?.name || (item.Name ? item.Name.split(' - ')[0] : 'Employee'),
                empEmail: item.Email || matchedEmp?.email || '',
                dept: matchedEmp?.department || 'Operations',
                designation: matchedEmp?.designation || 'Team Member',
                reportDate: item.Date || new Date().toISOString().split('T')[0],
                submittedAt: item.Created_Time || new Date().toISOString(),
                submittedDateFormatted: item.Date || 'Recent',
                tlId: '',
                tlName: '',
                tlEmail: item.Secondary_Email || '',
                description: item.Description || '',
                status: (item.Tag as DsrStatus) || 'Submitted',
                zohoId: zohoIdStr,
              });
            }
          });
          localStorage.setItem('be_dsr_reports', JSON.stringify(merged));
          return merged;
        });
      }
    }).catch(err => console.warn('[Zoho CRM] DSR fetch warning:', err));
  }, []);

  const saveReports = (updated: DsrReport[]) => {
    setReports(updated);
    localStorage.setItem('be_dsr_reports', JSON.stringify(updated));
  };

  // Resolve current employee's Team Leader
  useEffect(() => {
    if (employees.length > 0) {
      const empRecord = employees.find(e => e.id === currentUser.id || e.id === currentUser.empId || e.email === currentUser.email);
      const tlId = empRecord?.teamLeaderId || empRecord?.formData?.teamLeaderId || currentUser.teamLeaderId;
      const tlName = empRecord?.teamLeaderName || empRecord?.formData?.teamLeaderName || currentUser.teamLeaderName;

      if (tlId && tlName) {
        setSelectedTLId(tlId);
        setSelectedTLName(tlName);
      } else {
        const foundTL = employees.find(e => e.systemRole === 'TL' || e.role?.includes('TL') || e.role?.includes('Lead')) ||
                        employees.find(e => e.systemRole === 'HOD') ||
                        employees[0];
        if (foundTL) {
          setSelectedTLId(foundTL.id);
          setSelectedTLName(`${foundTL.name} (${foundTL.systemRole || 'TL'})`);
        }
      }
    }
  }, [employees, currentUser]);

  // Subordinates reporting to this user
  const teamMembers = employees.filter(e => {
    if (isSuperAdmin || isHR) return e.systemRole === 'TM' || e.systemRole === 'TL';
    const isSubordinate =
      e.teamLeaderId === currentUser.id ||
      e.teamLeaderId === currentUser.empId ||
      (e.teamLeaderName && currentUser.name && (
        (e.teamLeaderName ?? '').toLowerCase().includes((currentUser.name ?? '').toLowerCase()) ||
        (currentUser.name ?? '').toLowerCase().includes((e.teamLeaderName ?? '').toLowerCase())
      )) ||
      (e.formData?.teamLeaderId && (e.formData.teamLeaderId === currentUser.id || e.formData.teamLeaderId === currentUser.empId)) ||
      (e.formData?.teamLeaderName && currentUser.name && (
        (e.formData.teamLeaderName ?? '').toLowerCase().includes((currentUser.name ?? '').toLowerCase()) ||
        (currentUser.name ?? '').toLowerCase().includes((e.formData.teamLeaderName ?? '').toLowerCase())
      ));
    return isSubordinate && e.id !== currentUser.id && e.id !== currentUser.empId;
  });

  // Filter: My Reports (Submitted by current user)
  const myReports = reports.filter(r => 
    r.empId === currentUser.id || 
    r.empId === currentUser.empId || 
    (r.empEmail ?? '').toLowerCase() === (currentUser.email ?? '').toLowerCase() ||
    (currentUser.name && (r.empName ?? '').toLowerCase() === (currentUser.name ?? '').toLowerCase())
  );

  // Filter: Team Reports (Submitted to current user as TL, or all if Super Admin/HR)
  const teamReports = reports.filter(r => {
    if (isSuperAdmin || isHR) return true;
    const isSentToMe =
      r.tlId === currentUser.id || 
      r.tlId === currentUser.empId || 
      (r.tlName && currentUser.name && (
        (r.tlName ?? '').toLowerCase().includes((currentUser.name ?? '').toLowerCase()) ||
        (currentUser.name ?? '').toLowerCase().includes((r.tlName ?? '').toLowerCase())
      )) ||
      (r.tlEmail && currentUser.email && (r.tlEmail ?? '').toLowerCase() === (currentUser.email ?? '').toLowerCase()) ||
      teamMembers.some(m => m.id === r.empId || (m.name ?? '').toLowerCase() === (r.empName ?? '').toLowerCase());
    return isSentToMe && r.empId !== currentUser.id && r.empId !== currentUser.empId;
  });

  const pendingTLReviewCount = teamReports.filter(r => r.status === 'Submitted').length;

  const resetForm = () => {
    setReportDate(todayStr);
    setDescription('');
    setEditingDraftId(null);
    setFormErrors({});
  };

  const openSubmitModal = (existingReport?: DsrReport) => {
    if (existingReport) {
      setEditingDraftId(existingReport.id);
      setReportDate(existingReport.reportDate || todayStr);
      setSelectedTLId(existingReport.tlId);
      setSelectedTLName(existingReport.tlName);
      setDescription(existingReport.description || '');
    } else {
      resetForm();
    }
    setIsSubmitModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!reportDate) errors.reportDate = 'Report date is required.';
    if (!description.trim()) {
      errors.description = 'Please enter your daily status report.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveOrSubmit = (statusToSet: 'Draft' | 'Submitted') => {
    if (statusToSet === 'Submitted' && !validateForm()) {
      return;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + 
      ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const existing = editingDraftId ? reports.find(r => r.id === editingDraftId) : null;
    const currentEmpRecord = employees.find(e => e.id === currentUser.id || e.id === currentUser.empId || e.email === currentUser.email);
    const empZohoId = (currentEmpRecord as any)?.zohoId || (currentUser as any).zohoId || existing?.employeeZohoId;

    const newOrUpdatedReport: DsrReport = {
      id: editingDraftId || `DSR-${reportDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
      empId: existing?.empId || currentUser.empId || currentUser.id || 'EMP-USER',
      empName: existing?.empName || currentUser.name || 'Employee',
      empEmail: existing?.empEmail || currentUser.email || '',
      dept: existing?.dept || currentUser.department || 'Marketing',
      designation: existing?.designation || currentUser.designation || 'Team Member',
      reportDate: reportDate,
      submittedAt: existing?.submittedAt || now.toISOString(),
      submittedDateFormatted: existing?.submittedDateFormatted || formattedDate,
      tlId: selectedTLId || existing?.tlId || '',
      tlName: selectedTLName || existing?.tlName || '',
      tlEmail: employees.find(e => e.id === selectedTLId)?.email || existing?.tlEmail || 'tl@bharat-edge.com',
      description: description.trim(),
      status: statusToSet,
      tlFeedback: existing?.tlFeedback,
      zohoId: existing?.zohoId,
      employeeZohoId: empZohoId,
    };

    let updatedList: DsrReport[];
    if (editingDraftId) {
      updatedList = reports.map(r => r.id === editingDraftId ? newOrUpdatedReport : r);
    } else {
      updatedList = [newOrUpdatedReport, ...reports];
    }

    saveReports(updatedList);
    setIsSubmitModalOpen(false);
    resetForm();

    // Background sync to Zoho CRM
    saveOrUpdateZohoDsr(newOrUpdatedReport).then(res => {
      if (res.success && res.zohoId) {
        setReports(curr => {
          const updatedWithZoho = curr.map(r => r.id === newOrUpdatedReport.id ? { ...r, zohoId: res.zohoId } : r);
          localStorage.setItem('be_dsr_reports', JSON.stringify(updatedWithZoho));
          return updatedWithZoho;
        });
      }
    }).catch(err => console.error('[Zoho CRM] DSR sync error:', err));

    if (statusToSet === 'Submitted') {
      showToast(editingDraftId ? '🎉 DSR updated successfully!' : `🎉 DSR submitted successfully! Sent to your Team Leader (${selectedTLName}).`);
    } else {
      showToast('💾 DSR saved as Draft.');
    }
  };

  const handleReviewAction = (reportId: string, action: 'Reviewed' | 'Needs Revision') => {
    const now = new Date().toISOString();
    let updatedReportForZoho: DsrReport | null = null;
    const updated = reports.map(r => {
      if (r.id === reportId) {
        const mod: DsrReport = {
          ...r,
          status: action,
          tlFeedback: tlFeedbackInput.trim() || (action === 'Reviewed' ? 'Approved & Reviewed by TL' : 'Changes requested by TL'),
          reviewedAt: now,
          reviewedByName: currentUser.name
        };
        updatedReportForZoho = mod;
        return mod;
      }
      return r;
    });

    saveReports(updated);
    setReviewingReport(null);
    setTlFeedbackInput('');
    showToast(action === 'Reviewed' ? '✅ DSR reviewed and acknowledged!' : '⚠️ Revision request sent to employee.');

    if (updatedReportForZoho) {
      saveOrUpdateZohoDsr(updatedReportForZoho).catch(err => console.error('[Zoho CRM] DSR review sync error:', err));
    }
  };

  const handleDeleteReport = (id: string) => {
    if (confirm('Are you sure you want to delete this DSR report?')) {
      const targetReport = reports.find(r => r.id === id);
      const updated = reports.filter(r => r.id !== id);
      saveReports(updated);
      showToast('🗑️ DSR report removed.');

      if (targetReport?.zohoId) {
        deleteZohoDsr(targetReport.zohoId).catch(err => console.error('[Zoho CRM] DSR delete error:', err));
      }
    }
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4500);
  };

  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setReportDate(d.toISOString().split('T')[0]);
  };

  // Filtered reports
  const activeReportList = activeTab === 'team-reviews' ? teamReports : myReports;
  const filteredReports = activeReportList.filter(r => {
    const matchesSearch = 
      r.empName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reportDate?.includes(searchQuery) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const renderStatusBadge = (status: DsrStatus) => {
    switch (status) {
      case 'Submitted':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
            <Clock size={12} className="mr-1.5 animate-pulse text-amber-500" />
            Submitted to TL
          </span>
        );
      case 'Reviewed':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
            <CheckCircle2 size={12} className="mr-1.5 text-emerald-500" />
            Reviewed by TL
          </span>
        );
      case 'Needs Revision':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
            <AlertCircle size={12} className="mr-1.5 text-rose-500" />
            Needs Revision
          </span>
        );
      case 'Draft':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
            <Edit3 size={12} className="mr-1.5 text-gray-500" />
            Draft
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 right-6 z-50 bg-gray-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-gray-800 flex items-center space-x-3 text-sm font-semibold max-w-md"
          >
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-orange-100/50 via-amber-50/30 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100 shadow-sm">
                <ClipboardList size={22} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Daily Status Report (DSR)
              </h1>
            </div>
            <p className="text-gray-500 text-sm max-w-xl font-medium">
              Enter your daily status report. On submission, it is immediately sent to your Team Leader.
            </p>
            
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg border border-gray-200 flex items-center">
                <User size={13} className="mr-1.5 text-gray-500" />
                Employee: <strong className="ml-1 text-gray-900">{currentUser.name}</strong>
              </span>
              <span className="px-3 py-1 bg-orange-50 text-be-orange rounded-lg border border-orange-200 flex items-center">
                👔 Team Leader: <strong className="ml-1">{selectedTLName || 'Vineet Panchal (TL)'}</strong>
              </span>
            </div>
          </div>

          <button
            onClick={() => openSubmitModal()}
            className="px-6 py-3.5 bg-gradient-to-r from-be-orange to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-2xl shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all text-sm flex items-center group shrink-0"
          >
            <Plus size={18} className="mr-2 group-hover:rotate-90 transition-transform duration-300" />
            <span>Enter Daily Status Report</span>
          </button>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-gray-200/80 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('my-reports')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 ${
              activeTab === 'my-reports'
                ? 'bg-gray-900 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/80'
            }`}
          >
            <User size={16} />
            <span>My DSR Reports</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === 'my-reports' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              {myReports.length}
            </span>
          </button>

          {isTeamLeadOrAdmin && (
            <button
              onClick={() => setActiveTab('team-reviews')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 ${
                activeTab === 'team-reviews'
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/80'
              }`}
            >
              <Briefcase size={16} />
              <span>Team DSRs Received (TL Review)</span>
              {pendingTLReviewCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse">
                  {pendingTLReviewCount} Pending
                </span>
              )}
            </button>
          )}
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search reports..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-be-orange"
          >
            <option value="All">All Statuses</option>
            <option value="Submitted">Submitted to TL</option>
            <option value="Reviewed">Reviewed by TL</option>
            <option value="Needs Revision">Needs Revision</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center mx-auto mb-4 border border-orange-100">
              <ClipboardList size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">No Daily Status Reports Found</h3>
            <p className="text-gray-500 text-xs sm:text-sm max-w-md mx-auto mb-6">
              {activeTab === 'team-reviews'
                ? 'No team member DSRs matching your search criteria.'
                : "You haven't submitted any DSR reports yet. Click below to enter your daily status report."}
            </p>
            {activeTab === 'my-reports' && (
              <button
                onClick={() => openSubmitModal()}
                className="px-5 py-2.5 bg-be-orange text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-all"
              >
                + Enter Daily Status Report
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/75 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Report Date</th>
                  {activeTab === 'team-reviews' && <th className="py-4 px-6">Employee</th>}
                  <th className="py-4 px-6">Daily Status Report (DSR)</th>
                  <th className="py-4 px-6">Sent To TL</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                {filteredReports.map((report) => {
                  const formattedDate = new Date(report.reportDate).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  });

                  return (
                    <tr key={report.id} className="hover:bg-orange-50/30 transition-colors group">
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="font-bold text-gray-900 flex items-center space-x-2">
                          <CalendarIcon size={14} className="text-be-orange shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{report.id}</div>
                      </td>

                      {activeTab === 'team-reviews' && (
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="font-bold text-gray-900">{report.empName}</div>
                          <div className="text-[11px] text-gray-500">{report.dept} • {report.designation}</div>
                        </td>
                      )}

                      <td className="py-4 px-6 max-w-md">
                        <p className="text-gray-800 line-clamp-2 leading-relaxed">
                          {report.description}
                        </p>
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="font-semibold text-gray-800 flex items-center">
                          <span className="mr-1">👔</span> {report.tlName}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {report.submittedDateFormatted || 'Submitted on time'}
                        </div>
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap">
                        {renderStatusBadge(report.status)}
                        {report.tlFeedback && (
                          <div className="text-[10px] text-gray-500 italic mt-1 max-w-[180px] truncate" title={report.tlFeedback}>
                            💬 "{report.tlFeedback}"
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* View Action */}
                          <button
                            onClick={() => setViewingReport(report)}
                            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200/60 transition-colors"
                            title="View Full Details"
                          >
                            <Eye size={15} />
                          </button>

                          {/* TL Review Action */}
                          {activeTab === 'team-reviews' && isTeamLeadOrAdmin && (
                            <button
                              onClick={() => {
                                setReviewingReport(report);
                                setTlFeedbackInput(report.tlFeedback || '');
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center space-x-1"
                              title="Review & Feedback"
                            >
                              <MessageSquare size={13} />
                              <span>Review</span>
                            </button>
                          )}

                          {/* Edit Action for ALL reports */}
                          <button
                            onClick={() => openSubmitModal(report)}
                            className="p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-be-orange border border-orange-200 transition-colors"
                            title="Edit DSR"
                          >
                            <Edit3 size={15} />
                          </button>

                          {/* Delete Action for ALL reports */}
                          <button
                            onClick={() => handleDeleteReport(report.id)}
                            className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors"
                            title="Delete DSR"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Clean & Simple DSR Entry Form (Date + DSR Field) */}
      <AnimatePresence>
        {isSubmitModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-2xl w-full overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 text-white flex justify-between items-center">
                <div>
                  <div className="flex items-center space-x-2 text-orange-100 text-xs font-bold uppercase tracking-wider mb-1">
                    <ClipboardList size={16} />
                    <span>Daily Status Report Form</span>
                  </div>
                  <h2 className="text-xl font-black">
                    {editingDraftId ? 'Edit Daily Status Report Draft' : 'Enter Daily Status Report (DSR)'}
                  </h2>
                </div>
                <button
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Content */}
              <div className="p-6 space-y-5">
                {/* Employee & TL Direct Routing Banner */}
                <div className="p-4 bg-orange-50/70 rounded-2xl border border-orange-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Employee</span>
                    <div className="font-bold text-gray-900 text-sm">{currentUser.name}</div>
                    <div className="text-xs text-gray-500">{currentUser.department} • {currentUser.designation}</div>
                  </div>

                  <div className="sm:text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Will Send To Team Leader</span>
                    <div className="font-bold text-be-orange text-sm flex items-center sm:justify-end">
                      <span>👔</span>
                      <span className="ml-1">{selectedTLName}</span>
                    </div>
                  </div>
                </div>

                {/* 1. Date Field (Auto-fetched Today + Editable) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-800 flex items-center space-x-1">
                      <span>Date</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setQuickDate(0)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                          reportDate === todayStr 
                            ? 'bg-orange-50 text-be-orange border-orange-200 shadow-sm' 
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDate(-1)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                      >
                        Yesterday
                      </button>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <input
                      type="date"
                      value={reportDate}
                      onChange={e => setReportDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white font-semibold text-xs text-gray-900 focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 outline-none shadow-sm transition-all"
                      required
                    />
                  </div>
                  
                  {formErrors.reportDate && (
                    <p className="text-red-500 text-xs font-semibold mt-1">{formErrors.reportDate}</p>
                  )}
                </div>

                {/* 2. DSR Report / Description Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-800 flex items-center space-x-1.5">
                      <FileText size={15} className="text-be-orange" />
                      <span>Daily Status Report (DSR)</span>
                      <span className="text-red-500">*</span>
                    </label>
                  </div>

                  <textarea
                    rows={7}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Enter your daily status report here... (e.g. tasks completed, client calls made, quotations prepared, issues faced, deliverables achieved today)"
                    className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-white font-medium text-xs text-gray-900 focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 outline-none transition-all shadow-sm leading-relaxed"
                    required
                  />

                  {formErrors.description && (
                    <p className="text-red-500 text-xs font-semibold mt-1">{formErrors.description}</p>
                  )}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col-reverse sm:flex-row justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 font-bold text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>

                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleSaveOrSubmit('Draft')}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-gray-300 font-bold text-xs text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    Save as Draft
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveOrSubmit('Submitted')}
                    className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-be-orange to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-orange-500/25 hover:shadow-xl transition-all flex items-center justify-center space-x-2"
                  >
                    <Send size={14} />
                    <span>Submit DSR to TL</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: View Full DSR Details */}
      <AnimatePresence>
        {viewingReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-xl w-full overflow-hidden my-8"
            >
              <div className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex justify-between items-center">
                <div>
                  <div className="text-xs text-orange-400 font-bold uppercase tracking-wider">
                    Daily Status Report Details
                  </div>
                  <h2 className="text-lg font-bold mt-0.5">
                    {viewingReport.empName} — {new Date(viewingReport.reportDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </h2>
                </div>
                <button
                  onClick={() => setViewingReport(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                {/* Meta details */}
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Status</span>
                    <div className="mt-1">{renderStatusBadge(viewingReport.status)}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Sent To TL</span>
                    <div className="mt-1 font-bold text-gray-900">{viewingReport.tlName}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Submitted At</span>
                    <div className="mt-1 font-semibold text-gray-700">{viewingReport.submittedDateFormatted}</div>
                  </div>
                </div>

                {/* DSR Content */}
                <div className="p-5 bg-orange-50/40 rounded-2xl border border-orange-100 text-gray-900 space-y-2">
                  <h4 className="font-bold text-be-orange uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                    <FileText size={14} />
                    <span>Daily Status Report Content</span>
                  </h4>
                  <p className="text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                    {viewingReport.description}
                  </p>
                </div>

                {/* TL Feedback Banner (if reviewed) */}
                {viewingReport.tlFeedback && (
                  <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-emerald-900">
                    <div className="flex items-center space-x-2 font-bold mb-1">
                      <MessageSquare size={14} className="text-emerald-600" />
                      <span>Team Leader (TL) Feedback & Remarks:</span>
                    </div>
                    <p className="font-medium italic">"{viewingReport.tlFeedback}"</p>
                    {viewingReport.reviewedByName && (
                      <div className="text-[10px] text-emerald-700 mt-2 font-semibold">
                        Reviewed by: {viewingReport.reviewedByName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setViewingReport(null)}
                  className="px-5 py-2 rounded-xl bg-gray-900 text-white font-bold text-xs hover:bg-black transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: TL Review & Feedback */}
      <AnimatePresence>
        {reviewingReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden my-8"
            >
              <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex justify-between items-center">
                <div>
                  <div className="text-xs text-amber-100 font-bold uppercase tracking-wider">
                    Team Leader Review & Feedback
                  </div>
                  <h2 className="text-xl font-bold mt-0.5">
                    Reviewing DSR for {reviewingReport.empName}
                  </h2>
                </div>
                <button
                  onClick={() => setReviewingReport(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                  <div className="font-bold text-gray-900">
                    Date: {new Date(reviewingReport.reportDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="text-gray-800 font-medium whitespace-pre-wrap">
                    <strong>Report:</strong> {reviewingReport.description}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">
                    Write TL Remarks / Feedback for {reviewingReport.empName}:
                  </label>
                  <textarea
                    rows={3}
                    value={tlFeedbackInput}
                    onChange={e => setTlFeedbackInput(e.target.value)}
                    placeholder="e.g. Well done on today's report. Great progress!"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 font-medium text-xs text-gray-900 focus:bg-white focus:border-be-orange outline-none"
                  />
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-end">
                  <button
                    type="button"
                    onClick={() => handleReviewAction(reviewingReport.id, 'Needs Revision')}
                    className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 transition-colors"
                  >
                    Request Revision
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReviewAction(reviewingReport.id, 'Reviewed')}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5"
                  >
                    <Check size={16} />
                    <span>Acknowledge & Mark Reviewed</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
