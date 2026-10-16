import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InternalOperationsAllocationTable } from '../../components/crm/InternalOperationsAllocationTable';
import { getStoredInternalOperations } from '../../services/internalOperationsService';
import { useAuth } from '../../context/AuthContext';
import { Briefcase, Layers, ArrowLeft } from 'lucide-react';

export const InternalOperations = () => {
  const navigate = useNavigate();
  const { currentUser, isOperationsHOD, isLegalHOD, isSuperAdmin } = useAuth();
  const [stats, setStats] = useState({ total: 0, pending: 0, allocated: 0 });

  const updateStats = () => {
    const list = getStoredInternalOperations();
    setStats({
      total: list.length,
      pending: list.filter(r => r.Allocation_Status !== 'Allocated').length,
      allocated: list.filter(r => r.Allocation_Status === 'Allocated').length,
    });
  };

  useEffect(() => {
    updateStats();
    const handleUpdate = () => updateStats();
    window.addEventListener('be_internal_operations_updated', handleUpdate);
    return () => window.removeEventListener('be_internal_operations_updated', handleUpdate);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-be-orange flex items-center justify-center font-bold border border-orange-500/20 shadow-xs">
              <Layers size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-gray-900">Internal Operations</h1>
                <span className="px-2.5 py-0.5 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
                  {stats.total} {stats.total === 1 ? 'Service' : 'Services'}
                </span>
                {stats.pending > 0 && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold text-xs rounded-full border border-amber-200 animate-pulse">
                    {stats.pending} Pending
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                Operations Department delegation hub for delegating service lines to Team Leaders & Members
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/crm/deals')}
            className="flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-xs"
          >
            <Briefcase size={16} className="mr-2 text-be-orange" />
            View Deals
          </button>
        </div>
      </div>

      {/* Global Allocation Table Component */}
      <InternalOperationsAllocationTable mode="global" />
    </div>
  );
};
