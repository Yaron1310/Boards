import React, { useEffect, useRef, useState } from 'react';
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

const addDays = (d: Date, days: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
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
// Formula resolution — walk the dependency chain to compute effective dates
// ---------------------------------------------------------------------------

const resolveEffectiveDates = (
  item: Item,
  columnId: string,
  allItems: Item[],
  visited = new Set<string>(),
): { start: Date | null; end: Date | null } => {
  const key = `${item.id}::${columnId}`;
  if (visited.has(key)) return { start: null, end: null };
  visited.add(key);

  const deps = (item.dependencies ?? []).filter((d) => d.targetColumnId === columnId);

  if (deps.length === 0) {
    const raw = item.values[columnId] as TimeRangeValue | null | undefined;
    return { start: toDate(raw?.start), end: toDate(raw?.end) };
  }

  let latestSourceEnd: Date | null = null;
  let maxOffset = 0;

  for (const dep of deps) {
    const sourceItem = allItems.find((i) => i.id === dep.sourceItemId);
    if (!sourceItem) continue;
    const { end: sourceEnd } = resolveEffectiveDates(sourceItem, dep.sourceColumnId, allItems, new Set(visited));
    if (!sourceEnd) continue;
    if (!latestSourceEnd || sourceEnd > latestSourceEnd) {
      latestSourceEnd = sourceEnd;
      maxOffset = dep.offsetDays;
    }
  }

  if (!latestSourceEnd) {
    const raw = item.values[columnId] as TimeRangeValue | null | undefined;
    return { start: toDate(raw?.start), end: toDate(raw?.end) };
  }

  const rawValue = item.values[columnId] as TimeRangeValue | null | undefined;
  const storedDuration = rawValue?.durationDays ?? (() => {
    const rs = toDate(rawValue?.start);
    const re = toDate(rawValue?.end);
    return rs && re ? Math.max(0, Math.round((re.getTime() - rs.getTime()) / 86_400_000)) : 1;
  })();

  const computedStart = addDays(latestSourceEnd, maxOffset + 1);
  const computedEnd = addDays(computedStart, storedDuration);
  return { start: computedStart, end: computedEnd };
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
  const cellRef = useRef<HTMLDivElement | null>(null);

  const {
    items: allItems,
    drawState,
    startDraw,
    cancelDraw,
    setHoveredTarget,
    confirmDraw,
    hoveredCell,
    setHoveredCell,
    getDepsFrom,
    getDepsTo,
    registerCellRect,
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

  const { start: effectiveStart, end: effectiveEnd } = resolveEffectiveDates(item, column.id, allItems);
  const isDependentCell = hasDepsIn;

  const displayStart = isDependentCell ? effectiveStart : toDate(rawValue?.start);
  const displayEnd = isDependentCell ? effectiveEnd : toDate(rawValue?.end);

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
    isDrawing ? cancelDraw() : startDraw(cellRefId);
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
              isValidTarget ? 'ring-2 ring-inset ring-indigo-400 rounded' : ''
            } ${isSource ? 'ring-2 ring-inset ring-blue-500 rounded' : ''}`}
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

            {/* Incoming dependency dot */}
            {hasDepsIn && !isDrawing && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-orange-400 border border-white shadow z-10"
                aria-label="Has incoming dependency"
              />
            )}

            {/* Outgoing dependency dot */}
            {hasDepsOut && !isDrawing && (
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 border border-white shadow z-10"
                aria-label="Has outgoing dependency"
              />
            )}

            {/* Connector handle */}
            {(hovered || isHoveredCell || isSource) && !isEditing && !isDrawing && (
              <button
                type="button"
                className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-[18px] w-4 h-4 rounded-full border-2 shadow transition-all z-20
                  bg-white border-indigo-400 hover:bg-indigo-100 hover:scale-125`}
                onClick={handleConnectorClick}
                aria-label="Start dependency from this cell"
                title="Draw dependency"
              />
            )}

            {/* Source cancel handle when in draw mode */}
            {isSource && !isEditing && (
              <button
                type="button"
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[18px] w-4 h-4 rounded-full border-2 shadow transition-all z-20 bg-blue-500 border-blue-600 scale-125"
                onClick={handleConnectorClick}
                aria-label="Cancel dependency drawing"
                title="Click to cancel"
              />
            )}

            {/* Formula badge */}
            {isDependentCell && isHoveredCell && (
              <span
                className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-purple-600 bg-purple-50 border border-purple-200 rounded px-1 whitespace-nowrap z-30"
                aria-live="polite"
              >
                dependency formula
              </span>
            )}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default TimeRangeCell;
