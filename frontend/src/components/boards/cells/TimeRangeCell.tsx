import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, TimeRangeValue } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const toDateInput = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const formatDate = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

const toDate = (val: string | Date | null | undefined): Date | null => {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
};

const pluralDays = (n: number) => `${n} day${n !== 1 ? 's' : ''}`;

const getDurationText = (start: string | Date | null | undefined, end: string | Date | null | undefined): string => {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return '';
  const total = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const left = Math.round((endDate.getTime() - today.getTime()) / 86_400_000);
  if (left > 0) {
    return `${pluralDays(total)} (${pluralDays(left)} left)`;
  }
  return pluralDays(total);
};

const TrafficLight: React.FC<{ date: string | Date | null | undefined, type: 'start' | 'end' }> = ({ date, type }) => {
  let red = "#666666";
  let green = "#666666";

  if (type === 'start') {
    green = "#22c55e";
  } else {
    red = "#ef4444";
  }

  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] -ml-1">
      <rect x="7" y="3" width="10" height="18" rx="3" fill="#000000" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
      <circle cx="12" cy="7" r="2" fill={red} />
      <circle cx="12" cy="12" r="2" fill="#666666" />
      <circle cx="12" cy="17" r="2" fill={green} />
    </svg>
  );
};

const TimeRangeCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as TimeRangeValue | null | undefined;
  const { mutate } = useUpdateItem();
  const [start, setStart] = useState(toDateInput(rawValue?.start));
  const [end, setEnd] = useState(toDateInput(rawValue?.end));
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setStart(toDateInput(rawValue?.start));
    setEnd(toDateInput(rawValue?.end));
  }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    const nextStart = start ? new Date(start).toISOString() : null;
    const nextEnd = end ? new Date(end).toISOString() : null;
    mutate({
      id: item.id,
      patch: { values: { [column.id]: { start: nextStart, end: nextEnd } } },
    });
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <div
              className="flex items-center gap-1 px-2 py-1 w-full bg-white rounded shadow-lg border border-indigo-200 z-30"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  commit(stopEdit);
                }
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
                  if (e.key === 'Escape') { setStart(toDateInput(rawValue?.start)); setEnd(toDateInput(rawValue?.end)); stopEdit(); }
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
                  if (e.key === 'Escape') { setStart(toDateInput(rawValue?.start)); setEnd(toDateInput(rawValue?.end)); stopEdit(); }
                }}
              />
            </div>
          );
        }

        if (!rawValue?.start && !rawValue?.end) {
          return (
            <div className="px-3 py-2 text-xs text-gray-300 text-center w-full italic">
              Set range
            </div>
          );
        }

        const durationText = getDurationText(rawValue?.start, rawValue?.end);

        return (
          <div
            className="px-1 py-0.5 flex justify-center w-full overflow-hidden"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div
              className="flex items-center justify-center w-full gap-[2px] px-3 h-[26px] rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.1)] cursor-default"
              style={{ background: 'linear-gradient(90deg, #6366f1, #3b82f6)' }}
              aria-label={hovered && durationText ? durationText : `${formatDate(rawValue?.start)} to ${formatDate(rawValue?.end)}`}
            >
              {hovered && durationText ? (
                <span className="text-center leading-tight">{durationText}</span>
              ) : (
                <>
                  <span className="flex items-center gap-0.5">
                    <TrafficLight date={rawValue?.start} type="start" />
                    {formatDate(rawValue?.start) || '?'}
                  </span>

                  <span className="ml-1.5 flex items-center">
                    <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] fill-none stroke-white stroke-[2.5]">
                      <line x1="1" y1="12" x2="19" y2="12" />
                      <polyline points="13 6 19 12 13 18" />
                    </svg>
                  </span>

                  <span className="flex items-center gap-0.5 ml-0.5">
                    <TrafficLight date={rawValue?.end} type="end" />
                    {formatDate(rawValue?.end) || '?'}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default TimeRangeCell;
