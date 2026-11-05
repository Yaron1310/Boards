import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { FiX, FiPlus, FiEdit2, FiTrash2, FiLoader, FiSearch, FiAlertCircle, FiUserPlus } from 'react-icons/fi';
import { getUsers } from '../../services/geminiService';
import { queryKeys } from '../../hooks/queries/queryKeys';
import {
  useUserGroupsQuery,
  useCreateUserGroup,
  useUpdateUserGroup,
  useDeleteUserGroup,
} from '../../hooks/queries/useUserGroupQueries';
import type { User, UserGroup } from '../../types';

// Loads every page of users so the picker isn't limited to what the table has loaded.
const fetchAllUsers = async (): Promise<User[]> => {
  const all: User[] = [];
  let cursor: string | undefined;
  do {
    const page = await getUsers({ limit: 100, cursor });
    all.push(...(page.data ?? []));
    cursor = page.cursor ?? undefined;
  } while (cursor);
  return all;
};

const useAllUsers = () =>
  useQuery({ queryKey: [...queryKeys.users.all, 'all-for-groups'], queryFn: fetchAllUsers });

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

// ─── Create / edit group modal ────────────────────────────────────────────────

interface GroupFormModalProps {
  group: UserGroup | null; // null = create
  groups: UserGroup[];
  onClose: () => void;
}

