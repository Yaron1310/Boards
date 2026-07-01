import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { FiLoader, FiUser, FiList, FiUsers } from 'react-icons/fi';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { useItems } from '../../hooks/queries/useItemQueries';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import { UserRole, ColumnType } from '../../types';
import type { Item, Group } from '../../types';
import PersonalHubBoardGroup from './PersonalHubBoardGroup';
import GanttView from '../boards/GanttView';
import BoardDashboardView from '../boards/BoardDashboardView';
import ItemDetailPanel from '../boards/ItemDetailPanel';
import ItemChatModal from '../boards/ItemChatModal';

type ViewMode = 'table' | 'gantt' | 'dashboard';

/** Renders the Gantt swimlane for a single board's assigned items, using the board name as the group label. */
const PersonalHubGanttBoard: React.FC<{ boardId: string; items: Item[] }> = ({ boardId, items }) => {
  const { data: board } = useBoard(boardId);
  const { data: columns = [] } = useColumns(boardId);
  const hasTimeRange = columns.some((c) => c.type === ColumnType.TIME_RANGE);
  if (!board || !hasTimeRange) return null;

  const pseudoGroup: Group = {
    id: boardId,
    workspaceId: board.workspaceId,
    boardId,
    name: board.name,
    order: 0,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };

  return (
    <div className="flex flex-col mb-6 min-h-[220px]" aria-label={`Gantt for board ${board.name}`}>
      <h2 className="text-lg font-bold text-indigo-700 px-4 pt-4">{board.name}</h2>
      <div className="relative flex-1 min-h-[180px]">
        <GanttView
          groups={[pseudoGroup]}
          itemsByGroup={{ [boardId]: items }}
          columns={columns}
          onItemUpdate={() => {}}
        />
      </div>
    </div>
  );
};

const PersonalHubPage: React.FC = () => {
  const { userId: routeUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuthSession();

  const targetUserId = routeUserId || authUser?.id || '';
  const isOwn = !routeUserId || targetUserId === authUser?.id;
  const isOrgAdmin = authUser?.role === UserRole.ORGANIZATION_ADMIN || authUser?.role === UserRole.SYSTEM_ADMIN;

  const { data: allUsers = [] } = useUsersQuery({ limit: 200 }, !isOwn);
  const targetUser = isOwn ? authUser : allUsers.find((u) => u.id === targetUserId);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [chatItem, setChatItem] = useState<Item | null>(null);
  const [dashboardBoardId, setDashboardBoardId] = useState<string>('');

  const { data: itemsPage, isLoading } = useItems(
    { assignee: targetUserId, limit: 500 },
    !!targetUserId && (isOwn || isOrgAdmin),
  );
  const items = useMemo(() => itemsPage?.data ?? [], [itemsPage]);

  const itemsByBoard = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const item of items) {
      (map[item.boardId] ??= []).push(item);
    }
    return map;
  }, [items]);

  const boardIds = Object.keys(itemsByBoard);

  React.useEffect(() => {
    if (!dashboardBoardId && boardIds.length > 0) setDashboardBoardId(boardIds[0]);
  }, [boardIds, dashboardBoardId]);

  if (!authUser) return null;

  if (!isOwn && !isOrgAdmin) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <FiUser size={20} className="text-indigo-600" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-800">
          {isOwn ? 'Personal Hub' : `Personal Hub — ${targetUser?.name ?? 'User'}`}
        </h1>

        <div className="flex-1" />

        <div
          className="flex items-center border border-gray-300 rounded-lg overflow-hidden"
          role="group"
          aria-label="Personal hub view"
        >
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${viewMode === 'table' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            aria-pressed={viewMode === 'table'}
          >
            <FiList size={14} aria-hidden="true" />
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode('gantt')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-300 transition-colors ${viewMode === 'gantt' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            aria-pressed={viewMode === 'gantt'}
          >
            Gantt
          </button>
          <button
            type="button"
            onClick={() => setViewMode('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-300 transition-colors ${viewMode === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            aria-pressed={viewMode === 'dashboard'}
          >
            Dashboard
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64" role="status" aria-label="Loading assigned items">
          <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
        </div>
      ) : boardIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
          <FiUsers size={32} aria-hidden="true" />
          <p className="text-sm">No items are currently assigned to {isOwn ? 'you' : (targetUser?.name ?? 'this user')}.</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto" role="region" aria-label="Assigned items by board">
          <div className="p-4 space-y-4">
            {boardIds.map((boardId) => (
              <PersonalHubBoardGroup
                key={boardId}
                boardId={boardId}
                items={itemsByBoard[boardId]}
                onOpenDetail={setDetailItem}
                onOpenChat={setChatItem}
              />
            ))}
          </div>
        </div>
      ) : viewMode === 'gantt' ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto" role="region" aria-label="Assigned items timeline">
          {boardIds.map((boardId) => (
            <PersonalHubGanttBoard key={boardId} boardId={boardId} items={itemsByBoard[boardId]} />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 px-6 py-2 border-b border-gray-100 bg-white flex items-center gap-2">
            <label htmlFor="personal-hub-dashboard-board" className="text-sm text-gray-500">
              Board:
            </label>
            <select
              id="personal-hub-dashboard-board"
              value={dashboardBoardId}
              onChange={(e) => setDashboardBoardId(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
              aria-label="Select board for dashboard widgets"
            >
              {boardIds.map((boardId) => (
                <BoardOption key={boardId} boardId={boardId} />
              ))}
            </select>
          </div>
          {dashboardBoardId && (
            <BoardDashboardView boardId={dashboardBoardId} boardName="" isAdmin={isOwn} />
          )}
        </div>
      )}

      {detailItem && (
        <BoardRenderProvider visibleItems={items} columns={[]} isBoardReadOnly={false} openChat={setChatItem}>
          <ItemDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
        </BoardRenderProvider>
      )}

      {chatItem && createPortal(
        <ItemChatModal item={chatItem} onClose={() => setChatItem(null)} />,
        document.body,
      )}
    </div>
  );
};

const BoardOption: React.FC<{ boardId: string }> = ({ boardId }) => {
  const { data: board } = useBoard(boardId);
  return <option value={boardId}>{board?.name ?? boardId}</option>;
};

export default PersonalHubPage;
