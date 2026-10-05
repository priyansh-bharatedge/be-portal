import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Briefcase,
  FileText,
  Users,
  Building2,
  UserCircle,
  ClipboardList,
  Calendar,
  CreditCard,
  Book,
  MessageSquarePlus,
  ArrowRight,
  Sparkles,
  Command,
  CornerDownLeft,
  FolderOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAllDealsFromIndexedDB } from '../lib/db';

export interface GlobalSearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: 'CRM' | 'HRMS' | 'Quality' | 'Pages';
  type: string;
  path: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  extraInfo?: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery = ''
}) => {
  const navigate = useNavigate();
  const { currentUser, filterRecords, isSuperAdmin, isHR } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cached datasets for instant searching
  const [allDeals, setAllDeals] = useState<any[]>([]);
  const [allQuotations, setAllQuotations] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [allDsr, setAllDsr] = useState<any[]>([]);
  const [allLeaves, setAllLeaves] = useState<any[]>([]);
  const [allPolicies, setAllPolicies] = useState<any[]>([]);
  const [allQueries, setAllQueries] = useState<any[]>([]);

  // Load datasets when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Load Deals from IndexedDB and fallback localStorage
      getAllDealsFromIndexedDB().then(deals => {
        if (Array.isArray(deals) && deals.length > 0) {
          setAllDeals(deals);
        } else {
          try {
            const raw = localStorage.getItem('be_deals');
            if (raw) setAllDeals(JSON.parse(raw));
          } catch (e) {}
        }
      }).catch(() => {
        try {
          const raw = localStorage.getItem('be_deals');
          if (raw) setAllDeals(JSON.parse(raw));
        } catch (e) {}
      });

      // Load Quotations
      try {
        const raw = localStorage.getItem('be_quotations');
        if (raw) setAllQuotations(JSON.parse(raw));
      } catch (e) {}

      // Load Clients
      try {
        const raw = localStorage.getItem('be_clients');
        if (raw) setAllClients(JSON.parse(raw));
      } catch (e) {}

      // Load Companies
      try {
        const raw = localStorage.getItem('be_companies');
        if (raw) setAllCompanies(JSON.parse(raw));
      } catch (e) {}

      // Load Employees
      try {
        const raw = localStorage.getItem('be_employees');
        if (raw) setAllEmployees(JSON.parse(raw));
      } catch (e) {}

      // Load DSR
      try {
        const raw = localStorage.getItem('be_dsr_reports');
        if (raw) setAllDsr(JSON.parse(raw));
      } catch (e) {}

      // Load Leaves
      try {
        const raw = localStorage.getItem('be_leaves');
        if (raw) setAllLeaves(JSON.parse(raw));
      } catch (e) {}

      // Load Policies
      try {
        const raw = localStorage.getItem('be_policies');
        if (raw) setAllPolicies(JSON.parse(raw));
      } catch (e) {}

      // Load Queries
      try {
        const raw = localStorage.getItem('be_raised_queries') || localStorage.getItem('be_queries');
        if (raw) setAllQueries(JSON.parse(raw));
      } catch (e) {}
    }
  }, [isOpen, initialQuery]);

  // Static Portal Navigation Pages
  const portalPages = useMemo(() => [
    { title: 'CRM Dashboard', subtitle: 'Overview, analytics & deal metrics', path: '/crm/dashboard', category: 'Pages' as const, type: 'Page', icon: <Briefcase size={16} /> },
    { title: 'Deals Module', subtitle: 'Manage active, won, and closed sales deals', path: '/crm/deals', category: 'Pages' as const, type: 'Page', icon: <Briefcase size={16} /> },
    { title: 'Quotations Module', subtitle: 'Create, track and send client proposals', path: '/crm/quotations', category: 'Pages' as const, type: 'Page', icon: <FileText size={16} /> },
    { title: 'Clients Directory', subtitle: 'Customer database and contact records', path: '/crm/clients', category: 'Pages' as const, type: 'Page', icon: <Users size={16} /> },
    { title: 'Companies Directory', subtitle: 'Registered corporate accounts & GST details', path: '/crm/companies', category: 'Pages' as const, type: 'Page', icon: <Building2 size={16} /> },
    { title: 'CRM Documents', subtitle: 'Storage for deal contracts and attachments', path: '/crm/documents', category: 'Pages' as const, type: 'Page', icon: <FolderOpen size={16} /> },
    { title: 'HRMS Dashboard', subtitle: 'Employee attendance, leaves and HR stats', path: '/hrms/dashboard', category: 'Pages' as const, type: 'Page', icon: <UserCircle size={16} /> },
    { title: 'Employees Directory', subtitle: 'Team profiles, roles and designations', path: '/hrms/employees', category: 'Pages' as const, type: 'Page', icon: <UserCircle size={16} /> },
    { title: 'My Team Hub', subtitle: 'Team hierarchy, direct reports & sub-teams', path: '/hrms/my-team', category: 'Pages' as const, type: 'Page', icon: <Users size={16} /> },
    { title: 'Daily Status Reports (DSR)', subtitle: 'Daily work logs, tasks and TL reviews', path: '/hrms/dsr', category: 'Pages' as const, type: 'Page', icon: <ClipboardList size={16} /> },
    { title: 'Attendance Management', subtitle: 'Punch records, logs and biometric status', path: '/hrms/attendance', category: 'Pages' as const, type: 'Page', icon: <Calendar size={16} /> },
    { title: 'Leave Management', subtitle: 'Apply for leave, track balance & approvals', path: '/hrms/leaves', category: 'Pages' as const, type: 'Page', icon: <Calendar size={16} /> },
    { title: 'Salary Slips & Payslips', subtitle: 'View monthly remuneration and download PDF', path: '/hrms/salary', category: 'Pages' as const, type: 'Page', icon: <CreditCard size={16} /> },
    { title: 'Company Calendar', subtitle: 'Holidays, corporate events and deadlines', path: '/hrms/calendar', category: 'Pages' as const, type: 'Page', icon: <Calendar size={16} /> },
    { title: 'Company Policies', subtitle: 'Official handbook, compliance & guidelines', path: '/hrms/policies', category: 'Pages' as const, type: 'Page', icon: <Book size={16} /> },
    { title: 'Personal Documents', subtitle: 'Employee verification KYC & Zoho files', path: '/hrms/documents', category: 'Pages' as const, type: 'Page', icon: <FolderOpen size={16} /> },
    { title: 'Quality Raised Queries', subtitle: 'Client queries, escalations & ticket status', path: '/quality/raised-queries', category: 'Pages' as const, type: 'Page', icon: <MessageSquarePlus size={16} /> },
    { title: 'Quality Dashboard', subtitle: 'Audit and ticket resolution statistics', path: '/quality/dashboard', category: 'Pages' as const, type: 'Page', icon: <MessageSquarePlus size={16} /> },
  ], []);

  // Compute search results across all modules
  const searchResults = useMemo<GlobalSearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default: show top quick navigation pages
      return portalPages.map(p => ({
        id: `page-${p.path}`,
        title: p.title,
        subtitle: p.subtitle,
        category: 'Pages' as const,
        type: p.type,
        path: p.path,
        icon: p.icon,
        badge: 'Navigate',
        badgeColor: 'bg-gray-100 text-gray-700'
      }));
    }

    const results: GlobalSearchResult[] = [];

    // 1. CRM - Deals
    const rbacDeals = filterRecords ? filterRecords(allDeals, 'Deals') : allDeals;
    for (const d of rbacDeals) {
      const match =
        (d.id && String(d.id).toLowerCase().includes(q)) ||
        (d.zohoId && String(d.zohoId).toLowerCase().includes(q)) ||
        (d.client && String(d.client).toLowerCase().includes(q)) ||
        (d.company && String(d.company).toLowerCase().includes(q)) ||
        (d.service && String(d.service).toLowerCase().includes(q)) ||
        (d.owner && String(d.owner).toLowerCase().includes(q)) ||
        (d.employeeName && String(d.employeeName).toLowerCase().includes(q)) ||
        (d.salesEmployee && String(d.salesEmployee).toLowerCase().includes(q)) ||
        (d.status && String(d.status).toLowerCase().includes(q)) ||
        (d.stage && String(d.stage).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `deal-${d.id || d.zohoId}`,
          title: `${d.company || d.client || 'Deal'} — ${d.service || 'Service'}`,
          subtitle: `ID: ${d.id || d.zohoId} • Client: ${d.client || 'N/A'} • Owner: ${d.owner || d.employeeName || 'Admin'}`,
          category: 'CRM',
          type: 'Deal',
          path: `/crm/deals`,
          icon: <Briefcase size={16} className="text-orange-500" />,
          badge: d.amount || d.status || 'Deal',
          badgeColor: 'bg-orange-50 text-be-orange border border-orange-200',
          extraInfo: d.stage || d.status
        });
        if (results.length > 50) break;
      }
    }

    // 2. CRM - Quotations
    const rbacQuotes = filterRecords ? filterRecords(allQuotations, 'Quotations') : allQuotations;
    for (const qt of rbacQuotes) {
      const match =
        (qt.id && String(qt.id).toLowerCase().includes(q)) ||
        (qt.zohoId && String(qt.zohoId).toLowerCase().includes(q)) ||
        (qt.client && String(qt.client).toLowerCase().includes(q)) ||
        (qt.company && String(qt.company).toLowerCase().includes(q)) ||
        (qt.service && String(qt.service).toLowerCase().includes(q)) ||
        (qt.employeeName && String(qt.employeeName).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `quote-${qt.id || qt.zohoId}`,
          title: `Quotation ${qt.id} — ${qt.company || qt.client || 'Proposal'}`,
          subtitle: `Client: ${qt.client || 'N/A'} • Service: ${qt.service || 'Services'}`,
          category: 'CRM',
          type: 'Quotation',
          path: `/crm/quotations`,
          icon: <FileText size={16} className="text-amber-500" />,
          badge: qt.amount || 'Quotation',
          badgeColor: 'bg-amber-50 text-amber-700 border border-amber-200',
          extraInfo: qt.status || 'Draft'
        });
        if (results.length > 70) break;
      }
    }

    // 3. CRM - Clients
    const rbacClients = filterRecords ? filterRecords(allClients, 'Clients') : allClients;
    for (const cl of rbacClients) {
      const match =
        (cl.name && String(cl.name).toLowerCase().includes(q)) ||
        (cl.company && String(cl.company).toLowerCase().includes(q)) ||
        (cl.email && String(cl.email).toLowerCase().includes(q)) ||
        (cl.phone && String(cl.phone).includes(q)) ||
        (cl.id && String(cl.id).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `client-${cl.id}`,
          title: cl.name,
          subtitle: `Company: ${cl.company || 'Individual'} • Email: ${cl.email || 'N/A'} • Phone: ${cl.phone || 'N/A'}`,
          category: 'CRM',
          type: 'Client',
          path: `/crm/clients`,
          icon: <Users size={16} className="text-blue-500" />,
          badge: cl.status || 'Client',
          badgeColor: 'bg-blue-50 text-blue-700 border border-blue-200'
        });
        if (results.length > 85) break;
      }
    }

    // 4. CRM - Companies
    const rbacCompanies = filterRecords ? filterRecords(allCompanies, 'Companies') : allCompanies;
    for (const cp of rbacCompanies) {
      const match =
        (cp.name && String(cp.name).toLowerCase().includes(q)) ||
        (cp.gstNumber && String(cp.gstNumber).toLowerCase().includes(q)) ||
        (cp.type && String(cp.type).toLowerCase().includes(q)) ||
        (cp.email && String(cp.email).toLowerCase().includes(q)) ||
        (cp.id && String(cp.id).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `company-${cp.id}`,
          title: cp.name,
          subtitle: `Type: ${cp.type || 'Private Limited'} • GST: ${cp.gstNumber || 'N/A'}`,
          category: 'CRM',
          type: 'Company',
          path: `/crm/companies`,
          icon: <Building2 size={16} className="text-emerald-500" />,
          badge: cp.type || 'Company',
          badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        });
        if (results.length > 100) break;
      }
    }

    // 5. HRMS - Employees
    for (const emp of allEmployees) {
      const match =
        (emp.name && String(emp.name).toLowerCase().includes(q)) ||
        (emp.id && String(emp.id).toLowerCase().includes(q)) ||
        (emp.email && String(emp.email).toLowerCase().includes(q)) ||
        (emp.dept && String(emp.dept).toLowerCase().includes(q)) ||
        (emp.role && String(emp.role).toLowerCase().includes(q)) ||
        (emp.systemRole && String(emp.systemRole).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `emp-${emp.id}`,
          title: emp.name,
          subtitle: `${emp.role || 'Employee'} • Dept: ${emp.dept || 'General'} • ID: ${emp.id}`,
          category: 'HRMS',
          type: 'Employee',
          path: `/hrms/employees`,
          icon: <UserCircle size={16} className="text-purple-500" />,
          badge: emp.systemRole || 'TM',
          badgeColor: 'bg-purple-50 text-purple-700 border border-purple-200'
        });
        if (results.length > 115) break;
      }
    }

    // 6. HRMS - DSR
    for (const dsr of allDsr) {
      const match =
        (dsr.empName && String(dsr.empName).toLowerCase().includes(q)) ||
        (dsr.description && String(dsr.description).toLowerCase().includes(q)) ||
        (dsr.reportDate && String(dsr.reportDate).includes(q)) ||
        (dsr.status && String(dsr.status).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `dsr-${dsr.id}`,
          title: `DSR: ${dsr.empName} (${dsr.reportDate})`,
          subtitle: dsr.description ? dsr.description.slice(0, 90) : 'Daily status report log',
          category: 'HRMS',
          type: 'DSR',
          path: `/hrms/dsr`,
          icon: <ClipboardList size={16} className="text-indigo-500" />,
          badge: dsr.status || 'Submitted',
          badgeColor: 'bg-indigo-50 text-indigo-700 border border-indigo-200'
        });
        if (results.length > 125) break;
      }
    }

    // 7. HRMS - Leaves
    for (const lv of allLeaves) {
      const match =
        (lv.empName && String(lv.empName).toLowerCase().includes(q)) ||
        (lv.type && String(lv.type).toLowerCase().includes(q)) ||
        (lv.reason && String(lv.reason).toLowerCase().includes(q)) ||
        (lv.status && String(lv.status).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `leave-${lv.id}`,
          title: `Leave: ${lv.empName} — ${lv.type}`,
          subtitle: `${lv.startDate} to ${lv.endDate} • ${lv.reason || 'Leave application'}`,
          category: 'HRMS',
          type: 'Leave',
          path: `/hrms/leaves`,
          icon: <Calendar size={16} className="text-teal-500" />,
          badge: lv.status || 'Pending',
          badgeColor: 'bg-teal-50 text-teal-700 border border-teal-200'
        });
        if (results.length > 135) break;
      }
    }

    // 8. HRMS - Policies
    for (const pol of allPolicies) {
      const match =
        (pol.title && String(pol.title).toLowerCase().includes(q)) ||
        (pol.content && String(pol.content).toLowerCase().includes(q)) ||
        (pol.department && String(pol.department).toLowerCase().includes(q)) ||
        (pol.tag && String(pol.tag).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `policy-${pol.id}`,
          title: pol.title,
          subtitle: `Dept: ${pol.department || 'All'} • ${pol.content ? pol.content.slice(0, 80) : 'Company policy'}`,
          category: 'HRMS',
          type: 'Policy',
          path: `/hrms/policies`,
          icon: <Book size={16} className="text-cyan-500" />,
          badge: pol.department || 'Policy',
          badgeColor: 'bg-cyan-50 text-cyan-700 border border-cyan-200'
        });
        if (results.length > 145) break;
      }
    }

    // 9. Quality - Raised Queries
    for (const qry of allQueries) {
      const match =
        (qry.id && String(qry.id).toLowerCase().includes(q)) ||
        (qry.client && String(qry.client).toLowerCase().includes(q)) ||
        (qry.company && String(qry.company).toLowerCase().includes(q)) ||
        (qry.service && String(qry.service).toLowerCase().includes(q)) ||
        (qry.query && String(qry.query).toLowerCase().includes(q)) ||
        (qry.assignee && String(qry.assignee).toLowerCase().includes(q)) ||
        (qry.status && String(qry.status).toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `query-${qry.id}`,
          title: `Query ${qry.id}: ${qry.client || qry.company || 'Issue'}`,
          subtitle: `${qry.service || 'Service'} • ${qry.query ? qry.query.slice(0, 80) : 'Quality query'}`,
          category: 'Quality',
          type: 'Query',
          path: `/quality/raised-queries`,
          icon: <MessageSquarePlus size={16} className="text-rose-500" />,
          badge: qry.status || qry.priority || 'Open',
          badgeColor: 'bg-rose-50 text-rose-700 border border-rose-200'
        });
        if (results.length > 155) break;
      }
    }

    // 10. Portal Pages Matching
    for (const p of portalPages) {
      if (p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)) {
        results.unshift({
          id: `page-${p.path}`,
          title: p.title,
          subtitle: p.subtitle,
          category: 'Pages',
          type: p.type,
          path: p.path,
          icon: p.icon,
          badge: 'Page',
          badgeColor: 'bg-gray-100 text-gray-700'
        });
      }
    }

    return results;
  }, [query, allDeals, allQuotations, allClients, allCompanies, allEmployees, allDsr, allLeaves, allPolicies, allQueries, portalPages, filterRecords]);

  // Filter results by category tab
  const filteredResults = useMemo(() => {
    if (selectedCategory === 'All') return searchResults;
    return searchResults.filter(r => r.category === selectedCategory);
  }, [searchResults, selectedCategory]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredResults.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          handleSelectResult(filteredResults[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredResults, selectedIndex]);

  const handleSelectResult = (result: GlobalSearchResult) => {
    onClose();
    navigate(result.path);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-4 pb-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity"
        />

        {/* Search Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[80vh] z-10"
        >
          {/* Search Header Bar */}
          <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center space-x-3 bg-gradient-to-r from-gray-50/70 via-white to-orange-50/30">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center border border-orange-100 shrink-0 shadow-xs">
              <Search className="w-5 h-5" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search deals, clients, quotations, employees, DSR, policies..."
              className="flex-1 bg-transparent text-gray-900 text-base font-semibold placeholder:text-gray-400 placeholder:font-normal outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={16} />
              </button>
            )}
            <div className="hidden sm:flex items-center space-x-1 px-2 py-1 bg-gray-100/80 rounded-lg text-[11px] font-bold text-gray-500 border border-gray-200/60">
              <span>ESC</span>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center space-x-1.5 px-4 sm:px-5 py-2.5 bg-gray-50/50 border-b border-gray-100 overflow-x-auto text-xs font-semibold">
            {['All', 'CRM', 'HRMS', 'Quality', 'Pages'].map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setSelectedIndex(0);
                }}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  selectedCategory === cat
                    ? 'bg-be-orange text-white shadow-xs font-bold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
            <span className="text-[11px] text-gray-400 ml-auto hidden sm:inline pl-2">
              {filteredResults.length} {filteredResults.length === 1 ? 'match' : 'matches'}
            </span>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1 divide-y divide-transparent max-h-[50vh]">
            {filteredResults.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-be-orange flex items-center justify-center mx-auto mb-3">
                  <Search size={24} />
                </div>
                <h4 className="text-sm font-bold text-gray-900">No matching records found</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  Try searching with a different keyword like deal ID, company name, client, employee code, or leave type.
                </p>
              </div>
            ) : (
              filteredResults.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-orange-50/80 border border-orange-200/80 shadow-xs translate-x-0.5'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isSelected ? 'bg-white border-orange-200 shadow-xs' : 'bg-gray-50 border-gray-100'
                      }`}>
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {item.title}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 ml-3">
                      {item.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-gray-100 text-gray-700'}`}>
                          {item.badge}
                        </span>
                      )}
                      <ArrowRight size={14} className={`transition-transform ${isSelected ? 'text-be-orange translate-x-1' : 'text-gray-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Shortcuts */}
          <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 font-medium">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-gray-700 font-mono text-[10px] shadow-2xs">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-gray-700 font-mono text-[10px] shadow-2xs">↓</kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-gray-700 font-mono text-[10px] shadow-2xs">↵</kbd>
                <span>Select</span>
              </span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-gray-700 font-mono text-[10px] shadow-2xs">ESC</kbd>
                <span>Close</span>
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-gray-400 font-semibold">
              <Sparkles size={12} className="text-be-orange" />
              <span>Universal Instant Search</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
