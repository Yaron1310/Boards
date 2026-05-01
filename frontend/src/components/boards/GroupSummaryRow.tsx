import React, { useState } from 'react';
import { evaluateFormula } from '../../utils/formulaEngine';
import { ColumnType } from '../../types';
import type { Column, Item, SimpleFormulaColumnSettings, TimeRangeValue } from '../../types';
import { calculateColumnWidth, ITEM_SECTION_WIDTH } from '../../utils/columnWidths';

interface Props {
  items: Item[];
  columns: Column[];
  groupColor?: string;
}

type Mode = 'sum' | 'avg';

function parseTimeToMinutes(time: string): number | null {
  const match = time.match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

const AGGREGATABLE_TYPES = new Set([
  ColumnType.NUMBER,
  ColumnType.TIME,
  ColumnType.TIME_RANGE,
  ColumnType.CHECKBOX,
  ColumnType.SIMPLE_FORMULA,
]);

const GroupSummaryRow: React.FC<Props> = ({ items, columns, groupColor }) => {
  const [mode, setMode] = useState<Mode>('sum');

  const hasAggregatable = columns.some((c) => AGGREGATABLE_TYPES.has(c.type));
  if (!hasAggregatable) return null;

  const nonArchived = items.filter((i) => !i.isArchived);
  const numberCols = columns.filter((c) => c.type === ColumnType.NUMBER);

  function computeCell(col: Column): string | null {
    if (col.type === ColumnType.NUMBER) {
      const vals = nonArchived
        .map((i) => i.values[col.id])
        .filter((v) => v != null && v !== '')
        .map((v) => Number(v))
        .filter((v) => !isNaN(v));
      if (vals.length === 0) return null;
      const total = vals.reduce((a, b) => a + b, 0);
      const result = mode === 'sum' ? total : total / vals.length;
      return Number.isInteger(result) ? String(result) : result.toFixed(2);
    }

    if (col.type === ColumnType.TIME) {
      const mins = nonArchived
        .map((i) => parseTimeToMinutes((i.values[col.id] as string) ?? ''))
        .filter((m): m is number => m !== null);
      if (mins.length === 0) return null;
      const totalMins = mins.reduce((a, b) => a + b, 0);
      return formatMinutes(mode === 'sum' ? totalMins : totalMins / mins.length);
    }

    if (col.type === ColumnType.TIME_RANGE) {
      const days = nonArchived
        .map((i) => (i.values[col.id] as TimeRangeValue | null | undefined)?.durationDays)
        .filter((d): d is number => d != null && !isNaN(d));
      if (days.length === 0) return null;
      const total = days.reduce((a, b) => a + b, 0);
      const result = mode === 'sum' ? total : total / days.length;
      const rounded = Math.round(result * 10) / 10;
      return `${rounded}d`;
    }

    if (col.type === ColumnType.CHECKBOX) {
      const checked = nonArchived.filter((i) => Boolean(i.values[col.id])).length;
      return `${checked}/${nonArchived.length}`;
    }

    if (col.type === ColumnType.SIMPLE_FORMULA) {
      const settings = col.settings as SimpleFormulaColumnSettings;
      const defaultFormula = settings?.defaultFormula ?? '';
      const vals = nonArchived
        .map((i) => {
          const stored = i.values[col.id];
          const formula = typeof stored === 'string' ? stored : defaultFormula;
          if (!formula) return null;
          const colValues: Record<string, number | null | undefined> = {};
          for (const nc of numberCols) {
            const v = i.values[nc.id];
            colValues[nc.name] = v != null ? Number(v) : undefined;
          }
          return evaluateFormula(formula, colValues);
        })
        .filter((v): v is number => v !== null);
      if (vals.length === 0) return null;
      const total = vals.reduce((a, b) => a + b, 0);
      const result = mode === 'sum' ? total : total / vals.length;
      return Number.isInteger(result) ? String(result) : result.toFixed(2);
    }

    return null;
  }

  return (
    <div
      role="row"
      aria-label={`Group summary — ${mode === 'sum' ? 'sum' : 'average'}`}
      className="flex flex-nowrap items-stretch border-t border-[#d2d2d4] bg-gray-50/80 w-max rounded-bl-xl"
    >
      {/* Left section — toggle button */}
      <div
        className={`flex flex-shrink-0 items-center ${ITEM_SECTION_WIDTH} border-r border-[#d2d2d4] sticky left-4 bg-gray-50/80 z-[1] px-3 py-1.5`}
        style={groupColor ? { borderLeft: `4px solid ${groupColor}` } : undefined}
      >
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'sum' ? 'avg' : 'sum'))}
          className={`flex items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors select-none ${
            mode === 'sum'
              ? 'bg-blue-500 text-white'
              : 'bg-green-400 text-black'
          }`}
          aria-label={mode === 'sum' ? 'Switch to average' : 'Switch to sum'}
          title={mode === 'sum' ? 'Showing sum — click for average' : 'Showing average — click for sum'}
        >
          {mode === 'sum' ? 'Sum' : 'Ave'}
        </button>
      </div>

      {/* Column summary cells */}
      {columns.map((col) => {
        const value = computeCell(col);
        return (
          <div
            key={col.id}
            role="gridcell"
            aria-label={`${col.name} ${mode === 'sum' ? 'sum' : 'average'}: ${value ?? 'none'}`}
            style={{ width: `${calculateColumnWidth(col.name, col.type)}px` }}
            className="flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0 py-1.5 px-2"
          >
            {value !== null ? (
              <span className="text-xs font-medium text-gray-600 truncate">
                {value}
              </span>
            ) : (
              <span className="text-gray-300 text-xs select-none">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GroupSummaryRow;
