import { BarChart3, TrendingUp, Users, FileText } from 'lucide-react';

export const Reports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">HRMS Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Analytics and insights for your workforce.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Employees</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Avg Attendance</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">0%</h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Leaves</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
            </div>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><FileText size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Payroll</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">₹0</h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><BarChart3 size={20} /></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
        <BarChart3 size={64} className="text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-800">Advanced Analytics Available Soon</h3>
        <p className="text-gray-500 max-w-md mt-2">
          We are aggregating your data to generate detailed insights. Add more employees, mark attendance, and process payroll to see charts here.
        </p>
      </div>
    </div>
  );
};
