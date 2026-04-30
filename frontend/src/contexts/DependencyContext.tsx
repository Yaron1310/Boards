import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, TimeRangeDependency } from '../types';
import { useUpdateItem } from '../hooks/queries/useItemQueries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CellRef {
  itemId: string;
  columnId: string;
}

interface DrawState {
  source: CellRef;
  mouseX: number;
  mouseY: number;
  hoveredTarget: CellRef | null;
}

interface DependencyContextValue {
  // All board items (needed by TimeRangeCell for formula resolution)
  items: Item[];

  // Draw mode
  drawState: DrawState | null;
  startDraw: (source: CellRef, mouseX?: number, mouseY?: number) => void;
  cancelDraw: () => void;
  setDrawMouse: (x: number, y: number) => void;
  setHoveredTarget: (target: CellRef | null) => void;
  confirmDraw: (target: CellRef) => void;

  // Toast flag for circular dep — BoardViewPage reads and clears this
  circularDepDetected: boolean;
  clearCircularDepFlag: () => void;

  // Pending dep for the "apply to group?" prompt
  pendingApplyDep: TimeRangeDependency | null;
  clearPendingApplyDep: () => void;

  // Hover highlight
  hoveredCell: CellRef | null;
  setHoveredCell: (cell: CellRef | null) => void;

  // Dependency queries
  getDepsFrom: (itemId: string, columnId: string) => TimeRangeDependency[];
  getDepsTo: (itemId: string, columnId: string) => TimeRangeDependency[];
  allDeps: TimeRangeDependency[];

  // ID of the dep that was just drawn — DepLine uses it to auto-show for 1 s
  justCreatedDepIds: ReadonlySet<string>;
  addJustCreatedDepIds: (ids: string[]) => void;

  // Mutations
  removeDependency: (dep: TimeRangeDependency) => void;

  // Cell rect registry
  registerCellRect: (ref: CellRef, el: HTMLElement | null) => void;
  getCellRect: (ref: CellRef) => DOMRect | null;
  boardContainerRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DependencyContext = createContext<DependencyContextValue | null>(null);

export const useDependency = (): DependencyContextValue => {
  const ctx = useContext(DependencyContext);
  if (!ctx) throw new Error('useDependency must be used inside DependencyProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildDepList = (items: Item[]): TimeRangeDependency[] =>
  items.flatMap((item) => item.dependencies ?? []);

const hasCycle = (allDeps: TimeRangeDependency[], newDep: TimeRangeDependency): boolean => {
  const key = (itemId: string, colId: string) => `${itemId}::${colId}`;
  const adj: Record<string, Set<string>> = {};

  for (const d of [...allDeps, newDep]) {
    const src = key(d.sourceItemId, d.sourceColumnId);
    const tgt = key(d.targetItemId, d.targetColumnId);
    if (!adj[src]) adj[src] = new Set();
    adj[src].add(tgt);
  }

  const start = key(newDep.targetItemId, newDep.targetColumnId);
  const goal = key(newDep.sourceItemId, newDep.sourceColumnId);
  const visited = new Set<string>();
  const stack = [start];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === goal) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of adj[node] ?? []) stack.push(neighbor);
  }
  return false;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Props {
  children: React.ReactNode;
  items: Item[];
}

export const DependencyProvider: React.FC<Props> = ({ children, items }) => {
  const { mutate: updateItem } = useUpdateItem();

  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [hoveredCell, setHoveredCell] = useState<CellRef | null>(null);
  const [circularDepDetected, setCircularDepDetected] = useState(false);
  const [pendingApplyDep, setPendingApplyDep] = useState<TimeRangeDependency | null>(null);
  const [justCreatedDepIds, setJustCreatedDepIds] = useState<Set<string>>(new Set());

  const addJustCreatedDepIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setJustCreatedDepIds((prev) => new Set([...prev, ...ids]));
    setTimeout(() => {
      setJustCreatedDepIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, 3500);
  }, []);

  const cellEls = useRef<Map<string, HTMLElement>>(new Map());
  const boardContainerRef = useRef<HTMLDivElement | null>(null);

  const cellKey = (ref: CellRef) => `${ref.itemId}::${ref.columnId}`;

  const registerCellRect = useCallback((ref: CellRef, el: HTMLElement | null) => {
    const k = cellKey(ref);
    if (el) cellEls.current.set(k, el);
    else cellEls.current.delete(k);
  }, []);

