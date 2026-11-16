import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, AlertCircle, CheckCircle2, Clock, 
  TrendingDown, TrendingUp, Download, Filter, ArrowUpRight,
  ShieldCheck, Layers, FolderOpen, Search, Users, ExternalLink, RefreshCw
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import type { InternalOperationRecord } from '../../types/operations';
import { fetchInternalOperations, getStoredInternalOperations } from '../../services/internalOperationsService';
import { InternalOperationDetailModal } from '../../components/crm/InternalOperationDetailModal';
import { getAllEmployeesList } from '../../services/zohoRbacService';

export const QualityDashboard = () => {
  const navigate = useNavigate();

  // Operations Data state for Quality Department
  const [opsRecords, setOpsRecords] = useState<InternalOperationRecord[]>([]);
  const [opsLoading, setOpsLoading] = useState<boolean>(true);
  const [opsSearch, setOpsSearch] = useState<string>('');
  const [opsFilter, setOpsFilter] = useState<'all' | 'quality' | 'inprogress'>('all');
  const [selectedOpRecord, setSelectedOpRecord] = useState<InternalOperationRecord | null>(null);
  const [allStaff, setAllStaff] = useState<any[]>(() => getAllEmployeesList());

  useEffect(() => {
    let isMounted = true;
    const loadOps = async () => {
      setOpsLoading(true);
      try {
        const data = await fetchInternalOperations();
        if (isMounted) setOpsRecords(data);
      } catch (err) {
        if (isMounted) setOpsRecords(getStoredInternalOperations());
      } finally {
        if (isMounted) setOpsLoading(false);
      }
    };
    loadOps();

    const handleOpsUpdate = () => {
      setOpsRecords(getStoredInternalOperations());
    };
    window.addEventListener('be_internal_operations_updated', handleOpsUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('be_internal_operations_updated', handleOpsUpdate);
    };
  }, []);

  const isOpInQuality = (r: InternalOperationRecord) => Boolean(
    (r.Stages && r.Stages.trim().toLowerCase() === 'quality') ||
    (r.Stage && String(r.Stage).trim().toLowerCase() === 'quality') ||
    (r.Operation_Stage && String(r.Operation_Stage).trim().toLowerCase() === 'quality')
  );

  const opsCounts = useMemo(() => {
    const total = opsRecords.length;
    const inQuality = opsRecords.filter(isOpInQuality).length;
    const inProgress = total - inQuality;
    const deals = new Set(opsRecords.map(r => r.Deal_ID).filter(Boolean)).size;
    return { total, inQuality, inProgress, deals };
  }, [opsRecords]);

  const filteredOpsRecords = useMemo(() => {
    return opsRecords.filter(r => {
      const inQuality = isOpInQuality(r);
      if (opsFilter === 'quality' && !inQuality) return false;
      if (opsFilter === 'inprogress' && inQuality) return false;

      if (opsSearch.trim()) {
        const q = opsSearch.toLowerCase();
        const sMatch = (r.Service_Scheme || r.Name || '').toLowerCase().includes(q);
        const dMatch = (r.Deal_Name || '').toLowerCase().includes(q);
        const cMatch = (r.Client_Name || '').toLowerCase().includes(q);
        const tMatch = (r.Internal_Team_Type || r.Team_Type || '').toLowerCase().includes(q);
        const tlMatch = (r.Team_Leader?.name || r.Team_Leader_TL?.name || r.Team_Leader_Name || '').toLowerCase().includes(q);
        const tmMatch = (r.Team_Member?.name || r.Team_Member_TM?.name || r.Team_Member_Name || '').toLowerCase().includes(q);
        const ca1Raw: any = r.CA_CS1 || r.CA_CS_1;
        const ca2Raw: any = r.CA_CS2 || r.CA_CS_2;
        const ca1Val = (typeof ca1Raw === 'object' && ca1Raw) ? (ca1Raw.name || ca1Raw.lookup_label || '') : (ca1Raw || '');
        const ca2Val = (typeof ca2Raw === 'object' && ca2Raw) ? (ca2Raw.name || ca2Raw.lookup_label || '') : (ca2Raw || '');
        const ca1Match = String(ca1Val).toLowerCase().includes(q);
        const ca2Match = String(ca2Val).toLowerCase().includes(q);
        if (!sMatch && !dMatch && !cMatch && !tMatch && !tlMatch && !tmMatch && !ca1Match && !ca2Match) return false;
      }
      return true;
    });
  }, [opsRecords, opsFilter, opsSearch]);

  const stats = [
    { title: 'Total Queries', value: '84', icon: <ShieldAlert size={24} />, trend: '+4', isUp: false, color: 'text-gray-600', bg: 'bg-gray-100', path: '/quality/queries' },
    { title: 'Open', value: '18', icon: <AlertCircle size={24} />, trend: '-2', isUp: true, color: 'text-red-500', bg: 'bg-red-50', path: '/quality/queries?status=Open' },
    { title: 'In Progress', value: '24', icon: <Clock size={24} />, trend: '+5', isUp: false, color: 'text-blue-600', bg: 'bg-blue-50', path: '/quality/queries?status=In Progress' },
    { title: 'Resolved', value: '42', icon: <CheckCircle2 size={24} />, trend: '+12', isUp: true, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/quality/queries?status=Resolved' },
  ];

  const queryData = [
    { name: 'Mon', queries: 12 },
    { name: 'Tue', queries: 8 },
    { name: 'Wed', queries: 15 },
    { name: 'Thu', queries: 10 },
    { name: 'Fri', queries: 18 },
    { name: 'Sat', queries: 5 },
    { name: 'Sun', queries: 2 },
  ];

  const recentQueries = [
    { id: 'Q-2041', client: 'Acme Corp', priority: 'High', status: 'Open', date: '25 Sep 2026' },
    { id: 'Q-2040', client: 'TechFlow Ltd', priority: 'Medium', status: 'In Progress', date: '24 Sep 2026' },
    { id: 'Q-2039', client: 'Global Impex', priority: 'Critical', status: 'Open', date: '24 Sep 2026' },
    { id: 'Q-2038', client: 'Apex Builders', priority: 'Low', status: 'Resolved', date: '23 Sep 2026' },
  ];

  const getPriorityBadge = (p: string) => {
    switch(p) {
      case 'Critical': return 'bg-red-100 text-red-700 border border-red-200';
      case 'High': return 'bg-orange-100 text-orange-700 border border-orange-200';
      case 'Medium': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'Low': return 'bg-gray-100 text-gray-700 border border-gray-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  const getStatusBadge = (s: string) => {
    switch(s) {
      case 'Open': return 'bg-red-50 text-red-600';
      case 'In Progress': return 'bg-blue-50 text-blue-600';
      case 'Resolved': return 'bg-emerald-50 text-emerald-600';
      default: return 'bg-gray-50 text-gray-600';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quality Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track client queries, issues, and resolutions.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Filter size={16} className="mr-2" />
            This Week
          </button>
          <button className="flex items-center px-4 py-2 bg-be-dark text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
            <Download size={16} className="mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            onClick={() => stat.path && navigate(stat.path)}
            title={`Click to view ${stat.title}`}
            className="card p-6 hover:shadow-xl hover:border-orange-300 hover:-translate-y-1 transition-all duration-200 cursor-pointer group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                {stat.icon}
              </div>
              <div className={`flex items-center text-sm font-medium ${stat.isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {stat.trend}
                {stat.isUp ? <TrendingDown size={16} className="ml-1" /> : <TrendingUp size={16} className="ml-1" />}
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-gray-900 mb-1 group-hover:text-be-orange transition-colors">{stat.value}</p>
              <p className="text-sm font-bold text-gray-500 flex items-center justify-between">
                <span>{stat.title}</span>
                <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 text-be-orange transition-opacity" />
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Weekly Queries Trend</h2>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={queryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f25b22" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f25b22" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="queries" stroke="#f25b22" strokeWidth={3} fillOpacity={1} fill="url(#colorQueries)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Queries Table */}
        <div className="bg-transparent overflow-hidden flex flex-col mt-6">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Recent Queries</h2>
            <button
              onClick={() => navigate('/quality/queries')}
              className="text-sm font-bold text-be-orange hover:text-be-orangeHover transition-colors flex items-center gap-1"
            >
              View All →
            </button>
          </div>
          <div className="overflow-x-auto pb-6 flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
              <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Priority</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {recentQueries.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => navigate('/quality/queries?search=' + encodeURIComponent(q.id))}
                    title={`Click to view query ${q.id}`}
                    className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm cursor-pointer"
                  >
                    <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900 group-hover:text-be-orange">{q.id}</td>
                    <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100 font-medium">{q.client}</td>
                    <td className="px-6 py-5 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getPriorityBadge(q.priority)}`}>
                        {q.priority}
                      </span>
                    </td>
                    <td className="px-6 py-5 rounded-r-xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getStatusBadge(q.status)}`}>
                        {q.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Operations Department Files & Review Section (All Data for Quality Department) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-be-orange font-bold">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">Operations Files & Quality Review</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  All Data Access
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {opsCounts.inQuality} in Quality
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Full organizational visibility over all Internal Operations files and child records submitted for quality audit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/crm/internal-operations')}
              className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink size={14} />
              <span>Internal Operations Module</span>
            </button>
          </div>
        </div>

        {/* View Options Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setOpsFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                opsFilter === 'all'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <span>All Files</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                opsFilter === 'all' ? 'bg-white/25 text-white' : 'bg-white text-gray-700 border border-gray-200'
              }`}>
                {opsCounts.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOpsFilter('quality')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                opsFilter === 'quality'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <CheckCircle2 size={13} className={opsFilter === 'quality' ? 'text-white' : 'text-emerald-600'} />
              <span>Completed in Quality</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                opsFilter === 'quality' ? 'bg-white/25 text-white' : 'bg-white text-emerald-800 border border-emerald-200'
              }`}>
                {opsCounts.inQuality}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOpsFilter('inprogress')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                opsFilter === 'inprogress'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <Clock size={13} className={opsFilter === 'inprogress' ? 'text-white' : 'text-amber-600'} />
              <span>Inprogress Files</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                opsFilter === 'inprogress' ? 'bg-white/25 text-white' : 'bg-white text-amber-800 border border-amber-200'
              }`}>
                {opsCounts.inProgress}
              </span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search service, deal, client..."
              value={opsSearch}
              onChange={(e) => setOpsSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 focus:border-orange-500 rounded-xl text-xs font-medium outline-none transition-all"
            />
          </div>
        </div>

        {/* Operations Files Table */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {opsLoading ? (
            <div className="p-8 text-center text-gray-500">
              <RefreshCw size={24} className="animate-spin text-be-orange mx-auto mb-2" />
              <p className="text-xs font-bold">Loading operations data...</p>
            </div>
          ) : filteredOpsRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-xs font-bold">No operations files match the current criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-gray-50/80 text-gray-600 font-bold uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3">Service / Scheme</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Parent Deal</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Stage / Quality Status</th>
                    <th className="px-4 py-3">Assigned Staff</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-800">
                  {filteredOpsRecords.map((item, idx) => {
                    const inQuality = isOpInQuality(item);
                    return (
                      <tr key={item.id || idx} className="hover:bg-orange-50/15 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedOpRecord(item)}
                            className="font-bold text-gray-900 hover:text-be-orange transition-colors text-left cursor-pointer"
                          >
                            {item.Service_Scheme || item.Name || 'Service Allocation'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px]">
                            {item.Internal_Team_Type || item.Team_Type || 'Operations'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-700">
                          {item.Deal_Name || (item.Deal_ID ? `Deal #${item.Deal_ID}` : '-')}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.Client_Name || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {inQuality ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              Quality Stage
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock size={12} className="text-amber-600" />
                              {item.Stage || item.Operation_Stage || 'In Progress'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <div>
                            {item.Team_Leader?.name || item.Team_Leader_TL?.name || item.Team_Leader_Name ? (
                              <span className="font-medium text-[11px] text-amber-900 block">TL: {item.Team_Leader?.name || item.Team_Leader_TL?.name || item.Team_Leader_Name}</span>
                            ) : null}
                            {item.Team_Member?.name || item.Team_Member_TM?.name || item.Team_Member_Name ? (
                              <span className="font-medium text-[11px] text-emerald-900 block">TM: {item.Team_Member?.name || item.Team_Member_TM?.name || item.Team_Member_Name}</span>
                            ) : null}
                            {(item.CA_CS1 || item.CA_CS_1 || item.CA_CS2 || item.CA_CS_2) ? (
                              <span className="font-medium text-[11px] text-purple-900 block">CA/CS: {[
                                (typeof (item.CA_CS1 || item.CA_CS_1) === 'object' && (item.CA_CS1 || item.CA_CS_1)) ? ((item.CA_CS1 || item.CA_CS_1) as any).name : (item.CA_CS1 || item.CA_CS_1),
                                (typeof (item.CA_CS2 || item.CA_CS_2) === 'object' && (item.CA_CS2 || item.CA_CS_2)) ? ((item.CA_CS2 || item.CA_CS_2) as any).name : (item.CA_CS2 || item.CA_CS_2)
                              ].filter(Boolean).join(' • ')}</span>
                            ) : null}
                            {(!item.Team_Leader?.name && !item.Team_Member?.name && !item.CA_CS1 && !item.CA_CS_1 && !item.CA_CS2 && !item.CA_CS_2) && <span className="text-gray-400 italic">Unassigned</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedOpRecord(item)}
                            className="px-3 py-1.5 bg-orange-50 hover:bg-be-orange hover:text-white text-be-orange border border-orange-200 hover:border-orange-500 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <FolderOpen size={13} />
                            <span>Review Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Internal Operation Detail Modal for Quality Review */}
      {selectedOpRecord && (
        <InternalOperationDetailModal
          record={selectedOpRecord}
          onClose={() => setSelectedOpRecord(null)}
          onSaved={(updated) => {
            setOpsRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
            setSelectedOpRecord(updated);
          }}
          allStaff={allStaff}
          allTeamLeaders={[]}
          allTeamMembers={[]}
          allHODs={[]}
          canManage={true}
          canAssignTM={true}
          canDelete={false}
        />
      )}
    </div>
  );
};
