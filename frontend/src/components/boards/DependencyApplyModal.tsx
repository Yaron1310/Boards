import React, { useEffect } from 'react';
import type { Item, TimeRangeDependency } from '../../types';
import { useUpdateItem } from '../../hooks/queries/useItemQueries';

interface Props {
  /** The newly created dependency that triggered this modal */
  newDep: TimeRangeDependency;
  /** All items on the board, used to find rows below in the same group */
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

  // Items in the same group that come after the target item (by order)
  const targetItem = items.find((i) => i.id === newDep.targetItemId);
  const candidatesInGroup = targetItem
    ? items
        .filter(
          (i) =>
            i.groupId === targetItem.groupId &&
            i.id !== targetItem.id &&
            i.order > targetItem.order,
        )
        .sort((a, b) => a.order - b.order)
    : [];

  // Items on the whole board (other groups) minus already covered
  const candidatesOnBoard = items.filter(
    (i) =>
      i.id !== newDep.targetItemId &&
      !candidatesInGroup.some((c) => c.id === i.id),
  );

  const applyToItems = (targets: Item[]) => {
    const newDepIds: string[] = [];
    for (const targetIt of targets) {
      // Skip items that already have a dependency with the same source column → target column
      const existingDeps = targetIt.dependencies ?? [];
      const alreadyLinked = existingDeps.some(
        (d) =>
          d.sourceColumnId === newDep.sourceColumnId &&
          d.targetColumnId === newDep.targetColumnId,
      );
      if (alreadyLinked) continue;

      // Find the source item that corresponds to this target's row.
      // Convention: look for an item in the same group as targetIt that has a value in sourceColumnId.
      const sourceItem = items.find(
        (i) =>
          i.groupId === targetIt.groupId &&
          i.id !== targetIt.id &&
          i.values[newDep.sourceColumnId] != null,
      ) ?? items.find(
        (i) => i.id === newDep.sourceItemId,
      );

      if (!sourceItem) continue;
      // Prevent self-loop: source and target must be different items
      if (sourceItem.id === targetIt.id) continue;

      const dep: TimeRangeDependency = {
        id: crypto.randomUUID(),
        sourceItemId: sourceItem.id,
        sourceColumnId: newDep.sourceColumnId,
        targetItemId: targetIt.id,
        targetColumnId: newDep.targetColumnId,
        offsetDays: newDep.offsetDays,
      };

      updateItem({ id: targetIt.id, patch: { dependencies: [...existingDeps, dep] } });
      newDepIds.push(dep.id);
    }
    // Always include the original dep so it flashes too
    onApply([newDep.id, ...newDepIds]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none"
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
          {candidatesInGroup.length > 0 && (
            <button
              type="button"
              onClick={() => applyToItems(candidatesInGroup)}
              className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition-colors"
              aria-label={`Apply to ${candidatesInGroup.length} items below in this group`}
            >
              Apply to items below in this group
              <span className="ml-2 text-xs font-normal text-indigo-400">
                ({candidatesInGroup.length} item{candidatesInGroup.length !== 1 ? 's' : ''})
              </span>
            </button>
          )}

          {candidatesOnBoard.length > 0 && (
            <button
              type="button"
              onClick={() => applyToItems(candidatesOnBoard)}
              className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors"
              aria-label={`Apply to all ${candidatesOnBoard.length} other items on the board`}
            >
              Apply to all items on the board
              <span className="ml-2 text-xs font-normal text-purple-400">
                ({candidatesOnBoard.length} item{candidatesOnBoard.length !== 1 ? 's' : ''})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => { onApply([newDep.id]); onClose(); }}
            className="w-full text-center text-sm px-4 py-2 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
            aria-label="Keep only this one dependency"
          >
            Just this one
          </button>

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
