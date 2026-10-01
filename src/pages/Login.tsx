import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { 
  CheckCircle2, Crown, Shield, ArrowRight, UserCheck, 
  KeyRound, Mail, Lock, Eye, EyeOff, RefreshCw, Sparkles,
  ArrowLeft, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import type { SystemRole } from '../types/roles';

export const Login = () => {
  const navigate = useNavigate();
  const { login, requestOtp, verifyOtp, setPasswordAndActivate } = useAuth();
  
  // Tabs: 'signin' | 'first_time'
  const [activeTab, setActiveTab] = useState<'signin' | 'first_time'>('signin');

  // Sign in state
  const [email, setEmail] = useState('md@bharat-edge.com');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // First-Time OTP & Password State
  const [otpStep, setOtpStep] = useState<1 | 2 | 3 | 4>(1); // 1: Email, 2: OTP, 3: Set Password, 4: Success
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [empName, setEmpName] = useState('');
  const [otpBoxes, setOtpBoxes] = useState(['', '', '', '', '', '']);
  const [activeOtpCode, setActiveOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otpTimer, setOtpTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccessMsg, setOtpSuccessMsg] = useState('');

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // OTP Timer Countdown
  useEffect(() => {
    let timer: any;
    if (otpStep === 2 && otpTimer > 0) {
      timer = setTimeout(() => setOtpTimer(prev => prev - 1), 1000);
    } else if (otpTimer === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [otpStep, otpTimer]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const result = login(email, password);
      setLoading(false);
      if (result.success) {
        setError('');
        navigate('/modules');
      } else {
        setError(result.error || 'Invalid email address or password.');
      }
    }, 300);
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

  // Step 1: Send OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setOtpError('');
    setOtpSuccessMsg('');
    if (!otpIdentifier.trim()) {
      setOtpError('Please enter your registered Email address or Employee ID.');
      return;
    }

    setLoading(true);
    const result = await requestOtp(otpIdentifier.trim());
    setLoading(false);

    if (result.success) {
      setMaskedEmail(result.maskedEmail || result.targetEmail || '');
      setEmpName(result.empName || '');
      setActiveOtpCode(result.otp || '');
      setOtpStep(2);
      setOtpTimer(60);
      setCanResend(false);
      setOtpBoxes(['', '', '', '', '', '']);
      setOtpSuccessMsg(`OTP successfully dispatched from support@bharat-edge.com`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } else {
      setOtpError(result.error || 'Failed to send OTP.');
    }
  };

  // Step 2: Handle OTP Digits
  const handleOtpBoxChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '').slice(-1);
    const updated = [...otpBoxes];
    updated[index] = clean;
    setOtpBoxes(updated);

    // Auto advance
    if (clean && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpBoxes[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasteData) {
      const updated = pasteData.split('').concat(Array(6).fill('')).slice(0, 6);
      setOtpBoxes(updated);
      const nextIndex = Math.min(pasteData.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    const fullCode = otpBoxes.join('');
    if (fullCode.length !== 6) {
      setOtpError('Please enter all 6 digits of the OTP verification code.');
      return;
    }

    const result = verifyOtp(otpIdentifier, fullCode);
    if (result.success) {
      setOtpStep(3);
    } else {
      setOtpError(result.error || 'Invalid OTP code.');
    }
  };

  // Step 3: Set Password
  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');

    if (newPassword.length < 6) {
      setOtpError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setOtpError('Passwords do not match. Please re-enter.');
      return;
    }

    const fullCode = otpBoxes.join('');
    setLoading(true);
    const result = setPasswordAndActivate(otpIdentifier, fullCode, newPassword);
    setLoading(false);

    if (result.success) {
      setOtpStep(4);
      setTimeout(() => {
        navigate('/modules');
      }, 2000);
    } else {
      setOtpError(result.error || 'Failed to set password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden py-8">
      {/* Background ambient decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-be-orange/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-6xl flex shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] rounded-3xl overflow-hidden bg-white relative z-10 mx-4 lg:mx-8 min-h-[660px] border border-gray-100">
        
        {/* Left Side Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gray-50/80 border-r border-gray-100 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10">
            <Logo className="h-40 w-auto -mb-10 -mt-10 -ml-6 drop-shadow-sm" />
            <h1 className="text-[2.5rem] font-extrabold text-gray-900 mb-6 tracking-tight leading-[1.15]">
              Elevate Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-be-orange to-orange-500">Business Operations</span>
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-md leading-relaxed font-medium">
              Enterprise portal with complete Role-Based Access Control and secure First-Time Login OTP verification.
            </p>
            
            <div className="space-y-4">
              {[
                { name: 'Intelligent CRM', desc: 'Manage deals, quotes, client pipelines & Zoho integration' },
                { name: 'Role-Based HRMS', desc: 'Employee directory, hierarchy mapping & payroll' },
                { name: 'Secure First-Time Access', desc: 'Instant OTP verification via support@bharat-edge.com' }
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
            RBAC Active • OTP Verification via support@bharat-edge.com
          </div>
        </div>

        {/* Right Side Form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 lg:p-14 bg-white relative">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-md mx-auto"
          >
            <div className="mb-5 text-center lg:text-left">
              <div className="lg:hidden flex justify-center mb-4">
                <Logo className="h-28 w-auto drop-shadow-sm" />
              </div>
              
              {/* Header Title depending on tab */}
              {activeTab === 'signin' ? (
                <>
                  <h2 className="text-2xl font-extrabold text-gray-900 mb-1 tracking-tight">Welcome Back</h2>
                  <p className="text-gray-500 text-xs font-medium">Select a role below for 1-click test login or enter credentials.</p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-extrabold text-gray-900 mb-1 tracking-tight flex items-center gap-2">
                    <KeyRound className="text-be-orange w-6 h-6" /> First-Time Activation
                  </h2>
                  <p className="text-gray-500 text-xs font-medium">Verify via OTP from support@bharat-edge.com and set your custom password.</p>
                </>
              )}
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex bg-gray-100/80 p-1 rounded-2xl mb-5 border border-gray-200">
              <button
                type="button"
                onClick={() => { setActiveTab('signin'); setError(''); }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'signin'
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Regular Sign In
              </button>
              <button
                type="button"
                onClick={() => { 
                  setActiveTab('first_time'); 
                  setOtpStep(1); 
                  setOtpError('');
                  if (email && email !== 'md@bharat-edge.com') setOtpIdentifier(email);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'first_time'
                    ? 'bg-white text-be-orange shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-be-orange'
                }`}
              >
                <Sparkles size={13} className="text-be-orange" />
                First-Time / Set Password
              </button>
            </div>

            {/* TAB 1: REGULAR SIGN IN */}
            {activeTab === 'signin' && (
              <div>
                {/* Quick 1-Click Role Selector */}
                <div className="mb-5 bg-gradient-to-br from-orange-50/70 via-rose-50/40 to-blue-50/50 p-4 rounded-2xl border border-orange-100 shadow-sm">
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
                    <div className="relative">
                      <input 
                        type="text" 
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                        placeholder="e.g. employee@bharat-edge.com or EMP-001"
                        required
                      />
                      <Mail size={15} className="absolute left-3 top-3 text-gray-400" />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-700">Password</label>
                      <button 
                        type="button"
                        onClick={() => {
                          setActiveTab('first_time');
                          setOtpStep(1);
                          setOtpIdentifier(email);
                        }}
                        className="text-[11px] font-bold text-be-orange hover:underline"
                      >
                        First-Time Login / Reset with OTP?
                      </button>
                    </div>
                    <div className="relative">
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                        placeholder="Enter your password"
                        required
                      />
                      <Lock size={15} className="absolute left-3 top-3 text-gray-400" />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-gray-900/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-xs mt-2 flex justify-center items-center group relative overflow-hidden disabled:opacity-50"
                  >
                    <span className="relative z-10 flex items-center">
                      {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: FIRST TIME OTP & SET PASSWORD WIZARD */}
            {activeTab === 'first_time' && (
              <div>
                {/* Wizard Progress Pills */}
                <div className="flex items-center justify-between mb-5 px-1">
                  {[
                    { num: 1, label: 'Email / ID' },
                    { num: 2, label: 'OTP Code' },
                    { num: 3, label: 'Set Password' }
                  ].map((s) => (
                    <div key={s.num} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        otpStep === s.num
                          ? 'bg-be-orange text-white ring-2 ring-orange-200'
                          : otpStep > s.num
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {otpStep > s.num ? <Check size={12} /> : s.num}
                      </div>
                      <span className={`text-[11px] font-bold ${
                        otpStep === s.num ? 'text-be-orange' : otpStep > s.num ? 'text-emerald-600' : 'text-gray-400'
                      }`}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>

                {otpError && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium border border-red-100 flex items-center shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" />
                    {otpError}
                  </motion.div>
                )}

                {otpSuccessMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 flex items-center shadow-sm">
                    <CheckCircle2 size={15} className="mr-2 text-emerald-600 shrink-0" />
                    {otpSuccessMsg}
                  </motion.div>
                )}

                {/* STEP 1: Enter Email / Employee ID */}
                {otpStep === 1 && (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div className="bg-orange-50/60 p-3.5 rounded-2xl border border-orange-100 text-xs text-gray-700 space-y-1">
                      <div className="font-bold text-gray-900 flex items-center gap-1.5">
                        <Mail size={14} className="text-be-orange" />
                        Verification via Official Support Email
                      </div>
                      <p className="text-[11px] text-gray-600">
                        A 6-digit secure code will be dispatched from <strong className="text-be-orange font-mono">support@bharat-edge.com</strong> to your registered email address.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Registered Email or Employee ID *</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={otpIdentifier}
                          onChange={e => setOtpIdentifier(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                          placeholder="e.g. employee@bharat-edge.com or EMP-001"
                          required
                          autoFocus
                        />
                        <Mail size={15} className="absolute left-3 top-3 text-gray-400" />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-be-orange hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-xs mt-2 flex justify-center items-center group relative overflow-hidden disabled:opacity-50"
                    >
                      <span className="relative z-10 flex items-center">
                        {loading ? 'Sending OTP...' : 'Send 6-Digit OTP Code'}
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </button>
                  </form>
                )}

                {/* STEP 2: Enter 6-Digit OTP Code */}
                {otpStep === 2 && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-3.5 rounded-2xl border border-orange-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">OTP Sent for {empName || 'Employee'}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-orange-100 text-be-orange border border-orange-200">
                          support@bharat-edge.com
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600">
                        Delivered to: <span className="font-mono font-bold text-gray-900">{maskedEmail}</span>
                      </div>
                      {/* Live Code Banner for Testing */}
                      <div className="mt-1 p-2 bg-white/80 rounded-xl border border-orange-200 flex items-center justify-between">
                        <span className="text-[11px] text-gray-500 font-medium">OTP Code:</span>
                        <span className="font-mono font-extrabold text-sm tracking-widest text-be-orange bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                          {activeOtpCode}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2 text-center">
                        Enter 6-Digit Verification Code
                      </label>
                      <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                        {otpBoxes.map((digit, idx) => (
                          <input
                            key={idx}
                            ref={el => { otpInputRefs.current[idx] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={e => handleOtpBoxChange(idx, e.target.value)}
                            onKeyDown={e => handleOtpKeyDown(idx, e)}
                            className="w-11 h-12 text-center text-lg font-mono font-extrabold rounded-xl border-2 border-gray-200 bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 outline-none transition-all text-gray-900 shadow-sm"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => { setOtpStep(1); setOtpError(''); }}
                        className="text-xs font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1"
                      >
                        <ArrowLeft size={13} /> Change Email
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendOtp()}
                        disabled={!canResend || loading}
                        className={`text-xs font-bold flex items-center gap-1 transition-colors ${
                          canResend ? 'text-be-orange hover:underline cursor-pointer' : 'text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        {canResend ? 'Resend OTP' : `Resend in ${otpTimer}s`}
                      </button>
                    </div>

                    <button 
                      type="submit"
                      disabled={loading || otpBoxes.join('').length !== 6}
                      className="w-full bg-be-orange hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-xs mt-2 flex justify-center items-center group relative overflow-hidden disabled:opacity-50"
                    >
                      <span className="relative z-10 flex items-center">
                        Verify & Proceed to Set Password
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </button>
                  </form>
                )}

                {/* STEP 3: Set New Password */}
                {otpStep === 3 && (
                  <form onSubmit={handleSetPassword} className="space-y-4">
                    <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <div>
                        <strong>OTP Verified Successfully!</strong>
                        <div className="text-[11px] text-emerald-700">Please choose a secure password for your account.</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">New Password *</label>
                      <div className="relative">
                        <input 
                          type={showNewPassword ? 'text' : 'password'} 
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                          placeholder="Min 6 characters (e.g. MyPassword@123)"
                          required
                          autoFocus
                        />
                        <Lock size={15} className="absolute left-3 top-3 text-gray-400" />
                        <button 
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Confirm Password *</label>
                      <div className="relative">
                        <input 
                          type={showConfirmPassword ? 'text' : 'password'} 
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-be-orange focus:ring-2 focus:ring-be-orange/20 transition-all outline-none font-semibold text-xs text-gray-900 placeholder-gray-400"
                          placeholder="Re-enter new password"
                          required
                        />
                        <Lock size={15} className="absolute left-3 top-3 text-gray-400" />
                        <button 
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Password requirements pill */}
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-[11px] text-gray-500 space-y-1">
                      <div className={`flex items-center gap-1.5 ${newPassword.length >= 6 ? 'text-emerald-600 font-bold' : ''}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 6 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        At least 6 characters in length
                      </div>
                      <div className={`flex items-center gap-1.5 ${newPassword && newPassword === confirmPassword ? 'text-emerald-600 font-bold' : ''}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${newPassword && newPassword === confirmPassword ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        Passwords match
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-xs mt-2 flex justify-center items-center group relative overflow-hidden disabled:opacity-50"
                    >
                      <span className="relative z-10 flex items-center">
                        {loading ? 'Activating Account...' : 'Set Password & Launch Portal'}
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </button>
                  </form>
                )}

                {/* STEP 4: Success State */}
                {otpStep === 4 && (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner ring-8 ring-emerald-50">
                      <Check size={32} />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-gray-900">Account Activated!</h3>
                      <p className="text-xs text-gray-500 mt-1">Welcome, {empName}! Redirecting to your dashboard...</p>
                    </div>
                    <div className="w-6 h-6 border-2 border-be-orange border-t-transparent rounded-full animate-spin mx-auto" />
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