  const getCellRect = useCallback((ref: CellRef): DOMRect | null => {
    const el = cellEls.current.get(cellKey(ref));
    return el ? el.getBoundingClientRect() : null;
  }, []);

  const allDeps = useMemo(() => buildDepList(items), [items]);

  const getDepsFrom = useCallback(
    (itemId: string, columnId: string) =>
      allDeps.filter((d) => d.sourceItemId === itemId && d.sourceColumnId === columnId),
    [allDeps],
  );

  const getDepsTo = useCallback(
    (itemId: string, columnId: string) =>
      allDeps.filter((d) => d.targetItemId === itemId && d.targetColumnId === columnId),
    [allDeps],
  );

  const startDraw = useCallback((source: CellRef, mouseX = 0, mouseY = 0) => {
    setDrawState({ source, mouseX, mouseY, hoveredTarget: null });
  }, []);

  const cancelDraw = useCallback(() => setDrawState(null), []);

  const setDrawMouse = useCallback((x: number, y: number) => {
    setDrawState((prev) => prev ? { ...prev, mouseX: x, mouseY: y } : null);
  }, []);

  const setHoveredTarget = useCallback((target: CellRef | null) => {
    setDrawState((prev) => prev ? { ...prev, hoveredTarget: target } : null);
  }, []);

  const confirmDraw = useCallback(
    (target: CellRef) => {
      if (!drawState) return;
      const { source } = drawState;

      if (source.itemId === target.itemId && source.columnId === target.columnId) {
        setDrawState(null);
        return;
      }

      const newDep: TimeRangeDependency = {
        id: crypto.randomUUID(),
        sourceItemId: source.itemId,
        sourceColumnId: source.columnId,
        targetItemId: target.itemId,
        targetColumnId: target.columnId,
        offsetDays: 0,
      };

      if (hasCycle(allDeps, newDep)) {
        setDrawState(null);
        setCircularDepDetected(true);
        return;
      }

      setDrawState(null);

      const targetItem = items.find((i) => i.id === target.itemId);
      if (!targetItem) return;

      const existingDeps = targetItem.dependencies ?? [];
      const alreadyExists = existingDeps.some(
        (d) =>
          d.sourceItemId === source.itemId &&
          d.sourceColumnId === source.columnId &&
          d.targetColumnId === target.columnId,
      );
      if (alreadyExists) return;

      updateItem({ id: target.itemId, patch: { dependencies: [...existingDeps, newDep] } });
      setPendingApplyDep(newDep);
    },
    [drawState, allDeps, items, updateItem, addJustCreatedDepIds],
  );

  const removeDependency = useCallback(
    (dep: TimeRangeDependency) => {
      const targetItem = items.find((i) => i.id === dep.targetItemId);
      if (!targetItem) return;
      const updated = (targetItem.dependencies ?? []).filter((d) => d.id !== dep.id);
      updateItem({ id: dep.targetItemId, patch: { dependencies: updated } });
    },
    [items, updateItem],
  );

  const clearCircularDepFlag = useCallback(() => setCircularDepDetected(false), []);
  const clearPendingApplyDep = useCallback(() => setPendingApplyDep(null), []);

  // Esc cancels draw mode
  useEffect(() => {
    if (!drawState) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelDraw(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawState, cancelDraw]);

  const value = useMemo<DependencyContextValue>(
    () => ({
      items,
      drawState,
      startDraw,
      cancelDraw,
      setDrawMouse,
      setHoveredTarget,
      confirmDraw,
      circularDepDetected,
      clearCircularDepFlag,
      pendingApplyDep,
      clearPendingApplyDep,
      hoveredCell,
      setHoveredCell,
      getDepsFrom,
      getDepsTo,
      allDeps,
      justCreatedDepIds,
      addJustCreatedDepIds,
      removeDependency,
      registerCellRect,
      getCellRect,
      boardContainerRef,
    }),
    [
      items, drawState, startDraw, cancelDraw, setDrawMouse, setHoveredTarget, confirmDraw,
      circularDepDetected, clearCircularDepFlag, pendingApplyDep, clearPendingApplyDep,
      hoveredCell, setHoveredCell, getDepsFrom, getDepsTo, allDeps,
      justCreatedDepIds, addJustCreatedDepIds, removeDependency, registerCellRect, getCellRect,
    ],
  );

  return (
    <DependencyContext.Provider value={value}>
      {children}
    </DependencyContext.Provider>
  );
};
