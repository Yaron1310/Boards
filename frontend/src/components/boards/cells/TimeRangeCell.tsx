import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, TimeRangeValue, TimeRangeDependency } from '../../../types';
import { useDependency } from '../../../contexts/DependencyContext';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const toDateInput = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const formatDate = (val: Date | null | undefined): string => {
  if (!val) return '';
  return `${val.getDate()}.${val.getMonth() + 1}.${val.getFullYear()}`;
};

const toDate = (val: string | Date | null | undefined): Date | null => {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
};

const pluralDays = (n: number) => `${n} day${n !== 1 ? 's' : ''}`;

const getDurationText = (start: Date | null, end: Date | null): string => {
  if (!start || !end) return '';
  const total = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const left = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  return left > 0 ? `${pluralDays(total)} (${pluralDays(left)} left)` : pluralDays(total);
};

// ---------------------------------------------------------------------------
// Dependency formula helpers
// ---------------------------------------------------------------------------

// Compute display dates from the dependency formula — purely for rendering,
// never written to the DB. Returns raw values unchanged when:
//   - there are no incoming deps, OR
//   - the source cell has no end date (never invents dates)
const resolveEffectiveDates = (
  rawValue: TimeRangeValue | null | undefined,
  depsIn: TimeRangeDependency[],
  allItems: Item[],
): { start: Date | null; end: Date | null; isComputed: boolean } => {
  const rawStart = toDate(rawValue?.start);
  const rawEnd = toDate(rawValue?.end);

  // Only shift dates the user already entered — never create dates for an empty cell
  if (!rawStart) return { start: rawStart, end: rawEnd, isComputed: false };

  for (const dep of depsIn) {
    const srcVal = allItems.find((i) => i.id === dep.sourceItemId)
      ?.values[dep.sourceColumnId] as TimeRangeValue | null | undefined;
    const srcEnd = toDate(srcVal?.end);
    if (!srcEnd) continue;

    const newStart = new Date(srcEnd);
    newStart.setDate(newStart.getDate() + dep.offsetDays);

    const durMs = rawEnd ? Math.max(0, rawEnd.getTime() - rawStart.getTime()) : 0;
    const newEnd = durMs > 0 ? new Date(newStart.getTime() + durMs) : null;

    return { start: newStart, end: newEnd, isComputed: true };
  }
  return { start: rawStart, end: rawEnd, isComputed: false };
};

interface ComputedTarget {
  dep: TimeRangeDependency;
  targetItemId: string;
  targetColumnId: string;
  start: string;
  end: string | null;
  durationDays: number;
}

// Returns the formula-driven dates for a target item (used by source cell's
// blue-dot flow to know what each target is currently displaying).
const computeTargetEffective = (dep: TimeRangeDependency, allItems: Item[]): ComputedTarget | null => {
  const srcVal = allItems.find((i) => i.id === dep.sourceItemId)
    ?.values[dep.sourceColumnId] as TimeRangeValue | null | undefined;
  const srcEnd = toDate(srcVal?.end);
  if (!srcEnd) return null;

  const tgtItem = allItems.find((i) => i.id === dep.targetItemId);
  if (!tgtItem) return null;
  const tgtVal = tgtItem.values[dep.targetColumnId] as TimeRangeValue | null | undefined;

  // Don't compute for target cells with no user-entered dates
  if (!toDate(tgtVal?.start)) return null;

  const newStart = new Date(srcEnd);
  newStart.setDate(newStart.getDate() + dep.offsetDays);

  const rawStart = toDate(tgtVal?.start);
  const rawEnd = toDate(tgtVal?.end);
  const durMs = rawStart && rawEnd ? Math.max(0, rawEnd.getTime() - rawStart.getTime()) : 0;
  const newEnd = durMs > 0 ? new Date(newStart.getTime() + durMs) : null;

  return {
    dep,
    targetItemId: dep.targetItemId,
    targetColumnId: dep.targetColumnId,
    start: newStart.toISOString(),
    end: newEnd?.toISOString() ?? null,
    durationDays: durMs > 0 ? Math.round(durMs / 86_400_000) : (tgtVal?.durationDays ?? 1),
  };
};

// ---------------------------------------------------------------------------
// Traffic light
// ---------------------------------------------------------------------------

