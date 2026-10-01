import { ShieldCheck, AlertTriangle, FileCheck } from 'lucide-react';

export const Reports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quality Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Analytics for compliance and quality control.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Resolved Queries</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><ShieldCheck size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Issues</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
            </div>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg"><AlertTriangle size={20} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Avg Resolution Time</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">0h</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><FileCheck size={20} /></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
        <ShieldCheck size={64} className="text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-800">Quality Analytics</h3>
        <p className="text-gray-500 max-w-md mt-2">
          Resolve more queries to generate comprehensive quality charts.
        </p>
      </div>
    </div>
  );
};
