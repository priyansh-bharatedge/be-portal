import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { InternalOperationsAllocationTable, checkRecordAssignedToUser } from '../../components/crm/InternalOperationsAllocationTable';
import { OperationsDashboardView } from '../../components/crm/OperationsDashboardView';
import { getStoredInternalOperations } from '../../services/internalOperationsService';
import { useAuth } from '../../context/AuthContext';
import { Briefcase, Layers, ShieldCheck, UserCheck, BarChart3 } from 'lucide-react';

export const InternalOperations = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'dashboard' ? 'dashboard' : 'allocations';
  const [activeTab, setActiveTab] = useState<'allocations' | 'dashboard'>(initialTab);
  const { currentUser, isOperationsHOD, isLegalHOD, isSuperAdmin, isSales, isTL, isTM } = useAuth();
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
  const isTeamLeader = Boolean(
    isTL || 
    currentUser?.role === 'TL' || 
    currentUser?.role?.includes('Team Leader') || 
    currentUser?.designation?.includes('TL') || 
    currentUser?.designation?.includes('Leader')
  );
  const isTeamMember = Boolean(
    currentUser?.role === 'TM' ||
    (currentUser as any)?.systemRole === 'TM' ||
    isTM ||
    (isIndividualContributor && !isTeamLeader)
  );

  const updateStats = () => {
    const list = getStoredInternalOperations();
    const myCount = list.filter(r => checkRecordAssignedToUser(r, currentUser)).length;

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
                      {isTeamLeader ? 'Team Leader View' : 'Team Member View'}
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
                {isTeamMember
                  ? 'Manage and execute your assigned child records, update process stages, and upload compliance documents'
                  : isTeamLeader
                  ? 'Oversee and assign service allocations for your team members, monitor execution, and update stages'
                  : isLegalHOD
                  ? 'Supervisory auditing of service lines transferred from Legal Department to Operations'
                  : 'Operations Department delegation hub for delegating service lines to Team Leaders & Members'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Navigation Tabs */}
          <div className="flex items-center p-1 bg-gray-100 rounded-2xl border border-gray-200 text-xs font-bold">
            <button
              onClick={() => {
                setActiveTab('allocations');
                setSearchParams({});
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'allocations'
                  ? 'bg-white text-gray-900 shadow-sm font-extrabold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Layers size={14} />
              <span>Delegation Hub</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setSearchParams({ tab: 'dashboard' });
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-be-orange to-amber-600 text-white shadow-sm font-extrabold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <BarChart3 size={14} />
              <span>HOD Dashboard</span>
            </button>
          </div>

          <button
            onClick={() => navigate('/crm/deals')}
            className="flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-xs cursor-pointer"
          >
            <Briefcase size={16} className="mr-2 text-be-orange" />
            View Deals
          </button>
        </div>
      </div>

      {/* Body View: Tab Switch */}
      {activeTab === 'dashboard' ? (
        <OperationsDashboardView />
      ) : (
        <InternalOperationsAllocationTable mode="global" hideCardHeader={true} />
      )}
    </div>
  );
};
