import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Download,
  Edit,
  Trash2,
  Eye,
  Printer,
  DollarSign,
  CheckCircle,
  Clock,
  FileText,
  User,
  Building2,
  Calendar,
  CreditCard,
  ChevronRight,
  X,
  Sparkles,
  Filter,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { fetchZohoEmployees } from '../../services/zohoService';
import {
  type SalaryRecord,
  formatINR,
  formatPayPeriod,
  formatDOJ,
  numberToIndianWords,
  printSalarySlip,
  downloadSalarySlipHTML
} from '../../utils/salarySlipTemplate';
import { SalarySlipDocument } from '../../components/hrms/SalarySlipDocument';

// Reference initial records matching the user's payslip format exactly
const SAMPLE_INITIAL_SALARIES: SalaryRecord[] = [
  {
    id: 'SAL-BSAPL-222-AUG26',
    empId: 'BSAPL-222',
    empName: 'Drashti Bhuva',
    designation: 'Business Development Manager',
    department: 'Sales',
    dateOfJoining: '2026-02-03',
    month: '2026-08',
    payPeriodDisplay: 'Aug-26',
    presentDays: 31,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    totalPaidDays: 31,
    basic: 35000,
    incentivePay: 0,
    hra: 0,
    allowances: 0,
    pf: 0,
    professionalTax: 200,
    unpaidLeavesDeduction: 0,
    talkTimeDeduction: 0,
    holdDeduction: 0,
    tds: 0,
    totalGross: 35000,
    totalDeductions: 200,
    netSalary: 34800,
    netSalaryInWords: 'Thirty-Four Thousand Eight Hundred Only',
    status: 'Paid',
    salaryEntity: 'BSAPL',
    createdAt: '2026-08-31T18:30:00.000Z'
  },
  {
    id: 'SAL-EMP-001-AUG26',
    empId: 'EMP-001',
    empName: 'Managing Director',
    designation: 'Managing Director & Super Admin',
    department: 'Management',
    dateOfJoining: '2024-01-01',
    month: '2026-08',
    payPeriodDisplay: 'Aug-26',
    presentDays: 31,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    totalPaidDays: 31,
    basic: 75000,
    incentivePay: 15000,
    hra: 25000,
    allowances: 10000,
    pf: 1800,
    professionalTax: 200,
    unpaidLeavesDeduction: 0,
    talkTimeDeduction: 0,
    holdDeduction: 0,
    tds: 5000,
    totalGross: 125000,
    totalDeductions: 7000,
    netSalary: 118000,
    netSalaryInWords: 'One Lakh Eighteen Thousand Rupees Only',
    status: 'Paid',
    salaryEntity: 'BSPL',
    createdAt: '2026-08-31T18:30:00.000Z'
  },
  {
    id: 'SAL-BSAPL-104-SEP26',
    empId: 'BSAPL-104',
    empName: 'Sneha Patel',
    designation: 'Sr. Business Development Executive',
    department: 'Sales',
    dateOfJoining: '2025-05-15',
    month: '2026-09',
    payPeriodDisplay: 'Sep-26',
    presentDays: 30,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    totalPaidDays: 30,
    basic: 28000,
    incentivePay: 4500,
    hra: 0,
    allowances: 0,
    pf: 0,
    professionalTax: 200,
    unpaidLeavesDeduction: 0,
    talkTimeDeduction: 0,
    holdDeduction: 0,
    tds: 0,
    totalGross: 32500,
    totalDeductions: 200,
    netSalary: 32300,
    netSalaryInWords: 'Thirty-Two Thousand Three Hundred Only',
    status: 'Paid',
    salaryEntity: 'BSAPL',
    createdAt: '2026-09-30T18:30:00.000Z'
  }
];

