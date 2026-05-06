import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { evaluateFormula } from '../../utils/formulaEngine';
import { ColumnType } from '../../types';
import type { Column, Item, SimpleFormulaColumnSettings, TimeRangeValue } from '../../types';
import { calculateColumnWidth, ITEM_SECTION_WIDTH } from '../../utils/columnWidths';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalcMode = 'none' | 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count';

interface CellConfig {
  calc: CalcMode;
  unit: string;
  unitAlign: 'left' | 'right';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Blend a hex colour with white to produce a solid opaque tint.
 *  alpha=0 → pure white, alpha=1 → original colour. */
function blendWithWhite(hex: string, alpha = 0.25): string {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.slice(0, 6); // strip alpha channel if 8-char
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#f3f4f6';
  const rOut = Math.round(r * alpha + 255 * (1 - alpha));
  const gOut = Math.round(g * alpha + 255 * (1 - alpha));
  const bOut = Math.round(b * alpha + 255 * (1 - alpha));
  return `rgb(${rOut},${gOut},${bOut})`;
}

function loadConfig(colId: string, defaultCalc: CalcMode = 'sum'): CellConfig {
  try {
    const stored = localStorage.getItem(`summaryCell_${colId}`);
    if (stored) return JSON.parse(stored) as CellConfig;
  } catch { /* ignore */ }
  return { calc: defaultCalc, unit: '', unitAlign: 'left' };
}

function saveConfig(colId: string, config: CellConfig) {
  try { localStorage.setItem(`summaryCell_${colId}`, JSON.stringify(config)); } catch { /* ignore */ }
}

function applyUnit(value: string, unit: string, align: 'left' | 'right'): string {
  if (!unit) return value;
  return align === 'left' ? `${unit}${value}` : `${value}${unit}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AGGREGATABLE_TYPES = new Set([
  ColumnType.NUMBER,
  ColumnType.TIME,
  ColumnType.TIME_RANGE,
  ColumnType.CHECKBOX,
  ColumnType.SIMPLE_FORMULA,
]);

const CALC_LABEL: Record<CalcMode, string> = {
  none: 'None', sum: 'Sum', avg: 'Average', median: 'Median',
  min: 'Min', max: 'Max', count: 'Count',
};
const CALC_BADGE: Record<CalcMode, string> = {
  none: '', sum: 'Sum', avg: 'Avg', median: 'Med',
  min: 'Min', max: 'Max', count: 'Cnt',
};

const PRESET_UNITS = ['$', '€', '£', '%'];
const ALL_CALCS: CalcMode[] = ['none', 'sum', 'avg', 'median', 'min', 'max', 'count'];

// ─── Popover ─────────────────────────────────────────────────────────────────

interface PopoverProps {
  anchorRect: DOMRect;
  config: CellConfig;
  onChange: (c: CellConfig) => void;
  onClose: () => void;
  isCheckbox: boolean;
  isTimeType: boolean;
}

const SummaryPopover: React.FC<PopoverProps> = ({
  anchorRect, config, onChange, onClose, isCheckbox, isTimeType,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [customUnit, setCustomUnit] = useState<string>(
    config.unit && !PRESET_UNITS.includes(config.unit) ? config.unit : '',
  );

  // Compute position: try to open below, clamp to viewport
  const POPOVER_W = 340;
  const left = Math.min(anchorRect.left, window.innerWidth - POPOVER_W - 8);
  const top = anchorRect.bottom + 6;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the same click that opened doesn't close immediately
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const setCalc = (calc: CalcMode) => onChange({ ...config, calc });
  const setUnit = (unit: string) => { setCustomUnit(''); onChange({ ...config, unit }); };
  const setCustom = (val: string) => { setCustomUnit(val); onChange({ ...config, unit: val }); };
  const setAlign = (unitAlign: 'left' | 'right') => onChange({ ...config, unitAlign });

  const activeUnit = PRESET_UNITS.includes(config.unit) ? config.unit : (config.unit ? '' : '');
  const isCustomActive = !PRESET_UNITS.includes(config.unit) && config.unit !== '';
  const isNoneUnitActive = config.unit === '';

  const availableCalcs = isCheckbox
    ? (['none', 'count'] as CalcMode[])
    : ALL_CALCS;

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Summary settings"
      className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-[340px]"
      style={{ top, left }}
    >
      {/* Calculation */}
      <p className="text-sm font-semibold text-gray-700 mb-2">Calculation</p>
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {availableCalcs.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCalc(c)}
            className={`px-2.5 py-1 text-sm rounded border transition-all ${config.calc === c ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
            aria-pressed={config.calc === c}
          >
            {CALC_LABEL[c]}
          </button>
        ))}
      </div>

      {/* Unit — hidden for time/checkbox columns */}
      {!isTimeType && !isCheckbox && (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-2">Unit</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setUnit('')}
              className={`px-2.5 py-1 text-sm rounded border transition-all ${isNoneUnitActive ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
              aria-pressed={isNoneUnitActive}
            >
              None
            </button>
            {PRESET_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-2.5 py-1 text-sm rounded border transition-all ${config.unit === u ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                aria-pressed={config.unit === u}
              >
                {u}
              </button>
            ))}
            <input
              type="text"
              value={customUnit}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type your own"
              className={`flex-1 min-w-[90px] px-2 py-1 text-sm rounded border transition-all outline-none focus:ring-2 focus:ring-blue-400 ${isCustomActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
              aria-label="Custom unit"
            />
            <div className="flex border border-gray-300 rounded overflow-hidden ml-1">
              <button
                type="button"
                onClick={() => setAlign('left')}
                className={`px-2.5 py-1 text-sm transition-all ${config.unitAlign === 'left' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                aria-pressed={config.unitAlign === 'left'}
                aria-label="Unit on left"
              >
                L
              </button>
              <button
                type="button"
                onClick={() => setAlign('right')}
                className={`px-2.5 py-1 text-sm border-l border-gray-300 transition-all ${config.unitAlign === 'right' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                aria-pressed={config.unitAlign === 'right'}
                aria-label="Unit on right"
              >
                R
              </button>
            </div>
          </div>
        </>
      )}
    </div>,
    modalRoot,
  );
};

// ─── SummaryCell ─────────────────────────────────────────────────────────────

interface SummaryCellProps {
  col: Column;
  items: Item[];
  numberCols: Column[];
  isFirst?: boolean;
}

const SummaryCell: React.FC<SummaryCellProps> = ({ col, items, numberCols, isFirst }) => {
  const isCheckbox = col.type === ColumnType.CHECKBOX;
  const isTimeType = col.type === ColumnType.TIME || col.type === ColumnType.TIME_RANGE;
  const defaultCalc: CalcMode = isCheckbox ? 'count' : 'sum';

  const [config, setConfig] = useState<CellConfig>(() => loadConfig(col.id, defaultCalc));
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isAggregatable = AGGREGATABLE_TYPES.has(col.type);
  const colWidth = calculateColumnWidth(col.name, col.type);

  const handleChange = useCallback((c: CellConfig) => {
    setConfig(c);
    saveConfig(col.id, c);
  }, [col.id]);

  const handleOpen = () => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
  };

  function computeNumberVals(): number[] {
    if (col.type === ColumnType.NUMBER || col.type === ColumnType.SIMPLE_FORMULA) {
      if (col.type === ColumnType.SIMPLE_FORMULA) {
        const settings = col.settings as SimpleFormulaColumnSettings;
        const defaultFormula = settings?.defaultFormula ?? '';
        return items
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
      }
      return items
        .map((i) => i.values[col.id])
        .filter((v) => v != null && v !== '')
        .map((v) => Number(v))
        .filter((v) => !isNaN(v));
    }
    return [];
  }

  function computeTimeVals(): number[] {
    if (col.type === ColumnType.TIME) {
      return items
        .map((i) => parseTimeToMinutes((i.values[col.id] as string) ?? ''))
        .filter((m): m is number => m !== null);
    }
    if (col.type === ColumnType.TIME_RANGE) {
      return items
        .map((i) => (i.values[col.id] as TimeRangeValue | null | undefined)?.durationDays)
        .filter((d): d is number => d != null && !isNaN(d));
    }
    return [];
  }

  function computeValue(): string | null {
    const { calc } = config;
    if (calc === 'none') return null;

    if (isCheckbox) {
      if (calc === 'count') {
        const checked = items.filter((i) => Boolean(i.values[col.id])).length;
        return `${checked}/${items.length}`;
      }
      return null;
    }

    if (isTimeType) {
      const mins = computeTimeVals();
      if (mins.length === 0) return null;
      if (calc === 'count') return String(mins.length);
      const total = mins.reduce((a, b) => a + b, 0);
      if (calc === 'sum') return col.type === ColumnType.TIME_RANGE ? `${Math.round(total * 10) / 10}d` : formatMinutes(total);
      if (calc === 'avg') {
        const avg = total / mins.length;
        return col.type === ColumnType.TIME_RANGE ? `${Math.round(avg * 10) / 10}d` : formatMinutes(avg);
      }
      if (calc === 'median') {
        const med = median(mins);
        return col.type === ColumnType.TIME_RANGE ? `${Math.round(med * 10) / 10}d` : formatMinutes(med);
      }
      if (calc === 'min') {
        const mn = Math.min(...mins);
        return col.type === ColumnType.TIME_RANGE ? `${Math.round(mn * 10) / 10}d` : formatMinutes(mn);
      }
      if (calc === 'max') {
        const mx = Math.max(...mins);
        return col.type === ColumnType.TIME_RANGE ? `${Math.round(mx * 10) / 10}d` : formatMinutes(mx);
      }
      return null;
    }

    const vals = computeNumberVals();
    if (vals.length === 0) return null;
    if (calc === 'count') return String(vals.length);
    const total = vals.reduce((a, b) => a + b, 0);
    let result: number;
    if (calc === 'sum') result = total;
    else if (calc === 'avg') result = total / vals.length;
    else if (calc === 'median') result = median(vals);
    else if (calc === 'min') result = Math.min(...vals);
    else if (calc === 'max') result = Math.max(...vals);
    else return null;

    const formatted = Number.isInteger(result) ? String(result) : result.toFixed(2);
    return applyUnit(formatted, config.unit, config.unitAlign);
  }

  const value = isAggregatable ? computeValue() : null;
  const badge = isAggregatable && config.calc !== 'none' ? CALC_BADGE[config.calc] : null;

  return (
    <div
      role="gridcell"
      aria-label={`${col.name} ${config.calc}: ${value ?? 'none'}`}
      style={{ width: `${colWidth}px` }}
      className={`relative flex flex-shrink-0 items-center border-r border-[#d2d2d4] last:border-r-0 py-2 px-2${isFirst ? ' border-l border-[#d2d2d4]' : ''}`}
    >
      {isAggregatable && (
        <button
          ref={btnRef}
          type="button"
          onClick={handleOpen}
          className="absolute left-2 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-normal leading-none transition-colors select-none flex-shrink-0 hover:opacity-80"
          style={{
            backgroundColor: config.calc === 'none' ? '#e5e7eb' : '#3b82f6cf',
            color: config.calc === 'none' ? '#6b7280' : 'white',
          }}
          aria-label={`Open summary settings for ${col.name}`}
          aria-haspopup="dialog"
          title="Click to configure summary"
        >
          {badge ?? '—'}
        </button>
      )}
      <span className="flex-1 text-center text-sm font-normal text-gray-500 truncate">
        {value != null ? value : <span className="text-gray-300">—</span>}
      </span>

      {anchorRect && (
        <SummaryPopover
          anchorRect={anchorRect}
          config={config}
          onChange={handleChange}
          onClose={() => setAnchorRect(null)}
          isCheckbox={isCheckbox}
          isTimeType={isTimeType}
        />
      )}
    </div>
  );
};

// ─── GroupSummaryRow ──────────────────────────────────────────────────────────

interface Props {
  items: Item[];
  columns: Column[];
  groupColor: string;
}

const GroupSummaryRow: React.FC<Props> = ({ items, columns, groupColor }) => {
  const hasAggregatable = columns.some((c) => AGGREGATABLE_TYPES.has(c.type));
  if (!hasAggregatable) return null;

  const nonArchived = items.filter((i) => !i.isArchived);
  const numberCols = columns.filter((c) => c.type === ColumnType.NUMBER);
  const solidBg = blendWithWhite(groupColor, 0.15);

  return (
    <div
      role="row"
      aria-label="Group summary row"
      className="flex flex-nowrap items-stretch border-t border-[#d2d2d4] w-max rounded-bl-xl"
      style={{ backgroundColor: solidBg }}
    >
      <div
        className={`flex-shrink-0 ${ITEM_SECTION_WIDTH} sticky left-4 z-[1]`}
        style={{ backgroundColor: solidBg, borderBottomLeftRadius: '6px' }}
        aria-hidden="true"
      />
      {columns.map((col, index) => (
        <SummaryCell
          key={col.id}
          col={col}
          items={nonArchived}
          numberCols={numberCols}
          isFirst={index === 0}
        />
      ))}
    </div>
  );
};

export default GroupSummaryRow;
