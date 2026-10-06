import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserCheck, UserX, Clock, Calendar, Briefcase, 
  Download, Filter, ArrowUpRight
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { fetchZohoEmployees, fetchZohoAttendance, fetchZohoLeaves } from '../../services/zohoService';

export const HrmsDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isHR, isTL, isTM } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);

  useEffect(() => {
    // Seed from localStorage immediately for instant render
    try {
      const savedEmps = localStorage.getItem('be_employees');
      if (savedEmps) setEmployees(JSON.parse(savedEmps));
      const savedAtt = localStorage.getItem('be_attendance');
      if (savedAtt) setAttendance(JSON.parse(savedAtt));
      const savedLeaves = localStorage.getItem('be_leaves');
      if (savedLeaves) setLeaves(JSON.parse(savedLeaves));
    } catch (e) {}

    // Then fetch live data from Zoho CRM
    const fetchAll = async () => {
      try {
        const [empsRes, attRes, leavesRes] = await Promise.allSettled([
          fetchZohoEmployees(),
          fetchZohoAttendance(),
          fetchZohoLeaves(),
        ]);
        if (empsRes.status === 'fulfilled' && empsRes.value.success && empsRes.value.data.length > 0) {
          setEmployees(empsRes.value.data);
          localStorage.setItem('be_employees', JSON.stringify(empsRes.value.data));
        }
        if (attRes.status === 'fulfilled' && attRes.value.success && attRes.value.data.length > 0) {
          setAttendance(attRes.value.data);
          localStorage.setItem('be_attendance', JSON.stringify(attRes.value.data));
        }
        if (leavesRes.status === 'fulfilled' && leavesRes.value.success && leavesRes.value.data.length > 0) {
          setLeaves(leavesRes.value.data);
          localStorage.setItem('be_leaves', JSON.stringify(leavesRes.value.data));
        }
      } catch (e) {
        console.error('HRMS Dashboard Zoho fetch error:', e);
      }
    };
    fetchAll();
  }, []);

  const isFullAdmin = isSuperAdmin || isHR;
  const isTeamLead = !isFullAdmin && (isTL || currentUser.role === 'TL');
  const isTeamMember = !isFullAdmin && !isTeamLead;

  const today = new Date().toISOString().split('T')[0];
  const currentEmpId = currentUser.empId || currentUser.id;

  // 1. Team Member (Vrunda) personal data
  const myAttendance = attendance.filter(a => 
    a.empId === currentEmpId || 
    a.empName?.toLowerCase() === currentUser.name?.toLowerCase()
  );
  const myLeaves = leaves.filter(l => 
    l.empId === currentEmpId || 
    l.empName?.toLowerCase() === currentUser.name?.toLowerCase()
  );

  const myPresentDays = myAttendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
  const myAbsentDays = myAttendance.filter(a => a.status === 'Absent').length;
  const myLateDays = myAttendance.filter(a => a.status === 'Late').length;
  const myApprovedLeaves = myLeaves.filter(l => l.status === 'Approved').length;
  const myPendingLeaves = myLeaves.filter(l => l.status === 'Pending TL' || l.status === 'Pending HR').length;
  const myDept = currentUser.department || 'Marketing';

  // 2. Team Leader (TL) team data
  const myTeamMembers = employees.filter(e => {
    const isSubordinate = 
      e.teamLeaderId === currentUser.id || 
      e.teamLeaderId === currentUser.empId || 
      (e.teamLeaderName && currentUser.name && e.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
      (e.formData?.teamLeaderId && (e.formData.teamLeaderId === currentUser.id || e.formData.teamLeaderId === currentUser.empId)) ||
      (e.formData?.teamLeaderName && currentUser.name && e.formData.teamLeaderName.toLowerCase().includes(currentUser.name.toLowerCase()));
    return isSubordinate && e.id !== currentEmpId;
  });

  const teamPresentToday = myTeamMembers.filter(m => {
    const record = attendance.find(a => (a.empId === m.id || a.empName === m.name) && a.date === today);
    return record?.status === 'Present' || record?.status === 'Late';
  }).length;

  const teamAbsentToday = myTeamMembers.filter(m => {
    const record = attendance.find(a => (a.empId === m.id || a.empName === m.name) && a.date === today);
    return record?.status === 'Absent';
  }).length;

  const teamOnLeaveToday = leaves.filter(l => 
    l.status === 'Approved' && 
    l.startDate <= today && l.endDate >= today &&
    myTeamMembers.some(m => m.id === l.empId || m.name === l.empName)
  ).length;

  const pendingLeavesAwaitingTL = leaves.filter(l => 
    l.status === 'Pending TL' && 
    myTeamMembers.some(m => m.id === l.empId || m.name === l.empName)
  ).length;

  // 3. Super Admin & HR organization-wide data
  const totalEmployeesCount = employees.length || 5;
  const totalPresentToday = attendance.filter(a => a.date === today && (a.status === 'Present' || a.status === 'Late')).length;
  const totalAbsentToday = attendance.filter(a => a.date === today && a.status === 'Absent').length;
  const totalOnLeaveToday = leaves.filter(l => l.status === 'Approved' && l.startDate <= today && l.endDate >= today).length;
  const totalLateToday = attendance.filter(a => a.date === today && a.status === 'Late').length;
  const totalPendingLeaves = leaves.filter(l => l.status === 'Pending HR' || l.status === 'Pending TL').length;

  // Dynamic 6 Stat Cards based on role with click-through navigation paths
  const stats = isTeamMember ? [
    { title: 'My Department', value: myDept, icon: <Users size={24} />, color: 'text-blue-600', bg: 'bg-blue-50', path: '/hrms/employees' },
    { title: 'Present Days', value: String(myPresentDays || 1), icon: <UserCheck size={24} />, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/hrms/attendance?status=Present' },
    { title: 'Absent Days', value: String(myAbsentDays), icon: <UserX size={24} />, color: 'text-red-500', bg: 'bg-red-50', path: '/hrms/attendance?status=Absent' },
    { title: 'Approved Leaves', value: String(myApprovedLeaves), icon: <Calendar size={24} />, color: 'text-purple-600', bg: 'bg-purple-50', path: '/hrms/leaves?status=Approved' },
    { title: 'Late Days', value: String(myLateDays), icon: <Clock size={24} />, color: 'text-orange-600', bg: 'bg-orange-50', path: '/hrms/attendance?status=Late' },
    { title: 'Pending Leaves', value: String(myPendingLeaves), icon: <Briefcase size={24} />, color: 'text-amber-600', bg: 'bg-amber-50', path: '/hrms/leaves?status=Pending' },
  ] : isTeamLead ? [
    { title: 'Team Members', value: String(myTeamMembers.length), icon: <Users size={24} />, color: 'text-blue-600', bg: 'bg-blue-50', path: '/hrms/my-team' },
    { title: 'Present Today', value: String(teamPresentToday), icon: <UserCheck size={24} />, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/hrms/attendance?status=Present' },
    { title: 'Absent Today', value: String(teamAbsentToday), icon: <UserX size={24} />, color: 'text-red-500', bg: 'bg-red-50', path: '/hrms/attendance?status=Absent' },
    { title: 'On Leave', value: String(teamOnLeaveToday), icon: <Calendar size={24} />, color: 'text-purple-600', bg: 'bg-purple-50', path: '/hrms/leaves?status=Approved' },
    { title: 'Late Today', value: '0', icon: <Clock size={24} />, color: 'text-orange-600', bg: 'bg-orange-50', path: '/hrms/attendance?status=Late' },
    { title: 'Pending Approvals', value: String(pendingLeavesAwaitingTL), icon: <Briefcase size={24} />, color: 'text-amber-600', bg: 'bg-amber-50', path: '/hrms/leaves?status=Pending' },
  ] : [
    { title: 'Total Employees', value: String(totalEmployeesCount), icon: <Users size={24} />, color: 'text-blue-600', bg: 'bg-blue-50', path: '/hrms/employees' },
    { title: 'Present Today', value: String(totalPresentToday), icon: <UserCheck size={24} />, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/hrms/attendance?status=Present' },
    { title: 'Absent Today', value: String(totalAbsentToday), icon: <UserX size={24} />, color: 'text-red-500', bg: 'bg-red-50', path: '/hrms/attendance?status=Absent' },
    { title: 'On Leave', value: String(totalOnLeaveToday), icon: <Calendar size={24} />, color: 'text-purple-600', bg: 'bg-purple-50', path: '/hrms/leaves?status=Approved' },
    { title: 'Late Today', value: String(totalLateToday), icon: <Clock size={24} />, color: 'text-orange-600', bg: 'bg-orange-50', path: '/hrms/attendance?status=Late' },
    { title: 'Pending Leaves', value: String(totalPendingLeaves), icon: <Briefcase size={24} />, color: 'text-amber-600', bg: 'bg-amber-50', path: '/hrms/leaves?status=Pending' },
  ];

  // Dynamic Chart Data
  const attendanceData = isTeamMember ? [
    { name: 'Mon', present: 1, absent: 0 },
    { name: 'Tue', present: 1, absent: 0 },
    { name: 'Wed', present: 1, absent: 0 },
    { name: 'Thu', present: 1, absent: 0 },
    { name: 'Fri', present: 1, absent: 0 },
  ] : isTeamLead ? [
    { name: 'Mon', present: myTeamMembers.length || 1, absent: 0 },
    { name: 'Tue', present: myTeamMembers.length || 1, absent: 0 },
    { name: 'Wed', present: myTeamMembers.length || 1, absent: 0 },
    { name: 'Thu', present: myTeamMembers.length || 1, absent: 0 },
    { name: 'Fri', present: myTeamMembers.length || 1, absent: 0 },
  ] : [
    { name: 'Mon', present: 4, absent: 1 },
    { name: 'Tue', present: 5, absent: 0 },
    { name: 'Wed', present: 4, absent: 1 },
    { name: 'Thu', present: 5, absent: 0 },
    { name: 'Fri', present: 5, absent: 0 },
  ];

  // Department / Leave Breakdown
  const deptCounts: Record<string, number> = {};
  employees.forEach(e => {
    const d = e.dept || 'General';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });

  const deptData = isTeamMember ? [
    { name: 'Present Days', value: myPresentDays || 22 },
    { name: 'Approved Leaves', value: myApprovedLeaves || 1 },
    { name: 'Public Holidays', value: 4 },
    { name: 'Weekends (Off)', value: 8 },
  ] : Object.keys(deptCounts).length > 0 ? (
    Object.keys(deptCounts).map(d => ({ name: d, value: deptCounts[d] }))
  ) : [
    { name: 'Engineering', value: 2 },
    { name: 'Sales', value: 1 },
    { name: 'Marketing', value: 1 },
    { name: 'HR', value: 1 },
  ];

  const COLORS = ['#10b981', '#f25b22', '#3b82f6', '#8b5cf6', '#424242'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isTeamMember ? 'My HRMS Dashboard' : isTeamLead ? 'Team Leader Dashboard' : 'HRMS Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isTeamMember 
              ? `Personal overview of your attendance, leaves, and records for ${currentUser.name}.`
              : isTeamLead 
              ? `Overview of reporting team members, attendance, and leave requests for ${currentUser.name}.`
              : 'Overview of your employees, attendance, and leaves.'}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Filter size={16} className="mr-2" />
            Today
          </button>
          <button className="flex items-center px-4 py-2 bg-be-dark text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
            <Download size={16} className="mr-2" />
            Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            onClick={() => stat.path && navigate(stat.path)}
            title={`Click to view ${stat.title}`}
            className="card p-4 flex flex-col items-center justify-center text-center hover:shadow-xl hover:border-orange-300 hover:-translate-y-1 transition-all duration-200 cursor-pointer group"
          >
            <div className={`p-3 rounded-2xl mb-3 ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-black text-gray-900 mb-1 group-hover:text-be-orange transition-colors">{stat.value}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{stat.title}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Chart */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              {isTeamMember ? 'My Weekly Attendance Flow' : isTeamLead ? 'Team Weekly Attendance' : 'Weekly Attendance'}
            </h2>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="present" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPresent)" name="Present" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dept Distribution / Leave Breakdown */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              {isTeamMember ? 'Monthly Time & Leave Breakdown' : 'Department Distribution'}
            </h2>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {deptData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {deptData.slice(0, 4).map((entry, index) => (
              <div key={index} className="flex items-center text-xs">
                <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                <span className="text-gray-600 truncate">{entry.name} ({entry.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


