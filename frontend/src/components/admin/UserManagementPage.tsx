
import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useData } from '../../hooks/useData';
import type { User, PreApprovedUser } from '../../types';
import { UserRole } from '../../types';
import { FiSearch, FiFilter, FiChevronDown, FiUsers, FiLoader, FiUserPlus, FiShare, FiAlertTriangle, FiCheckCircle, FiAlertCircle, FiShield, FiEdit, FiTrash2 } from 'react-icons/fi';
import InviteUsersOrgModal from './InviteUsersOrgModal';
import TutorialSection from '../common/TutorialSection';
import OrganizationAdminsModal from './AcademyAdminsModal';
import UserPermissionsModal from './UserPermissionsModal';
import { useUsersInfiniteQuery } from '../../hooks/queries/useUserQueries';
import { useQueryClient } from '@tanstack/react-query';
import { removeUserFromOrg } from '../../services/geminiService';
import { queryKeys } from '../../hooks/queries/queryKeys';

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
    tutorialSettings,
    revokePreApprovedUser,
  } = useData();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');

  const [showOrganizationAdminsModal, setShowOrganizationAdminsModal] = useState(false);
  const [showInviteUsersModal, setShowInviteUsersModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string; isOrgAdmin: boolean } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const queryClient = useQueryClient();

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
    return infiniteData?.pages.flatMap((page: any) => page?.data ?? []) ?? [];
  }, [infiniteData]);

  // Filter preApprovedUsers by search term and workspaceId, then exclude emails already in allUsers
  const filteredPendingUsers = useMemo(() => {
    if (filterRole && filterRole !== 'pending') return [];
    const activeUserEmails = new Set(allUsers.map((u: User) => u.email?.toLowerCase()));
    return preApprovedUsers.filter(p => {
      if (filterOrg && p.workspaceId !== filterOrg) return false;
      if (debouncedSearch && !p.email.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
      if (activeUserEmails.has(p.email.toLowerCase())) return false;
      return true;
    });
  }, [preApprovedUsers, allUsers, filterOrg, debouncedSearch, filterRole]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  if (!authUser || (authUser.role !== UserRole.ORGANIZATION_ADMIN && authUser.role !== UserRole.SYSTEM_ADMIN)) {
    navigate('/chat');
    return null;
  }

  const handleRemoveUser = async () => {
    const orgId = selectedWorkspace?.orgId ?? authUser?.orgId;
    if (!removeTarget || !orgId) return;
    setIsRemoving(true);
    try {
      await removeUserFromOrg(orgId, removeTarget.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      setFeedback({ type: 'success', text: `${removeTarget.name} has been removed from the organization.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to remove user.' });
    } finally {
      setIsRemoving(false);
      setRemoveTarget(null);
    }
  };

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

  const PendingUserRow = ({ pending: p }: { pending: PreApprovedUser }) => {
    const workspaceName = workspaces.find(w => w.id === p.workspaceId)?.name;
    return (
      <tr className="hover:bg-gray-50 transition-colors border-b border-gray-200" aria-label={`Pending user ${p.email}`}>
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              className="h-10 w-10 rounded-full object-cover shrink-0 opacity-40"
              src="/default_user.webp"
              alt="Pending user"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-500 whitespace-nowrap italic">{p.email}</div>
              <div className="text-xs text-gray-400">Pending invitation</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 text-sm text-gray-500">{p.email}</td>
        <td className="px-6 py-4 text-sm text-gray-500">{workspaceName || '—'}</td>
        <td className="px-4 py-4 text-center">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Pending
          </span>
        </td>
        {authUser.role === UserRole.ORGANIZATION_ADMIN && (
          <td className="px-3 py-4 text-center">
            <span className="text-xs text-gray-400">—</span>
          </td>
        )}
        {authUser.role === UserRole.ORGANIZATION_ADMIN && (
          <td className="px-3 py-4 text-center">
            <button
              type="button"
              onClick={() => revokePreApprovedUser(p.id)}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              aria-label={`Revoke invitation for ${p.email}`}
              title="Revoke invitation"
            >
              <FiTrash2 size={15} aria-hidden="true" />
            </button>
          </td>
        )}
      </tr>
    );
  };

  const UserRow = ({ user: u }: { user: User }) => {
    const roleLabel = (() => {
        switch (u.role) {
            case UserRole.ORGANIZATION_ADMIN: return 'Org Admin';
            case UserRole.WORKSPACE_ADMIN: return 'Workhub Admin';
            case UserRole.ORG_EDITOR: return 'Org Editor';
            case UserRole.SYSTEM_ADMIN: return 'System Admin';
            default: return 'Member';
        }
    })();

    const navigateToUser = () => navigate(`/admin/users/${u.id}`);
    const tdNav = "px-6 py-4 text-sm text-gray-700 cursor-pointer whitespace-nowrap";

    return (
        <tr
            className="hover:bg-gray-50 transition-colors border-b border-gray-200"
            aria-label={`User ${u.name}`}
        >
            <td
                className="px-6 py-4 cursor-pointer"
                onClick={navigateToUser}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigateToUser()}
                tabIndex={0}
                title="View profile page"
            >
                <div className="flex items-center gap-3">
                    <img
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                        src={u.profileImageUrl || `/default_user.webp`}
                        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)}
                        alt={`${u.name}'s profile picture`}
                    />
                    <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{u.name}</div>
                        <div className="text-xs text-gray-500">{roleLabel}</div>
                    </div>
                </div>
            </td>
            <td className={tdNav} onClick={navigateToUser}>{u.email}</td>
            <td className={tdNav} onClick={navigateToUser}>
                {u.role === UserRole.ORGANIZATION_ADMIN ? 'All Workhubs' : (u.workspaceName || 'N/A')}
            </td>
            <td className="px-4 py-4 text-center cursor-pointer" onClick={navigateToUser}>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {u.status === 'active' ? t('common.active') : u.status}
                </span>
            </td>
            {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                <td className="px-3 py-4 text-center">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPermissionsUser({ id: u.id, name: u.name, isOrgAdmin: u.role === UserRole.ORGANIZATION_ADMIN }); }}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        aria-label={`Manage board permissions for ${u.name}`}
                        title="Manage board permissions"
                    >
                        <FiEdit size={15} aria-hidden="true" />
                    </button>
                </td>
            )}
            {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                <td className="px-3 py-4 text-center">
                    {u.id === authUser.id ? (
                        <span className="text-xs text-gray-400">N/A</span>
                    ) : (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setRemoveTarget({ id: u.id, name: u.name }); }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label={`Remove ${u.name} from organization`}
                            title="Remove from organization"
                        >
                            <FiTrash2 size={15} aria-hidden="true" />
                        </button>
                    )}
                </td>
            )}
        </tr>
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
        <div className="max-w-6xl mx-auto w-full flex-grow flex flex-col min-h-0 overflow-hidden">
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
                                <option value={UserRole.ORG_EDITOR}>Org Editor</option>
                                <option value={UserRole.WORKSPACE_ADMIN}>Workhub Admin</option>
                                <option value={UserRole.ORGANIZATION_ADMIN}>Org Admin</option>
                                <option value="pending">Pending</option>
                            </select>
                            <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <FiChevronDown className="h-5 w-5 text-gray-400" />
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar bg-white shadow-md rounded-lg border border-gray-200 min-h-0">
                {isUsersLoading && !infiniteData ? (
                    <div className="flex items-center justify-center py-16">
                        <FiLoader className="animate-spin text-blue-500" size={48} aria-label="Loading users" />
                    </div>
                ) : isUsersError ? (
                    <div className="flex items-center justify-center py-16 text-red-500" role="alert">
                        <FiAlertTriangle className="mr-2" /> {t('admin.errorLoadingUsers')}
                    </div>
                ) : allUsers.length === 0 && filteredPendingUsers.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        <FiUsers size={48} className="mx-auto mb-4 opacity-50" aria-hidden="true" />
                        <p className="text-lg">{t('admin.noUsersFound')}</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <th className="px-6 py-3 font-medium">{t('common.name')}</th>
                                <th className="px-6 py-3 font-medium">{t('common.email')}</th>
                                <th className="px-6 py-3 font-medium">{t('common.workspace')}</th>
                                <th className="px-4 py-3 font-medium text-center">{t('common.status')}</th>
                                {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                                    <th className="px-3 py-3 font-medium text-center">Permissions</th>
                                )}
                                {authUser.role === UserRole.ORGANIZATION_ADMIN && (
                                    <th className="px-3 py-3 font-medium text-center">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filterRole !== 'pending' && allUsers.map((u: any) => (
                                <UserRow key={u.id} user={u} />
                            ))}
                            {filteredPendingUsers.map((p: PreApprovedUser) => (
                                <PendingUserRow key={p.id} pending={p} />
                            ))}
                            {hasNextPage && filterRole !== 'pending' && (
                                <tr>
                                    <td colSpan={authUser.role === UserRole.ORGANIZATION_ADMIN ? 6 : 4} className="text-center py-4">
                                        <button
                                            onClick={() => fetchNextPage()}
                                            disabled={isFetchingNextPage}
                                            className="px-4 py-2 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50"
                                        >
                                            {isFetchingNextPage ? <FiLoader className="animate-spin inline mr-2" /> : null}
                                            Load more
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
      </div>

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
          isOrgAdmin={permissionsUser.isOrgAdmin}
          canAssignAdmin={authUser?.role === UserRole.ORGANIZATION_ADMIN || authUser?.role === UserRole.SYSTEM_ADMIN}
          onClose={() => setPermissionsUser(null)}
        />
      )}

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="remove-user-title">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 id="remove-user-title" className="text-lg font-semibold text-gray-900 mb-2">Remove user from organization</h2>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to remove <span className="font-medium">{removeTarget.name}</span> from the organization? They will lose all access immediately.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveUser}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 flex items-center gap-2"
                aria-label={`Confirm removal of ${removeTarget.name}`}
              >
                {isRemoving ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiTrash2 size={14} aria-hidden="true" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UserManagementPage;
