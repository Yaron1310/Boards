
import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useData } from '../../hooks/useData';
import type { User } from '../../types';
import { UserRole } from '../../types';
import { FiSearch, FiFilter, FiChevronDown, FiUsers, FiLoader, FiUserPlus, FiShare, FiAlertTriangle, FiCheckCircle, FiAlertCircle, FiShield, FiSliders } from 'react-icons/fi';
import PreApproveUsersModal from './PreApproveUsersModal';
import InviteUsersOrgModal from './InviteUsersOrgModal';
import TutorialSection from '../common/TutorialSection';
import OrganizationAdminsModal from './AcademyAdminsModal';
import UserPermissionsModal from './UserPermissionsModal';
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


const UserManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user: authUser, selectedWorkspace } = useAuthSession();
  const {
    workspaces,
    preApprovedUsers,
    tutorialSettings
  } = useData();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');

  const [showPreApproveModal, setShowPreApproveModal] = useState(false);
  const [showOrganizationAdminsModal, setShowOrganizationAdminsModal] = useState(false);
  const [showInviteUsersModal, setShowInviteUsersModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string } | null>(null);

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
    workspaceId: filterOrg,
    role: filterRole
  }, !!authUser);

  const allUsers = useMemo(() => {
    const users = infiniteData?.pages.flatMap(page => page.data) ?? [];
    console.log('[DBG:UserManagementPage] allUsers computed', {
      pageCount: infiniteData?.pages.length ?? 0,
      totalUsers: users.length,
      users: users.map((u: any) => `${u.id}:${u.role}:${u.name}`),
      isLoading: isUsersLoading,
      isError: isUsersError,
      hasNextPage,
    });
    return users;
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (authUser?.role === UserRole.WORKSPACE_ADMIN) {
        return selectedWorkspace;
    }
    return null;
  }, [authUser, selectedWorkspace]);

  const handleOpenPreApproveModal = () => {
    if (orgForPreApproval) setShowPreApproveModal(true);
  };

  const { currentRegularUsersCount, pendingInvitesCount } = useMemo(() => {
    if (authUser?.role !== UserRole.WORKSPACE_ADMIN || !selectedWorkspace || !allUsers || !preApprovedUsers) {
        return { currentRegularUsersCount: 0, pendingInvitesCount: 0 };
    }

    const regularUsers = allUsers.filter((u: User) => {
        if (u.dbRoles?.workspaceAdmin?.includes(selectedWorkspace.id)) return false;
        if (u.dbRoles?.organizationAdmin?.includes(selectedWorkspace.orgId)) return false;
        if (u.dbRoles?.systemAdmin) return false;
        return true;
    });

    const pendingCount = preApprovedUsers.filter(p => p.workspaceId === selectedWorkspace.id).length;

    return {
        currentRegularUsersCount: regularUsers.length,
        pendingInvitesCount: pendingCount
    };
  }, [authUser, selectedWorkspace, allUsers, preApprovedUsers]);


  if (!authUser || (authUser.role !== UserRole.ORGANIZATION_ADMIN && authUser.role !== UserRole.WORKSPACE_ADMIN && authUser.role !== UserRole.SYSTEM_ADMIN)) {
    navigate('/chat');
    return null;
  }

  const handleExportToExcel = () => {
    // Note: For very large datasets, we should fetch all pages or use a server-side export.
    // For now, we export the loaded pages.
    const dataForExport = allUsers.map((u: User) => ({
        'Name': u.name,
        'Email': u.email,
        'Role': u.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        'WorkHub(s)': u.workspaces.filter(o => !o.isPersonal).map(o => o.name).join(', '),
    }));

    exportToCSV(dataForExport, "Logyx_Users_Export.csv");
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

    const roleLabel = (() => {
        switch (u.role) {
            case UserRole.ORGANIZATION_ADMIN: return 'Org Admin';
            case UserRole.WORKSPACE_ADMIN: return 'Workhub Admin';
            case UserRole.SYSTEM_ADMIN: return 'System Admin';
            default: return 'Member';
        }
    })();

    return (
        <div
            style={style}
            className="flex hover:bg-gray-50 transition-colors border-b border-gray-200 bg-white"
            role="row"
            aria-label={`User ${u.name}`}
        >
            <div
                className="flex-[2] px-6 py-4 flex items-center min-w-0 cursor-pointer"
                onClick={() => navigate(`/admin/users/${u.id}`)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/admin/users/${u.id}`)}
                tabIndex={0}
                title="View profile page"
            >
                <div className="flex-shrink-0 h-10 w-10">
                    <img className="h-10 w-10 rounded-full object-cover" src={u.profileImageUrl || `/default_user.webp`}
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)}
                    alt={`${u.name}'s profile picture`} />
                </div>
                <div className="ml-4 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                    <div className="text-xs text-gray-500">{roleLabel}</div>
                </div>
            </div>
            <div className="flex-[1.5] px-6 py-4 text-sm text-gray-700 flex items-center truncate cursor-pointer"
                onClick={() => navigate(`/admin/users/${u.id}`)}>
                {u.workspaceName || 'N/A'}
            </div>
            <div className="flex-1 px-6 py-4 text-sm text-gray-700 flex items-center truncate cursor-pointer"
                onClick={() => navigate(`/admin/users/${u.id}`)}>
                {u.email}
            </div>
            <div className="flex-[0.75] px-6 py-4 text-sm text-gray-700 flex items-center justify-center cursor-pointer"
                onClick={() => navigate(`/admin/users/${u.id}`)}>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {u.status === 'active' ? t('common.active') : u.status}
                </span>
            </div>
            {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                <div className="flex-[0.75] px-3 py-4 flex items-center justify-center">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPermissionsUser({ id: u.id, name: u.name }); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        aria-label={`Manage board permissions for ${u.name}`}
                        title="Manage board permissions"
                    >
                        <FiSliders size={12} aria-hidden="true" />
                        Permissions
                    </button>
                </div>
            )}
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
                    {authUser.role === UserRole.WORKSPACE_ADMIN && (
                        <button
                        onClick={handleOpenPreApproveModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                        aria-label="Pre-approve new users for your workspace"
                        title="Pre-approve new users for your workspace"
                        >
                        <FiUserPlus className="mr-2" /> {t('admin.preApproveUsers')}
                        </button>
                    )}
                    {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                        <button
                        onClick={() => setShowInviteUsersModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                        aria-label="Invite users to the organization"
                        >
                        <FiUserPlus className="mr-2" /> Invite Users
                        </button>
                    )}
                    {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                        <button
                        onClick={() => setShowOrganizationAdminsModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                        aria-label="Manage admins for your workspace"
                        title="Manage admins for your workspace"
                        >
                        <FiShield className="mr-2" /> {t('admin.manageOrganizationAdmins')}
                        </button>
                    )}
                    <button
                      onClick={handleExportToExcel}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                      aria-label="Export current user list to a CSV file"
                      title="Export current user list to a CSV file"
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
                <div className={`p-3 mb-4 rounded-md flex items-center text-sm shrink-0 ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} role="alert">
                    {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                    {feedback.text}
                    <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label="Dismiss">&times;</button>
                </div>
            )}

            <div className="mb-6 bg-white p-4 rounded-lg shadow w-full space-y-4 shrink-0">
                <div className="flex items-center gap-6">
                    <h2 className="text-xl font-semibold text-gray-700">{t('common.filters')}</h2>
                    <button
                        onClick={() => { setSearchTerm(''); setFilterOrg(''); setFilterRole(''); }}
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
                        {(authUser.role === UserRole.ORGANIZATION_ADMIN || authUser.role === UserRole.SYSTEM_ADMIN) && (
                            <div className="relative">
                                <label htmlFor="org-filter-users" className="sr-only">Filter by workspace</label>
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FiFilter className="h-5 w-5 text-gray-400" />
                                </span>
                                <select
                                    id="org-filter-users"
                                    value={filterOrg}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterOrg(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                    aria-label="Filter by workspace"
                                >
                                    <option value="">{t('admin.allWorkspaces')}</option>
                                    {workspaces.filter(w => !w.isPersonal && !w.isTemplates).map(org => (
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
                                <option value={UserRole.REGULAR_USER}>Board member</option>
                                <option value={UserRole.WORKSPACE_ADMIN}>Workhub Admin</option>
                                <option value={UserRole.ORGANIZATION_ADMIN}>Org Admin</option>
                            </select>
                            <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <FiChevronDown className="h-5 w-5 text-gray-400" />
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-grow flex flex-col bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="flex bg-gray-50 border-b border-gray-200 shrink-0 font-medium text-xs text-gray-500 uppercase tracking-wider" role="rowgroup">
                    <div className="flex-[2] px-6 py-3 text-left" role="columnheader">{t('common.name')}</div>
                    <div className="flex-[1.5] px-6 py-3 text-left" role="columnheader">{t('common.workspace')}</div>
                    <div className="flex-1 px-6 py-3 text-left" role="columnheader">{t('common.email')}</div>
                    <div className="flex-[0.75] px-6 py-3 text-center" role="columnheader">{t('common.status')}</div>
                    {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                        <div className="flex-[0.75] px-3 py-3 text-center" role="columnheader">Permissions</div>
                    )}
                </div>

                <div className="flex-grow min-h-0">
                    {isUsersLoading && !infiniteData ? (
                        <div className="flex items-center justify-center h-full">
                            <FiLoader className="animate-spin text-blue-500" size={48} aria-label="Loading users" />
                        </div>
                    ) : isUsersError ? (
                        <div className="flex items-center justify-center h-full text-red-500" role="alert">
                            <FiAlertTriangle className="mr-2" /> {t('admin.errorLoadingUsers')}
                        </div>
                    ) : allUsers.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <FiUsers size={48} className="mx-auto mb-4 opacity-50" aria-hidden="true" />
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
            workspace={orgForPreApproval}
            maxUsers={null}
            currentRegularUsersCount={currentRegularUsersCount}
            pendingInvitesCount={pendingInvitesCount}
        />
      )}

      {showOrganizationAdminsModal && (
        <OrganizationAdminsModal
            isOpen={showOrganizationAdminsModal}
            onClose={() => setShowOrganizationAdminsModal(false)}
            onActionSuccess={() => {}}
        />
      )}

      <InviteUsersOrgModal
        isOpen={showInviteUsersModal}
        onClose={() => setShowInviteUsersModal(false)}
        workspaces={workspaces.filter(w => !w.isPersonal)}
      />

      {permissionsUser && (
        <UserPermissionsModal
          userId={permissionsUser.id}
          userName={permissionsUser.name}
          onClose={() => setPermissionsUser(null)}
        />
      )}

    </div>
  );
};

export default UserManagementPage;
