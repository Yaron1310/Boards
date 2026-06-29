import React, { useState, useRef, useEffect } from 'react';
import { FiPlus, FiLoader, FiTrash2 } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import { useSubitemColumns } from '../../hooks/queries/useColumnQueries';
import { useSubitemGroup } from '../../hooks/queries/useGroupQueries';
import { useGroupItems, useCreateItem, useArchiveItem, useUpdateItem } from '../../hooks/queries/useItemQueries';
import { useCreateColumn } from '../../hooks/queries/useColumnQueries';
import { useCreateGroup } from '../../hooks/queries/useGroupQueries';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { useAuthSession } from '../../hooks/useAuthSession';
import { ColumnType } from '../../types';
import type { Column, Item } from '../../types';
import { COLUMN_TYPE_ICONS } from './ColumnHeader';
import { ColumnCell } from './cells';

const DEFAULT_STATUS_OPTIONS = [
  { id: 'todo', label: 'To Do', color: '#94a3b8' },
  { id: 'inprogress', label: 'In Progress', color: '#6366f1' },
  { id: 'done', label: 'Done', color: '#22c55e' },
];

interface SubitemGroupProps {
  boardId: string;
  workspaceId: string;
  parentItemId: string;
}

const SubitemRow: React.FC<{
  item: Item;
  columns: Column[];
}> = ({ item, columns }) => {
  const { mutateAsync: archiveItem } = useArchiveItem();
  const { mutateAsync: updateItem } = useUpdateItem();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameValue(item.name); }, [item.name]);
  useEffect(() => { if (editingName) inputRef.current?.select(); }, [editingName]);

  const commitName = async () => {
    const trimmed = nameValue.trim();
    setEditingName(false);
    if (!trimmed || trimmed === item.name) { setNameValue(item.name); return; }
    await updateItem({ id: item.id, patch: { name: trimmed } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void commitName(); }
    if (e.key === 'Escape') { setNameValue(item.name); setEditingName(false); }
  };

  return (
    <div
      role="row"
      className="flex flex-nowrap items-stretch border-b border-[#e5e7eb] last:border-b-0 hover:bg-indigo-50/30 transition-colors group bg-white"
    >
      {/* Name cell */}
      <div
        className="flex items-center px-3 py-1.5 min-w-0 flex-shrink-0"
        style={{ width: '220px' }}
        role="gridcell"
      >
        {editingName ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={handleKeyDown}
            className="w-full text-xs text-gray-700 bg-white border border-indigo-400 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400"
            aria-label="Edit subitem name"
          />
        ) : (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span
              className="text-xs text-gray-700 truncate cursor-text flex-1"
              onClick={() => setEditingName(true)}
            >
              {item.name}
            </span>
            <button
              type="button"
              onClick={() => void archiveItem(item.id)}
              className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 text-gray-400 hover:text-red-500 rounded transition-all flex-shrink-0"
              aria-label={`Delete subitem ${item.name}`}
            >
              <FiTrash2 size={11} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Dynamic column cells */}
      {columns.map((col) => (
        <ColumnCell key={col.id} item={item} column={col} />
      ))}
    </div>
  );
};

