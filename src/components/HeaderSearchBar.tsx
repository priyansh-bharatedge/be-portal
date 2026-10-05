import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Book,
  MessageSquarePlus,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAllDealsFromIndexedDB } from '../lib/db';

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  path: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

export const HeaderSearchBar: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, filterRecords } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cached datasets for fast live search
  const [allDeals, setAllDeals] = useState<any[]>([]);
  const [allQuotations, setAllQuotations] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [allDsr, setAllDsr] = useState<any[]>([]);
  const [allLeaves, setAllLeaves] = useState<any[]>([]);
  const [allPolicies, setAllPolicies] = useState<any[]>([]);
  const [allQueries, setAllQueries] = useState<any[]>([]);

  // Load datasets into memory on mount
  useEffect(() => {
    // 1. Deals
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

    // 2. Quotations
    try {
      const raw = localStorage.getItem('be_quotations');
      if (raw) setAllQuotations(JSON.parse(raw));
    } catch (e) {}

    // 3. Clients
    try {
      const raw = localStorage.getItem('be_clients');
      if (raw) setAllClients(JSON.parse(raw));
    } catch (e) {}

    // 4. Companies
    try {
      const raw = localStorage.getItem('be_companies');
      if (raw) setAllCompanies(JSON.parse(raw));
    } catch (e) {}

    // 5. Employees
    try {
      const raw = localStorage.getItem('be_employees');
      if (raw) setAllEmployees(JSON.parse(raw));
    } catch (e) {}

    // 6. DSR
    try {
      const raw = localStorage.getItem('be_dsr_reports');
      if (raw) setAllDsr(JSON.parse(raw));
    } catch (e) {}

    // 7. Leaves
    try {
      const raw = localStorage.getItem('be_leaves');
      if (raw) setAllLeaves(JSON.parse(raw));
    } catch (e) {}

    // 8. Policies
    try {
      const raw = localStorage.getItem('be_policies');
      if (raw) setAllPolicies(JSON.parse(raw));
    } catch (e) {}

    // 9. Queries
    try {
      const raw = localStorage.getItem('be_raised_queries') || localStorage.getItem('be_queries');
      if (raw) setAllQueries(JSON.parse(raw));
    } catch (e) {}
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute live search results
  const results = useMemo<SearchResultItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const list: SearchResultItem[] = [];

    // 1. Pages matching
    const pages = [
      { title: 'Deals', subtitle: 'Manage CRM deals & pipelines', path: '/crm/deals', icon: <Briefcase size={14} className="text-orange-500" /> },
      { title: 'Quotations', subtitle: 'Proposals & quotations', path: '/crm/quotations', icon: <FileText size={14} className="text-amber-500" /> },
      { title: 'Clients', subtitle: 'Client records & contacts', path: '/crm/clients', icon: <Users size={14} className="text-blue-500" /> },
      { title: 'Companies', subtitle: 'Company accounts & GST details', path: '/crm/companies', icon: <Building2 size={14} className="text-emerald-500" /> },
      { title: 'Employees', subtitle: 'Employee directory & profiles', path: '/hrms/employees', icon: <UserCircle size={14} className="text-purple-500" /> },
      { title: 'My Team', subtitle: 'Team hierarchy & members', path: '/hrms/my-team', icon: <Users size={14} className="text-purple-500" /> },
      { title: 'Daily Status Reports (DSR)', subtitle: 'Employee work logs & reviews', path: '/hrms/dsr', icon: <ClipboardList size={14} className="text-indigo-500" /> },
      { title: 'Attendance', subtitle: 'Punch logs & attendance tracking', path: '/hrms/attendance', icon: <Calendar size={14} className="text-teal-500" /> },
      { title: 'Leave Management', subtitle: 'Leave applications & balance', path: '/hrms/leaves', icon: <Calendar size={14} className="text-teal-500" /> },
      { title: 'Salary Slips', subtitle: 'Monthly payroll & pay slips', path: '/hrms/salary', icon: <FileText size={14} className="text-green-500" /> },
      { title: 'Company Policies', subtitle: 'Employee policies & handbook', path: '/hrms/policies', icon: <Book size={14} className="text-cyan-500" /> },
      { title: 'Company Calendar', subtitle: 'Events, holidays & calendar', path: '/hrms/calendar', icon: <Calendar size={14} className="text-rose-500" /> },
      { title: 'Personal Documents', subtitle: 'KYC & verification documents', path: '/hrms/documents', icon: <FileText size={14} className="text-orange-500" /> },
      { title: 'Quality Queries', subtitle: 'Client tickets & raised queries', path: '/quality/raised-queries', icon: <MessageSquarePlus size={14} className="text-rose-500" /> },
    ];

    for (const p of pages) {
      if (p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q)) {
        list.push({
          id: `page-${p.path}`,
          title: p.title,
          subtitle: p.subtitle,
          category: 'Page',
          path: p.path,
          icon: p.icon,
          badge: 'Navigate',
          badgeColor: 'bg-gray-100 text-gray-700'
        });
      }
    }

    // 2. Deals
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
        (d.status && String(d.status).toLowerCase().includes(q));

      if (match) {
        list.push({
          id: `deal-${d.id || d.zohoId}`,
          title: `${d.company || d.client || 'Deal'} — ${d.service || 'Service'}`,
          subtitle: `ID: ${d.id || d.zohoId} • ${d.client || ''}`,
          category: 'CRM',
          path: '/crm/deals',
          icon: <Briefcase size={14} className="text-orange-500" />,
          badge: d.amount || d.status,
          badgeColor: 'bg-orange-50 text-be-orange border border-orange-200'
        });
        if (list.length > 25) break;
      }
    }

    // 3. Quotations
    const rbacQuotes = filterRecords ? filterRecords(allQuotations, 'Quotations') : allQuotations;
    for (const qt of rbacQuotes) {
      const match =
        (qt.id && String(qt.id).toLowerCase().includes(q)) ||
        (qt.client && String(qt.client).toLowerCase().includes(q)) ||
        (qt.company && String(qt.company).toLowerCase().includes(q)) ||
        (qt.service && String(qt.service).toLowerCase().includes(q));

      if (match) {
        list.push({
          id: `quote-${qt.id}`,
          title: `Quotation ${qt.id} — ${qt.company || qt.client}`,
          subtitle: `Client: ${qt.client || 'N/A'} • ${qt.service || ''}`,
          category: 'CRM',
          path: '/crm/quotations',
          icon: <FileText size={14} className="text-amber-500" />,
          badge: qt.amount,
          badgeColor: 'bg-amber-50 text-amber-700 border border-amber-200'
        });
        if (list.length > 30) break;
      }
    }

    // 4. Clients
    const rbacClients = filterRecords ? filterRecords(allClients, 'Clients') : allClients;
    for (const cl of rbacClients) {
      const match =
        (cl.name && String(cl.name).toLowerCase().includes(q)) ||
        (cl.company && String(cl.company).toLowerCase().includes(q)) ||
        (cl.email && String(cl.email).toLowerCase().includes(q)) ||
        (cl.phone && String(cl.phone).includes(q));

      if (match) {
        list.push({
          id: `client-${cl.id}`,
          title: cl.name,
          subtitle: `Company: ${cl.company || 'Individual'} • ${cl.email || cl.phone || ''}`,
          category: 'CRM',
          path: '/crm/clients',
          icon: <Users size={14} className="text-blue-500" />,
          badge: 'Client',
          badgeColor: 'bg-blue-50 text-blue-700'
        });
        if (list.length > 35) break;
      }
    }

    // 5. Companies
    const rbacCompanies = filterRecords ? filterRecords(allCompanies, 'Companies') : allCompanies;
    for (const cp of rbacCompanies) {
      const match =
        (cp.name && String(cp.name).toLowerCase().includes(q)) ||
        (cp.gstNumber && String(cp.gstNumber).toLowerCase().includes(q)) ||
        (cp.email && String(cp.email).toLowerCase().includes(q));

      if (match) {
        list.push({
          id: `company-${cp.id}`,
          title: cp.name,
          subtitle: `Type: ${cp.type || 'Private Limited'} • GST: ${cp.gstNumber || 'N/A'}`,
          category: 'CRM',
          path: '/crm/companies',
          icon: <Building2 size={14} className="text-emerald-500" />,
          badge: 'Company',
          badgeColor: 'bg-emerald-50 text-emerald-700'
        });
        if (list.length > 40) break;
      }
    }

    // 6. Employees
    for (const emp of allEmployees) {
      const match =
        (emp.name && String(emp.name).toLowerCase().includes(q)) ||
        (emp.id && String(emp.id).toLowerCase().includes(q)) ||
        (emp.email && String(emp.email).toLowerCase().includes(q)) ||
        (emp.dept && String(emp.dept).toLowerCase().includes(q)) ||
        (emp.role && String(emp.role).toLowerCase().includes(q));

      if (match) {
        list.push({
          id: `emp-${emp.id}`,
          title: emp.name,
          subtitle: `${emp.role || 'Employee'} • Dept: ${emp.dept || 'General'} • ID: ${emp.id}`,
          category: 'HRMS',
          path: '/hrms/employees',
          icon: <UserCircle size={14} className="text-purple-500" />,
          badge: emp.systemRole || 'Employee',
          badgeColor: 'bg-purple-50 text-purple-700'
        });
        if (list.length > 45) break;
      }
    }

    // 7. DSR
    for (const dsr of allDsr) {
      const match =
        (dsr.empName && String(dsr.empName).toLowerCase().includes(q)) ||
        (dsr.description && String(dsr.description).toLowerCase().includes(q)) ||
        (dsr.reportDate && String(dsr.reportDate).includes(q));

      if (match) {
        list.push({
          id: `dsr-${dsr.id}`,
          title: `DSR: ${dsr.empName} (${dsr.reportDate})`,
          subtitle: dsr.description ? dsr.description.slice(0, 60) : 'Daily status report',
          category: 'HRMS',
          path: '/hrms/dsr',
          icon: <ClipboardList size={14} className="text-indigo-500" />,
          badge: dsr.status || 'Submitted',
          badgeColor: 'bg-indigo-50 text-indigo-700'
        });
        if (list.length > 50) break;
      }
    }

    // 8. Quality Queries
    for (const qry of allQueries) {
      const match =
        (qry.id && String(qry.id).toLowerCase().includes(q)) ||
        (qry.client && String(qry.client).toLowerCase().includes(q)) ||
        (qry.query && String(qry.query).toLowerCase().includes(q));

      if (match) {
        list.push({
          id: `qry-${qry.id}`,
          title: `Query ${qry.id}: ${qry.client || qry.company || 'Issue'}`,
          subtitle: qry.query ? qry.query.slice(0, 60) : 'Quality query',
          category: 'Quality',
          path: '/quality/raised-queries',
          icon: <MessageSquarePlus size={14} className="text-rose-500" />,
          badge: qry.status || 'Query',
          badgeColor: 'bg-rose-50 text-rose-700'
        });
        if (list.length > 55) break;
      }
    }

    return list;
  }, [searchQuery, allDeals, allQuotations, allClients, allCompanies, allEmployees, allDsr, allQueries, filterRecords]);

  // Handle keyboard arrow navigation & enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSelect = (item: SearchResultItem) => {
    setIsOpen(false);
    setSearchQuery('');
    navigate(item.path);
  };

  return (
    <div ref={containerRef} className="relative max-w-xs w-full">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => {
            if (searchQuery.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search portal..."
          className="w-48 sm:w-64 pl-9 pr-7 py-1.5 bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 rounded-full text-xs font-medium text-gray-800 placeholder:text-gray-400 outline-none transition-all shadow-2xs"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 p-0.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Floating Live Search Dropdown */}
      {isOpen && searchQuery.trim() && (
        <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-2 max-h-80 overflow-y-auto space-y-1">
            {results.length === 0 ? (
              <div className="py-6 px-4 text-center">
                <p className="text-xs font-bold text-gray-800">No results found</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Try searching with deal ID, name, or company.</p>
              </div>
            ) : (
              results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-orange-50 border border-orange-200/70 shadow-2xs'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {item.title}
                          </span>
                          <span className="text-[9px] font-extrabold uppercase px-1 py-0.2 rounded bg-gray-100 text-gray-600 shrink-0">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5 font-medium">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      {item.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.badgeColor || 'bg-gray-100 text-gray-700'}`}>
                          {item.badge}
                        </span>
                      )}
                      <ArrowRight size={12} className={`transition-transform ${isSelected ? 'text-be-orange translate-x-0.5' : 'text-gray-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {results.length > 0 && (
            <div className="px-3 py-2 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-medium">
              <span>{results.length} results</span>
              <span>Press <kbd className="px-1 py-0.2 bg-white rounded border border-gray-200 text-gray-600 font-bold">↵ Enter</kbd> to open</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