const GroupFormModal: React.FC<GroupFormModalProps> = ({ group, groups, onClose }) => {
  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const createGroup = useCreateUserGroup();
  const updateGroup = useUpdateUserGroup();

  const [name, setName] = useState(group?.name ?? '');
  const [order, setOrder] = useState<string>(String(group?.order ?? Math.max(0, ...groups.map(g => g.order)) + 1));
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? []);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  // Users that belong to a different group are hidden from the picker.
  const usedElsewhere = useMemo(
    () => new Set(groups.filter(g => g.id !== group?.id).flatMap(g => g.memberIds)),
    [groups, group?.id],
  );

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(u =>
      !usedElsewhere.has(u.id) &&
      !members.includes(u.id) &&
      (!term || u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)),
    );
  }, [users, usedElsewhere, members, search]);

  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allVisibleChecked = candidates.length > 0 && candidates.every(u => checked.has(u.id));
  const toggleAllVisible = () =>
    setChecked(allVisibleChecked ? new Set() : new Set(candidates.map(u => u.id)));

  const addToGroup = () => {
    setMembers(prev => [...prev, ...Array.from(checked).filter(id => !prev.includes(id))]);
    setChecked(new Set());
  };

  const isSaving = createGroup.isPending || updateGroup.isPending;

  const handleSave = async () => {
    setError(null);
    const orderNum = Number(order);
    if (!name.trim()) return setError('Group name is required.');
    if (!Number.isInteger(orderNum) || orderNum < 1) return setError('Order must be a whole number of 1 or more.');
    const input = { name: name.trim(), order: orderNum, memberIds: members };
    try {
      if (group) await updateGroup.mutateAsync({ groupId: group.id, input });
      else await createGroup.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Failed to save group.'));
    }
  };

  const title = group ? 'Edit group' : 'Create new group';

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4" role="dialog" aria-modal="true" aria-labelledby="group-form-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 id="group-form-title" className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700" aria-label="Close">
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-100 text-red-700 text-sm flex items-center" role="alert">
              <FiAlertCircle className="mr-2 shrink-0" aria-hidden="true" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-4">
            <div>
              <label htmlFor="group-name" className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
              <input
                id="group-name"
                type="text"
                value={name}
                maxLength={100}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Group name"
              />
            </div>
            <div>
              <label htmlFor="group-order" className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <input
                id="group-order"
                type="number"
                min={1}
                step={1}
                value={order}
                onChange={e => setOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Group order number"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span id="members-label" className="block text-sm font-medium text-gray-700">Members ({members.length})</span>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500">No members yet. Select users below and click &quot;Add to group&quot;.</p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-labelledby="members-label">
                {members.map(id => (
                  <li key={id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-xs rounded-full pl-3 pr-1 py-1">
                    {usersById.get(id)?.name ?? 'Unknown user'}
                    <button
                      type="button"
                      onClick={() => setMembers(prev => prev.filter(m => m !== id))}
                      className="p-0.5 rounded-full hover:bg-blue-100"
                      aria-label={`Remove ${usersById.get(id)?.name ?? 'user'} from group`}
                    >
                      <FiX size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
              <div className="relative flex-grow">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiSearch className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search users"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Search users to add"
                />
              </div>
              <button
                type="button"
                onClick={addToGroup}
                disabled={checked.size === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-md flex items-center justify-center"
                aria-label={`Add ${checked.size} selected users to group`}
              >
                <FiUserPlus className="mr-2" aria-hidden="true" /> Add to group{checked.size > 0 ? ` (${checked.size})` : ''}
              </button>
            </div>

            <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
              {usersLoading ? (
                <div className="flex justify-center py-6"><FiLoader className="animate-spin text-blue-500" aria-label="Loading users" /></div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No available users.</p>
              ) : (
                <>
                  <label className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} aria-label="Select all listed users" />
                    Select all
                  </label>
                  <ul>
                    {candidates.map(u => (
                      <li key={u.id} className="border-b border-gray-100 last:border-b-0">
                        <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={checked.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Select ${u.name}`} />
                          <span className="min-w-0">
                            <span className="block text-sm text-gray-900 truncate">{u.name}</span>
                            <span className="block text-xs text-gray-500 truncate">{u.email}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center gap-2"
            aria-label={group ? 'Save group' : 'Create group'}
          >
            {isSaving && <FiLoader className="animate-spin" aria-hidden="true" />}
            {group ? 'Save' : 'Create group'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Groups manager modal ─────────────────────────────────────────────────────

interface UserGroupsModalProps {
  onClose: () => void;
}

const UserGroupsModal: React.FC<UserGroupsModalProps> = ({ onClose }) => {
  const { data: groups = [], isLoading, isError } = useUserGroupsQuery();
  const deleteGroup = useDeleteUserGroup();
  const [editing, setEditing] = useState<UserGroup | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && !deleteTarget) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, editing, deleteTarget]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteGroup.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete group.'));
      setDeleteTarget(null);
    }
  };

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" role="dialog" aria-modal="true" aria-labelledby="groups-manager-title">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
            <h2 id="groups-manager-title" className="text-lg font-semibold text-gray-900">Groups</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-3 rounded-md flex items-center"
                aria-label="Create new group"
              >
                <FiPlus className="mr-1" aria-hidden="true" /> Group
              </button>
              <button type="button" onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700" aria-label="Close groups manager">
                <FiX size={20} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="px-6 py-4 overflow-y-auto">
            {error && (
              <div className="p-3 mb-3 rounded-md bg-red-100 text-red-700 text-sm flex items-center" role="alert">
                <FiAlertCircle className="mr-2 shrink-0" aria-hidden="true" /> {error}
              </div>
            )}
            {isLoading ? (
              <div className="flex justify-center py-8"><FiLoader className="animate-spin text-blue-500" size={28} aria-label="Loading groups" /></div>
            ) : isError ? (
              <p className="text-sm text-red-600 text-center py-8" role="alert">Failed to load groups.</p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No groups yet. Click &quot;+ Group&quot; to create one.</p>
            ) : (
              <ul className="divide-y divide-gray-100" aria-label="Groups">
                {groups.map(g => (
                  <li key={g.id} className="flex items-center gap-3 py-3">
                    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 shrink-0" title="Order">{g.order}</span>
                    <div className="min-w-0 flex-grow">
                      <div className="text-sm font-medium text-gray-900 truncate">{g.name}</div>
                      <div className="text-xs text-gray-500">{g.memberIds.length} {g.memberIds.length === 1 ? 'member' : 'members'}</div>
                    </div>
                    <button type="button" onClick={() => setEditing(g)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" aria-label={`Edit group ${g.name}`} title="Edit group">
                      <FiEdit2 size={15} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(g)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label={`Delete group ${g.name}`} title="Delete group">
                      <FiTrash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <GroupFormModal
          group={editing === 'new' ? null : editing}
          groups={groups}
          onClose={() => setEditing(null)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 id="delete-group-title" className="text-lg font-semibold text-gray-900 mb-2">Delete group</h2>
            <p className="text-sm text-gray-600 mb-6">
              Delete <span className="font-medium">{deleteTarget.name}</span>? Its members stay in the organization and move to the ungrouped section.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteGroup.isPending} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteGroup.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 flex items-center gap-2"
                aria-label={`Confirm deletion of ${deleteTarget.name}`}
              >
                {deleteGroup.isPending ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiTrash2 size={14} aria-hidden="true" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

export default UserGroupsModal;
