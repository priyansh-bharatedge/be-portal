import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLE_DEFINITIONS } from '../types/roles';
import type { SystemRole, AuthUser } from '../types/roles';
import { X, Check, Shield, Users, Crown, Briefcase, User, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RoleSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({ isOpen, onClose }) => {
  const { currentRole, switchRole, availableUsers, switchUser, currentUser, isSuperAdmin } = useAuth();

  const isSuperAdminUser = isSuperAdmin || 
                           currentRole === 'Super Admin' || 
                           (currentUser.role as string) === 'Super Admin' || 
                           currentUser.email?.toLowerCase() === 'superadmin@be.com' ||
                           currentUser.email === 'md@bharat-edge.com';

  if (!isSuperAdminUser) {
    return null;
  }

  const roleIcons: Record<SystemRole, React.ReactNode> = {
    'Super Admin': <Crown className="w-5 h-5 text-purple-600" />,
    'HR': <UserCheck className="w-5 h-5 text-rose-600" />,
    'HOD': <Shield className="w-5 h-5 text-blue-600" />,
    'TL': <Briefcase className="w-5 h-5 text-amber-600" />,
    'TM': <User className="w-5 h-5 text-emerald-600" />
  };

  const roles: SystemRole[] = ['Super Admin', 'HR', 'HOD', 'TL', 'TM'];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-orange-50/30">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-be-orange font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Switch System Role & User</h2>
                  <p className="text-xs text-gray-500 font-medium">Test Role-Based Access Control (RBAC) across the portal</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {/* Role Level Cards */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                  1. Select Role Hierarchy Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {roles.map((role) => {
                    const info = ROLE_DEFINITIONS[role];
                    const isSelected = currentRole === role;
                    return (
                      <div
                        key={role}
                        onClick={() => {
                          switchRole(role);
                        }}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? `${info.borderClass} ${info.bgClass} shadow-md`
                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2.5">
                            <div className="p-2 rounded-xl bg-white shadow-sm border border-gray-100">
                              {roleIcons[role]}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900 flex items-center">
                                {info.label}
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                Level {info.level} of 4
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center">
                              <Check size={12} strokeWidth={3} />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 font-medium mt-1 leading-relaxed">
                          {info.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Specific Users for this role */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                  2. Or Switch to a Specific Employee in Organization
                </label>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {availableUsers.map((user: AuthUser) => {
                    const isCurrent = currentUser.id === user.id;
                    const rInfo = (user.role && ROLE_DEFINITIONS[user.role as SystemRole]) || ROLE_DEFINITIONS['TM'];
                    return (
                      <div
                        key={user.id}
                        onClick={() => {
                          switchUser(user);
                          onClose();
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isCurrent
                            ? 'border-be-orange bg-orange-50/60 shadow-sm'
                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center font-bold text-xs border border-orange-200">
                            {user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                              <span>{user.name}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rInfo.badgeClass}`}>
                                {rInfo.shortLabel}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 font-medium">
                              {user.empId} • {user.department} • {user.designation}
                              {user.teamLeaderName && (
                                <span className="text-amber-700 ml-1">
                                  (TL: {user.teamLeaderName})
                                </span>
                              )}
                              {user.reportingManagerName && !user.teamLeaderName && (
                                <span className={user.reportingManagerName.includes('Super Admin') ? 'text-purple-700 ml-1' : 'text-blue-700 ml-1'}>
                                  ({user.reportingManagerName.includes('Super Admin') ? 'Super Admin: ' : 'Admin/HOD: '}{user.reportingManagerName})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isCurrent ? (
                          <span className="text-xs font-bold text-be-orange bg-orange-100/70 px-2.5 py-1 rounded-full">
                            Active User
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Switch to User
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hierarchy Visualizer */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Role Hierarchy Chain
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="px-3 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200 flex items-center">
                    👑 Super Admin
                  </span>
                  <span className="text-gray-400 font-bold">➔</span>
                  <span className="px-3 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 flex items-center">
                    💼 HR Admin
                  </span>
                  <span className="text-gray-400 font-bold">➔</span>
                  <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200 flex items-center">
                    🏢 Admin (HOD)
                  </span>
                  <span className="text-gray-400 font-bold">➔</span>
                  <span className="px-3 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 flex items-center">
                    👔 Team Leader (TL)
                  </span>
                  <span className="text-gray-400 font-bold">➔</span>
                  <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center">
                    👤 Team Member (TM)
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold transition-all shadow-sm"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
