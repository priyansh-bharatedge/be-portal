import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { Briefcase, Users, ShieldCheck, ChevronRight, RefreshCw, Crown, Shield, User } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { RoleSwitcherModal } from '../components/RoleSwitcherModal';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
};

const subtitles = [
  'Your workspace is ready for you.',
  "Let's make today productive.",
  'One workspace. Everything you need.',
  'Ready to get things moving?',
  'Welcome back. Let\'s get things done.',
  'Your BharatEdge workspace is ready.',
];

export const ModuleSelection = () => {
  const navigate = useNavigate();
  const greeting = getGreeting();
  const subtitle = subtitles[Math.floor(Math.random() * subtitles.length)];
  const { currentUser, roleInfo, isHR, isHOD, isSuperAdmin, currentRole } = useAuth();
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  const modules = [
    {
      id: 'crm',
      title: 'CRM',
      icon: <Briefcase className="w-6 h-6 text-white" />,
      iconBg: 'bg-gradient-to-br from-orange-500 to-rose-500',
      description: 'Manage clients, companies, deals, services and documents.',
      path: '/crm/dashboard',
    },
    {
      id: 'hrms',
      title: 'HRMS',
      icon: <Users className="w-6 h-6 text-white" />,
      iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-500',
      description: 'Manage employee directory, hierarchy (Super Admin/HOD/TL/TM), attendance, leaves & salary.',
      path: '/hrms/dashboard',
    },
    {
      id: 'quality',
      title: 'QUALITY',
      icon: <ShieldCheck className="w-6 h-6 text-white" />,
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-500',
      description: 'Manage client queries, issues, assignments and resolutions.',
      path: '/quality/dashboard',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.3 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.97 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 22 } }
  };

  const isSuperAdminUser = isSuperAdmin || 
                           currentRole === 'Super Admin' || 
                           (currentUser.role as string) === 'Super Admin' || 
                           currentUser.email?.toLowerCase() === 'superadmin@be.com' ||
                           currentUser.email === 'md@bharat-edge.com';

  const isHREmployee = isHR || 
                       currentRole === 'HR' || 
                       (currentUser.role as string) === 'HR' || 
                       currentUser.email?.toLowerCase().includes('hr@') ||
                       currentUser.name?.toLowerCase().includes('hr');

  const isHODEmployee = !isHREmployee && (
    isHOD || 
    currentRole === 'HOD' || 
    (currentUser.role as string) === 'HOD' || 
    currentUser.email?.toLowerCase().includes('mishal@')
  );

  const displayName = (() => {
    const rawName = (currentUser.name ?? '').trim();
    if (!rawName) return isSuperAdminUser ? 'Super Admin' : (roleInfo.label || 'User');
    if (rawName.toLowerCase() === 'super admin' || (isSuperAdminUser && rawName.toLowerCase() === 'super')) {
      return 'Super Admin';
    }
    if (rawName.toLowerCase() === 'hr admin' || rawName.toLowerCase() === 'hr') {
      return 'HR Admin';
    }
    if (isSuperAdminUser && rawName.toLowerCase().includes('super')) {
      return 'Super Admin';
    }
    return rawName.split(' ')[0] || rawName;
  })();

  // Module access rules:
  // - HR: HRMS only (CRM & Quality hidden)
  // - All other roles (Super Admin, HOD, Team Leader (TL), Team Member (TM)): CRM, HRMS, QUALITY (all 3)
  let allowedModules = modules;
  if (isHREmployee) {
    allowedModules = modules.filter(m => m.id === 'hrms');
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] flex flex-col">
      {/* Light Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-gray-100 px-6 sm:px-10 py-3 flex justify-between items-center z-20 sticky top-0 shadow-sm">
        <Logo className="h-20 w-auto" />
        
        <div className="flex items-center space-x-4">
          <div 
            onClick={() => setIsRoleModalOpen(true)}
            className="flex items-center space-x-3 cursor-pointer p-1 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold text-gray-900 leading-tight">{currentUser.name}</div>
              <div className="text-[11px] text-be-orange font-semibold">{roleInfo.label}</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-orange-500 to-rose-500 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-orange-500/20">
              {(currentUser.name ?? '').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* Warm Gradient Hero */}
      <div className="relative overflow-hidden">
        {/* Soft peach/orange gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50/80 via-rose-50/40 to-[#f7f8fa]" />
        {/* Decorative soft blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-64 bg-orange-200/20 rounded-full blur-3xl" />
        <div className="absolute top-10 right-1/4 w-80 h-56 bg-rose-200/15 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-12 pb-16 sm:pt-16 sm:pb-20 text-center">
          {/* Logo mark */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="mb-5"
          >
            <img src="/logo.png" alt="BharatEdge" className="h-32 sm:h-36 mx-auto object-contain" />
          </motion.div>

          {/* Greeting */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 tracking-tight mb-3"
          >
            {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-be-orange to-rose-500">{displayName}</span> <span className="inline-block animate-[wave_2s_ease-in-out_infinite]">👋</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-base sm:text-lg text-gray-500 font-medium"
          >
            Logged in as <span className="font-bold text-gray-800">{roleInfo.label}</span>. {isHREmployee ? 'HRMS module access authorized.' : subtitle}
          </motion.p>
        </div>
      </div>

      {/* Module Cards */}
      <main className="flex-1 flex flex-col items-center px-6 sm:px-10 pb-16 -mt-2 relative z-10">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className={`grid gap-6 w-full ${
            allowedModules.length === 1 
              ? 'grid-cols-1 max-w-md' 
              : allowedModules.length === 2 
                ? 'grid-cols-1 md:grid-cols-2 max-w-3xl' 
                : 'grid-cols-1 md:grid-cols-3 max-w-5xl'
          }`}
        >
          {allowedModules.map((mod) => (
            <motion.div 
              key={mod.id}
              variants={itemVariants}
              whileHover={{ y: -8, transition: { duration: 0.25 } }}
              className="bg-white rounded-2xl p-7 flex flex-col cursor-pointer group border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300"
              onClick={() => navigate(mod.path)}
            >
              {/* Icon + Enterprise Badge */}
              <div className="flex justify-between items-start mb-6">
                <div className={`h-12 w-12 rounded-xl ${mod.iconBg} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-2 transition-all duration-300`}>
                  {mod.icon}
                </div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
                  Enterprise
                </span>
              </div>
              
              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">{mod.title}</h2>
              
              {/* Description */}
              <p className="text-sm text-gray-500 mb-8 flex-1 leading-relaxed">{mod.description}</p>
              
              {/* CTA Button */}
              <button className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-gray-600 bg-gray-50 border border-gray-100 group-hover:bg-gradient-to-r group-hover:from-be-orange group-hover:to-rose-500 group-hover:text-white group-hover:border-transparent transition-all duration-300 flex items-center justify-between shadow-sm group-hover:shadow-md">
                <span>Open {mod.title}</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      </main>

      <RoleSwitcherModal 
        isOpen={isRoleModalOpen} 
        onClose={() => setIsRoleModalOpen(false)} 
      />

      {/* Wave animation keyframes */}
      <style>{`
        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-8deg); }
          30% { transform: rotate(14deg); }
          40% { transform: rotate(-4deg); }
          50% { transform: rotate(10deg); }
          60% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
};
