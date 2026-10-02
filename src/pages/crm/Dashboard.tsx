import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Briefcase, IndianRupee, TrendingUp, AlertCircle, 
  MoreHorizontal, FolderKanban, RefreshCw, CheckCircle2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { fetchZohoDeals, fetchZohoClients, fetchZohoQueries } from '../../services/zohoService';
import { getAllDealsFromIndexedDB, bulkUpsertDealsToIndexedDB, getDealsCountFromIndexedDB } from '../../lib/db';

export const CrmDashboard = () => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dbCount, setDbCount] = useState<number>(0);

  const parseMoney = (val: any) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const num = String(val).replace(/[^0-9.]/g, '');
    return parseFloat(num) || 0;
  };

  const mapZohoDeals = (rawDeals: any[]) => {
    return rawDeals.map((zDeal: any) => {
      let clientName = '';
      if (zDeal.Client_Name && typeof zDeal.Client_Name === 'string' && !/^\(\d+\)$/.test(zDeal.Client_Name.trim())) {
        clientName = zDeal.Client_Name.trim();
      } else if (zDeal.Clients && typeof zDeal.Clients === 'object' && zDeal.Clients.name && !/^\(\d+\)$/.test(zDeal.Clients.name.trim())) {
        clientName = zDeal.Clients.name.trim();
      } else if (zDeal.Company_name && !/^\(\d+\)$/.test(zDeal.Company_name.trim())) {
        clientName = zDeal.Company_name.trim();
      } else if (zDeal.Deal_Name) {
        const parts = zDeal.Deal_Name.split(' - ');
        const candidate = parts[0]?.replace(/^\(|\)$/g, '').trim();
        clientName = candidate && !/^\d+$/.test(candidate) ? candidate : 'Client';
      } else {
        clientName = 'Client';
      }

      let serviceName = '';
      if (zDeal.Service_Name) {
        serviceName = zDeal.Service_Name;
      } else if (zDeal.Choose_Wisely && zDeal.Choose_Wisely !== 'New Case Booking') {
        serviceName = zDeal.Choose_Wisely;
      } else if (zDeal.Deal_Name && zDeal.Deal_Name.includes(' - ')) {
        const afterHyphen = zDeal.Deal_Name.split(' - ').slice(1).join(' - ').trim();
        if (afterHyphen && !/^\(\d+\)$/.test(afterHyphen)) {
          serviceName = afterHyphen;
        }
      }
      if (!serviceName) serviceName = zDeal.Choose_Wisely || 'Services';

      const parseZohoNum = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };

      const formatRupee = (val: number): string => {
        if (!val || isNaN(val) || val <= 0) return '₹0';
        return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
      };

      const totalAmt = parseZohoNum(
        zDeal.Total_deal_amount_inclusive_of_gst !== undefined && zDeal.Total_deal_amount_inclusive_of_gst !== null ? zDeal.Total_deal_amount_inclusive_of_gst :
        (zDeal.Amount !== undefined && zDeal.Amount !== null ? zDeal.Amount :
        (zDeal.Deal_Amount !== undefined && zDeal.Deal_Amount !== null ? zDeal.Deal_Amount :
        (zDeal.Amount_Without_GST !== undefined && zDeal.Amount_Without_GST !== null ? Number(zDeal.Amount_Without_GST) / 0.82 :
        (zDeal.amount_if_you_have_kindly_put_0 || zDeal.Amount_After_disbursement || 0))))
      );

      const recAmt = parseZohoNum(
        zDeal.Total_Received_Amount !== undefined && zDeal.Total_Received_Amount !== null ? zDeal.Total_Received_Amount :
        (zDeal.Deal_Received_Amount !== undefined && zDeal.Deal_Received_Amount !== null ? zDeal.Deal_Received_Amount :
        (zDeal.Received_amount || 0))
      );

      const pendAmt = parseZohoNum(
        zDeal.Total_Pending_Amount !== undefined && zDeal.Total_Pending_Amount !== null ? zDeal.Total_Pending_Amount :
        (zDeal.Deal_Pending_Amount !== undefined && zDeal.Deal_Pending_Amount !== null ? zDeal.Deal_Pending_Amount :
        (zDeal.Pending_amount !== undefined && zDeal.Pending_amount !== null ? zDeal.Pending_amount :
        (totalAmt > recAmt ? totalAmt - recAmt : 0)))
      );

      const stage = zDeal.Stage || 'Sales';
      let status = 'New';
      if (stage === 'Closed Won' || stage === 'Won' || stage.includes('Won') || stage === 'Operations executors') {
        status = 'Won';
      } else if (stage === 'Closed Lost' || stage === 'Lost' || stage.includes('Lost')) {
        status = 'Lost';
      } else if (stage.includes('Negotiat')) {
        status = 'Negotiation';
      } else if (stage.includes('Propos')) {
        status = 'Proposal';
      } else if (stage.includes('Qualif')) {
        status = 'Qualified';
      } else {
        status = stage;
      }

      return {
        id: String(zDeal.id || `DL-${Math.floor(1000 + Math.random() * 9000)}`),
        client: clientName,
        company: zDeal.Company_name || clientName || 'Company',
        service: serviceName,
        amount: formatRupee(totalAmt),
        received: formatRupee(recAmt),
        pending: formatRupee(pendAmt),
        status,
        stage,
        date: zDeal.Booking_Date ? new Date(zDeal.Booking_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        zohoId: zDeal.id,
      };
    });
  };

  const loadData = async () => {
    setIsRefreshing(true);
    let currentDealsList: any[] = [];

    // 1. Instant load from IndexedDB
    try {
      const idbDeals = await getAllDealsFromIndexedDB();
      if (Array.isArray(idbDeals) && idbDeals.length > 0) {
        currentDealsList = idbDeals;
        setDeals(idbDeals);
        setDbCount(idbDeals.length);
      } else {
        const savedDeals = localStorage.getItem('be_deals');
        if (savedDeals) {
          const parsed = JSON.parse(savedDeals);
          if (Array.isArray(parsed) && parsed.length > 0) {
            currentDealsList = parsed;
            setDeals(parsed);
            setDbCount(parsed.length);
          }
        }
      }
      const savedClients = localStorage.getItem('be_clients');
      if (savedClients) setClients(JSON.parse(savedClients));
      const savedQueries = localStorage.getItem('be_queries');
      if (savedQueries) setQueries(JSON.parse(savedQueries));
    } catch (e) {}

    // 2. Fetch live updates from Zoho CRM without overwriting full dataset
    try {
      const [dealsRes, clientsRes, queriesRes] = await Promise.allSettled([
        fetchZohoDeals({ per_page: 200 }),
        fetchZohoClients({ per_page: 200 }),
        fetchZohoQueries(),
      ]);

      if (dealsRes.status === 'fulfilled' && dealsRes.value.success && Array.isArray(dealsRes.value.data) && dealsRes.value.data.length > 0) {
        const mappedDeals = mapZohoDeals(dealsRes.value.data);
        
        // Merge with existing full dataset instead of replacing
        const dealMap = new Map<string, any>();
        currentDealsList.forEach(d => {
          if (d.zohoId) dealMap.set(String(d.zohoId), d);
          else if (d.id) dealMap.set(String(d.id), d);
        });

        mappedDeals.forEach(d => {
          const key = String(d.zohoId || d.id);
          const existing = dealMap.get(key);
          dealMap.set(key, { ...existing, ...d });
        });

        const mergedList = Array.from(dealMap.values());
        setDeals(mergedList);
        setDbCount(mergedList.length);

        // Bulk upsert new records without clearing 10,000+ records
        bulkUpsertDealsToIndexedDB(mappedDeals).catch(() => {});
      }

      if (clientsRes.status === 'fulfilled' && clientsRes.value.success && Array.isArray(clientsRes.value.data) && clientsRes.value.data.length > 0) {
        setClients(clientsRes.value.data);
        try { localStorage.setItem('be_clients', JSON.stringify(clientsRes.value.data.slice(0, 2000))); } catch (e) {}
      }

      if (queriesRes.status === 'fulfilled' && queriesRes.value.success && Array.isArray(queriesRes.value.data) && queriesRes.value.data.length > 0) {
        setQueries(queriesRes.value.data);
        try { localStorage.setItem('be_queries', JSON.stringify(queriesRes.value.data.slice(0, 1000))); } catch (e) {}
      }
    } catch (e) {
      console.error('Dashboard Zoho fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalClientsCount = clients.length || (deals.length > 0 ? new Set(deals.map(d => d.client)).size : 0);
  const activeDealsList = deals.filter(d => d.status !== 'Lost');
  const activeDealsCount = activeDealsList.length || deals.length;

  const totalDealValue = deals.reduce((sum, d) => sum + parseMoney(d.amount), 0);
  const totalReceivedValue = deals.reduce((sum, d) => sum + parseMoney(d.received), 0);
  const totalPendingValue = deals.reduce((sum, d) => sum + parseMoney(d.pending || (parseMoney(d.amount) - parseMoney(d.received))), 0);

  const formatCurrencyShort = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)} k`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const stats = [
    { title: 'Total Clients', value: String(totalClientsCount.toLocaleString('en-IN')), icon: <Users size={24} className="text-white" />, trend: 'Live Sync', bg: 'bg-gradient-to-br from-blue-500 to-indigo-600', shadow: 'shadow-blue-500/40' },
    { title: 'Active Deals', value: String(activeDealsCount.toLocaleString('en-IN')), icon: <Briefcase size={24} className="text-white" />, trend: 'Live Sync', bg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600', shadow: 'shadow-purple-500/40' },
    { title: 'Total Deal Value', value: formatCurrencyShort(totalDealValue), icon: <IndianRupee size={24} className="text-white" />, trend: 'Live Sync', bg: 'bg-gradient-to-br from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/40' },
    { title: 'Pending Amount', value: formatCurrencyShort(totalPendingValue), icon: <TrendingUp size={24} className="text-white" />, trend: 'Live Sync', bg: 'bg-gradient-to-br from-orange-500 to-rose-600', shadow: 'shadow-orange-500/40' },
  ];

  const pipelineCategories = [
    { label: 'Sales', matcher: (s: string) => s.toLowerCase().includes('sale') || s === 'new' },
    { label: 'Ops Allocator', matcher: (s: string) => s.toLowerCase().includes('allocat') },
    { label: 'Ops Executors', matcher: (s: string) => s.toLowerCase().includes('execut') },
    { label: 'Legal', matcher: (s: string) => s.toLowerCase().includes('legal') },
    { label: 'Account', matcher: (s: string) => s.toLowerCase().includes('account') },
    { label: 'Quality', matcher: (s: string) => s.toLowerCase().includes('qualit') },
    { label: 'Won / Closed', matcher: (s: string) => s.toLowerCase().includes('won') },
  ];

  const pipelineData = pipelineCategories.map(cat => ({
    name: cat.label,
    count: deals.filter(d => cat.matcher(d.stage || d.status || '')).length
  }));

  // Monthly revenue aggregation
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyRevenueMap = new Map<string, { received: number; pending: number; total: number }>();
  
  deals.forEach(d => {
    let monthLabel = '';
    if (d.date) {
      try {
        const parts = String(d.date).split('/');
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12) monthLabel = monthNames[mIdx];
        } else {
          const dt = new Date(d.date);
          if (!isNaN(dt.getTime())) monthLabel = monthNames[dt.getMonth()];
        }
      } catch (e) {}
    }
    if (!monthLabel) monthLabel = 'General';

    const current = monthlyRevenueMap.get(monthLabel) || { received: 0, pending: 0, total: 0 };
    const rec = parseMoney(d.received);
    const tot = parseMoney(d.amount);
    const pend = parseMoney(d.pending || (tot - rec));
    monthlyRevenueMap.set(monthLabel, {
      received: current.received + rec,
      pending: current.pending + pend,
      total: current.total + tot
    });
  });

  let revenueData = monthNames
    .filter(m => monthlyRevenueMap.has(m))
    .map(m => ({
      name: m,
      received: monthlyRevenueMap.get(m)!.received,
      pending: monthlyRevenueMap.get(m)!.pending,
      total: monthlyRevenueMap.get(m)!.total,
    }));

  if (revenueData.length === 0) {
    revenueData = [
      { name: 'Total Revenue', received: totalReceivedValue, pending: totalPendingValue, total: totalDealValue }
    ];
  }

  const recentDeals = deals.slice(0, 6);
  const openQueriesCount = queries.filter(q => q.status !== 'Resolved' && q.status !== 'Closed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Won': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Negotiation': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Proposal': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Operations executors':
      case 'Operations allocator': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'Sales': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center">
              CRM Dashboard
            </h1>
            <span className="px-2.5 py-0.5 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
              {deals.length.toLocaleString()} Deals
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-2 font-medium">Overview of live Zoho CRM deals, clients, revenue, and pipeline status.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={loadData}
            disabled={isRefreshing}
            className="flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all shadow-sm"
          >
            <RefreshCw size={15} className={`mr-2 ${isRefreshing ? 'animate-spin text-be-orange' : 'text-gray-500'}`} />
            {isRefreshing ? 'Syncing...' : 'Sync Zoho CRM'}
          </button>
          <button 
            onClick={() => navigate('/crm/deals')}
            className="flex items-center px-4 py-2.5 bg-gradient-to-r from-be-dark to-gray-800 text-white rounded-xl text-sm font-semibold hover:from-gray-800 hover:to-gray-900 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            <Briefcase size={16} className="mr-2" />
            Go to Deals ({deals.length.toLocaleString()})
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 group cursor-pointer relative overflow-hidden">
            <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-[0.05] group-hover:scale-150 transition-transform duration-700 ${stat.bg}`}></div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className={`p-3.5 rounded-2xl shadow-lg ${stat.bg} ${stat.shadow} transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                {stat.icon}
              </div>
              <div className="flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-600 border border-gray-100">
                <CheckCircle2 size={12} className="mr-1 text-emerald-500" />
                {stat.trend}
              </div>
            </div>
            <div className="relative z-10">
              <p className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight group-hover:translate-x-1 transition-transform">{stat.value}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{stat.title}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Revenue Overview</h2>
              <p className="text-xs text-gray-500 mt-1 font-medium">Received vs Pending amounts across all deals</p>
            </div>
            <div className="flex items-center space-x-4 text-xs font-semibold">
              <span className="flex items-center text-emerald-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span>Received: {formatCurrencyShort(totalReceivedValue)}</span>
              <span className="flex items-center text-orange-600"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 mr-1.5"></span>Pending: {formatCurrencyShort(totalPendingValue)}</span>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center">
            {deals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} tickFormatter={(val) => `₹${(val/100000).toFixed(1)}L`} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, undefined]}
                  />
                  <Area type="monotone" dataKey="received" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReceived)" name="Received" />
                  <Area type="monotone" dataKey="pending" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorPending)" name="Pending" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <FolderKanban size={40} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-sm text-gray-500">No revenue data available yet</p>
                <p className="text-xs text-gray-400 mt-1">Deals will populate automatically from Zoho CRM</p>
              </div>
            )}
          </div>
        </div>

        {/* Deals by Status */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Deal Pipeline</h2>
              <p className="text-xs text-gray-500 mt-1 font-medium">Deals distribution across stages</p>
            </div>
          </div>
          <div className="flex-1 w-full min-h-[250px] flex items-center justify-center">
            {deals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} layout="vertical" margin={{ top: 0, right: 15, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f97316"/>
                      <stop offset="100%" stopColor="#f59e0b"/>
                    </linearGradient>
                  </defs>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={100} />
                  <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" fill="url(#colorBar)" radius={[0, 8, 8, 0]} barSize={16} background={{ fill: '#f1f5f9', radius: 8 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <p className="font-semibold text-xs text-gray-500">Pipeline is currently empty</p>
              </div>
            )}
          </div>
          <div className="mt-6 p-4 bg-gradient-to-r from-orange-50 to-rose-50 rounded-xl border border-orange-100 flex items-start shadow-inner">
            <AlertCircle className="text-be-orange shrink-0 mt-0.5 mr-3" size={20} />
            <p className="text-sm text-gray-800 leading-relaxed"><strong>{openQueriesCount} active queries</strong> in the Quality module.</p>
          </div>
        </div>
      </div>

      {/* Recent Deals Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recent Deals</h2>
            <p className="text-xs text-gray-500">Latest synchronized deals from Zoho CRM</p>
          </div>
          <button onClick={() => navigate('/crm/deals')} className="text-sm font-semibold text-be-orange hover:text-orange-700 transition-colors">View All Deals →</button>
        </div>
        <div className="overflow-x-auto">
          {recentDeals.length > 0 ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100 text-xs">
                <tr>
                  <th className="px-6 py-4">Deal ID</th>
                  <th className="px-6 py-4">Client</th>
                  <th className="px-6 py-4">Service</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Received</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                {recentDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{deal.id}</td>
                    <td className="px-6 py-4">{deal.client || deal.company || 'Client'}</td>
                    <td className="px-6 py-4 text-gray-800">{deal.service || 'Service'}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{deal.amount}</td>
                    <td className="px-6 py-4 font-bold text-emerald-600">{deal.received}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(deal.status)}`}>
                        {deal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{deal.date}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => navigate(`/crm/deals/${deal.id}`)} className="p-1.5 text-gray-400 hover:text-be-orange rounded-lg hover:bg-orange-50 transition-colors"><MoreHorizontal size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="font-semibold text-sm text-gray-500">No deals created yet</p>
              <p className="text-xs text-gray-400 mt-1">Click "Go to Deals" to start adding or synchronizing real deals</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
