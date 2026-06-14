import React, { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { useDashboardOverdue } from '../../../hooks/queries/useDashboardQueries';
import type { DashboardParams, Item } from '../../../types';

interface Props {
  count: number;
  items: Item[];
  dashboardParams: DashboardParams;
  boardNameMap: Record<string, string>;
}

function daysOverdue(dueDate: Date | string): number {
  const due = new Date(dueDate);
  const now = new Date();
  return Math.floor((now.getTime() - due.getTime()) / 86_400_000);
}

// ─── Single row ───────────────────────────────────────────────────────────────

interface OverdueRowProps {
  item: Item;
  boardName?: string;
}

const OverdueRow: React.FC<OverdueRowProps> = ({ item, boardName }) => {
  const days = item.dueDate !== undefined ? daysOverdue(item.dueDate) : null;
  return (
    <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
        {boardName && (
          <span className="text-xs text-gray-400">{boardName}</span>
        )}
      </div>
      {days !== null && (
        <span className="ml-4 shrink-0 text-xs font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5">
          {days}d overdue
        </span>
      )}
    </li>
  );
};

// ─── "View all" modal ─────────────────────────────────────────────────────────

interface AllOverdueModalProps {
  count: number;
  dashboardParams: DashboardParams;
  boardNameMap: Record<string, string>;
  onClose: () => void;
}

const AllOverdueModal: React.FC<AllOverdueModalProps> = ({
  count,
  dashboardParams,
  boardNameMap,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const { data, isLoading } = useDashboardOverdue({ ...dashboardParams, limit: 100 });
  const items = data?.data ?? [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`All ${count} overdue items`}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            All Overdue Items ({count})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded p-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Close overdue items modal"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {isLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No overdue items</p>
          ) : (
            <ul aria-label="All overdue items">
              {items.map(item => (
                <OverdueRow
                  key={item.id}
                  item={item}
                  boardName={boardNameMap[item.boardId]}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Widget ───────────────────────────────────────────────────────────────────

const OverdueItemsWidget: React.FC<Props> = ({ count, items, dashboardParams, boardNameMap }) => {
  const [modalOpen, setModalOpen] = useState(false);

  const preview = [...items]
    .sort((a, b) => {
      const da = a.dueDate !== undefined ? new Date(a.dueDate).getTime() : 0;
      const db = b.dueDate !== undefined ? new Date(b.dueDate).getTime() : 0;
      return da - db;
    })
    .slice(0, 5);

  return (
    <>
      <ul aria-label="Overdue items preview">
        {preview.map(item => (
          <OverdueRow
            key={item.id}
            item={item}
            boardName={boardNameMap[item.boardId]}
          />
        ))}
      </ul>

      {count > 5 && (
        <button
          className="mt-3 text-sm text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          onClick={() => setModalOpen(true)}
          aria-label={`View all ${count} overdue items`}
        >
          View all {count} overdue items →
        </button>
      )}

      {modalOpen && (
        <AllOverdueModal
          count={count}
          dashboardParams={dashboardParams}
          boardNameMap={boardNameMap}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
};

export default OverdueItemsWidget;