export const Salary = () => {
  const { currentUser, isTM, isSuperAdmin, isHR, can } = useAuth();
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Preview Modal
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSalary, setPreviewSalary] = useState<SalaryRecord | null>(null);

  // Edit / Add Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    empId: '',
    empName: '',
    designation: 'Business Development Manager',
    department: 'Sales',
    dateOfJoining: '2026-02-03',
    month: '2026-08',
    payPeriodDisplay: 'Aug-26',
    presentDays: 31,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    totalPaidDays: 31,
    basic: 35000,
    incentivePay: 0,
    hra: 0,
    allowances: 0,
    pf: 0,
    professionalTax: 200,
    unpaidLeavesDeduction: 0,
    talkTimeDeduction: 0,
    holdDeduction: 0,
    tds: 0,
    bankName: '',
    bankAccount: '',
    ifscCode: '',
    panNumber: '',
    status: 'Paid' as 'Paid' | 'Pending',
    salaryEntity: 'BSAPL'
  });

  const loadLocalEmployees = () => {
    try {
      const raw = localStorage.getItem('be_employees');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEmployees(parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  };

  useEffect(() => {
    // Load salaries from storage
    const saved = localStorage.getItem('be_salaries');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSalaries(parsed);
        } else {
          setSalaries(SAMPLE_INITIAL_SALARIES);
          localStorage.setItem('be_salaries', JSON.stringify(SAMPLE_INITIAL_SALARIES));
        }
      } catch (e) {
        setSalaries(SAMPLE_INITIAL_SALARIES);
      }
    } else {
      setSalaries(SAMPLE_INITIAL_SALARIES);
      localStorage.setItem('be_salaries', JSON.stringify(SAMPLE_INITIAL_SALARIES));
    }

    // Load employees
    const currentEmps = loadLocalEmployees();
    if (currentEmps.length === 0) {
      fetchZohoEmployees()
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            const mapped = res.data.map((z: any) => ({
              id: z.Employment_ID || `EMP-${String(z.id).slice(-4)}`,
              name:
                [z.Name, z.Middle_Name, z.Last_Name].filter(Boolean).join(' ') ||
                z.Name ||
                'Employee',
              email: z.Email || '',
              dept: z.Department || 'Sales',
              role: z.Designation_Job_Title || 'Business Development Manager',
              joined: z.Date_of_Joining || '2026-02-03',
              zohoId: String(z.id)
            }));
            setEmployees(mapped);
            localStorage.setItem('be_employees', JSON.stringify(mapped));
          }
        })
        .catch((err) => console.warn('[Zoho CRM] Salary employee fetch error:', err));
    }

    const onEmpUpdate = () => loadLocalEmployees();
    window.addEventListener('be_employees_updated', onEmpUpdate);
    return () => window.removeEventListener('be_employees_updated', onEmpUpdate);
  }, []);

  const saveToStorage = (data: SalaryRecord[]) => {
    setSalaries(data);
    localStorage.setItem('be_salaries', JSON.stringify(data));
  };

  // Calculations
  const calculateGross = () =>
    Number(formData.basic || 0) +
    Number(formData.incentivePay || 0) +
    Number(formData.hra || 0) +
    Number(formData.allowances || 0);

  const calculateDeductions = () =>
    Number(formData.pf || 0) +
    Number(formData.professionalTax || 0) +
    Number(formData.unpaidLeavesDeduction || 0) +
    Number(formData.talkTimeDeduction || 0) +
    Number(formData.holdDeduction || 0) +
    Number(formData.tds || 0);

  const calculateNet = () => calculateGross() - calculateDeductions();

  // Employee Selection Handler in Form
  const handleEmployeeSelect = (empId: string) => {
    const selected = employees.find((e) => e.id === empId);
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        empId: selected.id,
        empName: selected.name,
        designation: selected.role || selected.designation || prev.designation,
        department: selected.dept || selected.department || prev.department,
        dateOfJoining: selected.joined || selected.dateOfJoining || prev.dateOfJoining,
        salaryEntity: selected.salaryEntity || (selected.id.startsWith('BSAPL') ? 'BSAPL' : 'BSPL')
      }));
    } else {
      setFormData((prev) => ({ ...prev, empId }));
    }
  };

  const handleMonthChange = (monthVal: string) => {
    const payPeriod = formatPayPeriod(monthVal);
    setFormData((prev) => ({
      ...prev,
      month: monthVal,
      payPeriodDisplay: payPeriod
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.empId) return alert('Please select or specify an Employee ID');

    const totalGross = calculateGross();
    const totalDeductions = calculateDeductions();
    const netSalary = calculateNet();
    const inWords = numberToIndianWords(netSalary);

    const record: SalaryRecord = {
      id: editingId || `SAL-${formData.empId}-${Date.now()}`,
      empId: formData.empId,
      empName: formData.empName || 'Employee',
      designation: formData.designation,
      department: formData.department,
      dateOfJoining: formData.dateOfJoining,
      month: formData.month,
      payPeriodDisplay: formData.payPeriodDisplay || formatPayPeriod(formData.month),
      presentDays: Number(formData.presentDays),
      paidLeaveDays: Number(formData.paidLeaveDays),
      unpaidLeaveDays: Number(formData.unpaidLeaveDays),
      totalPaidDays: Number(formData.presentDays) + Number(formData.paidLeaveDays),
      basic: Number(formData.basic),
      incentivePay: Number(formData.incentivePay),
      hra: Number(formData.hra),
      allowances: Number(formData.allowances),
      pf: Number(formData.pf),
      professionalTax: Number(formData.professionalTax),
      unpaidLeavesDeduction: Number(formData.unpaidLeavesDeduction),
      talkTimeDeduction: Number(formData.talkTimeDeduction),
      holdDeduction: Number(formData.holdDeduction),
      tds: Number(formData.tds),
      bankName: formData.bankName,
      bankAccount: formData.bankAccount,
      ifscCode: formData.ifscCode,
      panNumber: formData.panNumber,
      totalGross,
      totalDeductions,
      netSalary,
      netSalaryInWords: inWords,
      status: formData.status,
      salaryEntity: formData.salaryEntity,
      createdAt: new Date().toISOString()
    };

    if (editingId) {
      saveToStorage(salaries.map((s) => (s.id === editingId ? record : s)));
    } else {
      saveToStorage([record, ...salaries]);
    }
    closeModal();
  };

  const openAddModal = () => {
    setEditingId(null);
    const firstEmp = employees[0];
    setFormData({
      empId: firstEmp?.id || 'BSAPL-222',
      empName: firstEmp?.name || 'Drashti Bhuva',
      designation: firstEmp?.role || 'Business Development Manager',
      department: firstEmp?.dept || 'Sales',
      dateOfJoining: firstEmp?.joined || '2026-02-03',
      month: '2026-08',
      payPeriodDisplay: 'Aug-26',
      presentDays: 31,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      totalPaidDays: 31,
      basic: 35000,
      incentivePay: 0,
      hra: 0,
      allowances: 0,
      pf: 0,
      professionalTax: 200,
      unpaidLeavesDeduction: 0,
      talkTimeDeduction: 0,
      holdDeduction: 0,
      tds: 0,
      bankName: '',
      bankAccount: '',
      ifscCode: '',
      panNumber: '',
      status: 'Paid',
      salaryEntity: 'BSAPL'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (sal: SalaryRecord) => {
    setEditingId(sal.id);
    setFormData({
      empId: sal.empId,
      empName: sal.empName,
      designation: sal.designation || 'Business Development Manager',
      department: sal.department || 'Sales',
      dateOfJoining: sal.dateOfJoining || '2026-02-03',
      month: sal.month || '2026-08',
      payPeriodDisplay: sal.payPeriodDisplay || formatPayPeriod(sal.month),
      presentDays: sal.presentDays ?? 31,
      paidLeaveDays: sal.paidLeaveDays ?? 0,
      unpaidLeaveDays: sal.unpaidLeaveDays ?? 0,
      totalPaidDays: sal.totalPaidDays ?? 31,
      basic: sal.basic ?? 35000,
      incentivePay: sal.incentivePay ?? 0,
      hra: sal.hra ?? 0,
      allowances: sal.allowances ?? 0,
      pf: sal.pf ?? 0,
      professionalTax: sal.professionalTax ?? 200,
      unpaidLeavesDeduction: sal.unpaidLeavesDeduction ?? 0,
      talkTimeDeduction: sal.talkTimeDeduction ?? 0,
      holdDeduction: sal.holdDeduction ?? 0,
      tds: sal.tds ?? 0,
      bankName: sal.bankName || '',
      bankAccount: sal.bankAccount || '',
      ifscCode: sal.ifscCode || '',
      panNumber: sal.panNumber || '',
      status: sal.status || 'Paid',
      salaryEntity: sal.salaryEntity || 'BSAPL'
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const openPreview = (sal: SalaryRecord) => {
    setPreviewSalary(sal);
    setIsPreviewOpen(true);
  };

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewSalary(null);
  };

  const isEmployeeSelfOnly = isTM || currentUser.role === 'TM' || (!isSuperAdmin && !isHR);

  // Available unique months for filtering
  const availableMonths = Array.from(new Set(salaries.map((s) => s.payPeriodDisplay || formatPayPeriod(s.month)))).filter(Boolean);

  const displayedSalaries = salaries.filter((s) => {
    const matchesSearch =
      (s.empName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.empId ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.department ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.designation ?? '').toLowerCase().includes(searchQuery.toLowerCase());

    const period = s.payPeriodDisplay || formatPayPeriod(s.month);
    const matchesMonth = monthFilter === 'All' || period === monthFilter;
    const matchesStatus = statusFilter === 'All' || s.status === statusFilter;

    if (isEmployeeSelfOnly) {
      const isMine =
        s.empId === currentUser.empId ||
        s.empId === currentUser.id ||
        (currentUser.id &&
          s.empId &&
          String(s.empId).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
        (currentUser.empId &&
          s.empId &&
          String(s.empId).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
        s.empName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase();
      return matchesSearch && matchesMonth && matchesStatus && isMine;
    }

    return matchesSearch && matchesMonth && matchesStatus;
  });

  // Payroll Totals Summary
  const totalPayrollValue = displayedSalaries.reduce((acc, s) => acc + (s.netSalary || 0), 0);
  const totalGrossValue = displayedSalaries.reduce((acc, s) => acc + (s.totalGross || 0), 0);
  const totalDeductionsValue = displayedSalaries.reduce((acc, s) => acc + (s.totalDeductions || 0), 0);
  const paidCount = displayedSalaries.filter((s) => s.status === 'Paid').length;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {isEmployeeSelfOnly ? 'My Salary & Payslips' : 'Salary & Payroll Management'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
              Official Payslip v2
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {isEmployeeSelfOnly
              ? `Personal salary records and official downloadable payslips for ${currentUser.name}.`
              : 'Generate unique, high-precision salary slips with automated attendance, earnings & deduction breakdowns.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {can('create_salary') ? (
            <button
              onClick={openAddModal}
              className="bg-be-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-lg shadow-orange-500/20 transition-all active:scale-95"
            >
              <Plus size={18} className="mr-2" /> Generate Salary Slip
            </button>
          ) : (
            <div className="text-xs text-gray-500 bg-gray-50 px-3.5 py-2 rounded-xl font-medium border border-gray-200">
              Self-Service View ({currentUser.role})
            </div>
          )}
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Total Net Payroll
            </span>
            <span className="text-2xl font-black text-gray-900 mt-1 block">
              ₹{formatINR(totalPayrollValue)}
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block flex items-center">
              <CheckCircle size={12} className="inline mr-1" />
              {paidCount} Paid of {displayedSalaries.length} Slips
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-be-orange border border-orange-100">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Total Gross Earnings
            </span>
            <span className="text-2xl font-black text-gray-900 mt-1 block">
              ₹{formatINR(totalGrossValue)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
              Before Taxes & Deductions
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <CreditCard size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Total Deductions
            </span>
            <span className="text-2xl font-black text-gray-900 mt-1 block">
              ₹{formatINR(totalDeductionsValue)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
              PT, PF, Holds & Leaves
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
            <Building2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Active Slips
            </span>
            <span className="text-2xl font-black text-gray-900 mt-1 block">
              {displayedSalaries.length}
            </span>
            <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
              Ready for Download & Print
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
            <FileText size={24} />
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name, EMP ID, department, designation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-be-orange text-sm font-medium transition-all"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">
            <Calendar size={14} className="text-gray-400" />
            <span>Pay Period:</span>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="bg-transparent font-bold text-gray-900 outline-none cursor-pointer"
            >
              <option value="All">All Periods</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">
            <Filter size={14} className="text-gray-400" />
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-gray-900 outline-none cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Salary Table */}
      <div className="bg-transparent overflow-hidden">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Employee Details</th>
                <th className="px-6 py-3">Pay Period</th>
                <th className="px-6 py-3">Attendance</th>
                <th className="px-6 py-3">Gross & Deductions</th>
                <th className="px-6 py-3">Net Take Home</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Payslip Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {displayedSalaries.map((sal) => {
                const payPeriod = sal.payPeriodDisplay || formatPayPeriod(sal.month);
                return (
                  <tr
                    key={sal.id}
                    className="bg-white hover:bg-orange-50/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group shadow-sm"
                  >
                    {/* Employee info */}
                    <td className="px-6 py-4 rounded-l-2xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-800 font-black text-sm flex items-center justify-center flex-shrink-0">
                          {sal.empName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 flex items-center gap-1.5">
                            {sal.empName}
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-bold bg-gray-100 text-gray-700 border border-gray-200">
                              {sal.empId}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 font-medium block mt-0.5">
                            {sal.designation || 'Business Development Manager'} • {sal.department || 'Sales'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Pay Period */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-be-orange" />
                        <span>{payPeriod}</span>
                      </div>
                      <span className="text-[11px] text-gray-400 block font-normal mt-0.5">
                        DOJ: {sal.dateOfJoining ? formatDOJ(sal.dateOfJoining) : '03-Feb-2026'}
                      </span>
                    </td>

                    {/* Attendance */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium text-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold border border-emerald-200">
                          {sal.presentDays} Present
                        </span>
                        {sal.unpaidLeaveDays > 0 ? (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-md text-xs font-bold border border-red-200">
                            {sal.unpaidLeaveDays} Unpaid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md text-xs font-medium border border-gray-200">
                            0 Leave
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 block mt-0.5">
                        Paid Days: {sal.totalPaidDays ?? sal.presentDays}
                      </span>
                    </td>

                    {/* Gross & Deductions */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100 font-semibold text-gray-800">
                      <div className="text-xs text-gray-900">
                        Gross: <span className="font-bold">₹{formatINR(sal.totalGross)}</span>
                      </div>
                      <div className="text-xs text-red-600 mt-0.5">
                        Deductions: <span className="font-semibold">-₹{formatINR(sal.totalDeductions)}</span>
                      </div>
                    </td>

                    {/* Net Salary */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100 font-black text-gray-900">
                      <div className="text-base text-gray-900">
                        ₹{formatINR(sal.netSalary)}
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium block truncate max-w-[160px]" title={sal.netSalaryInWords || numberToIndianWords(sal.netSalary)}>
                        {sal.netSalaryInWords || numberToIndianWords(sal.netSalary)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm inline-flex items-center gap-1 ${
                          sal.status === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {sal.status === 'Paid' ? <Check size={12} /> : <Clock size={12} />}
                        {sal.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right rounded-r-2xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Live View Button */}
                        <button
                          onClick={() => openPreview(sal)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm flex items-center gap-1"
                          title="View Official Payslip Document"
                        >
                          <Eye size={14} /> View
                        </button>

                        {/* Direct Print Button */}
                        <button
                          onClick={() => printSalarySlip(sal)}
                          className="p-1.5 text-gray-600 hover:text-slate-900 hover:bg-gray-100 rounded-xl transition-colors"
                          title="Print / Save as PDF"
                        >
                          <Printer size={16} />
                        </button>

                        {/* Direct Download HTML */}
                        <button
                          onClick={() => downloadSalarySlipHTML(sal)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="Download Offline HTML Payslip"
                        >
                          <Download size={16} />
                        </button>

                        {can('create_salary') && (
                          <>
                            <button
                              onClick={() => openEditModal(sal)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Edit Salary Record"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete salary record for ${sal.empName}?`)) {
                                  saveToStorage(salaries.filter((s) => s.id !== sal.id));
                                }
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayedSalaries.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-14 text-center text-gray-500 bg-white rounded-2xl border border-gray-100"
                  >
                    <DollarSign size={44} className="mx-auto text-gray-300 mb-2" />
                    <p className="font-bold text-gray-800 text-base">No salary records found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Try adjusting your search query or filter parameters.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. LIVE PAYSLIP PREVIEW MODAL */}
      <AnimatePresence>
        {isPreviewOpen && previewSalary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
            >
              {/* Modal Top Action Header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                      Official Payslip Document
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {previewSalary.payPeriodDisplay || formatPayPeriod(previewSalary.month)}
                      </span>
                    </h2>
                    <p className="text-xs text-gray-500 font-medium">
                      {previewSalary.empName} ({previewSalary.empId})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Print Button */}
                  <button
                    onClick={() => printSalarySlip(previewSalary)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Printer size={15} /> Print / PDF
                  </button>

                  {/* Download HTML */}
                  <button
                    onClick={() => downloadSalarySlipHTML(previewSalary)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Download size={15} /> Download HTML
                  </button>

                  {can('create_salary') && (
                    <button
                      onClick={() => {
                        closePreview();
                        openEditModal(previewSalary);
                      }}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Edit size={15} /> Edit
                    </button>
                  )}

                  <button
                    onClick={closePreview}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body: Document Preview */}
              <div className="p-4 sm:p-8 overflow-y-auto flex-1 flex justify-center items-start bg-slate-100">
                <div className="w-full bg-white shadow-xl rounded-sm p-2 sm:p-4">
                  <SalarySlipDocument salary={previewSalary} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. CREATE / EDIT SALARY RECORD MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-gray-900">
                      {editingId ? 'Edit Salary Slip Record' : 'Generate New Salary Slip'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      Fill out employee details, attendance, earnings, and deductions.
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
                {/* 1. Employee & Period Meta */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={14} /> Employee & Period Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Select Employee *
                      </label>
                      <select
                        required
                        value={formData.empId}
                        onChange={(e) => handleEmployeeSelect(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none transition-all"
                      >
                        <option value="">Choose Employee...</option>
                        {employees.map((e: any) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.id}) - {e.role || e.dept}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Salary Entity
                      </label>
                      <select
                        value={formData.salaryEntity}
                        onChange={(e) => setFormData({ ...formData, salaryEntity: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                      >
                        <option value="BSAPL">BSAPL (Startup Advisors)</option>
                        <option value="BSPL">BSPL (Solutions)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Employee Name
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.empName}
                        onChange={(e) => setFormData({ ...formData, empName: e.target.value })}
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                        placeholder="Drashti Bhuva"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Designation
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                        placeholder="Business Development Manager"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                        placeholder="Sales"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Date of Joining
                      </label>
                      <input
                        type="date"
                        value={formData.dateOfJoining}
                        onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Month / Period *
                      </label>
                      <input
                        type="month"
                        required
                        value={formData.month}
                        onChange={(e) => handleMonthChange(e.target.value)}
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Payment Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) =>
                          setFormData({ ...formData, status: e.target.value as 'Paid' | 'Pending' })
                        }
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm focus:bg-white focus:border-be-orange outline-none"
                      >
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Attendance Stats */}
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} /> Attendance & Leave Count
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Present Days
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={formData.presentDays}
                        onChange={(e) =>
                          setFormData({ ...formData, presentDays: Number(e.target.value) })
                        }
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm focus:bg-white focus:border-be-orange outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Paid Leave
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={formData.paidLeaveDays}
                        onChange={(e) =>
                          setFormData({ ...formData, paidLeaveDays: Number(e.target.value) })
                        }
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm focus:bg-white focus:border-be-orange outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Unpaid Leave
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={formData.unpaidLeaveDays}
                        onChange={(e) =>
                          setFormData({ ...formData, unpaidLeaveDays: Number(e.target.value) })
                        }
                        className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm focus:bg-white focus:border-be-orange outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Total Paid Days
                      </label>
                      <div className="w-full px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-black text-sm">
                        {Number(formData.presentDays) + Number(formData.paidLeaveDays)} Days
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Earnings & Deductions Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-gray-100">
                  {/* Left Column: Earnings */}
                  <div className="space-y-3 p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100">
                    <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                      Earnings Breakdown
                    </h4>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Basic Salary (₹) *
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.basic}
                        onChange={(e) => setFormData({ ...formData, basic: Number(e.target.value) })}
                        className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Incentive Pay (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.incentivePay}
                        onChange={(e) =>
                          setFormData({ ...formData, incentivePay: Number(e.target.value) })
                        }
                        className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        House Rent Allowance / HRA (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.hra}
                        onChange={(e) => setFormData({ ...formData, hra: Number(e.target.value) })}
                        className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Other Allowances (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.allowances}
                        onChange={(e) =>
                          setFormData({ ...formData, allowances: Number(e.target.value) })
                        }
                        className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>

                    <div className="pt-2 border-t border-emerald-200/60 flex justify-between items-center text-xs font-extrabold text-emerald-900">
                      <span>Total Gross:</span>
                      <span className="text-base">₹{formatINR(calculateGross())}</span>
                    </div>
                  </div>

                  {/* Right Column: Deductions */}
                  <div className="space-y-3 p-4 bg-red-50/40 rounded-2xl border border-red-100">
                    <h4 className="text-xs font-black text-red-800 uppercase tracking-wider">
                      Deductions Breakdown
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Provident Fund (PF)
                        </label>
                        <input
                          type="number"
                          value={formData.pf}
                          onChange={(e) => setFormData({ ...formData, pf: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-red-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Professional Tax (PT)
                        </label>
                        <input
                          type="number"
                          value={formData.professionalTax}
                          onChange={(e) =>
                            setFormData({ ...formData, professionalTax: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-red-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Unpaid Leaves Ded.
                        </label>
                        <input
                          type="number"
                          value={formData.unpaidLeavesDeduction}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              unpaidLeavesDeduction: Number(e.target.value)
                            })
                          }
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-red-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Talk Time Ded.
                        </label>
                        <input
                          type="number"
                          value={formData.talkTimeDeduction}
                          onChange={(e) =>
                            setFormData({ ...formData, talkTimeDeduction: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-red-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Hold (₹)</label>
                        <input
                          type="number"
                          value={formData.holdDeduction}
                          onChange={(e) =>
                            setFormData({ ...formData, holdDeduction: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-red-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          TDS / Tax (₹)
                        </label>
                        <input
                          type="number"
                          value={formData.tds}
                          onChange={(e) =>
                            setFormData({ ...formData, tds: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-sm focus:border-red-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-red-200/60 flex justify-between items-center text-xs font-extrabold text-red-900">
                      <span>Total Deductions:</span>
                      <span className="text-base">-₹{formatINR(calculateDeductions())}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Live Net Salary Summary Highlight */}
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <span className="text-xs font-bold text-gray-600 block">Calculated Net Pay:</span>
                    <span className="text-xs text-orange-800 font-medium">
                      In Words: {numberToIndianWords(calculateNet())}
                    </span>
                  </div>
                  <span className="text-2xl font-black text-be-orange">
                    ₹{formatINR(calculateNet())}
                  </span>
                </div>

                {/* Buttons */}
                <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-5 py-2.5 border border-gray-300 rounded-xl font-bold text-xs text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-be-orange hover:bg-orange-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
                  >
                    {editingId ? 'Save Changes' : 'Generate Slip'}
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
