import { 
  ShieldAlert, AlertCircle, CheckCircle2, Clock, 
  TrendingDown, TrendingUp, Download, Filter 
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export const QualityDashboard = () => {
  const stats = [
    { title: 'Total Queries', value: '84', icon: <ShieldAlert size={24} />, trend: '+4', isUp: false, color: 'text-gray-600', bg: 'bg-gray-100' },
    { title: 'Open', value: '18', icon: <AlertCircle size={24} />, trend: '-2', isUp: true, color: 'text-red-500', bg: 'bg-red-50' },
    { title: 'In Progress', value: '24', icon: <Clock size={24} />, trend: '+5', isUp: false, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Resolved', value: '42', icon: <CheckCircle2 size={24} />, trend: '+12', isUp: true, color: 'text-emerald-600', bg: 'bg-emerald-50' },
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
          <div key={idx} className="card p-6">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                {stat.icon}
              </div>
              <div className={`flex items-center text-sm font-medium ${stat.isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {stat.trend}
                {stat.isUp ? <TrendingDown size={16} className="ml-1" /> : <TrendingUp size={16} className="ml-1" />}
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
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
            <button className="text-sm font-medium text-be-orange hover:text-be-orangeHover transition-colors">View All</button>
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
                  <tr key={q.id} className="bg-white hover:bg-orange-50/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group shadow-sm">
                    <td className="px-6 py-5 rounded-l-xl border-t border-b border-l border-gray-100 group-hover:border-orange-100 font-bold text-gray-900">{q.id}</td>
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
    </div>
  );
};
