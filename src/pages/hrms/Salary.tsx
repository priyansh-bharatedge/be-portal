import { useState, useEffect } from 'react';
import { Search, Plus, Download, Edit, Trash2, Shield, Info, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { fetchZohoEmployees } from '../../services/zohoService';

interface SalaryRecord {
  id: string;
  empId: string;
  empName: string;
  month: string;
  basic: number;
  hra: number;
  allowances: number;
  target: number;
  deductions: number;
  pf: number;
  tds: number;
  netSalary: number;
  status: 'Paid' | 'Pending';
}

const formatMonth = (monthStr: string) => {
  if (!monthStr) return '';
  if (!monthStr.includes('-')) return monthStr;
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
};

const INITIAL_SALARIES: SalaryRecord[] = [];

export const Salary = () => {
  const { currentUser, isTM, isSuperAdmin, isHR, can } = useAuth();
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    empId: '', month: new Date().toISOString().substring(0, 7), basic: 45000, hra: 15000, allowances: 5000, target: 0, deductions: 1000, pf: 1800, tds: 2000, status: 'Pending' as 'Paid' | 'Pending'
  });

  const loadLocalEmployees = () => {
    try {
      const raw = localStorage.getItem('be_employees');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setEmployees(parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  };

  useEffect(() => {
    const saved = localStorage.getItem('be_salaries');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSalaries(parsed);
        }
      } catch (e) {
        console.error(e);
      }
    }

    const currentEmps = loadLocalEmployees();
    if (currentEmps.length === 0) {
      fetchZohoEmployees().then(res => {
        if (res.success && Array.isArray(res.data)) {
          const mapped = res.data.map((z: any) => ({
            id: z.Employment_ID || `EMP-${String(z.id).slice(-4)}`,
            name: [z.Name, z.Middle_Name, z.Last_Name].filter(Boolean).join(' ') || z.Name || 'Employee',
            email: z.Email || '',
            dept: z.Department || 'Sales',
            role: z.Designation_Job_Title || 'Team Member',
            zohoId: String(z.id)
          }));
          setEmployees(mapped);
          localStorage.setItem('be_employees', JSON.stringify(mapped));
        }
      }).catch(err => console.warn('[Zoho CRM] Salary employee fetch error:', err));
    }

    const onEmpUpdate = () => loadLocalEmployees();
    window.addEventListener('be_employees_updated', onEmpUpdate);
    return () => window.removeEventListener('be_employees_updated', onEmpUpdate);
  }, []);

  const saveToStorage = (data: SalaryRecord[]) => {
    setSalaries(data);
    localStorage.setItem('be_salaries', JSON.stringify(data));
  };

  const calculateNet = () => formData.basic + formData.hra + formData.allowances + formData.target - formData.deductions - formData.pf - formData.tds;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((e: any) => e.id === formData.empId);
    if (!emp) return alert("Select an employee");

    const record: SalaryRecord = {
      id: editingId || `SAL-${Date.now()}`,
      empName: emp.name,
      ...formData,
      netSalary: calculateNet()
    };

    if (editingId) {
      saveToStorage(salaries.map(s => s.id === editingId ? record : s));
    } else {
      saveToStorage([record, ...salaries]);
    }
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ empId: '', month: '', basic: 0, hra: 0, allowances: 0, target: 0, deductions: 0, pf: 0, tds: 0, status: 'Pending' });
  };

  const handleDownloadPayslip = (sal: SalaryRecord) => {
    const formattedMonth = formatMonth(sal.month);
    const htmlContent = `
      <html>
        <head>
          <title>Payslip - ${sal.empName} - ${formattedMonth}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #ea580c; padding-bottom: 20px; margin-bottom: 30px; }
            .company-info h1 { margin: 0; color: #ea580c; font-size: 22px; }
            .company-info p { margin: 4px 0 0 0; color: #666; font-size: 12px; }
            .slip-title { font-size: 20px; font-weight: bold; color: #555; text-transform: uppercase; text-align: right; }
            .details { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .details div { flex: 1; }
            .table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            .table th, .table td { padding: 12px; border: 1px solid #ddd; text-align: left; }
            .table th { background-color: #f9fafb; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f3f4f6; }
            .footer { text-align: center; color: #777; font-size: 12px; margin-top: 50px; border-top: 1px solid #ddd; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <h1>BharatEdge</h1>
              <p>123 Business Avenue, Tech Park | info@bharat-edge.com</p>
            </div>
            <div class="slip-title">
              <div>PAYSLIP</div>
              <div style="font-size: 14px; font-weight: normal; margin-top: 5px;">${formattedMonth}</div>
            </div>
          </div>
          
          <div class="details">
            <div>
              <strong>Employee Name:</strong> ${sal.empName}<br/>
              <strong>Employee ID:</strong> ${sal.empId}<br/>
            </div>
            <div style="text-align: right;">
              <strong>Status:</strong> ${sal.status}<br/>
              <strong>Date Generated:</strong> ${new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
          
          <table class="table">
            <thead>
              <tr>
                <th>Earnings</th>
                <th>Amount (₹)</th>
                <th>Deductions</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic Salary</td>
                <td>${sal.basic.toLocaleString()}</td>
                <td>Provident Fund (PF)</td>
                <td>${(sal.pf || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td>House Rent Allowance (HRA)</td>
                <td>${sal.hra.toLocaleString()}</td>
                <td>Tax Deducted at Source (TDS)</td>
                <td>${(sal.tds || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Other Allowances</td>
                <td>${sal.allowances.toLocaleString()}</td>
                <td>Deductions</td>
                <td>${sal.deductions.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Target / Incentive</td>
                <td>${(sal.target || 0).toLocaleString()}</td>
                <td></td>
                <td></td>
              </tr>
              <tr class="total-row">
                <td>Total Earnings</td>
                <td>${(sal.basic + sal.hra + sal.allowances + (sal.target || 0)).toLocaleString()}</td>
                <td>Total Deductions</td>
                <td>${(sal.deductions + (sal.pf || 0) + (sal.tds || 0)).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          
          <div style="text-align: right; font-size: 18px;">
            <strong>Net Salary: ₹${sal.netSalary.toLocaleString()}</strong>
          </div>
          
          <div class="footer">
            This is a computer-generated document. No signature is required.
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip_${sal.empName.replace(/\s+/g, '_')}_${formattedMonth.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isEmployeeSelfOnly = isTM || currentUser.role === 'TM' || (!isSuperAdmin && !isHR);

  const displayedSalaries = salaries.filter(s => {
    const matchesSearch = s.empName.toLowerCase().includes(searchQuery.toLowerCase()) || s.empId.toLowerCase().includes(searchQuery.toLowerCase());
    if (isEmployeeSelfOnly) {
      return matchesSearch && (
        s.empId === currentUser.empId || 
        s.empId === currentUser.id ||
        (currentUser.id && s.empId && String(s.empId).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
        (currentUser.empId && s.empId && String(s.empId).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
        s.empName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()
      );
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEmployeeSelfOnly ? 'My Salary & Payslips' : 'Salary & Payroll Management'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isEmployeeSelfOnly 
              ? `Personal salary records and downloadable payslips for ${currentUser.name}.` 
              : 'Manage employee compensation, generate payslips, and process monthly payroll.'}
          </p>
        </div>
        
        {can('create_salary') ? (
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({
                empId: employees[0]?.id || '',
                month: new Date().toISOString().substring(0, 7),
                basic: 45000,
                hra: 15000,
                allowances: 5000,
                target: 0,
                deductions: 1000,
                pf: 1800,
                tds: 2000,
                status: 'Paid'
              });
              setIsModalOpen(true);
            }} 
            className="bg-be-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-md shadow-orange-500/20"
          >
            <Plus size={18} className="mr-2" /> Add Salary Record
          </button>
        ) : (
          <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-xl font-medium border border-gray-200">
            Personal Self-Service View ({currentUser.role})
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search employee by name or ID..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-be-orange text-sm font-medium"
          />
        </div>
      </div>

      <div className="bg-transparent overflow-hidden">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Month</th>
                <th className="px-6 py-3">Net Salary</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {displayedSalaries.map((sal) => (
                <tr key={sal.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                  <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">
                    <div className="font-bold text-gray-900">{sal.empName}</div>
                    <span className="text-xs text-gray-400 block font-mono font-medium">{sal.empId}</span>
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-semibold text-gray-800">
                    {formatMonth(sal.month)}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-extrabold text-gray-900">
                    ₹{sal.netSalary.toLocaleString()}
                  </td>
                  <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                      sal.status === 'Paid' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}>
                      {sal.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => handleDownloadPayslip(sal)} 
                        className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center" 
                        title="Download Payslip HTML"
                      >
                        <Download size={14} className="mr-1" /> Payslip
                      </button>
                      
                      {can('create_salary') && (
                        <>
                          <button 
                            onClick={() => { setEditingId(sal.id); setFormData(sal); setIsModalOpen(true); }} 
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => confirm('Delete record?') && saveToStorage(salaries.filter(s => s.id !== sal.id))} 
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {displayedSalaries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <DollarSign size={40} className="mx-auto text-gray-300 mb-2" />
                    <p className="font-bold text-gray-800">No salary records found</p>
                    <p className="text-xs text-gray-400 mt-1">No salary slips found matching the current search or role view.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Salary Record' : 'Generate New Salary Record'}</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Select Employee *</label>
                    <select required value={formData.empId} onChange={e => setFormData({...formData, empId: e.target.value})} className="w-full px-3 py-2 border rounded-xl font-medium text-sm">
                      <option value="">Select Employee...</option>
                      {employees.map((e: any) => (
                        <option key={e.id} value={e.id}>{e.name} ({e.id}) - {e.systemRole || e.dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Month *</label>
                    <input required type="month" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} className="w-full px-3 py-2 border rounded-xl text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Status *</label>
                    <select required value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full px-3 py-2 border rounded-xl text-sm font-medium">
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Basic Salary (₹)</label>
                    <input required type="number" value={formData.basic} onChange={e => setFormData({...formData, basic: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-xl text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">HRA (₹)</label>
                    <input required type="number" value={formData.hra} onChange={e => setFormData({...formData, hra: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-xl text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Allowances (₹)</label>
                    <input required type="number" value={formData.allowances} onChange={e => setFormData({...formData, allowances: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-xl text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Target Incentive (₹)</label>
                    <input required type="number" value={formData.target} onChange={e => setFormData({...formData, target: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-xl text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">PF (₹)</label>
                    <input required type="number" value={formData.pf} onChange={e => setFormData({...formData, pf: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-xl text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">TDS (₹)</label>
                    <input required type="number" value={formData.tds} onChange={e => setFormData({...formData, tds: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-xl text-sm font-semibold" />
                  </div>
                </div>

                <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 flex justify-between items-center text-sm font-bold text-gray-900">
                  <span>Calculated Net Salary:</span>
                  <span className="text-be-orange text-base font-extrabold">₹{calculateNet().toLocaleString()}</span>
                </div>

                <div className="pt-4 border-t flex justify-end gap-3 mt-4">
                  <button type="button" onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-be-orange text-white rounded-xl font-bold text-xs hover:bg-orange-600 shadow-md">Save Record</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
