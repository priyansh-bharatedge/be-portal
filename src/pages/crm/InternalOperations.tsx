import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InternalOperationsAllocationTable, checkUserMatchesStaff } from '../../components/crm/InternalOperationsAllocationTable';
import { getStoredInternalOperations } from '../../services/internalOperationsService';
import { useAuth } from '../../context/AuthContext';
import { Briefcase, Layers, ShieldCheck, UserCheck } from 'lucide-react';

export const InternalOperations = () => {
  const navigate = useNavigate();
  const { currentUser, isOperationsHOD, isLegalHOD, isSuperAdmin, isSales } = useAuth();
  const [stats, setStats] = useState({ total: 0, pending: 0, allocated: 0, myAssigned: 0 });

  const isSalesDeptUser = !isSuperAdmin && Boolean(
    isSales || 
    (currentUser?.department && (
      currentUser.department.toLowerCase().includes('sale') || 
      currentUser.department.toLowerCase().includes('bdm') || 
      currentUser.department.toLowerCase().includes('business dev')
    ))
  );

  useEffect(() => {
    if (isSalesDeptUser) {
      navigate('/crm/deals', { replace: true });
    }
  }, [isSalesDeptUser, navigate]);

  const isIndividualContributor = !isSuperAdmin && !isOperationsHOD && !isLegalHOD;

  const updateStats = () => {
    const list = getStoredInternalOperations();
    const myCount = list.filter(r => 
      checkUserMatchesStaff(currentUser, r.Team_Leader, r.Team_Leader_ID, r.Team_Leader_Name) ||
      checkUserMatchesStaff(currentUser, r.Team_Member, r.Team_Member_ID, r.Team_Member_Name)
    ).length;

    setStats({
      total: list.length,
      pending: list.filter(r => r.Allocation_Status !== 'Allocated').length,
      allocated: list.filter(r => r.Allocation_Status === 'Allocated').length,
      myAssigned: myCount
    });
  };

  useEffect(() => {
    updateStats();
    const handleUpdate = () => updateStats();
    window.addEventListener('be_internal_operations_updated', handleUpdate);
    return () => window.removeEventListener('be_internal_operations_updated', handleUpdate);
  }, [currentUser]);

  if (isSalesDeptUser) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border shadow-xs ${
              isIndividualContributor
                ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                : isLegalHOD
                ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                : 'bg-orange-500/10 text-be-orange border-orange-500/20'
            }`}>
              {isIndividualContributor ? <UserCheck size={22} /> : isLegalHOD ? <ShieldCheck size={22} /> : <Layers size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">
                  {isIndividualContributor
                    ? 'Operations Execution Workspace'
                    : isLegalHOD
                    ? 'Internal Operations'
                    : 'Internal Operations Delegation Hub'}
                </h1>
                
                {isIndividualContributor ? (
                  <>
                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-full border border-blue-200">
                      {stats.myAssigned} Assigned {stats.myAssigned === 1 ? 'Service' : 'Services'}
                    </span>
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full border border-emerald-200">
                      Team Member View
                    </span>
                  </>
                ) : (
                  <>
                    <span className="px-2.5 py-0.5 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
                      {stats.total} {stats.total === 1 ? 'Service' : 'Services'}
                    </span>
                    {stats.pending > 0 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold text-xs rounded-full border border-amber-200 animate-pulse">
                        {stats.pending} Pending
                      </span>
                    )}
                    {isLegalHOD && (
                      <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full border border-indigo-200">
                        Legal Supervisory View
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {isIndividualContributor
                  ? 'Manage and execute your assigned service allocations, update process stages, and upload compliance documents'
                  : isLegalHOD
                  ? 'Supervisory auditing of service lines transferred from Legal Department to Operations'
                  : 'Operations Department delegation hub for delegating service lines to Team Leaders & Members'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/crm/deals')}
            className="flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-xs cursor-pointer"
          >
            <Briefcase size={16} className="mr-2 text-be-orange" />
            View Deals
          </button>
        </div>
      </div>

      {/* Global Allocation Table Component (with hideCardHeader to prevent duplicate headers) */}
      <InternalOperationsAllocationTable mode="global" hideCardHeader={true} />
    </div>
  );
};
