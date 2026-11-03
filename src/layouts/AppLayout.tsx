import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { 
  Search, Bell, Menu, ChevronLeft, ChevronRight, 
  Settings, LogOut, LayoutDashboard, Briefcase, Users, 
  Building2, FileText, BarChart3, Calendar, ShieldAlert,
  HelpCircle, UserCircle, SwitchCamera, ClipboardList,
  Crown, Shield, User, RefreshCw, UserCheck, ArrowLeft,
  Layers, ShieldCheck, Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { RoleSwitcherModal } from '../components/RoleSwitcherModal';
import { HeaderSearchBar } from '../components/HeaderSearchBar';

export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  const { currentUser, currentRole, roleInfo, isHR, isHOD, isSuperAdmin, isSales, switchRole, logout } = useAuth();

  // Determine current module based on URL path
  const currentModule = location.pathname.split('/')[1] as 'crm' | 'hrms' | 'quality';

  const isHREmployee = isHR || 
                       currentRole === 'HR' || 
                       (currentUser.role as string) === 'HR' || 
                       currentUser.email?.toLowerCase().includes('hr@');

  const isHODEmployee = !isHREmployee && (
    isHOD || 
    currentRole === 'HOD' || 
    (currentUser.role as string) === 'HOD' || 
    currentUser.email?.toLowerCase().includes('mishal@')
  );

  const isSuperAdminUser = isSuperAdmin || 
                           currentRole === 'Super Admin' || 
                           (currentUser.role as string) === 'Super Admin' || 
                           currentUser.email?.toLowerCase() === 'superadmin@be.com' ||
                           currentUser.email === 'md@bharat-edge.com';

  const isSuperAdminDashboard = Boolean(
    isSuperAdminUser && (
      location.pathname.startsWith('/crm/dashboard') || 
      location.pathname === '/crm' || 
      location.pathname === '/crm/'
    )
  );

  // Role-based module access restrictions:
  // - HR: only HRMS allowed (redirected from CRM & Quality)
  // - Super Admin, HOD, Team Leader (TL), Team Member (TM): CRM, HRMS, QUALITY (all 3 allowed)
  useEffect(() => {
    if (isHREmployee && currentModule && currentModule !== 'hrms') {
      navigate('/hrms/dashboard', { replace: true });
    }
  }, [isHREmployee, currentModule, navigate]);

  const isSuperAdminOrHR = isSuperAdmin || isHR || isHOD || currentRole === 'Super Admin' || currentRole === 'HR' || currentRole === 'HOD';
  const isTeamLeadUser = !isSuperAdminOrHR && (currentRole === 'TL' || (currentUser.role as string) === 'TL' || currentUser.email?.toLowerCase().includes('vineet@'));

  const getHrmsMenuItems = () => {
    if (isTeamLeadUser) {
      return [
        { name: 'Dashboard', path: '/hrms/dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'My Team', path: '/hrms/my-team', icon: <Users size={20} /> },
        { name: 'My Profile', path: '/hrms/employees', icon: <UserCircle size={20} /> },
        { name: 'DSR', path: '/hrms/dsr', icon: <ClipboardList size={20} /> },
        { name: 'Attendance', path: '/hrms/attendance', icon: <Calendar size={20} /> },
        { name: 'Leave Management', path: '/hrms/leaves', icon: <Briefcase size={20} /> },
        { name: 'Salary', path: '/hrms/salary', icon: <FileText size={20} /> },
        { name: 'Calendar', path: '/hrms/calendar', icon: <Calendar size={20} /> },
        { name: 'Company Policies', path: '/hrms/policies', icon: <Building2 size={20} /> },
        { name: 'Personal Documents', path: '/hrms/documents', icon: <FileText size={20} /> },
      ];
    }
    if (isSuperAdminOrHR) {
      return [
        { name: 'Dashboard', path: '/hrms/dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'Employees', path: '/hrms/employees', icon: <Users size={20} /> },
        { name: 'My Team', path: '/hrms/my-team', icon: <Users size={20} /> },
        { name: 'DSR', path: '/hrms/dsr', icon: <ClipboardList size={20} /> },
        { name: 'Attendance', path: '/hrms/attendance', icon: <Calendar size={20} /> },
        { name: 'Leave Management', path: '/hrms/leaves', icon: <Briefcase size={20} /> },
        { name: 'Salary', path: '/hrms/salary', icon: <FileText size={20} /> },
        { name: 'Calendar', path: '/hrms/calendar', icon: <Calendar size={20} /> },
        { name: 'Company Policies', path: '/hrms/policies', icon: <Building2 size={20} /> },
        { name: 'Personal Documents', path: '/hrms/documents', icon: <FileText size={20} /> },
      ];
    }
    return [
      { name: 'Dashboard', path: '/hrms/dashboard', icon: <LayoutDashboard size={20} /> },
      { name: 'My Profile', path: '/hrms/employees', icon: <UserCircle size={20} /> },
      { name: 'DSR', path: '/hrms/dsr', icon: <ClipboardList size={20} /> },
      { name: 'Attendance', path: '/hrms/attendance', icon: <Calendar size={20} /> },
      { name: 'Leave Management', path: '/hrms/leaves', icon: <Briefcase size={20} /> },
      { name: 'Salary', path: '/hrms/salary', icon: <FileText size={20} /> },
      { name: 'Calendar', path: '/hrms/calendar', icon: <Calendar size={20} /> },
      { name: 'Company Policies', path: '/hrms/policies', icon: <Building2 size={20} /> },
      { name: 'Personal Documents', path: '/hrms/documents', icon: <FileText size={20} /> },
    ];
  };

  const isSalesDeptUser = !isSuperAdmin && Boolean(
    isSales || 
    (currentUser?.department && (
      currentUser.department.toLowerCase().includes('sale') || 
      currentUser.department.toLowerCase().includes('bdm') || 
      currentUser.department.toLowerCase().includes('business dev')
    ))
  );

  const getCrmMenuItems = () => {
    const items = [
      { name: 'Dashboard', path: '/crm/dashboard', icon: <LayoutDashboard size={20} /> },
      { name: 'Quotations', path: '/crm/quotations', icon: <ClipboardList size={20} /> },
      { name: 'Deals', path: '/crm/deals', icon: <Briefcase size={20} /> },
    ];

    if (!isSalesDeptUser) {
      items.push({ name: 'Internal Operations', path: '/crm/internal-operations', icon: <Layers size={20} /> });
    }

    items.push(
      { name: 'Clients', path: '/crm/clients', icon: <Users size={20} /> },
      { name: 'Companies', path: '/crm/companies', icon: <Building2 size={20} /> },
      { name: 'Documents', path: '/crm/documents', icon: <FileText size={20} /> },
    );

    return items;
  };

  const menuConfig = {
    crm: {
      title: 'CRM',
      items: getCrmMenuItems()
    },
    hrms: {
      title: 'HRMS',
      items: getHrmsMenuItems()
    },
    quality: {
      title: 'QUALITY',
      items: [
        { name: 'Dashboard', path: '/quality/dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'Raised Queries', path: '/quality/queries', icon: <ShieldAlert size={20} /> },
      ]
    }
  };

  const currentMenu = menuConfig[currentModule] || menuConfig.crm;

  // =========================================================================
  // LUXURY CLAYMORPHIC SIDEBAR FOR SUPER ADMIN DASHBOARD
  // =========================================================================
  const SuperAdminSidebarContent = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#f8f9fb] via-[#f1f4f8] to-[#eaedf3] border-r border-slate-200/90 shadow-[4px_0_28px_rgba(0,0,0,0.03)] select-none">
      {/* Brand Header */}
      <div className="p-4 flex items-center justify-between min-h-[72px] border-b border-slate-200/70 bg-white/50 backdrop-blur-md">
        <Link to="/modules" className="flex items-center overflow-visible group">
          {isSidebarOpen ? (
            <div className="flex items-center gap-2">
              <Logo className="h-[46px] w-auto scale-[2.8] origin-left ml-5 drop-shadow-2xs" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950 text-amber-400 font-black text-sm flex items-center justify-center mx-auto shadow-md border border-slate-800">
              b
            </div>
          )}
        </Link>
        {isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="w-7 h-7 rounded-xl bg-white/90 hover:bg-white border border-white text-slate-500 hover:text-slate-900 shadow-2xs hover:shadow-xs flex items-center justify-center transition-all cursor-pointer hidden md:flex"
            title="Collapse Sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav List */}
      <div className="py-4 flex-1 overflow-y-auto">
        {isSidebarOpen && (
          <div className="px-5 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                CRM MODULE
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-slate-900 text-amber-400 text-[9px] font-black tracking-wider uppercase shadow-2xs">
              HQ
            </span>
          </div>
        )}
        
        <nav className="px-3 space-y-1.5">
          {currentMenu.items.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center px-3.5 py-2.5 rounded-2xl text-xs transition-all group relative cursor-pointer",
                  isActive 
                    ? "bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white shadow-[0_8px_20px_rgba(15,23,42,0.22)] border border-slate-700/60 font-black" 
                    : "text-slate-600 hover:text-slate-950 hover:bg-white/80 hover:shadow-2xs border border-transparent hover:border-white font-bold"
                )}
                title={!isSidebarOpen ? item.name : undefined}
              >
                <div className={cn(
                  "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all",
                  isActive 
                    ? "bg-amber-400/20 text-amber-400 border border-amber-400/30 shadow-2xs" 
                    : "bg-slate-100/80 text-slate-500 group-hover:bg-white group-hover:text-slate-800 group-hover:shadow-2xs"
                )}>
                  {item.icon}
                </div>
                {isSidebarOpen && (
                  <span className="ml-3 truncate">{item.name}</span>
                )}
                {isSidebarOpen && isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Luxury Footer (Active Role + Navigation Actions) */}
      {isSidebarOpen ? (
        <div className="border-t border-slate-200/70 p-3 space-y-2 bg-[#eaedf3]/50">
          {/* Executive Active Role Card */}
          <div className="p-3.5 rounded-[1.6rem] bg-gradient-to-br from-slate-950 via-slate-900 to-[#171b26] text-white shadow-[0_12px_28px_rgba(15,23,42,0.28)] border border-slate-800/80 relative overflow-hidden group">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-amber-500/15 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            
            <div className="flex items-center justify-between mb-2 relative z-10">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/90 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Role
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white text-[9px] font-black tracking-wider uppercase border border-white/10">
                Super Admin
              </span>
            </div>

            <div className="flex items-center gap-2.5 relative z-10">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/30 border border-amber-200 shrink-0">
                <Crown size={16} className="fill-slate-950/20" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-white tracking-tight truncate">
                  {currentUser.name || 'Super Admin'}
                </div>
                <div className="text-[10px] text-amber-200/90 font-bold flex items-center gap-1 mt-0.5">
                  <ShieldCheck size={11} className="text-amber-400 shrink-0" />
                  <span className="truncate">Master Authority</span>
                </div>
              </div>
            </div>

            {isSuperAdminUser && (
              <button
                onClick={() => setIsRoleModalOpen(true)}
                className="mt-2.5 w-full py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-black text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs relative z-10"
              >
                <SwitchCamera size={12} className="text-amber-400" />
                <span>Switch Role View</span>
              </button>
            )}
          </div>

          {/* Back to Modules Navigation */}
          <button
            onClick={() => navigate('/modules')}
            className="flex items-center w-full px-3 py-2 text-xs font-extrabold text-slate-700 bg-white/85 hover:bg-white border border-white hover:border-slate-200 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-xs transition-all group cursor-pointer"
            title="Back to Module Selection"
          >
            <div className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-amber-50 flex items-center justify-center mr-2 transition-colors shrink-0">
              <ArrowLeft size={13} className="text-slate-500 group-hover:text-amber-600 transition-transform group-hover:-translate-x-0.5" />
            </div>
            <span className="truncate">Back to Modules</span>
          </button>

          {/* Logout */}
          <button
            onClick={() => {
              if (logout) logout();
              navigate('/login');
            }}
            className="flex items-center w-full px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50/80 rounded-2xl transition-colors group cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center mr-2 group-hover:bg-rose-100 transition-colors shrink-0">
              <LogOut size={13} className="text-rose-500 group-hover:scale-110 transition-transform" />
            </div>
            <span>Logout</span>
          </button>
        </div>
      ) : (
        <div className="p-2.5 border-t border-slate-200/60 flex flex-col items-center space-y-2 bg-[#eaedf3]/60">
          <button
            onClick={() => setIsRoleModalOpen(true)}
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-md shadow-amber-500/20 border border-amber-300 transition-transform hover:scale-105 cursor-pointer"
            title="Super Admin - Switch Role"
          >
            <Crown size={16} />
          </button>
          <button
            onClick={() => navigate('/modules')}
            className="p-2 text-slate-500 hover:text-slate-900 bg-white/90 hover:bg-white rounded-xl border border-white shadow-2xs hover:shadow-xs transition-all cursor-pointer"
            title="Back to Modules"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => {
              if (logout) logout();
              navigate('/login');
            }}
            className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </div>
  );

  // =========================================================================
  // STANDARD SIDEBAR FOR ALL OTHER PAGES / MODULES / ROLES (UNMODIFIED)
  // =========================================================================
  const StandardSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      <div className="p-4 flex items-center justify-between min-h-[72px] border-b border-gray-50">
        <Link to="/modules" className="flex items-center overflow-visible">
          {isSidebarOpen ? (
            <Logo className="h-[48px] w-auto scale-[3] origin-left ml-6" />
          ) : (
            <div className="w-8 h-8 bg-be-orange rounded-lg flex items-center justify-center text-white font-bold text-sm mx-auto">
              b
            </div>
          )}
        </Link>
        {isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 hidden md:block"
          >
            <ChevronLeft size={20} />
          </button>
        )}
      </div>

      <div className="py-4 flex-1 overflow-y-auto">
        {isSidebarOpen && (
          <div className="px-6 mb-4 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {currentMenu.title} MODULE
            </span>
          </div>
        )}
        
        <nav className="px-3 space-y-1">
          {currentMenu.items.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group relative",
                  isActive 
                    ? "bg-orange-50 text-be-orange font-bold" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
                title={!isSidebarOpen ? item.name : undefined}
              >
                <div className={cn("flex-shrink-0", isActive ? "text-be-orange" : "text-gray-400 group-hover:text-gray-600")}>
                  {item.icon}
                </div>
                {isSidebarOpen && (
                  <span className="ml-3 truncate">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Role Badge, Back & Logout */}
      {isSidebarOpen ? (
        <div className="border-t border-gray-100 p-3 space-y-1.5">
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100/80 mb-2">
            <div className="mb-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Role</span>
            </div>
            <div className="flex items-center space-x-2.5">
              <div className={`p-1.5 rounded-lg border ${roleInfo.badgeClass}`}>
                {currentRole === 'Super Admin' && <Crown size={14} />}
                {currentRole === 'HR' && <UserCheck size={14} />}
                {currentRole === 'HOD' && <Shield size={14} />}
                {currentRole === 'TL' && <Briefcase size={14} />}
                {currentRole === 'TM' && <User size={14} />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-900 truncate">{currentUser.name}</div>
                <div className="text-[11px] text-gray-500 font-medium truncate">{roleInfo.label}</div>
              </div>
            </div>
          </div>

          {/* Back to Modules Navigation */}
          <button
            onClick={() => navigate('/modules')}
            className="flex items-center w-full px-3 py-2 text-xs font-bold text-gray-700 bg-gray-50/80 hover:bg-orange-50 hover:text-be-orange border border-gray-100 hover:border-orange-200 rounded-xl transition-all group shadow-xs"
            title="Back to Module Selection"
          >
            <ArrowLeft size={16} className="mr-2 text-gray-400 group-hover:text-be-orange transition-transform group-hover:-translate-x-1" />
            <span>Back to Modules</span>
          </button>

          {/* Logout */}
          <button
            onClick={() => {
              if (logout) logout();
              navigate('/login');
            }}
            className="flex items-center w-full px-3 py-2 text-xs font-bold text-red-600 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors group"
          >
            <LogOut size={16} className="mr-2.5 text-red-500 group-hover:text-red-700" />
            <span>Logout</span>
          </button>
        </div>
      ) : (
        <div className="p-2 border-t border-gray-100 flex flex-col items-center space-y-1">
          <button
            onClick={() => navigate('/modules')}
            className="p-2.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
            title="Back to Modules"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => {
              if (logout) logout();
              navigate('/login');
            }}
            className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </div>
  );

  const SidebarContent = isSuperAdminDashboard ? SuperAdminSidebarContent : StandardSidebarContent;

  return (
    <div className={cn("h-screen flex overflow-hidden", isSuperAdminDashboard ? "bg-[#edf0f4]" : "bg-gray-50")}>
      {/* Desktop Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? (isSuperAdminDashboard ? 268 : 260) : 80 }}
        className="hidden md:block flex-shrink-0 z-20"
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/50 z-30 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className={cn("fixed inset-y-0 left-0 w-[268px] z-40 md:hidden", isSuperAdminDashboard ? "bg-[#f8f9fb]" : "bg-white")}
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className={cn(
          "h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-40 relative transition-colors",
          isSuperAdminDashboard 
            ? "bg-[#edf0f4]/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)]" 
            : "bg-white border-b border-gray-100 shadow-sm"
        )}>
          <div className="flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="mr-4 text-gray-500 hover:text-gray-700 md:hidden p-2 rounded-md hover:bg-gray-100"
            >
              <Menu size={24} />
            </button>
            
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  "mr-4 hidden md:block p-1.5 rounded-xl transition-all cursor-pointer",
                  isSuperAdminDashboard
                    ? "text-slate-600 bg-white/90 hover:bg-white border border-white shadow-2xs hover:shadow-xs"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                )}
              >
                <ChevronRight size={20} />
              </button>
            )}

            {isSuperAdminDashboard ? (
              <div className="hidden sm:flex items-center text-xs font-bold">
                <span className="px-2.5 py-1 rounded-full bg-slate-900 text-amber-400 text-[10px] font-black tracking-widest uppercase mr-2.5 shadow-2xs border border-amber-400/30">SUPER ADMIN</span>
                <span className="text-slate-500 font-bold">CRM</span>
                <span className="mx-2 text-slate-400">/</span>
                <span className="text-slate-900 font-black">Executive Dashboard</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center text-sm text-gray-500 font-medium">
                <span className="text-gray-900 capitalize font-bold">{currentModule}</span>
                <span className="mx-2">/</span>
                <span className="capitalize">{location.pathname.split('/').pop()?.replace('-', ' ')}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">

            {/* Direct Header Search Bar */}
            <HeaderSearchBar />

            <button className={cn(
              "relative p-2 rounded-full transition-colors",
              isSuperAdminDashboard
                ? "text-slate-500 hover:text-slate-800 bg-white/80 hover:bg-white border border-white shadow-2xs"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            )}>
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full border-2 border-white"></span>
            </button>

            <div className={cn("h-7 w-px hidden sm:block", isSuperAdminDashboard ? "bg-slate-300" : "bg-gray-200")}></div>

            {/* User Profile */}
            <div className="flex items-center">
              {isSuperAdminDashboard ? (
                <div 
                  onClick={() => setIsRoleModalOpen(true)}
                  className="flex items-center cursor-pointer group"
                  title="Click to Switch Role View"
                >
                  <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center border border-amber-300 shrink-0 font-black text-xs shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                    <Crown size={17} className="fill-slate-950/20" />
                  </div>
                  <div className="hidden md:block text-left ml-2.5">
                    <div className="text-xs font-black text-slate-900 leading-tight flex items-center gap-1">
                      {currentUser.name}
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div className="text-[10px] text-amber-600 font-black uppercase tracking-wider">
                      Super Admin • Master Authority
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center border border-orange-200 shrink-0 font-bold text-xs shadow-sm">
                    {(currentUser.name || '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="hidden md:block text-left ml-2">
                    <div className="text-xs font-bold text-gray-900 leading-tight flex items-center">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">
                      {roleInfo.shortLabel}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={cn(
          "flex-1 overflow-y-auto overflow-x-auto relative",
          isSuperAdminDashboard ? "bg-[#edf0f4] p-4 sm:p-6 lg:p-8" : "p-4 sm:p-6 lg:p-8"
        )}>
          <Outlet />
        </main>
      </div>

      {/* Role & User Switcher Modal (Super Admin only) */}
      {isSuperAdminUser && (
        <RoleSwitcherModal 
          isOpen={isRoleModalOpen} 
          onClose={() => setIsRoleModalOpen(false)} 
        />
      )}
    </div>
  );
};