const TrafficLight: React.FC<{ date: Date | null; type: 'start' | 'end' }> = ({ date: _date, type }) => {
  let red = '#666666';
  let green = '#666666';
  if (type === 'start') green = '#22c55e';
  else red = '#ef4444';

  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] -ml-1">
      <rect x="7" y="3" width="10" height="18" rx="3" fill="#000000" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
      <circle cx="12" cy="7" r="2" fill={red} />
      <circle cx="12" cy="12" r="2" fill="#666666" />
      <circle cx="12" cy="17" r="2" fill={green} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TimeRangeCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as TimeRangeValue | null | undefined;
  const { mutate } = useUpdateItem();
  const [start, setStart] = useState(toDateInput(rawValue?.start));
  const [end, setEnd] = useState(toDateInput(rawValue?.end));
  const [hovered, setHovered] = useState(false);
  const [showDepMenu, setShowDepMenu] = useState<'in' | 'out' | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  // Pending removal confirmation: holds the deps to remove + targets with computed dates
  const [removeConfirm, setRemoveConfirm] = useState<{
    depsToRemove: TimeRangeDependency[];
    computedTargets: ComputedTarget[];
  } | null>(null);
  const cellRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = () => { setShowDepMenu(null); setRemoveConfirm(null); };

  const openDepMenu = (type: 'in' | 'out', btn: EventTarget & HTMLButtonElement) => {
    const r = btn.getBoundingClientRect();
    setMenuAnchor({ x: r.left + r.width / 2, y: r.top });
    setRemoveConfirm(null);
    setShowDepMenu((v) => (v === type ? null : type));
  };

  useEffect(() => {
    if (!showDepMenu) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showDepMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    drawState,
    startDraw,
    cancelDraw,
    setHoveredTarget,
    confirmDraw,
    hoveredCell,
    setHoveredCell,
    getDepsFrom,
    getDepsTo,
    removeDependency,
    registerCellRect,
    items: allItems,
  } = useDependency();

  const cellRefId = { itemId: item.id, columnId: column.id };
  const isDrawing = drawState !== null;
  const isSource = drawState?.source.itemId === item.id && drawState?.source.columnId === column.id;
  const isValidTarget = isDrawing && !isSource;
  const hasDepsOut = getDepsFrom(item.id, column.id).length > 0;
  const hasDepsIn = getDepsTo(item.id, column.id).length > 0;
  const isHoveredCell = hoveredCell?.itemId === item.id && hoveredCell?.columnId === column.id;

  useEffect(() => {
    registerCellRect(cellRefId, cellRef.current);
    return () => registerCellRect(cellRefId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCellRect]);

  useEffect(() => {
    setStart(toDateInput(rawValue?.start));
    setEnd(toDateInput(rawValue?.end));
  }, [rawValue]);

  // Compute display dates: formula-driven if source has an end date, raw otherwise.
  const depsIn = getDepsTo(item.id, column.id);
  const { start: displayStart, end: displayEnd, isComputed } = resolveEffectiveDates(rawValue, depsIn, allItems);

  const isDependentCell = hasDepsIn;

  // ---------------------------------------------------------------------------
  // Removal helpers — prompt keep/revert when formula-computed dates exist
  // ---------------------------------------------------------------------------

  // Incoming dep removal (orange dot — current cell is the target)
  const triggerRemoveIn = (dep: TimeRangeDependency) => {
    if (isComputed && displayStart) {
      const durMs = displayEnd ? Math.max(0, displayEnd.getTime() - displayStart.getTime()) : 0;
      setRemoveConfirm({
        depsToRemove: [dep],
        computedTargets: [{
          dep,
          targetItemId: item.id,
          targetColumnId: column.id,
          start: displayStart.toISOString(),
          end: displayEnd?.toISOString() ?? null,
          durationDays: durMs > 0 ? Math.round(durMs / 86_400_000) : (rawValue?.durationDays ?? 1),
        }],
      });
    } else {
      removeDependency(dep);
      closeMenu();
    }
  };

  // Outgoing dep removal (blue dot — current cell is the source, targets are other items)
  const triggerRemoveOut = () => {
    const deps = getDepsFrom(item.id, column.id);
    const computedTargets = deps
      .map((dep) => computeTargetEffective(dep, allItems))
      .filter((x): x is ComputedTarget => x !== null);

    if (computedTargets.length > 0) {
      setRemoveConfirm({ depsToRemove: deps, computedTargets });
    } else {
      deps.forEach((d) => removeDependency(d));
      closeMenu();
    }
  };

  const handleKeepDates = () => {
    if (!removeConfirm) return;
    for (const t of removeConfirm.computedTargets) {
      mutate({ id: t.targetItemId, patch: { values: { [t.targetColumnId]: { start: t.start, end: t.end, durationDays: t.durationDays } } } });
    }
    removeConfirm.depsToRemove.forEach((d) => removeDependency(d));
    closeMenu();
  };

  const handleRevertDates = () => {
    if (!removeConfirm) return;
    removeConfirm.depsToRemove.forEach((d) => removeDependency(d));
    closeMenu();
  };

  // ---------------------------------------------------------------------------
  // Commit user-entered dates
  // ---------------------------------------------------------------------------

  const commit = (stopEdit: () => void) => {
    const nextStart = start ? new Date(start).toISOString() : null;
    const nextEnd = end ? new Date(end).toISOString() : null;
    const durationDays =
      nextStart && nextEnd
        ? Math.max(0, Math.round((new Date(nextEnd).getTime() - new Date(nextStart).getTime()) / 86_400_000))
        : (rawValue?.durationDays ?? 1);
    mutate({
      id: item.id,
      patch: { values: { [column.id]: { start: nextStart, end: nextEnd, durationDays } } },
    });
    setHovered(false);
    stopEdit();
  };

  const handleConnectorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDrawing ? cancelDraw() : startDraw(cellRefId, e.clientX, e.clientY);
  };

  const handleCellClick = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    if (isSource) { cancelDraw(); return; }
    e.stopPropagation();
    confirmDraw(cellRefId);
  };

  const handleMouseEnter = () => {
    setHoveredCell(cellRefId);
    setHovered(true);
    if (isValidTarget) setHoveredTarget(cellRefId);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
    setHovered(false);
    if (isValidTarget) setHoveredTarget(null);
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <div
              className="flex items-center gap-1 px-2 py-1 w-full bg-white rounded shadow-lg border border-indigo-200 z-30"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(stopEdit);
              }}
            >
              <input
                type="date"
                value={start}
                autoFocus
                className="flex-1 text-[10px] border border-gray-100 rounded px-1 py-0.5 outline-none focus:border-indigo-400 text-center"
                onChange={(e) => setStart(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                  if (e.key === 'Escape') {
                    setStart(toDateInput(rawValue?.start));
                    setEnd(toDateInput(rawValue?.end));
                    setHovered(false);
                    stopEdit();
                  }
                }}
              />
              <span className="text-gray-400 text-[10px] flex-shrink-0">→</span>
              <input
                type="date"
                value={end}
                className="flex-1 text-[10px] border border-gray-100 rounded px-1 py-0.5 outline-none focus:border-indigo-400 text-center"
                onChange={(e) => setEnd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                  if (e.key === 'Escape') {
                    setStart(toDateInput(rawValue?.start));
                    setEnd(toDateInput(rawValue?.end));
                    setHovered(false);
                    stopEdit();
                  }
                }}
              />
            </div>
          );
        }

        const isEmpty = !displayStart && !displayEnd;
        const durationText = getDurationText(displayStart, displayEnd);

        return (
          <div
            ref={cellRef}
            className={`px-1 py-0.5 flex justify-center w-full overflow-visible relative ${
              isSource ? 'ring-2 ring-inset ring-blue-500 rounded' : ''
            }`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={isDrawing ? handleCellClick : undefined}
            style={isDrawing && isValidTarget ? { cursor: 'crosshair' } : undefined}
            aria-label={`${column.name} for ${item.name}`}
          >
            {isEmpty ? (
              <div className="px-3 py-2 text-xs text-gray-300 text-center w-full italic">
                Set range
              </div>
            ) : (
              <div
                className="flex items-center justify-center w-full gap-[2px] px-3 h-[26px] rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.1)] cursor-default"
                style={{
                  background: isDependentCell
                    ? 'linear-gradient(90deg, #8b5cf6, #6366f1)'
                    : 'linear-gradient(90deg, #6366f1, #3b82f6)',
                }}
                aria-label={hovered && durationText ? durationText : `${formatDate(displayStart)} to ${formatDate(displayEnd)}`}
              >
                {hovered && durationText ? (
                  <span className="text-center leading-tight">{durationText}</span>
                ) : (
                  <>
                    <span className="flex items-center gap-0.5">
                      <TrafficLight date={displayStart} type="start" />
                      {formatDate(displayStart) || '?'}
                    </span>
                    <span className="ml-1.5 flex items-center">
                      <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] fill-none stroke-white stroke-[2.5]">
                        <line x1="1" y1="12" x2="19" y2="12" />
                        <polyline points="13 6 19 12 13 18" />
                      </svg>
                    </span>
                    <span className="flex items-center gap-0.5 ml-0.5">
                      <TrafficLight date={displayEnd} type="end" />
                      {formatDate(displayEnd) || '?'}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Incoming dependency dot — orange with X; click to remove individual incoming links */}
            {hasDepsIn && !isDrawing && (
              <button
                type="button"
                className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-400 border border-white shadow hover:scale-125 transition-transform flex items-center justify-center"
                style={{ zIndex: 10000 }}
                aria-label="Incoming dependency — click to remove"
                title="Click to remove incoming dependency"
                onClick={(e) => {
                  e.stopPropagation();
                  openDepMenu('in', e.currentTarget);
                }}
              >
                <svg viewBox="0 0 8 8" className="w-[6px] h-[6px]" aria-hidden="true">
                  <line x1="1" y1="1" x2="7" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="7" y1="1" x2="1" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* Outgoing dependency dot — blue; click to remove all outgoing links */}
            {hasDepsOut && !isDrawing && (
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border border-white shadow hover:scale-125 transition-transform flex items-center justify-center"
                style={{ zIndex: 10000 }}
                aria-label="Outgoing dependency — click to remove all"
                title="Click to remove all outgoing dependencies"
                onClick={(e) => {
                  e.stopPropagation();
                  openDepMenu('out', e.currentTarget);
                }}
              >
                <svg viewBox="0 0 8 8" className="w-[6px] h-[6px]" aria-hidden="true">
                  <line x1="1" y1="1" x2="7" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="7" y1="1" x2="1" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* Dependency removal popover — rendered via portal to float above SVG overlay */}
            {showDepMenu && menuAnchor && createPortal(
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                  onClick={closeMenu}
                  aria-hidden="true"
                />
                <div
                  style={{
                    position: 'fixed',
                    left: menuAnchor.x,
                    top: menuAnchor.y,
                    transform: 'translate(-50%, calc(-100% - 8px))',
                    zIndex: 10001,
                  }}
                  className="bg-white border border-gray-200 rounded-lg shadow-xl min-w-[200px] py-1"
                  role="menu"
                  aria-label="Dependency options"
                  onClick={(e) => e.stopPropagation()}
                >
                  {removeConfirm ? (
                    // Keep / revert confirmation step
                    <>
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-700 leading-snug">
                        {removeConfirm.computedTargets.length === 1 && removeConfirm.computedTargets[0].targetItemId === item.id
                          ? 'This cell shows formula-driven dates.'
                          : `${removeConfirm.computedTargets.length} target cell(s) show formula-driven dates.`}
                      </p>
                      <p className="px-3 pb-2 text-[10px] text-gray-400">
                        Keep the current dates or revert to the original?
                      </p>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 font-medium"
                        onClick={handleKeepDates}
                        aria-label="Keep formula-computed dates after removing link"
                      >
                        Keep current dates
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        onClick={handleRevertDates}
                        aria-label="Revert to original dates after removing link"
                      >
                        Revert to original dates
                      </button>
                      <div className="border-t border-gray-100 mt-1">
                        <button
                          type="button"
                          className="w-full text-center px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                          onClick={closeMenu}
                          aria-label="Cancel removal"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    // Normal dep list
                    <>
                      <p className="px-3 pt-1 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        {showDepMenu === 'in' ? 'Incoming' : 'Outgoing'} dependencies
                      </p>
                      {showDepMenu === 'out' ? (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                          onClick={triggerRemoveOut}
                        >
                          <span className="text-red-400">✕</span>
                          Remove all links ({getDepsFrom(item.id, column.id).length})
                        </button>
                      ) : (
                        getDepsTo(item.id, column.id).map((dep) => (
                          <button
                            key={dep.id}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                            onClick={() => triggerRemoveIn(dep)}
                          >
                            <span className="text-red-400">✕</span>
                            Remove link
                          </button>
                        ))
                      )}
                      <div className="border-t border-gray-100 mt-1">
                        <button
                          type="button"
                          className="w-full text-center px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                          onClick={closeMenu}
                          aria-label="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>,
              document.body
            )}

            {/* Connector handle — inside the cell, right side */}
            {(hovered || isHoveredCell || isSource) && !isEditing && !isDrawing && (
              <button
                type="button"
                className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow transition-all z-20 bg-white border-indigo-400 hover:bg-indigo-100 hover:scale-125"
                onClick={handleConnectorClick}
                aria-label="Start dependency from this cell"
                title="Draw dependency"
              />
            )}

            {/* Source cancel handle when in draw mode */}
            {isSource && !isEditing && (
              <button
                type="button"
                className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow transition-all z-20 bg-blue-500 border-blue-600 scale-125"
                onClick={handleConnectorClick}
                aria-label="Cancel dependency drawing"
                title="Click to cancel"
              />
            )}

          </div>
        );
      }}
    </CellWrapper>
  );
};

export default TimeRangeCell;
