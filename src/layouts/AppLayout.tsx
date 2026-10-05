import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { 
  Search, Bell, Menu, ChevronLeft, ChevronRight, 
  Settings, LogOut, LayoutDashboard, Briefcase, Users, 
  Building2, FileText, BarChart3, Calendar, ShieldAlert,
  HelpCircle, UserCircle, SwitchCamera, ClipboardList,
  Crown, Shield, User, RefreshCw, UserCheck, ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { RoleSwitcherModal } from '../components/RoleSwitcherModal';
import { GlobalSearchModal } from '../components/GlobalSearchModal';

export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // Global Keyboard Shortcut: Ctrl+K or Cmd+K or / to open Global Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is actively typing inside an input/textarea/select
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { currentUser, currentRole, roleInfo, isHR, isHOD, isSuperAdmin, switchRole, logout } = useAuth();

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

            {/* Global Search Bar (Desktop) */}
            <div 
              onClick={() => setIsGlobalSearchOpen(true)}
              className="hidden lg:flex items-center relative max-w-xs w-full cursor-pointer group"
            >
              <Search className="w-4 h-4 text-gray-400 group-hover:text-be-orange absolute left-3 transition-colors" />
              <div 
                className="w-56 pl-9 pr-8 py-1.5 bg-gray-50 group-hover:bg-white border border-gray-100 group-hover:border-orange-200 rounded-full text-xs font-medium text-gray-400 group-hover:text-gray-700 shadow-2xs transition-all flex items-center justify-between"
              >
                <span>Search portal...</span>
                <kbd className="text-[10px] font-bold font-mono px-1.5 py-0.5 bg-gray-100 group-hover:bg-orange-50 group-hover:text-be-orange text-gray-500 rounded border border-gray-200 group-hover:border-orange-200">
                  Ctrl+K
                </kbd>
              </div>
            </div>

            {/* Mobile Search Button */}
            <button 
              onClick={() => setIsGlobalSearchOpen(true)}
              className="lg:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              title="Search Portal (Ctrl+K)"
            >
              <Search size={18} />
            </button>

            <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            <div className="h-7 w-px bg-gray-200 hidden sm:block"></div>

            {/* User Profile */}
            <div className="flex items-center">
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
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          <Outlet />
        </main>
      </div>

      {/* Global Universal Search Modal */}
      <GlobalSearchModal 
        isOpen={isGlobalSearchOpen} 
        onClose={() => setIsGlobalSearchOpen(false)} 
      />

      {/* Role & User Switcher Modal */}
      <RoleSwitcherModal 
        isOpen={isRoleModalOpen} 
        onClose={() => setIsRoleModalOpen(false)} 
      />
    </div>
  );
};
