import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Briefcase, IndianRupee, TrendingUp, AlertCircle, 
  ArrowUpRight, MoreHorizontal, Download, Filter, FolderKanban
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { fetchZohoDeals, fetchZohoClients, fetchZohoQueries } from '../../services/zohoService';

export const CrmDashboard = () => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);

  useEffect(() => {
    // Seed from localStorage immediately for instant render
    try {
      const savedDeals = localStorage.getItem('be_deals');
      if (savedDeals) setDeals(JSON.parse(savedDeals));
      const savedClients = localStorage.getItem('be_clients');
      if (savedClients) setClients(JSON.parse(savedClients));
      const savedQueries = localStorage.getItem('be_queries');
      if (savedQueries) setQueries(JSON.parse(savedQueries));
    } catch (e) {}

    // Then fetch live data from Zoho CRM
    const fetchAll = async () => {
      try {
        const [dealsRes, clientsRes, queriesRes] = await Promise.allSettled([
          fetchZohoDeals(),
          fetchZohoClients(),
          fetchZohoQueries(),
        ]);
        if (dealsRes.status === 'fulfilled' && dealsRes.value.success && dealsRes.value.data.length > 0) {
          setDeals(dealsRes.value.data);
          localStorage.setItem('be_deals', JSON.stringify(dealsRes.value.data));
        }
        if (clientsRes.status === 'fulfilled' && clientsRes.value.success && clientsRes.value.data.length > 0) {
          setClients(clientsRes.value.data);
          localStorage.setItem('be_clients', JSON.stringify(clientsRes.value.data));
        }
        if (queriesRes.status === 'fulfilled' && queriesRes.value.success && queriesRes.value.data.length > 0) {
          setQueries(queriesRes.value.data);
          localStorage.setItem('be_queries', JSON.stringify(queriesRes.value.data));
        }
      } catch (e) {
        console.error('Dashboard Zoho fetch error:', e);
      }
    };
    fetchAll();
  }, []);

  const parseMoney = (val: any) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const num = String(val).replace(/[^0-9.]/g, '');
    return parseFloat(num) || 0;
  };

  const totalClientsCount = clients.length;
  const activeDealsList = deals.filter(d => d.status !== 'Lost');
  const activeDealsCount = activeDealsList.length;

  const totalDealValue = deals.reduce((sum, d) => sum + parseMoney(d.amount), 0);
  const totalReceivedValue = deals.reduce((sum, d) => sum + parseMoney(d.received), 0);
  const totalPendingValue = deals.reduce((sum, d) => sum + parseMoney(d.pending || parseMoney(d.amount) - parseMoney(d.received)), 0);

  const formatCurrencyShort = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const stats = [
    { title: 'Total Clients', value: String(totalClientsCount), icon: <Users size={24} className="text-white" />, trend: 'Live', isUp: true, bg: 'bg-gradient-to-br from-blue-500 to-indigo-600', shadow: 'shadow-blue-500/40' },
    { title: 'Active Deals', value: String(activeDealsCount), icon: <Briefcase size={24} className="text-white" />, trend: 'Live', isUp: true, bg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600', shadow: 'shadow-purple-500/40' },
    { title: 'Total Deal Value', value: formatCurrencyShort(totalDealValue), icon: <IndianRupee size={24} className="text-white" />, trend: 'Live', isUp: true, bg: 'bg-gradient-to-br from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/40' },
    { title: 'Pending Amount', value: formatCurrencyShort(totalPendingValue), icon: <TrendingUp size={24} className="text-white" />, trend: 'Live', isUp: false, bg: 'bg-gradient-to-br from-orange-500 to-rose-600', shadow: 'shadow-orange-500/40' },
  ];

  const pipelineStages = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
  const pipelineData = pipelineStages.map(stage => ({
    name: stage,
    count: deals.filter(d => (d.status || '').toLowerCase() === stage.toLowerCase()).length
  }));

  const revenueData = [
    { name: 'Current', received: totalReceivedValue, pending: totalPendingValue }
  ];

  const recentDeals = deals.slice(0, 5);
  const openQueriesCount = queries.filter(q => q.status !== 'Resolved' && q.status !== 'Closed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Won': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Negotiation': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Proposal': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center">
            CRM Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-2 font-medium">Overview of your clients, deals and business performance.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => navigate('/crm/deals')}
            className="flex items-center px-4 py-2.5 bg-gradient-to-r from-be-dark to-gray-800 text-white rounded-xl text-sm font-semibold hover:from-gray-800 hover:to-gray-900 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            <Briefcase size={16} className="mr-2" />
            Go to Deals
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 group cursor-pointer relative overflow-hidden">
            {/* Decorative background blob */}
            <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-[0.05] group-hover:scale-150 transition-transform duration-700 ${stat.bg}`}></div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className={`p-3.5 rounded-2xl shadow-lg ${stat.bg} ${stat.shadow} transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                {stat.icon}
              </div>
              <div className="flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-600 border border-gray-100">
                {stat.trend}
              </div>
            </div>
            <div className="relative z-10">
              <p className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight group-hover:translate-x-1 transition-transform">{stat.value}</p>
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{stat.title}</p>
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
              <p className="text-xs text-gray-500 mt-1 font-medium">Generated vs pending revenue across deals</p>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center">
            {deals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} tickFormatter={(val) => `₹${val/1000}k`} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${value.toLocaleString()}`, undefined]}
                    cursor={{ stroke: '#f97316', strokeWidth: 1, strokeDasharray: '5 5' }}
                  />
                  <Area type="monotone" dataKey="received" stroke="#f97316" strokeWidth={4} fillOpacity={1} fill="url(#colorReceived)" name="Received" activeDot={{ r: 8, strokeWidth: 0, fill: '#f97316' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <FolderKanban size={40} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-sm text-gray-500">No revenue data available yet</p>
                <p className="text-xs text-gray-400 mt-1">Create your first deal to see revenue analytics</p>
              </div>
            )}
          </div>
        </div>

        {/* Deals by Status */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Deal Pipeline</h2>
              <p className="text-xs text-gray-500 mt-1 font-medium">Status of active deals</p>
            </div>
          </div>
          <div className="flex-1 w-full min-h-[250px] flex items-center justify-center">
            {deals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f97316"/>
                      <stop offset="100%" stopColor="#f59e0b"/>
                    </linearGradient>
                  </defs>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} width={85} />
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
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Recent Deals</h2>
          <button onClick={() => navigate('/crm/deals')} className="text-sm font-medium text-be-orange hover:text-be-orangeHover transition-colors">View All</button>
        </div>
        <div className="overflow-x-auto">
          {recentDeals.length > 0 ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Deal ID</th>
                  <th className="px-6 py-4">Client</th>
                  <th className="px-6 py-4">Service</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700">
                {recentDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{deal.id}</td>
                    <td className="px-6 py-4">{deal.client || deal.clientName}</td>
                    <td className="px-6 py-4">{deal.service || 'Service'}</td>
                    <td className="px-6 py-4 font-medium">{deal.amount}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deal.status)}`}>
                        {deal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{deal.date}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => navigate(`/crm/deals/${deal.id}`)} className="text-gray-400 hover:text-be-orange transition-colors"><MoreHorizontal size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="font-semibold text-sm text-gray-500">No deals created yet</p>
              <p className="text-xs text-gray-400 mt-1">Click "Go to Deals" or "Create Deal" to start adding real deals</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

