import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useData } from '../../hooks/useData';
import { UserRole } from '../../types';
import { FiUsers, FiBriefcase, FiShield, FiCpu, FiLoader, FiUserPlus, FiTrendingUp, FiChevronRight } from 'react-icons/fi';


const AdminDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, selectedWorkspace } = useAuthSession();
  const {
    users,
    workspaces,
    organizationSettings,
    organizationTokenUsage,
    orgTokenUsage,
    isAnalyticsLoading,
    preApprovedUsers,
  } = useData();

  const organizationUsage = useMemo(() => {
    if (user?.role !== UserRole.ORGANIZATION_ADMIN || !selectedWorkspace?.orgId || !organizationTokenUsage) {
        return null;
    }
    return organizationTokenUsage[selectedWorkspace.orgId];
  }, [user, selectedWorkspace, organizationTokenUsage]);

  const orgUsage = useMemo(() => {
      if (user?.role !== UserRole.WORKSPACE_ADMIN || !selectedWorkspace?.id || !orgTokenUsage) {
          return null;
      }
      return orgTokenUsage[selectedWorkspace.id];
  }, [user, selectedWorkspace, orgTokenUsage]);

  const tokenPercentage = useMemo(() => {
      const usage = user?.role === UserRole.ORGANIZATION_ADMIN ? organizationUsage : orgUsage;
      if (!usage || !usage.limit) return 0;
      return (usage.used / usage.limit) * 100;
  }, [user, organizationUsage, orgUsage]);

  // --- WorkHub Admin Metrics ---
  const organizationMetrics = useMemo(() => {
    if (user?.role !== UserRole.ORGANIZATION_ADMIN) return null;

    // New Users This Month
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const newUsersMonth = users.filter(u => {
        const created = (u as any).createdAt ? ((u as any).createdAt.seconds ? new Date((u as any).createdAt.seconds * 1000) : new Date((u as any).createdAt)) : null;
        return created && created >= startOfMonth;
    }).length;

    // WorkHub Performance
    const orgPerformance = workspaces
        .filter(org => !org.isPersonal && org.name !== 'Default Workspace')
        .map(org => {
            const orgId = org.id;
            const orgMembers = users.filter(u => u.workspaces?.some(o => o.id === orgId));
            const usage = orgTokenUsage?.[orgId];
            return {
                id: orgId,
                name: org.name,
                userCount: orgMembers.length,
                usedTokens: usage?.used || 0,
                tokenLimit: usage?.limit || 0
            };
        })
        .sort((a, b) => b.usedTokens - a.usedTokens);

    return {
        newUsersMonth,
        orgPerformance,
    };
  }, [user, users, workspaces, orgTokenUsage]);

  // --- WorkHub Manager Metrics ---
  const orgMetrics = useMemo(() => {
    if (user?.role !== UserRole.WORKSPACE_ADMIN) return null;

    const pendingInvites = preApprovedUsers.length;

    return {
      pendingInvites,
    };
  }, [user, preApprovedUsers]);

  if (!user || (user.role !== UserRole.ORGANIZATION_ADMIN && user.role !== UserRole.WORKSPACE_ADMIN && user.role !== UserRole.SYSTEM_ADMIN)) {
    return <div className="p-6 text-red-600">{t('admin.accessDenied')}</div>;
  }
  
  const totalUsers = users.length;
  const totalWorkspaces = workspaces.filter(org => !org.isPersonal).length;

  // For WorkHub Admins, the `users` list from useData() is scoped to their workspace.
  const managerOrgUsers = user.role === UserRole.WORKSPACE_ADMIN ? users.length : 0;


  const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className={`bg-white p-6 rounded-xl shadow-lg border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 uppercase">{title}</p>
          <p className="text-3xl font-bold text-gray-800">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${color.replace('border-','bg-').replace('-500','-100')} text-${color.split('-')[1]}-600`}>
          {icon}
        </div>
      </div>
    </div>
  );

  const currentUsage = user.role === UserRole.ORGANIZATION_ADMIN ? organizationUsage : orgUsage;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800">
            {user.role === UserRole.ORGANIZATION_ADMIN ? t('admin.organizationAdminDashboard') : user.role === UserRole.SYSTEM_ADMIN ? t('admin.systemAdminDashboard') : t('admin.managerDashboard', { name: user.selectedWorkspace?.name || t('admin.workspace') })}
          </h1>
        </div>
      </div>

      {/* Main Scrolling Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-6xl mx-auto">

        {user.role === UserRole.ORGANIZATION_ADMIN && (!organizationSettings?.description || (!organizationSettings?.contactEmail && !organizationSettings?.contactPhone)) && (
            <Link to="/admin/organization-hub">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 cursor-pointer rounded-r-lg shadow-sm">
                <p className="text-yellow-700">{t('admin.completeOrganizationDetails')}</p>
              </div>
            </Link>
          )}
          {(user.role === UserRole.ORGANIZATION_ADMIN || user.role === UserRole.WORKSPACE_ADMIN) && (
            <div className="mb-8 p-4 bg-purple-50 border border-purple-200 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-purple-800 mb-2 flex items-center">
                    <FiCpu className="mr-2"/> {user.role === UserRole.ORGANIZATION_ADMIN ? t('admin.organizationMonthlyTokenUsage') : t('admin.orgMonthlyTokenUsage')}
                </h2>
                {isAnalyticsLoading && !currentUsage ? (
                    <div className="flex justify-center items-center p-4">
                        <FiLoader className="animate-spin h-6 w-6 text-purple-500"/>
                    </div>
                ) : currentUsage ? (
                    <div className="w-full">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-purple-700">{currentUsage.used.toLocaleString()}</span>
                            <span className="text-gray-500">/ {currentUsage.limit ? currentUsage.limit.toLocaleString() : 'N/A'}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                                className={`h-2.5 rounded-full ${tokenPercentage > 100 ? 'bg-red-500' : 'bg-purple-600'}`} 
                                style={{ width: `${currentUsage.limit ? Math.min(tokenPercentage, 100) : 0}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {user.role === UserRole.ORGANIZATION_ADMIN
                                ? t('admin.organizationTokenUsageNote')
                                : t('admin.orgTokenUsageNote')}
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">{t('admin.tokenUsageNotAvailable')}</p>
                )}
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {user.role === UserRole.SYSTEM_ADMIN ? (
              <>
                <StatCard title={t('admin.totalAcademies')} value={workspaces.length} icon={<FiShield size={24}/>} color="border-purple-500" />
                <StatCard title={t('admin.totalUsers')} value={totalUsers} icon={<FiUsers size={24}/>} color="border-blue-500" />
                <StatCard title={t('admin.totalWorkspaces')} value={totalWorkspaces} icon={<FiBriefcase size={24}/>} color="border-green-500" />
              </>
          ) : user.role === UserRole.ORGANIZATION_ADMIN ? (
            <>
              <StatCard title={t('admin.totalUsers')} value={totalUsers} icon={<FiUsers size={24}/>} color="border-blue-500" />
              <StatCard title={t('admin.newThisMonth')} value={organizationMetrics?.newUsersMonth || 0} icon={<FiUserPlus size={24}/>} color="border-orange-500" />
              <StatCard title={t('admin.totalOrgs')} value={totalWorkspaces} icon={<FiBriefcase size={24}/>} color="border-purple-500" />
            </>
          ) : ( // WORKSPACE_ADMIN
            <>
              <StatCard title={t('admin.usersInOrg')} value={managerOrgUsers} icon={<FiUsers size={24}/>} color="border-blue-500" />
              <StatCard title={t('admin.pendingInvites')} value={orgMetrics?.pendingInvites || 0} icon={<FiUserPlus size={24}/>} color="border-orange-500" />
            </>
          )}
        </div>

        {user.role === UserRole.ORGANIZATION_ADMIN && organizationMetrics && (
            <div className="space-y-8">
                {/* WorkHub Performance Table */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center">
                            <FiTrendingUp className="mr-2 text-blue-500" /> {t('admin.orgPerformance')}
                        </h3>
                        <Link to="/admin/WorkHubs" className="text-sm text-blue-600 hover:text-blue-800 flex items-center font-medium">
                            {t('admin.manageOrgs')} <FiChevronRight className="ml-1 rtl-flip" />
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-3 font-semibold">{t('admin.workspace')}</th>
                                    <th className="px-6 py-3 font-semibold text-center">{t('admin.members')}</th>
                                    <th className="px-6 py-3 font-semibold text-left">{t('admin.tokenUsage')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {organizationMetrics.orgPerformance.length > 0 ? (
                                    organizationMetrics.orgPerformance.map(org => (
                                        <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-bold text-gray-800">{org.name}</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-sm text-gray-600">{org.userCount}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-col items-end min-w-[120px]">
                                                    <div className="flex justify-between w-full text-[11px] mb-1">
                                                        <span className="font-bold text-gray-700">{org.usedTokens.toLocaleString()}</span>
                                                        {org.tokenLimit > 0 ? (
                                                            <span className="text-gray-400">/ {org.tokenLimit.toLocaleString()}</span>
                                                        ) : (
                                                            <span className="text-gray-400">{t('admin.noLimit')}</span>
                                                        )}
                                                    </div>
                                                    {org.tokenLimit > 0 ? (
                                                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                            <div
                                                                className={`h-1.5 rounded-full ${ (org.usedTokens / org.tokenLimit) >= 1 ? 'bg-red-500' : 'bg-purple-500'}`}
                                                                style={{ width: `${Math.min((org.usedTokens / org.tokenLimit) * 100, 100)}%` }}
                                                            ></div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full bg-gray-50 rounded-full h-1.5 border border-gray-100"></div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-10 text-center text-gray-400 italic">{t('admin.noWorkspacesFound')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  </div>
);
};

export default AdminDashboardPage;