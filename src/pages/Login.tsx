import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { CheckCircle2, Crown, Shield, ArrowRight, UserCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import type { SystemRole } from '../types/roles';

export const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('md@bharat-edge.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }
    const result = login(email, password);
    if (result.success) {
      setError('');
      navigate('/modules');
    } else {
      setError(result.error || 'Invalid email address or password.');
    }
  };

  const handleRoleQuickLogin = (role: SystemRole, userEmail: string) => {
    setEmail(userEmail);
    setPassword('admin123');
    setError('');
    const result = login(userEmail, 'admin123', role);
    if (result.success) {
      navigate('/modules');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden py-8">
      {/* Background ambient decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-be-orange/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-6xl flex shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] rounded-3xl overflow-hidden bg-white relative z-10 mx-4 lg:mx-8 min-h-[640px] border border-gray-100">
        
        {/* Left Side Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gray-50/80 border-r border-gray-100 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10">
            <Logo className="h-40 w-auto -mb-10 -mt-10 -ml-6 drop-shadow-sm" />
            <h1 className="text-[2.5rem] font-extrabold text-gray-900 mb-6 tracking-tight leading-[1.15]">
              Elevate Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-be-orange to-orange-500">Business Operations</span>
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-md leading-relaxed font-medium">
              Enterprise portal with complete Role-Based Access Control (Super Admin, HR Admin, Admin (HOD), Team Leader, Team Member).
            </p>
            
            <div className="space-y-4">
              {[
                { name: 'Intelligent CRM', desc: 'Manage deals, quotes and client pipelines' },
                { name: 'Role-Based HRMS', desc: 'Hierarchy mapping (Super Admin ➔ HR ➔ Admin (HOD) ➔ TL ➔ TM)' },
                { name: 'Quality Management', desc: 'Track queries and resolutions with team assignments' }
              ].map((module, i) => (
                <motion.div 
                  key={module.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + (i * 0.1) }}
                  className="flex items-start space-x-4 group"
                >
                  <div className="mt-1 w-10 h-10 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                    <CheckCircle2 className="w-5 h-5 text-be-orange" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{module.name}</h3>
                    <p className="text-xs text-gray-500 font-medium">{module.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
          <div className="relative z-10 text-xs text-gray-400 font-bold mt-8 flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
            RBAC System Active • 5 Hierarchical Roles Enabled
          </div>
        </div>

        {/* Right Side Form & 1-Click Role Presets */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 lg:p-14 bg-white relative">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-md mx-auto"
          >
            <div className="mb-6 text-center lg:text-left">
              <div className="lg:hidden flex justify-center mb-4">
                <Logo className="h-28 w-auto drop-shadow-sm" />
              </div>
              <h2 className="text-2xl font-extrabold text-gray-900 mb-1 tracking-tight">Welcome Back</h2>
              <p className="text-gray-500 text-xs font-medium">Select a role below for 1-click test login or enter credentials.</p>
            </div>

            {/* Quick 1-Click Role Selector */}
            <div className="mb-6 bg-gradient-to-br from-orange-50/70 via-rose-50/40 to-blue-50/50 p-4 rounded-2xl border border-orange-100 shadow-sm">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>1-Click Test Login:</span>
                <span className="text-be-orange font-bold">Fast Switch</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleRoleQuickLogin('Super Admin', 'md@bharat-edge.com')}
                  className="p-2.5 rounded-xl bg-white border border-purple-200 hover:border-purple-400 text-left transition-all hover:shadow-sm flex items-center space-x-2 group"
                >
                  <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 group-hover:scale-105 transition-transform shrink-0">
                    <Crown size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-purple-900 truncate">Super Admin</div>
                    <div className="text-[9px] text-gray-400 font-mono truncate">md@...</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleQuickLogin('HR', 'hr@bharat-edge.com')}
                  className="p-2.5 rounded-xl bg-white border border-rose-200 hover:border-rose-400 text-left transition-all hover:shadow-sm flex items-center space-x-2 group"
                >
                  <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 group-hover:scale-105 transition-transform shrink-0">
                    <UserCheck size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-rose-900 truncate">HR Admin</div>
                    <div className="text-[9px] text-gray-400 font-mono truncate">hr@...</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleQuickLogin('HOD', 'hod@bharat-edge.com')}
                  className="p-2.5 rounded-xl bg-white border border-blue-200 hover:border-blue-400 text-left transition-all hover:shadow-sm flex items-center space-x-2 group"
                >
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 group-hover:scale-105 transition-transform shrink-0">
                    <Shield size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-blue-900 truncate">Admin (HOD)</div>
                    <div className="text-[9px] text-gray-400 font-mono truncate">hod@...</div>
                  </div>
                </button>
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium border border-red-100 flex items-center shadow-sm">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Email Address or Employee ID</label>
                <input 
                  type="text" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                  placeholder="e.g. vrundafadadu@gmail.com or md@bharat-edge.com"
                  required
                />
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Password</label>
                  <span className="text-[11px] font-medium text-gray-400">Default: <code className="text-be-orange font-bold font-mono">admin123</code></span>
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                  placeholder="Enter password (default: admin123)"
                  required
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-gray-900/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-xs mt-2 flex justify-center items-center group relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center">
                  Sign In to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
