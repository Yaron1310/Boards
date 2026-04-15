import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { UserRole, User, Conversation, UserCourseProgress, Workspace } from '../../types';
import { FiUsers, FiBriefcase, FiBarChart2, FiMessageSquare, FiZap, FiBookOpen, FiShield, FiCpu, FiLoader, FiUserPlus, FiTrendingUp, FiClock, FiStar, FiActivity, FiPieChart, FiAward, FiChevronRight } from 'react-icons/fi';


const AdminDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, selectedOrganization } = useAuth();
  const { 
    users, 
    workspaces, 
    conversations, 
    workspaces, 
    academySettings, 
    academyTokenUsage, 
    orgTokenUsage, 
    isAnalyticsLoading,
    preApprovedUsers,
    organizationProgress,
    courses
  } = useData();

  const academyUsage = useMemo(() => {
    if (user?.role !== UserRole.ACADEMY_ADMIN || !selectedOrganization?.orgId || !academyTokenUsage) {
        return null;
    }
    return academyTokenUsage[selectedOrganization.orgId];
  }, [user, selectedOrganization, academyTokenUsage]);

  const orgUsage = useMemo(() => {
      if (user?.role !== UserRole.ORGANIZATION_ADMIN || !selectedOrganization?.id || !orgTokenUsage) {
          return null;
      }
      return orgTokenUsage[selectedOrganization.id];
  }, [user, selectedOrganization, orgTokenUsage]);

  const tokenPercentage = useMemo(() => {
      const usage = user?.role === UserRole.ACADEMY_ADMIN ? academyUsage : orgUsage;
      if (!usage || !usage.limit) return 0;
      return (usage.used / usage.limit) * 100;
  }, [user, academyUsage, orgUsage]);

  // --- Workspace Admin Metrics ---
  const academyMetrics = useMemo(() => {
    if (user?.role !== UserRole.ACADEMY_ADMIN) return null;

    // 1. Active Users (Last 30 Days) - Users with conversations or progress updates
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const usersWithConversations = new Set(
      conversations
        .filter(c => new Date(c.date) >= thirtyDaysAgo)
        .map(c => c.userId)
    );

    const usersWithProgress = new Set(
        organizationProgress
            .filter(p => {
                const updated = p.updatedAt ? (p.updatedAt.seconds ? new Date(p.updatedAt.seconds * 1000) : new Date(p.updatedAt)) : null;
                return updated && updated >= thirtyDaysAgo;
            })
            .map(p => p.userId)
    );

    const activeUserIds = new Set([...usersWithConversations, ...usersWithProgress]);
    const activeUsersCount = activeUserIds.size;

    // 2. New Users This Month
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Since users.createdAt is often a Timestamp or Date, we normalize
    const newUsersMonth = users.filter(u => {
        const created = u.createdAt ? (u.createdAt.seconds ? new Date(u.createdAt.seconds * 1000) : new Date(u.createdAt)) : null;
        return created && created >= startOfMonth;
    }).length;

    // 3. Workspace Performance
    const orgPerformance = workspaces
        .filter(org => !org.isPersonal && org.name !== 'Default Workspace')
        .map(org => {
            const orgId = org.id;
            const orgMembers = users.filter(u => u.workspaces?.some(o => o.id === orgId));
            const orgProgress = organizationProgress.filter(p => p.organizationId === orgId);
            
            // Average progress for this org
            let avgProgress = 0;
            if (orgProgress.length > 0) {
                const totalProgress = orgProgress.reduce((acc, curr) => {
                    const course = courses.find(c => c.id === curr.courseId);
                    const lessonCount = course?.lessonCount || 1;
                    return acc + (curr.completedLessons.length / lessonCount);
                }, 0);
                avgProgress = Math.round((totalProgress / orgProgress.length) * 100);
            }

            // Usage
            const usage = academyTokenUsage && orgTokenUsage?.[orgId];

            return {
                id: orgId,
                name: org.name,
                userCount: orgMembers.length,
                avgProgress,
                usedTokens: usage?.used || 0,
                tokenLimit: usage?.limit || 0
            };
        })
        .sort((a, b) => b.usedTokens - a.usedTokens);

    // 4. Top Courses (Workspace-wide)
    const courseStats = organizationProgress.reduce((acc, curr) => {
        acc[curr.courseId] = (acc[curr.courseId] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const topCourses = Object.entries(courseStats)
        .map(([id, count]) => ({
            id,
            count,
            name: courses.find(c => c.id === id)?.name || 'Unknown Course'
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 5. Most Popular Mentors (Workspace-wide)
    const mentorStats = conversations.reduce((acc, curr) => {
        acc[curr.personaName] = (acc[curr.personaName] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const topMentors = Object.entries(mentorStats)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 6. Recent Activity (Workspace-wide)
    const latestConversations = [...conversations]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map(c => {
            const user = users.find(u => u.id === c.userId);
            return {
                ...c,
                userName: user?.name || 'Unknown User'
            };
        });

    return {
        activeUsersCount,
        newUsersMonth,
        orgPerformance,
        topCourses,
        topMentors,
        latestConversations
    };
  }, [user, conversations, users, workspaces, organizationProgress, courses, academyTokenUsage, orgTokenUsage]);

  // --- Workspace Manager Metrics ---
  const orgMetrics = useMemo(() => {
    if (user?.role !== UserRole.ORGANIZATION_ADMIN) return null;

    // 1. Pending Invitations
    const pendingInvites = preApprovedUsers.length;

    // 2. Average Learning Progress
    let avgProgress = 0;
    if (organizationProgress.length > 0) {
      const totalProgress = organizationProgress.reduce((acc, curr) => {
        const course = courses.find(c => c.id === curr.courseId);
        const lessonCount = course?.lessonCount || 1;
        return acc + (curr.completedLessons.length / lessonCount);
      }, 0);
      avgProgress = Math.round((totalProgress / organizationProgress.length) * 100);
    }

    // 3. Active This Month (users with at least one conversation in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUserIds = new Set(
      conversations
        .filter(c => new Date(c.date) >= thirtyDaysAgo)
        .map(c => c.userId)
    );
    const activeThisMonth = activeUserIds.size;

    // 4. New Members (Last 5)
    const newMembers = [...users]
      .sort((a, b) => (b.id > a.id ? 1 : -1)) // Fallback to ID sorting if no createdAt
      .slice(0, 5);

    // 5. Latest Conversations (Last 5)
    const latestConversations = [...conversations]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    // 6. Top Courses (Most completions or most progress entries)
    const courseStats = organizationProgress.reduce((acc, curr) => {
      acc[curr.courseId] = (acc[curr.courseId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topCourses = Object.entries(courseStats)
      .map(([id, count]) => ({
        id,
        count,
        name: courses.find(c => c.id === id)?.name || 'Unknown Course'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // 7. Most Popular Mentors
    const mentorStats = conversations.reduce((acc, curr) => {
      acc[curr.personaName] = (acc[curr.personaName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topMentors = Object.entries(mentorStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      pendingInvites,
      avgProgress,
      activeThisMonth,
      newMembers,
      latestConversations,
      topCourses,
      topMentors
    };
  }, [user, preApprovedUsers, organizationProgress, courses, conversations, users]);

  if (!user || (user.role !== UserRole.ACADEMY_ADMIN && user.role !== UserRole.ORGANIZATION_ADMIN && user.role !== UserRole.SYSTEM_ADMIN)) {
    return <div className="p-6 text-red-600">{t('admin.accessDenied')}</div>;
  }
  
  const totalUsers = users.length;
  const totalOrganizations = workspaces.filter(org => !org.isPersonal).length;
  const totalConversations = conversations.length;

  // For Workspace Admins, the `users` and `conversations` lists from useData()
  // are already scoped to their workspace by the `fetchAllData` logic.
  const managerOrgUsers = user.role === UserRole.ORGANIZATION_ADMIN ? users.length : 0;
  const managerOrgConversations = user.role === UserRole.ORGANIZATION_ADMIN ? conversations.length : 0;


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

  const currentUsage = user.role === UserRole.ACADEMY_ADMIN ? academyUsage : orgUsage;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800">
            {user.role === UserRole.ACADEMY_ADMIN ? t('admin.academyAdminDashboard') : user.role === UserRole.SYSTEM_ADMIN ? t('admin.systemAdminDashboard') : t('admin.managerDashboard', { name: user.selectedOrganization?.name || t('admin.workspace') })}
          </h1>
        </div>
      </div>

      {/* Main Scrolling Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-6xl mx-auto">

        {user.role === UserRole.ACADEMY_ADMIN && (!academySettings?.description || (!academySettings?.contactEmail && !academySettings?.contactPhone)) && (
            <Link to="/admin/workspace-hub">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 cursor-pointer rounded-r-lg shadow-sm">
                <p className="text-yellow-700">{t('admin.completeAcademyDetails')}</p>
              </div>
            </Link>
          )}
          {(user.role === UserRole.ACADEMY_ADMIN || user.role === UserRole.ORGANIZATION_ADMIN) && (
            <div className="mb-8 p-4 bg-purple-50 border border-purple-200 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-purple-800 mb-2 flex items-center">
                    <FiCpu className="mr-2"/> {user.role === UserRole.ACADEMY_ADMIN ? t('admin.academyMonthlyTokenUsage') : t('admin.orgMonthlyTokenUsage')}
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
                            {user.role === UserRole.ACADEMY_ADMIN
                                ? t('admin.academyTokenUsageNote')
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
                <StatCard title={t('admin.totalOrganizations')} value={totalOrganizations} icon={<FiBriefcase size={24}/>} color="border-green-500" />
                <StatCard title={t('admin.totalConversations')} value={totalConversations} icon={<FiBarChart2 size={24}/>} color="border-indigo-500" />
              </>
          ) : user.role === UserRole.ACADEMY_ADMIN ? (
            <>
              <StatCard title={t('admin.totalUsers')} value={totalUsers} icon={<FiUsers size={24}/>} color="border-blue-500" />
              <StatCard title={t('admin.active30d')} value={academyMetrics?.activeUsersCount || 0} icon={<FiActivity size={24}/>} color="border-green-500" />
              <StatCard title={t('admin.newThisMonth')} value={academyMetrics?.newUsersMonth || 0} icon={<FiUserPlus size={24}/>} color="border-orange-500" />
              <StatCard title={t('admin.totalOrgs')} value={totalOrganizations} icon={<FiBriefcase size={24}/>} color="border-purple-500" />
            </>
          ) : ( // ORGANIZATION_ADMIN
            <>
              <StatCard title={t('admin.usersInOrg')} value={managerOrgUsers} icon={<FiUsers size={24}/>} color="border-blue-500" />
              <StatCard title={t('admin.pendingInvites')} value={orgMetrics?.pendingInvites || 0} icon={<FiUserPlus size={24}/>} color="border-orange-500" />
              <StatCard title={t('admin.avgProgress')} value={`${orgMetrics?.avgProgress || 0}%`} icon={<FiTrendingUp size={24}/>} color="border-green-500" />
              <StatCard title={t('admin.activeThisMonth')} value={orgMetrics?.activeThisMonth || 0} icon={<FiUsers size={24}/>} color="border-indigo-500" />
            </>
          )}
        </div>

        {user.role === UserRole.ACADEMY_ADMIN && academyMetrics && (
            <div className="space-y-8">
                {/* Workspace Performance Table */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center">
                            <FiTrendingUp className="mr-2 text-blue-500" /> {t('admin.orgPerformance')}
                        </h3>
                        <Link to="/admin/workspaces" className="text-sm text-blue-600 hover:text-blue-800 flex items-center font-medium">
                            {t('admin.manageOrgs')} <FiChevronRight className="ml-1 rtl-flip" />
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-3 font-semibold">{t('admin.workspace')}</th>
                                    <th className="px-6 py-3 font-semibold text-center">{t('admin.members')}</th>
                                    <th className="px-6 py-3 font-semibold text-center">{t('admin.avgProgress')}</th>
                                    <th className="px-6 py-3 font-semibold text-left">{t('admin.tokenUsage')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {academyMetrics.orgPerformance.length > 0 ? (
                                    academyMetrics.orgPerformance.map(org => (
                                        <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-bold text-gray-800">{org.name}</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-sm text-gray-600">{org.userCount}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center">
                                                    <div className="w-16 bg-gray-200 rounded-full h-1.5 mr-2">
                                                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${org.avgProgress}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-semibold text-gray-700">{org.avgProgress}%</span>
                                                </div>
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
                                        <td colSpan={4} className="px-6 py-10 text-center text-gray-400 italic">{t('admin.noOrganizationsFound')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Second Row: Top Content & Mentors */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                            <FiAward className="mr-2 text-yellow-500" /> {t('admin.topCoursesAcademy')}
                        </h3>
                        <div className="space-y-4">
                            {academyMetrics.topCourses.length > 0 ? (
                                academyMetrics.topCourses.map((course, idx) => (
                                    <div key={course.id} className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <span className="w-6 h-6 flex items-center justify-center bg-yellow-50 text-yellow-700 rounded-full text-xs font-bold mr-3">{idx + 1}</span>
                                            <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{course.name}</span>
                                        </div>
                                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
                                            {t('admin.activeLearners', { count: course.count })}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-400 text-sm italic">{t('admin.noCourseData')}</p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                            <FiStar className="mr-2 text-purple-500" /> {t('admin.mostPopularMentors')}
                        </h3>
                        <div className="space-y-4">
                            {academyMetrics.topMentors.length > 0 ? (
                                academyMetrics.topMentors.map((mentor, idx) => (
                                    <div key={mentor.name} className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <span className="w-6 h-6 flex items-center justify-center bg-purple-50 text-purple-700 rounded-full text-xs font-bold mr-3">{idx + 1}</span>
                                            <span className="text-sm font-medium text-gray-700">{mentor.name}</span>
                                        </div>
                                        <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-full">
                                            {t('admin.sessions', { count: mentor.count })}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-400 text-sm italic">{t('admin.noMentorData')}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Third Row: Recent Activity */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                        <FiClock className="mr-2 text-indigo-500" /> {t('admin.recentAcademyActivity')}
                    </h3>
                    <div className="space-y-3">
                        {academyMetrics.latestConversations.length > 0 ? (
                            academyMetrics.latestConversations.map(conv => (
                                <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                                    <div className="flex items-center">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 mr-4">
                                            <FiMessageSquare />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-800">{conv.userName}</p>
                                            <p className="text-xs text-gray-500">{t('admin.chattedWith')} <span className="font-semibold">{conv.personaName}</span></p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">{new Date(conv.date).toLocaleDateString()} {new Date(conv.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-400 text-sm italic">{t('admin.noRecentActivity')}</p>
                        )}
                    </div>
                </div>
            </div>
        )}

        {user.role === UserRole.ORGANIZATION_ADMIN && orgMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <StatCard title={t('admin.totalConversations')} value={managerOrgConversations} icon={<FiBarChart2 size={24}/>} color="border-purple-500" />

            {/* Recent Activity Card */}
            <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500 flex flex-col">
                  <p className="text-sm font-medium text-gray-500 uppercase mb-3 flex items-center">
                    <FiClock className="mr-2" /> {t('admin.recentActivity')}
                  </p>
                  <div className="space-y-2 flex-grow overflow-hidden">
                    {orgMetrics?.latestConversations && orgMetrics.latestConversations.length > 0 ? (
                      orgMetrics.latestConversations.slice(0, 3).map(conv => (
                        <div key={conv.id} className="flex items-center justify-between text-xs border-b border-gray-50 pb-1 last:border-0">
                          <span className="font-medium text-gray-700 truncate mr-2">{conv.personaName}</span>
                          <span className="text-gray-400 whitespace-nowrap">{new Date(conv.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 text-xs italic">{t('admin.noActivityYet')}</p>
                    )}
                  </div>
              </div>

            {/* Insights Row */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <FiBookOpen className="mr-2 text-green-500" /> {t('admin.topCourses')}
              </h3>
              <div className="space-y-4">
                {orgMetrics.topCourses.length > 0 ? (
                  orgMetrics.topCourses.map(course => (
                    <div key={course.id} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{course.name}</span>
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
                        {t('admin.active', { count: course.count })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm italic">{t('admin.noCourseData')}</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <FiStar className="mr-2 text-purple-500" /> {t('admin.mostPopularMentors')}
              </h3>
              <div className="space-y-4">
                {orgMetrics.topMentors.length > 0 ? (
                  orgMetrics.topMentors.map(mentor => (
                    <div key={mentor.name} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{mentor.name}</span>
                      <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-full">
                        {t('admin.chats', { count: mentor.count })}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm italic">{t('admin.noMentorData')}</p>
                )}
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