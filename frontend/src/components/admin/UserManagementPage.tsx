
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { User } from '../../types'; 
import { UserRole } from '../../types'; 
import { FiSearch, FiFilter, FiChevronDown, FiUsers, FiBookOpen, FiCpu, FiLoader, FiUserPlus, FiShare, FiAlertTriangle, FiCheckCircle, FiAlertCircle, FiShield, FiMessageSquare } from 'react-icons/fi';
import QuestionnaireIcon from '../common/QuestionnaireIcon';
import PreApproveUsersModal from './PreApproveUsersModal';
import TutorialSection from '../common/TutorialSection';
import AcademyAdminsModal from './AcademyAdminsModal';
import { useUsersInfiniteQuery } from '../../hooks/queries/useUserQueries';
import { List } from 'react-window';
import { InfiniteLoader } from 'react-window-infinite-loader';
import { AutoSizer } from 'react-virtualized-auto-sizer';

const exportToCSV = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) return;
    const escape = (v: unknown) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = Object.keys(rows[0]);
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
};

const TokenUsageBar: React.FC<{ used: number; limit: number | null }> = ({ used, limit }) => {
    const formatTokens = (tokens: number) => {
        if (tokens < 1000) {
            return tokens.toLocaleString();
        }
        return `${(tokens / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
    };

    if (limit === null) {
        return <>{formatTokens(used)}</>;
    }

    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    const isOverLimit = percentage > 100;

    return (
        <div className="w-full">
            <div className="flex justify-between text-xs mb-1">
                <span>{formatTokens(used)}</span>
                <span className="text-gray-500">/ {formatTokens(limit)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                    className={`h-2 rounded-full ${isOverLimit ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                ></div>
            </div>
        </div>
    );
};


const UserManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user: authUser, selectedOrganization } = useAuth();
  const { 
    organizations,
    plans,
    preApprovedUsers,
    conversations: allConversations, 
    courses, 
    questionnaires,
    organizationProgress,
    userTokenUsage,
    fetchUserTokenUsage,
    isAnalyticsLoading,
    tutorialSettings
  } = useData(); 
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState<string>(''); 
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  
  const [showPreApproveModal, setShowPreApproveModal] = useState(false);
  const [showAcademyAdminsModal, setShowAcademyAdminsModal] = useState(false);
  
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isUsersLoading,
    isError: isUsersError,
  } = useUsersInfiniteQuery({
    search: debouncedSearch,
    organizationId: filterOrg,
    role: filterRole
  }, !!authUser);

  const allUsers = useMemo(() => {
    return infiniteData?.pages.flatMap(page => page.data) ?? [];
  }, [infiniteData]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const orgForPreApproval = useMemo(() => {
    if (authUser?.role === UserRole.ORGANIZATION_ADMIN) {
        return selectedOrganization;
    }
    return null;
  }, [authUser, selectedOrganization]);

  const handleOpenPreApproveModal = () => {
    if (orgForPreApproval) setShowPreApproveModal(true);
  };
  
  const months = useMemo(() => Array.from({length: 12}, (_, i) => ({ value: i + 1, name: new Date(0, i).toLocaleString('default', { month: 'long' }) })), []);
  const years = useMemo(() => {
      const currentYear = new Date().getFullYear();
      return Array.from({length: 5}, (_, i) => currentYear - i);
  }, []);

  useEffect(() => {
    const yearNum = filterYear ? parseInt(filterYear, 10) : undefined;
    const monthNum = filterMonth ? parseInt(filterMonth, 10) : undefined;
    fetchUserTokenUsage(monthNum, yearNum);
  }, [filterYear, filterMonth, fetchUserTokenUsage]);
  
  const { maxUsers, currentRegularUsersCount, pendingInvitesCount } = useMemo(() => {
    if (authUser?.role !== UserRole.ORGANIZATION_ADMIN || !selectedOrganization || !plans || !allUsers || !preApprovedUsers) {
        return { maxUsers: null, currentRegularUsersCount: 0, pendingInvitesCount: 0 };
    }
    const plan = plans.find(p => p.id === selectedOrganization.planId);
    if (!plan || !plan.maxUsers || plan.maxUsers === 0) {
        return { maxUsers: null, currentRegularUsersCount: allUsers.length, pendingInvitesCount: preApprovedUsers.length }; // Unlimited
    }

    const regularUsers = allUsers.filter(u => {
        if (u.dbRoles?.organizationAdmin?.includes(selectedOrganization.id)) return false;
        if (u.dbRoles?.academyAdmin?.includes(selectedOrganization.academyId)) return false;
        if (u.dbRoles?.systemAdmin) return false;
        return true;
    });

    const pendingCount = preApprovedUsers.filter(p => p.organizationId === selectedOrganization.id).length;
    
    return { 
        maxUsers: plan.maxUsers, 
        currentRegularUsersCount: regularUsers.length,
        pendingInvitesCount: pendingCount
    };
  }, [authUser, selectedOrganization, plans, allUsers, preApprovedUsers]);

  
  if (!authUser || (authUser.role !== UserRole.ACADEMY_ADMIN && authUser.role !== UserRole.ORGANIZATION_ADMIN && authUser.role !== UserRole.SYSTEM_ADMIN)) {
    navigate('/chat'); 
    return null;
  }

  const getUserCourseProgress = (u: User) => {
    if (u.completedCourseCount !== undefined) {
        return `${u.completedCourseCount} / ${courses.length}`;
    }
    const userProgress = organizationProgress.filter(p => p.userId === u.id && p.status === 'completed');
    return `${userProgress.length} / ${courses.length}`;
  };

  const handleExportToExcel = () => {
    // Note: For very large datasets, we should fetch all pages or use a server-side export.
    // For now, we export the loaded pages.
    const dataForExport = allUsers.map(u => {
        const usage = userTokenUsage?.[u.id];
        const courseProgress = getUserCourseProgress(u).split(' / ');
        const completedQuestionnaires = u.completedQuestionnairesCount || 0;
        const totalQuestionnaires = questionnaires.length;
        const userConversationCount = u.conversationCount !== undefined ? u.conversationCount : allConversations.filter(conv => conv.userId === u.id).length;
        
        return {
            'Name': u.name,
            'Email': u.email,
            'Role': u.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            'Organization(s)': u.organizations.filter(o => !o.isPersonal).map(o => o.name).join(', '),
            'Conversations': userConversationCount,
            'Completed Courses': courseProgress[0] ? parseInt(courseProgress[0], 10) : 0,
            'Total Courses': courseProgress[1] ? parseInt(courseProgress[1], 10) : courses.length,
            'Completed Questionnaires': completedQuestionnaires,
            'Total Questionnaires': totalQuestionnaires,
            'Tokens Used': usage ? usage.used : 0,
            'Token Limit': usage?.limit === null ? 'Unlimited' : (usage?.limit ?? 0)
        };
    });

    exportToCSV(dataForExport, "Gymind_Users_Export.csv");
  };

  const isItemLoaded = (index: number) => !hasNextPage || index < allUsers.length;
  const loadMoreItems = isFetchingNextPage ? () => Promise.resolve() : () => fetchNextPage();

  const UserRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    if (!isItemLoaded(index)) {
        return (
            <div style={style} className="flex items-center justify-center py-4 border-b border-gray-200 bg-white">
                <FiLoader className="animate-spin text-blue-500" size={24} />
            </div>
        );
    }

    const u = allUsers[index];
    if (!u) return null;

    const userConversationCount = u.conversationCount !== undefined ? u.conversationCount : allConversations.filter(conv => conv.userId === u.id).length;
    const courseProgress = getUserCourseProgress(u);
    const usage = userTokenUsage?.[u.id];
    const completedQuestionnaires = u.completedQuestionnairesCount || 0;
    const totalQuestionnaires = questionnaires.length;
    const questionnaireProgress = `${completedQuestionnaires} / ${totalQuestionnaires}`;

    return (
        <div 
            style={style}
            className="flex hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-200 bg-white"
            onClick={() => navigate(`/admin/users/${u.id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/admin/users/${u.id}`)}
            tabIndex={0}
            title="View profile page"
        >
            <div className="flex-[2] px-6 py-4 flex items-center min-w-0">
                <div className="flex-shrink-0 h-10 w-10">
                    <img className="h-10 w-10 rounded-full object-cover" src={u.profileImageUrl || `/default_user.webp`} 
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)}
                    alt={`${u.name}'s profile picture`} />
                </div>
                <div className="ml-4 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                    <div className="text-xs text-gray-500 capitalize">
                        {t('common.role')}: {u.role.replace(/_/g, ' ')}
                    </div>
                </div>
            </div>
            <div className="flex-[1.5] px-6 py-4 text-sm text-gray-700 flex items-center truncate">
                {u.organizationName || 'N/A'}
            </div>
            <div className="flex-1 px-6 py-4 text-sm text-gray-700 flex items-center justify-center">
                <div className="flex items-center" title="Total Conversations">
                    <FiMessageSquare className="mr-2 text-blue-500" size="1em"/> {userConversationCount}
                </div>
            </div>
            <div className="flex-1 px-6 py-4 text-sm text-gray-700 flex items-center justify-center">
                <div className="flex items-center" title="Completed Courses">
                    <FiBookOpen className="mr-2 text-blue-500" size="1em"/> {courseProgress}
                </div>
            </div>
            <div className="flex-1 px-6 py-4 text-sm text-gray-700 flex items-center justify-center">
                <div className="flex items-center" title="Completed Questionnaires">
                    <QuestionnaireIcon className="mr-2 text-blue-500" size="1em" /> {questionnaireProgress}
                </div>
            </div>
            <div className="flex-[1.5] px-6 py-4 text-sm text-gray-700 flex items-center justify-center min-w-[150px]">
                {isAnalyticsLoading ? <FiLoader className="animate-spin h-4 w-4 mx-auto"/> : 
                    usage ? <TokenUsageBar used={usage.used} limit={usage.limit} /> : '0'
                }
            </div>
        </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-100 overflow-hidden">
      {/* Sticky Header */}
      <div className="bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4 shrink-0">
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center mb-2 sm:mb-0">
                    <FiUsers className="mr-3 text-blue-500"/>{t('admin.userManagement')}
                </h1>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                    {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                        <button
                        onClick={handleOpenPreApproveModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                        title="Pre-approve new users for your organization"
                        >
                        <FiUserPlus className="mr-2" /> {t('admin.preApproveUsers')}
                        </button>
                    )}
                    {authUser.role === UserRole.ACADEMY_ADMIN && (
                        <button
                        onClick={() => setShowAcademyAdminsModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                        title="Manage admins for your academy"
                        >
                        <FiShield className="mr-2" /> {t('admin.manageAcademyAdmins')}
                        </button>
                    )}
                    <button
                      onClick={handleExportToExcel}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                      title="Export current user list to an Excel file"
                    >
                      <FiShare className="mr-2" /> {t('common.export')}
                    </button>
                </div>
            </div>
            <TutorialSection videoUrl={tutorialSettings?.users?.videoUrl} />
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-8 pb-4 flex-grow flex flex-col min-h-0 overflow-hidden">
        <div className="max-w-6xl mx-auto w-full flex-grow flex flex-col overflow-hidden">
            {feedback && (
                <div className={`p-3 mb-4 rounded-md flex items-center text-sm shrink-0 ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                    {feedback.text}
                    <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label="Dismiss">&times;</button>
                </div>
            )}

            <div className="mb-6 bg-white p-4 rounded-lg shadow w-full space-y-4 shrink-0">
                <div className="flex items-center gap-6">
                    <h2 className="text-xl font-semibold text-gray-700">{t('common.filters')}</h2>
                    <button
                        onClick={() => { setSearchTerm(''); setFilterOrg(''); setFilterRole(''); setFilterYear(''); setFilterMonth(''); }}
                        className="text-sm text-blue-600 border border-blue-600 hover:bg-blue-50 font-medium px-3 py-1 rounded-md transition-colors"
                        aria-label={t('common.resetFilters')}
                    >
                        {t('common.resetFilters')}
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                        <label htmlFor="user-search" className="sr-only">Search by name or email</label>
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FiSearch className="h-5 w-5 text-gray-400" />
                        </span>
                        <input
                            id="user-search"
                            type="text"
                            placeholder={t('admin.searchByNameOrEmail')}
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Search users"
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {(authUser.role === UserRole.ACADEMY_ADMIN || authUser.role === UserRole.SYSTEM_ADMIN) && ( 
                            <div className="relative">
                                <label htmlFor="org-filter-users" className="sr-only">Filter by organization</label>
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FiFilter className="h-5 w-5 text-gray-400" />
                                </span>
                                <select 
                                    id="org-filter-users"
                                    value={filterOrg}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterOrg(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                    aria-label="Filter by organization"
                                >
                                    <option value="">{t('admin.allOrganizations')}</option>
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <FiChevronDown className="h-5 w-5 text-gray-400" />
                                </span>
                            </div>
                        )}
                        
                        <div className="relative">
                            <label htmlFor="role-filter" className="sr-only">Filter by role</label>
                            <select
                                id="role-filter"
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                aria-label="Filter by role"
                            >
                                <option value="">{t('admin.allRoles')}</option>
                                {Object.values(UserRole).map(role => (
                                    <option key={role} value={role}>{role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                                ))}
                            </select>
                            <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <FiChevronDown className="h-5 w-5 text-gray-400" />
                            </span>
                        </div>
                    </div>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.tokenUsagePeriodFilter')}</label>
                    <div className="grid grid-cols-2 gap-4">
                        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white" aria-label="Filter by month">
                            <option value="">{t('common.allMonths')}</option>
                            {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                        </select>
                        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white" aria-label="Filter by year">
                            <option value="">{t('common.allYears')}</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex-grow flex flex-col bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="flex bg-gray-50 border-b border-gray-200 shrink-0 font-medium text-xs text-gray-500 uppercase tracking-wider">
                    <div className="flex-[2] px-6 py-3 text-left">{t('common.name')}</div>
                    <div className="flex-[1.5] px-6 py-3 text-left">{t('common.organization')}</div>
                    <div className="flex-1 px-6 py-3 text-center">{t('admin.conv')}</div>
                    <div className="flex-1 px-6 py-3 text-center">{t('admin.courses')}</div>
                    <div className="flex-1 px-6 py-3 text-center">{t('questionnaire.title')}</div>
                    <div className="flex-[1.5] px-6 py-3 text-center min-w-[150px]">
                        <div className="flex items-center justify-center">
                            <FiCpu className="mr-1.5" /> {t('admin.tokensK')}
                        </div>
                    </div>
                </div>

                <div className="flex-grow min-h-0">
                    {isUsersLoading && !infiniteData ? (
                        <div className="flex items-center justify-center h-full">
                            <FiLoader className="animate-spin text-blue-500" size={48} />
                        </div>
                    ) : isUsersError ? (
                        <div className="flex items-center justify-center h-full text-red-500">
                            <FiAlertTriangle className="mr-2" /> {t('admin.errorLoadingUsers')}
                        </div>
                    ) : allUsers.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <FiUsers size={48} className="mx-auto mb-4 opacity-50" />
                            <p className="text-lg">{t('admin.noUsersFound')}</p>
                        </div>
                    ) : (
                        <AutoSizer>
                            {({ height, width }) => (
                                <InfiniteLoader
                                    isItemLoaded={isItemLoaded}
                                    itemCount={hasNextPage ? allUsers.length + 1 : allUsers.length}
                                    loadMoreItems={loadMoreItems}
                                >
                                    {({ onItemsRendered, ref }) => (
                                        <List
                                            height={height}
                                            itemCount={hasNextPage ? allUsers.length + 1 : allUsers.length}
                                            itemSize={72}
                                            onItemsRendered={onItemsRendered}
                                            ref={ref}
                                            width={width}
                                            className="custom-scrollbar"
                                        >
                                            {UserRow}
                                        </List>
                                    )}
                                </InfiniteLoader>
                            )}
                        </AutoSizer>
                    )}
                </div>
            </div>
        </div>
      </div>
      
      {showPreApproveModal && orgForPreApproval && (
        <PreApproveUsersModal 
            isOpen={showPreApproveModal} 
            onClose={() => setShowPreApproveModal(false)} 
            organization={orgForPreApproval} 
            maxUsers={maxUsers}
            currentRegularUsersCount={currentRegularUsersCount}
            pendingInvitesCount={pendingInvitesCount}
        />
      )}
      
      {showAcademyAdminsModal && (
        <AcademyAdminsModal 
            isOpen={showAcademyAdminsModal}
            onClose={() => setShowAcademyAdminsModal(false)}
            onActionSuccess={() => {}} 
        />
      )}
      
    </div>
  );
};

export default UserManagementPage;
