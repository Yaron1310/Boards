import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, TimeRangeValue } from '../../../types';
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
  const cellRef = useRef<HTMLDivElement | null>(null);

  const openDepMenu = (type: 'in' | 'out', btn: EventTarget & HTMLButtonElement) => {
    const r = btn.getBoundingClientRect();
    setMenuAnchor({ x: r.left + r.width / 2, y: r.top });
    setShowDepMenu((v) => (v === type ? null : type));
  };

  useEffect(() => {
    if (!showDepMenu) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowDepMenu(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showDepMenu]);

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

  // Dependency formula: when any source cell's end date changes, shift this
  // cell's start to sourceEnd + offsetDays and shift end to preserve duration.
  const depsIn = getDepsTo(item.id, column.id);
  const depFormulaKey = depsIn
    .map((dep) => {
      const srcVal = allItems.find((i) => i.id === dep.sourceItemId)
        ?.values[dep.sourceColumnId] as TimeRangeValue | null | undefined;
      return `${dep.id}:${srcVal?.end ?? ''}:${dep.offsetDays}`;
    })
    .join('|');

  // Using refs so the effect body always reads the latest values without
  // needing them as deps (we only want to fire when the source end changes).
  const rawValueRef = useRef(rawValue);
  rawValueRef.current = rawValue;
  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;
  const depsInRef = useRef(depsIn);
  depsInRef.current = depsIn;

  useEffect(() => {
    const deps = depsInRef.current;
    const items = allItemsRef.current;
    const rv = rawValueRef.current;
    if (deps.length === 0) return;

    for (const dep of deps) {
      const srcVal = items.find((i) => i.id === dep.sourceItemId)
        ?.values[dep.sourceColumnId] as TimeRangeValue | null | undefined;
      const srcEnd = toDate(srcVal?.end);
      if (!srcEnd) continue;

      const newStart = new Date(srcEnd);
      newStart.setDate(newStart.getDate() + dep.offsetDays);

      const curStart = toDate(rv?.start);
      const curEnd = toDate(rv?.end);
      const durMs = curStart && curEnd ? Math.max(0, curEnd.getTime() - curStart.getTime()) : 0;
      const newEnd = durMs > 0 ? new Date(newStart.getTime() + durMs) : null;

      const newStartISO = newStart.toISOString();
      const newEndISO = newEnd?.toISOString() ?? null;
      if (newStartISO === rv?.start && newEndISO === rv?.end) continue;

      const durationDays = durMs > 0 ? Math.round(durMs / 86_400_000) : (rv?.durationDays ?? 1);
      mutate({ id: item.id, patch: { values: { [column.id]: { start: newStartISO, end: newEndISO, durationDays } } } });
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depFormulaKey]);

  const isDependentCell = hasDepsIn;
  const displayStart = toDate(rawValue?.start);
  const displayEnd = toDate(rawValue?.end);

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

            {/* Outgoing dependency dot — shows X; click removes ALL outgoing at once */}
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
                {/* Backdrop closes on outside click */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                  onClick={() => setShowDepMenu(null)}
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
                  className="bg-white border border-gray-200 rounded-lg shadow-xl min-w-[160px] py-1"
                  role="menu"
                  aria-label="Dependency options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="px-3 pt-1 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    {showDepMenu === 'in' ? 'Incoming' : 'Outgoing'} dependencies
                  </p>
                  {showDepMenu === 'out' ? (
                    // Outgoing: single bulk-remove button — individual removal via target's orange dot
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                      onClick={() => {
                        getDepsFrom(item.id, column.id).forEach((dep) => removeDependency(dep));
                        setShowDepMenu(null);
                      }}
                    >
                      <span className="text-red-400">✕</span>
                      Remove all links ({getDepsFrom(item.id, column.id).length})
                    </button>
                  ) : (
                    // Incoming: each dep can be removed individually
                    getDepsTo(item.id, column.id).map((dep) => (
                      <button
                        key={dep.id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => {
                          removeDependency(dep);
                          setShowDepMenu(null);
                        }}
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
                      onClick={() => setShowDepMenu(null)}
                      aria-label="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
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
