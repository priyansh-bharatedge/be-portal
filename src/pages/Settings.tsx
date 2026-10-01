import { useState } from 'react';
import { User, Bell, Lock, Building, Save, Database, Trash2, CheckCircle2 } from 'lucide-react';
import { INITIAL_EMPLOYEES, DEMO_USERS } from '../utils/initialData';

export const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [resetSuccess, setResetSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: 'Managing Director',
    email: 'md@bharat-edge.com',
    company: 'Bharat Edge',
    phone: '+91 9876543210'
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Settings saved successfully!');
  };

  const handleResetData = () => {
    if (window.confirm('Are you sure you want to clear all test records (Deals, Quotes, Companies, Clients, Leaves, Salaries, Attendance, DSRs, Queries)? This will keep only the Super Admin account so you can test entering fresh data.')) {
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
      setResetSuccess(true);
      setTimeout(() => {
        setResetSuccess(false);
        window.location.reload();
      }, 1500);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and portal preferences.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row min-h-[500px]">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 border-r border-gray-100 p-4 space-y-2">
          <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center px-4 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'profile' ? 'bg-orange-50 text-be-orange' : 'text-gray-600 hover:bg-gray-50'}`}>
            <User size={18} className="mr-3" /> Profile
          </button>
          <button onClick={() => setActiveTab('company')} className={`w-full flex items-center px-4 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'company' ? 'bg-orange-50 text-be-orange' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Building size={18} className="mr-3" /> Company
          </button>
          <button onClick={() => setActiveTab('security')} className={`w-full flex items-center px-4 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'security' ? 'bg-orange-50 text-be-orange' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Lock size={18} className="mr-3" /> Security
          </button>
          <button onClick={() => setActiveTab('notifications')} className={`w-full flex items-center px-4 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'notifications' ? 'bg-orange-50 text-be-orange' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Bell size={18} className="mr-3" /> Notifications
          </button>
          <button onClick={() => setActiveTab('data')} className={`w-full flex items-center px-4 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'data' ? 'bg-orange-50 text-be-orange' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Database size={18} className="mr-3" /> Data Management
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 capitalize">{activeTab === 'data' ? 'Data Management' : `${activeTab} Settings`}</h2>
          
          {activeTab === 'data' ? (
            <div className="space-y-6 max-w-xl">
              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Clear Test Data</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">
                  Wipe all mock/test records from your browser (Deals, Quotations, Clients, Companies, Leaves, Salaries, Attendance, DSRs, Queries) and start with fresh, empty databases.
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
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              {activeTab === 'profile' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                      <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 outline-none" />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'company' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input type="text" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-be-orange/20 outline-none" />
                  </div>
                </>
              )}

              {activeTab === 'security' && (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input type="password" placeholder="••••••••" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input type="password" placeholder="••••••••" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" />
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-4">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-be-orange rounded border-gray-300 focus:ring-be-orange" />
                    <span className="text-gray-700 font-medium">Email alerts for new Deals</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-be-orange rounded border-gray-300 focus:ring-be-orange" />
                    <span className="text-gray-700 font-medium">Leave Request approvals</span>
                  </label>
                </div>
              )}

              <div className="pt-6 border-t border-gray-100">
                <button type="submit" className="bg-be-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg font-medium flex items-center transition-colors">
                  <Save size={18} className="mr-2" /> Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

