import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { 
  Search, Bell, Menu, ChevronLeft, ChevronRight, 
  Settings, LogOut, LayoutDashboard, Briefcase, Users, 
  Building2, FileText, BarChart3, Calendar, ShieldAlert,
  HelpCircle, UserCircle, SwitchCamera, ClipboardList,
  Crown, Shield, User, RefreshCw, UserCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { RoleSwitcherModal } from '../components/RoleSwitcherModal';

export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  const { currentUser, currentRole, roleInfo, isHR, isHOD, isSuperAdmin, switchRole } = useAuth();

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
                           currentUser.email === 'md@bharat-edge.com';

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

  const menuConfig = {
    crm: {
      title: 'CRM',
      items: [
        { name: 'Dashboard', path: '/crm/dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'Quotations', path: '/crm/quotations', icon: <ClipboardList size={20} /> },
        { name: 'Deals', path: '/crm/deals', icon: <Briefcase size={20} /> },
        { name: 'Clients', path: '/crm/clients', icon: <Users size={20} /> },
        { name: 'Companies', path: '/crm/companies', icon: <Building2 size={20} /> },
        { name: 'Documents', path: '/crm/documents', icon: <FileText size={20} /> },
      ]
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

  const SidebarContent = () => (
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

      {/* Sidebar Role Badge & Logout */}
      {isSidebarOpen ? (
        <div className="border-t border-gray-100 p-3 space-y-2">
          <div className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100/80">
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

          <button
            onClick={() => navigate('/login')}
            className="flex items-center w-full px-3 py-2.5 text-xs font-bold text-red-600 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors group"
          >
            <LogOut size={16} className="mr-2.5 text-red-500 group-hover:text-red-700" />
            <span>Logout</span>
          </button>
        </div>
      ) : (
        <div className="p-2 border-t border-gray-100 flex justify-center">
          <button
            onClick={() => navigate('/login')}
            className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Desktop Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
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
              className="fixed inset-y-0 left-0 w-[260px] z-40 bg-white md:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white h-16 border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 shadow-sm">
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
                className="mr-4 text-gray-400 hover:text-gray-600 hidden md:block p-1.5 rounded-md hover:bg-gray-100"
              >
                <ChevronRight size={20} />
              </button>
            )}

            <div className="hidden sm:flex items-center text-sm text-gray-500 font-medium">
              <span className="text-gray-900 capitalize font-bold">{currentModule}</span>
              <span className="mx-2">/</span>
              <span className="capitalize">{location.pathname.split('/').pop()?.replace('-', ' ')}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">

            <div className="hidden lg:flex items-center relative max-w-xs w-full">
              <Search className="w-4 h-4 text-gray-400 absolute left-3" />
              <input 
                type="text" 
                placeholder="Search portal..." 
                className="w-48 pl-9 pr-4 py-1.5 bg-gray-50 border border-transparent rounded-full text-xs font-medium focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none"
              />
            </div>

            <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            {/* Switch Role Quick Button */}
            <button
              onClick={() => setIsRoleModalOpen(true)}
              className="flex items-center px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-be-orange border border-orange-200 text-xs font-bold transition-all shadow-sm hover:shadow"
              title="Switch role between Super Admin, HR, HOD, TL, TM"
            >
              <RefreshCw size={13} className="mr-1.5 animate-spin-hover" />
              <span className="hidden sm:inline">Switch Role</span>
            </button>

            <div className="h-7 w-px bg-gray-200 hidden sm:block"></div>

            {/* Profile Dropdown */}
            <div className="flex items-center group relative cursor-pointer">
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center border border-orange-200 shrink-0 font-bold text-xs shadow-sm">
                {(currentUser.name || '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div className="hidden md:block text-left mr-2 ml-2">
                <div className="text-xs font-bold text-gray-900 leading-tight flex items-center">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-gray-500 font-medium">
                  {roleInfo.shortLabel}
                </div>
              </div>
              
              {/* Profile Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right z-50 p-2">
                <div className="p-3 border-b border-gray-50 bg-gray-50/50 rounded-xl mb-1">
                  <p className="text-xs font-bold text-gray-900">{currentUser.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{currentUser.email}</p>
                  <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border bg-white text-gray-700">
                    Role: {roleInfo.label}
                  </div>
                </div>

                <div className="p-1 space-y-1">
                  <button 
                    onClick={() => {
                      const empId = currentUser.empId || currentUser.id || 'EMP-001';
                      navigate(`/hrms/employees/${empId}`);
                    }} 
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <UserCircle size={14} className="mr-2.5 text-gray-400" />
                    My Profile
                  </button>

                  <button 
                    onClick={() => setIsRoleModalOpen(true)} 
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-be-orange rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <RefreshCw size={14} className="mr-2.5 text-be-orange" />
                    Switch Role / User
                  </button>

                  <button 
                    onClick={() => navigate('/settings')} 
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Settings size={14} className="mr-2.5 text-gray-400" />
                    Settings
                  </button>

                  <div className="pt-1 border-t border-gray-50">
                    <button 
                      onClick={() => navigate('/login')} 
                      className="flex w-full items-center px-3 py-2 text-xs font-semibold text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={14} className="mr-2.5" />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          <Outlet />
        </main>
      </div>

      {/* Role & User Switcher Modal */}
      <RoleSwitcherModal 
        isOpen={isRoleModalOpen} 
        onClose={() => setIsRoleModalOpen(false)} 
      />
    </div>
  );
};
