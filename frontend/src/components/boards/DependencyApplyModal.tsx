import React, { useEffect } from 'react';
import type { Item, TimeRangeDependency } from '../../types';
import { useUpdateItem } from '../../hooks/queries/useItemQueries';

interface Props {
  /** The newly created dependency that triggered this modal */
  newDep: TimeRangeDependency;
  /** All items on the board, used to find candidate rows */
  items: Item[];
  onClose: () => void;
  /** Called when the user explicitly cancels — removes the newly created dep */
  onCancel: () => void;
  /** Called with IDs of all deps created by the bulk-apply so they can flash */
  onApply: (depIds: string[]) => void;
}

const DependencyApplyModal: React.FC<Props> = ({ newDep, items, onClose, onCancel, onApply }) => {
  const { mutate: updateItem } = useUpdateItem();

  // Esc cancels and revokes the newly created dependency
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const targetItem = items.find((i) => i.id === newDep.targetItemId);

  // Derive group visual order: a group's position = the minimum item.order among its members.
  // Groups with a lower min order appear higher on the board.
  const groupMinOrder: Record<string, number> = {};
  for (const i of items) {
    if (groupMinOrder[i.groupId] === undefined || i.order < groupMinOrder[i.groupId]) {
      groupMinOrder[i.groupId] = i.order;
    }
  }
  const targetGroupOrder = targetItem ? (groupMinOrder[targetItem.groupId] ?? 0) : 0;

  // b. Items below in this group (after target by order, same group)
  const candidatesBelow = targetItem
    ? items
        .filter(
          (i) =>
            i.groupId === targetItem.groupId &&
            i.id !== targetItem.id &&
            i.id !== newDep.sourceItemId &&
            i.order > targetItem.order,
        )
        .sort((a, b) => a.order - b.order)
    : [];

  // c. All items in this group (same group, excluding source and original target)
  const candidatesAllGroup = targetItem
    ? items.filter(
        (i) =>
          i.groupId === targetItem.groupId &&
          i.id !== targetItem.id &&
          i.id !== newDep.sourceItemId,
      )
    : [];

  // d. Items below on the board: items below target in its group + items in groups
  //    that appear after the target's group (by derived group order).
  const candidatesBelowBoard = targetItem
    ? items.filter(
        (i) =>
          i.id !== targetItem.id &&
          i.id !== newDep.sourceItemId &&
          (
            (i.groupId === targetItem.groupId && i.order > targetItem.order) ||
            (i.groupId !== targetItem.groupId && (groupMinOrder[i.groupId] ?? 0) > targetGroupOrder)
          ),
      )
    : [];

  // e. All items on the board (excluding source and original target)
  const candidatesAllBoard = items.filter(
    (i) => i.id !== newDep.targetItemId && i.id !== newDep.sourceItemId,
  );

  const applyToItems = (targets: Item[]) => {
    const newDepIds: string[] = [];

    // Sort targets by visual order (group position, then item order within group)
    // so the chain flows top-to-bottom as rendered on the board.
    const sortedTargets = [...targets].sort((a, b) => {
      const aGroupOrder = groupMinOrder[a.groupId] ?? 0;
      const bGroupOrder = groupMinOrder[b.groupId] ?? 0;
      if (aGroupOrder !== bGroupOrder) return aGroupOrder - bGroupOrder;
      return a.order - b.order;
    });

    // Build a chain: newDep already links source → target.
    // Each additional item depends on the previous one, not the original source.
    let prevItemId = newDep.targetItemId;

    for (const targetIt of sortedTargets) {
      if (targetIt.id === prevItemId) continue;

      const existingDeps = targetIt.dependencies ?? [];
      const alreadyLinked = existingDeps.some(
        (d) =>
          d.sourceColumnId === newDep.sourceColumnId &&
          d.targetColumnId === newDep.targetColumnId,
      );
      if (alreadyLinked) {
        prevItemId = targetIt.id;
        continue;
      }

      const dep: TimeRangeDependency = {
        id: crypto.randomUUID(),
        sourceItemId: prevItemId,
        sourceColumnId: newDep.sourceColumnId,
        targetItemId: targetIt.id,
        targetColumnId: newDep.targetColumnId,
        offsetDays: newDep.offsetDays,
      };

      updateItem({ id: targetIt.id, patch: { dependencies: [...existingDeps, dep] } });
      newDepIds.push(dep.id);
      prevItemId = targetIt.id;
    }
    // Include the original dep so it flashes too
    onApply([newDep.id, ...newDepIds]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10003] flex items-end justify-center pb-8 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Apply dependency rule"
    >
      <div className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-indigo-100 px-5 py-4 max-w-sm w-full mx-4 animate-in fade-in slide-in-from-bottom-4">
        <p className="text-sm font-semibold text-gray-800 mb-1">Apply this dependency rule?</p>
        <p className="text-xs text-gray-500 mb-4">
          You just linked two time range columns. Apply the same rule to other items automatically.
        </p>

        <div className="flex flex-col gap-2">
          {/* a. Just this one */}
          <button
            type="button"
            onClick={() => { onApply([newDep.id]); onClose(); }}
            className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium transition-colors"
            aria-label="Keep only this one dependency"
          >
            Just this one
            <span className="ml-2 text-xs font-normal text-gray-400">(1 item)</span>
          </button>

          {/* b. Apply to items below in this group */}
          {candidatesBelow.length > 0 && (
            <button
              type="button"
              onClick={() => applyToItems(candidatesBelow)}
              className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition-colors"
              aria-label={`Apply to ${candidatesBelow.length + 1} items below in this group`}
            >
              Apply to items below in this group
              <span className="ml-2 text-xs font-normal text-indigo-400">
                ({candidatesBelow.length + 1} item{candidatesBelow.length + 1 !== 1 ? 's' : ''})
              </span>
            </button>
          )}

          {/* c. Apply to all items in this group */}
          {candidatesAllGroup.length > 0 && (
            <button
              type="button"
              onClick={() => applyToItems(candidatesAllGroup)}
              className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition-colors"
              aria-label={`Apply to all ${candidatesAllGroup.length + 1} items in this group`}
            >
              Apply to all items in this group
              <span className="ml-2 text-xs font-normal text-indigo-400">
                ({candidatesAllGroup.length + 1} item{candidatesAllGroup.length + 1 !== 1 ? 's' : ''})
              </span>
            </button>
          )}

          {/* d. Apply to items below on the board */}
          {candidatesBelowBoard.length > 0 && (
            <button
              type="button"
              onClick={() => applyToItems(candidatesBelowBoard)}
              className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors"
              aria-label={`Apply to ${candidatesBelowBoard.length + 1} items below on the board`}
            >
              Apply to items below on the board
              <span className="ml-2 text-xs font-normal text-purple-400">
                ({candidatesBelowBoard.length + 1} item{candidatesBelowBoard.length + 1 !== 1 ? 's' : ''})
              </span>
            </button>
          )}

          {/* e. Apply to all items on the board */}
          {candidatesAllBoard.length > 0 && (
            <button
              type="button"
              onClick={() => applyToItems(candidatesAllBoard)}
              className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors"
              aria-label={`Apply to all ${candidatesAllBoard.length + 1} items on the board`}
            >
              Apply to all items on the board
              <span className="ml-2 text-xs font-normal text-purple-400">
                ({candidatesAllBoard.length + 1} item{candidatesAllBoard.length + 1 !== 1 ? 's' : ''})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="w-full text-center text-sm px-4 py-2 rounded-lg text-red-400 hover:bg-red-50 transition-colors border border-red-100"
            aria-label="Cancel and remove this dependency"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DependencyApplyModal;