const SubitemGroup: React.FC<SubitemGroupProps> = ({ boardId, workspaceId, parentItemId }) => {
  const { user } = useAuthSession();
  const qc = useQueryClient();
  const [isInitializing, setIsInitializing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const addItemInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createGroup } = useCreateGroup();
  const { mutateAsync: createColumn } = useCreateColumn(boardId);
  const { mutateAsync: createItem, isPending: isCreatingItem } = useCreateItem();

  const { data: subitemGroup, isLoading: groupLoading } = useSubitemGroup(boardId, parentItemId);

  const { data: columns = [], isLoading: columnsLoading } = useSubitemColumns(
    boardId,
    subitemGroup?.id ?? '',
    !!subitemGroup,
  );

  const { data: itemsPage, isFetching: itemsFetching } = useGroupItems(
    subitemGroup?.id ?? '',
    undefined,
    200,
    !!subitemGroup,
  );

  const items = itemsPage?.data ?? [];

  useEffect(() => { if (addingItem) addItemInputRef.current?.focus(); }, [addingItem]);

  const initialize = async () => {
    if (!user || isInitializing || subitemGroup !== null) return;
    setIsInitializing(true);
    try {
      const group = await createGroup({
        boardId,
        data: { name: 'Subitems', color: '#94a3b8', parentItemId },
      });

      await Promise.all([
        createColumn({ name: 'Assignee', type: ColumnType.PERSON, settings: { multiple: true }, parentGroupId: group.id }),
        createColumn({
          name: 'Status',
          type: ColumnType.STATUS,
          settings: { options: DEFAULT_STATUS_OPTIONS },
          parentGroupId: group.id,
        }),
        createColumn({ name: 'Due Date', type: ColumnType.DATE, settings: {}, parentGroupId: group.id }),
      ]);

      await qc.invalidateQueries({ queryKey: queryKeys.groups.subitem(boardId, parentItemId) });
    } finally {
      setIsInitializing(false);
    }
  };

  // Auto-initialize on first render if no subitem group exists yet
  useEffect(() => {
    if (!groupLoading && subitemGroup === null && !isInitializing) {
      void initialize();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupLoading, subitemGroup]);

  const handleAddItem = async () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !user || !subitemGroup) return;
    await createItem({
      name: trimmed,
      workspaceId,
      boardId,
      groupId: subitemGroup.id,
    });
    setNewItemName('');
    setAddingItem(false);
  };

  const handleAddItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddItem();
    if (e.key === 'Escape') { setAddingItem(false); setNewItemName(''); }
  };

  const isLoading = groupLoading || isInitializing || (!!subitemGroup && columnsLoading);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 pl-10 py-2 text-xs text-gray-400">
        <FiLoader size={11} className="animate-spin" aria-hidden="true" />
        Loading subitems…
      </div>
    );
  }

  const nameColWidth = 220;

  return (
    <div
      className="ml-8 mb-1 border border-[#e5e7eb] rounded-lg bg-white shadow-sm overflow-hidden"
      role="region"
      aria-label="Subitems"
    >
      {/* Column header row */}
      <div
        className="flex flex-nowrap items-stretch border-b border-[#e5e7eb] bg-gray-50 rounded-t-lg"
        role="row"
      >
        <div
          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-gray-500"
          style={{ width: `${nameColWidth}px` }}
          role="columnheader"
        >
          Subitem
        </div>
        {columns.map((col) => (
          <div
            key={col.id}
            role="columnheader"
            style={{ width: `${col.width ?? 120}px` }}
            className="flex flex-shrink-0 items-center justify-center gap-1 px-2 py-1.5 border-l border-[#e5e7eb] text-xs font-semibold text-gray-500"
          >
            <span className="text-gray-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
            <span className="truncate">{col.name}</span>
          </div>
        ))}
      </div>

      {/* Item rows */}
      <div role="rowgroup">
        {itemsFetching && items.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1">
            <FiLoader size={10} className="animate-spin" aria-hidden="true" /> Loading…
          </div>
        ) : items.length === 0 ? null : (
          items.map((item) => (
            <SubitemRow key={item.id} item={item} columns={columns} />
          ))
        )}
      </div>

      {/* Add subitem row */}
      <div className="px-3 py-1.5">
        {addingItem ? (
          <div className="flex items-center gap-2">
            <input
              ref={addItemInputRef}
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={handleAddItemKeyDown}
              onBlur={() => { if (!newItemName.trim()) setAddingItem(false); }}
              placeholder="Subitem name…"
              disabled={isCreatingItem}
              className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="New subitem name"
            />
            {isCreatingItem && <FiLoader size={11} className="animate-spin text-indigo-500" aria-hidden="true" />}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingItem(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            aria-label="Add subitem"
          >
            <FiPlus size={12} aria-hidden="true" />
            Add subitem
          </button>
        )}
      </div>
    </div>
  );
};

export default SubitemGroup;
