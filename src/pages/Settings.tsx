import React, { useState, useEffect } from 'react';
import { User, Bell, Lock, Building, Save, Database, Trash2, CheckCircle2, ShieldCheck, KeyRound, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { INITIAL_EMPLOYEES, DEMO_USERS } from '../utils/initialData';
import { updateZohoEmployeePassword } from '../services/zohoService';
import { DeleteConfirmModal } from '../components/ui/DeleteConfirmModal';

export const Settings = () => {
  const { currentUser, switchUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  
  // Profile Form
  const [formData, setFormData] = useState({
    name: currentUser?.name || 'Employee',
    email: currentUser?.email || currentUser?.personalEmail || 'superadmin@be.com',
    company: 'BharatEdge Startup Advisors Private Limited',
    phone: currentUser?.mobile || '+91 9876543210'
  });

  // Security / Password Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({ type: '', message: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setFormData({
        name: currentUser.name || '',
        email: currentUser.email || currentUser.personalEmail || '',
        company: 'BharatEdge Startup Advisors Private Limited',
        phone: currentUser.mobile || ''
      });
    }
  }, [currentUser]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        name: formData.name,
        email: formData.email,
        mobile: formData.phone
      };
      switchUser(updatedUser);
      localStorage.setItem('be_active_user', JSON.stringify(updatedUser));
    }
    alert('Profile settings saved successfully!');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus({ type: '', message: '' });

    if (!newPassword.trim() || newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 6 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New password and confirmation password do not match.' });
      return;
    }

    setIsSavingPassword(true);
    const cleanPassword = newPassword.trim();
    const userEmail = currentUser?.email || currentUser?.personalEmail || currentUser?.workEmail || formData.email;

    try {
      // 1. Sync actual password to Zoho CRM Employee record found via email
      const zohoRes = await updateZohoEmployeePassword(userEmail, cleanPassword, currentUser?.zohoId);

      // 2. Update local employee record
      const savedEmps = localStorage.getItem('be_employees');
      if (savedEmps) {
        const emps = JSON.parse(savedEmps);
        const idx = emps.findIndex((x: any) => 
          x.id === currentUser?.id || 
          x.id === currentUser?.empId || 
          x.email?.toLowerCase() === userEmail.toLowerCase() ||
          x.formData?.email?.toLowerCase() === userEmail.toLowerCase()
        );
        if (idx !== -1) {
          emps[idx].password = cleanPassword;
          emps[idx].passwordSet = true;
          if (zohoRes?.zohoId && !emps[idx].zohoId) {
            emps[idx].zohoId = zohoRes.zohoId;
          }
          localStorage.setItem('be_employees', JSON.stringify(emps));
          window.dispatchEvent(new Event('be_employees_updated'));
        }
      }

      // 3. Update active user session
      const updatedUser = {
        ...currentUser,
        password: cleanPassword,
        passwordSet: true
      };
      switchUser(updatedUser as any);
      localStorage.setItem('be_active_user', JSON.stringify(updatedUser));

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({
        type: 'success',
        message: `Password successfully updated for employee (${userEmail})!`
      });
    } catch (err: any) {
      setPasswordStatus({
        type: 'error',
        message: err?.message || 'Failed to update password. Please try again.'
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleResetData = () => {
    setIsResetConfirmOpen(true);
  };

  const confirmResetData = () => {
    localStorage.setItem('be_deals', JSON.stringify([]));
    localStorage.setItem('be_quotations', JSON.stringify([]));
    localStorage.setItem('be_companies', JSON.stringify([]));
    localStorage.setItem('be_clients', JSON.stringify([]));
    localStorage.setItem('be_salaries', JSON.stringify([]));
    localStorage.setItem('be_dsr_reports', JSON.stringify([]));
    localStorage.setItem('be_queries', JSON.stringify([]));
    localStorage.setItem('be_leaves', JSON.stringify([]));
    localStorage.setItem('be_attendance', JSON.stringify([]));
    localStorage.setItem('be_emp_docs', JSON.stringify([]));
    localStorage.setItem('be_employees', JSON.stringify(INITIAL_EMPLOYEES));
    localStorage.setItem('be_active_user', JSON.stringify(DEMO_USERS[0]));
    setIsResetConfirmOpen(false);
    setResetSuccess(true);
    setTimeout(() => {
      setResetSuccess(false);
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Settings & Security</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your employee account, password, and portal preferences.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row min-h-[500px] overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 border-r border-gray-100 p-4 space-y-1.5 bg-gray-50/50">
          <button 
            onClick={() => setActiveTab('profile')} 
            className={`w-full flex items-center px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${activeTab === 'profile' ? 'bg-orange-50 text-be-orange border border-orange-200' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <User size={18} className="mr-3" /> Profile
          </button>
          <button 
            onClick={() => setActiveTab('security')} 
            className={`w-full flex items-center px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${activeTab === 'security' ? 'bg-orange-50 text-be-orange border border-orange-200' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <KeyRound size={18} className="mr-3" /> Security & Password
          </button>
          <button 
            onClick={() => setActiveTab('company')} 
            className={`w-full flex items-center px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${activeTab === 'company' ? 'bg-orange-50 text-be-orange border border-orange-200' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Building size={18} className="mr-3" /> Company
          </button>
          <button 
            onClick={() => setActiveTab('notifications')} 
            className={`w-full flex items-center px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${activeTab === 'notifications' ? 'bg-orange-50 text-be-orange border border-orange-200' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Bell size={18} className="mr-3" /> Notifications
          </button>
          <button 
            onClick={() => setActiveTab('data')} 
            className={`w-full flex items-center px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${activeTab === 'data' ? 'bg-orange-50 text-be-orange border border-orange-200' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Database size={18} className="mr-3" /> Data Management
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 capitalize">
            {activeTab === 'data' ? 'Data Management' : activeTab === 'security' ? 'Security & Password' : `${activeTab} Settings`}
          </h2>
          
          {activeTab === 'data' && (
            <div className="space-y-6 max-w-xl">
              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Clear Test Data</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">
                  Wipe all mock/test records from your browser and reset to fresh initial state.
                </p>
                <button
                  type="button"
                  onClick={handleResetData}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center"
                >
                  <Trash2 size={16} className="mr-2" />
                  Wipe All Test Data & Reset
                </button>
              </div>

              {resetSuccess && (
                <div className="p-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center">
                  <CheckCircle2 size={18} className="mr-2 text-emerald-600" />
                  All test data cleared! Reloading portal...
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-be-orange/20 outline-none text-sm font-medium" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-be-orange/20 outline-none text-sm font-medium" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number</label>
                  <input 
                    type="tel" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} 
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-be-orange/20 outline-none text-sm font-medium" 
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <button type="submit" className="bg-be-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center transition-colors shadow-sm">
                  <Save size={16} className="mr-2" /> Save Profile
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handleSavePassword} className="space-y-5 max-w-md">
              <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-xl text-xs text-orange-950 flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-be-orange flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Password Synchronization</span>
                  <span>Setting your new password here updates your employee credentials securely.</span>
                </div>
              </div>

              {passwordStatus.message && (
                <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  passwordStatus.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {passwordStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{passwordStatus.message}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Current Password</label>
                <input 
                  type="password" 
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:border-be-orange" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">New Password (Min. 6 Characters) *</label>
                <input 
                  type="password" 
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password" 
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:border-be-orange" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Confirm New Password *</label>
                <input 
                  type="password" 
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password" 
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:border-be-orange" 
                />
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button 
                  type="submit" 
                  disabled={isSavingPassword}
                  className="bg-be-orange hover:bg-orange-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center transition-all shadow-md shadow-orange-500/20"
                >
                  <Save size={16} className="mr-2" />
                  {isSavingPassword ? 'Updating Password...' : 'Update & Store Password'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'company' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Company Entity Name</label>
                <input 
                  type="text" 
                  value={formData.company} 
                  onChange={e => setFormData({...formData, company: e.target.value})} 
                  className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-be-orange/20 outline-none text-sm font-semibold" 
                />
              </div>
              <div className="pt-6 border-t border-gray-100">
                <button type="submit" className="bg-be-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center transition-colors shadow-sm">
                  <Save size={16} className="mr-2" /> Save Company Info
                </button>
              </div>
            </form>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-be-orange rounded border-gray-300 focus:ring-be-orange" />
                <span className="text-gray-700 font-medium text-sm">Email alerts for new Deals & Quotations</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-be-orange rounded border-gray-300 focus:ring-be-orange" />
                <span className="text-gray-700 font-medium text-sm">Leave Request approvals & Attendance alerts</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={confirmResetData}
        title="Clear All Test Records"
        itemName="All Test Records"
        message="Are you sure you want to clear all test records (Deals, Quotes, Companies, Clients, Leaves, Salaries, Attendance, DSRs, Queries)? This will keep only the Super Admin account so you can enter fresh data."
      />
    </div>
  );
};
