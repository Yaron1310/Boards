import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { evaluateFormula, extractForeignRefs, serializeRef, type SummaryCalc, type CellRef } from '../../utils/formulaEngine';
import { ColumnType } from '../../types';
import type { Column, Item, SimpleFormulaColumnSettings, TimeRangeValue } from '../../types';
import { calculateColumnWidth } from '../../utils/columnWidths';
import { formatGroupedNumber } from '../../utils/numberFormat';
import { useUpdateColumn } from '../../hooks/queries/useColumnQueries';
import { useForeignCellValues } from '../../hooks/queries/useForeignCellValues';
import { useAuth } from '../../hooks/useAuth';
import { useBoardRender } from '../../contexts/BoardRenderContext';
import { useFormulaRecording } from '../../contexts/FormulaRecordingContext';
import { ITEM_COL_ID } from './ColumnHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalcMode = 'none' | 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count';

export interface CellConfig {
  calc: CalcMode;
  unit: string;
  unitAlign: 'left' | 'right';
  /** Aggregate this group's items plus every group above it (running total) when true. */
  cumulative: boolean;
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


function configFromSummary(
  sc: { calc: string; unit: string; unitAlign: 'left' | 'right'; cumulative?: boolean } | undefined,
  defaultCalc: CalcMode = 'sum',
): CellConfig {
  if (sc) {
    return {
      calc: (sc.calc as CalcMode) || defaultCalc,
      unit: sc.unit ?? '',
      unitAlign: sc.unitAlign ?? 'left',
      cumulative: sc.cumulative ?? false,
    };
  }
  return { calc: defaultCalc, unit: '', unitAlign: 'left', cumulative: false };
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

// Column types that only support count (non-empty values)
const COUNT_ONLY_TYPES = new Set([
  ColumnType.TEXT,
  ColumnType.EMAIL,
  ColumnType.PERSON,
  ColumnType.DROPDOWN,
  ColumnType.STATUS,
  ColumnType.TAGS,
  ColumnType.LOCATION,
  ColumnType.PHONE,
  ColumnType.DATE,
  ColumnType.LINK,
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
  isCountOnly: boolean;
  /** Hide the per-group cumulative "Scope" toggle (board-total footer spans every group). */
  hideScope?: boolean;
}

const SummaryPopover: React.FC<PopoverProps> = ({
  anchorRect, config, onChange, onClose, isCheckbox, isTimeType, isCountOnly, hideScope = false,
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
  const setCumulative = (cumulative: boolean) => onChange({ ...config, cumulative });

  const isCustomActive = !PRESET_UNITS.includes(config.unit) && config.unit !== '';
  const isNoneUnitActive = config.unit === '';

  const availableCalcs = (isCheckbox || isCountOnly)
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

      {/* Scope — this group only vs. this group + all groups above it (running total) */}
      {!hideScope && (
      <>
      <p className="text-sm font-semibold text-gray-700 mb-2">Scope</p>
      <div className="flex items-center gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setCumulative(false)}
          className={`px-2.5 py-1 text-sm rounded border transition-all ${!config.cumulative ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
          aria-pressed={!config.cumulative}
        >
          This group
        </button>
        <button
          type="button"
          onClick={() => setCumulative(true)}
          className={`px-2.5 py-1 text-sm rounded border transition-all ${config.cumulative ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
          aria-pressed={config.cumulative}
          title="Include items from this group and every group above it"
        >
          This + groups above
        </button>
      </div>
      </>
      )}

      {/* Unit — hidden for time/checkbox/count-only columns */}
      {!isTimeType && !isCheckbox && !isCountOnly && (
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

/**
 * Minimal column shape the summary cell needs — satisfied by both a real board
 * `Column` and a Personal Hub `PersonalColumn`, so the exact same cell (and its
 * popover, aggregation math, and formatting) can be reused for personal columns.
 */
export interface SummaryColumn {
  id: string;
  name: string;
  type: ColumnType;
  settings: unknown;
  boardId?: string;
  width?: number;
  summaryConfig?: { calc: string; unit: string; unitAlign: 'left' | 'right'; cumulative?: boolean };
  /** Independent config for the board-wide total footer, used when `boardTotal` is set. */
  boardSummaryConfig?: { calc: string; unit: string; unitAlign: 'left' | 'right' };
}

interface SummaryCellProps {
  col: SummaryColumn;
  items: Item[];
  numberCols: Column[];
  /**
   * Items from every group above this one, already display-filtered. Only used
   * when the column's summary is set to cumulative ("this + groups above").
   */
  itemsAbove?: Item[];
  /** Personal Hub: fixed width instead of resolving from board column widths. */
  widthOverride?: number;
  /** Personal Hub: read a value from the personal store instead of item.values. */
  getValue?: (item: Item, colId: string) => unknown;
  /**
   * Personal Hub: evaluate a SIMPLE_FORMULA column for one item (personal
   * formulas use {Letter}{Row} grid addressing, not the board's name-based
   * per-row evaluation). Called per item so it composes with cumulative scope.
   */
  evalFormula?: (item: Item) => number | null;
  /** Persist column-level summaryConfig (calc/unit/align) to the personal column. Board default persists to the board column. */
  onPersist?: (config: CellConfig) => void;
  /**
   * Cumulative scope is PER-GROUP, not per-column — the calc/unit are shared
   * across a column's groups, but "include groups above" is a property of this
   * one group's cell. So it comes in as a prop and is persisted separately
   * (per group on the board; per board in Personal Hub) via onCumulativeChange.
   */
  cumulative?: boolean;
  onCumulativeChange?: (cumulative: boolean) => void;
  /**
   * Board-wide total footer cell: read/write the column's independent
   * `boardSummaryConfig` instead of the per-group `summaryConfig`, so the footer's
   * calc/unit is configured separately from the group rows. Cumulative scope is
   * hidden (the footer already spans every group).
   */
  boardTotal?: boolean;
}

export const SummaryCell: React.FC<SummaryCellProps> = ({
  col, items, numberCols, itemsAbove, widthOverride, getValue, evalFormula, onPersist,
  cumulative = false, onCumulativeChange, boardTotal = false,
}) => {
  const getVal = getValue ?? ((i: Item, colId: string) => i.values[colId]);
  const isCheckbox = col.type === ColumnType.CHECKBOX;
  const isTimeType = col.type === ColumnType.TIME || col.type === ColumnType.TIME_RANGE;
  const isCountOnly = COUNT_ONLY_TYPES.has(col.type);
  const defaultCalc: CalcMode = isCheckbox ? 'count' : isCountOnly ? 'none' : 'sum';

  // Board-total cells read/write an independent config; group cells use the shared one.
  const summarySource = boardTotal ? col.boardSummaryConfig : col.summaryConfig;
  const [colConfig, setColConfig] = useState<CellConfig>(() => configFromSummary(summarySource, defaultCalc));
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { mutate: updateColumn } = useUpdateColumn(col.boardId ?? '');
  const { columnWidths, visibleItems, columns: boardColumns } = useBoardRender();
  const { isRecording, insertRef, session } = useFormulaRecording();
  const { user, selectedWorkspace } = useAuth();
  const orgId = selectedWorkspace?.orgId ?? (user as { orgId?: string } | null | undefined)?.orgId;

  const isAggregatable = AGGREGATABLE_TYPES.has(col.type);
  const isInteractive = isAggregatable || isCountOnly;
  const colWidth = widthOverride ?? columnWidths[col.id] ?? col.width ?? calculateColumnWidth(col.name, col.type);

  // The popover shows the column-shared calc/unit plus this group's own cumulative flag.
  const config: CellConfig = { ...colConfig, cumulative };

  // Cumulative scope aggregates this group's items plus every group above it.
  const effectiveItems = cumulative && itemsAbove?.length ? [...itemsAbove, ...items] : items;

  // A board (non-personal) SIMPLE_FORMULA column needs to evaluate each row's formula with a real
  // context to aggregate it — otherwise its `{ref:…}` tokens resolve to 0. Gather the foreign
  // (cross-board) refs across the rows so their values are loaded; same-board refs resolve locally
  // from the board's own items. Personal formula columns use `evalFormula` instead (grid-addressed).
  const isBoardFormula = col.type === ColumnType.SIMPLE_FORMULA && !evalFormula;
  const formulaHomeBoardId = col.boardId ?? '';
  const foreignRefs: CellRef[] = [];
  if (isBoardFormula) {
    const settings = col.settings as SimpleFormulaColumnSettings;
    const defaultFormula = settings?.defaultFormula ?? '';
    const seen = new Set<string>();
    for (const i of effectiveItems) {
      const stored = getVal(i, col.id);
      const formula = typeof stored === 'string' ? stored : defaultFormula;
      if (!formula) continue;
      for (const r of extractForeignRefs(formula, formulaHomeBoardId)) {
        const key = serializeRef(r);
        if (!seen.has(key)) { seen.add(key); foreignRefs.push(r); }
      }
    }
  }
  const { resolve: resolveForeign } = useForeignCellValues(foreignRefs, orgId);

  // Keep local state in sync if the column data is refreshed from the server
  useEffect(() => {
    setColConfig(configFromSummary(summarySource, defaultCalc));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summarySource]);

  const handleChange = useCallback((c: CellConfig) => {
    // Cumulative is per-group — route it separately; never store it on the shared column.
    if (c.cumulative !== cumulative) onCumulativeChange?.(c.cumulative);
    const colPart: CellConfig = { calc: c.calc, unit: c.unit, unitAlign: c.unitAlign, cumulative: false };
    setColConfig(colPart);
    const persisted = { calc: colPart.calc, unit: colPart.unit, unitAlign: colPart.unitAlign };
    if (onPersist) onPersist(colPart);
    // Board-total cells persist to the column's independent boardSummaryConfig; group cells to summaryConfig.
    else if (boardTotal) updateColumn({ id: col.id, patch: { boardSummaryConfig: persisted } });
    else updateColumn({ id: col.id, patch: { summaryConfig: persisted } });
  }, [col.id, updateColumn, onPersist, cumulative, onCumulativeChange, boardTotal]);

  const handleOpen = () => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
  };

  function computeNumberVals(): number[] {
    if (col.type === ColumnType.NUMBER || col.type === ColumnType.SIMPLE_FORMULA) {
      if (col.type === ColumnType.SIMPLE_FORMULA) {
        // Personal formula columns evaluate via {Letter}{Row} grid addressing; the
        // caller supplies a per-item evaluator so it composes with cumulative scope.
        if (evalFormula) {
          return effectiveItems
            .map((i) => evalFormula(i))
            .filter((v): v is number => v !== null);
        }
        const settings = col.settings as SimpleFormulaColumnSettings;
        const defaultFormula = settings?.defaultFormula ?? '';
        return effectiveItems
          .map((i) => {
            const stored = getVal(i, col.id);
            const formula = typeof stored === 'string' ? stored : defaultFormula;
            if (!formula) return null;
            // Legacy name-keyed values (for old {ColumnName} refs) plus a full ID-ref context:
            // same-board refs resolve from the board's items via currentRowIndex; foreign refs
            // go through resolveForeign. This mirrors how the formula cell itself evaluates, so
            // the footer total matches the values shown in the column.
            const colValues: Record<string, number | null | undefined> = {};
            for (const nc of numberCols) {
              const v = i.values[nc.id];
              colValues[nc.name] = v != null ? Number(v) : undefined;
            }
            const rowIndex = visibleItems.findIndex((v) => v.id === i.id);
            return evaluateFormula(formula, colValues, {
              allItems: visibleItems,
              columns: boardColumns,
              currentRowIndex: rowIndex >= 0 ? rowIndex : undefined,
              homeBoardId: formulaHomeBoardId,
              resolveRef: (ref) => resolveForeign(ref, i.id),
            });
          })
          .filter((v): v is number => v !== null);
      }
      return effectiveItems
        .map((i) => getVal(i, col.id))
        .filter((v) => v != null && v !== '')
        .map((v) => Number(v))
        .filter((v) => !isNaN(v));
    }
    return [];
  }

  function computeTimeRangeIntervals(): { s: Date; e: Date }[] {
    return effectiveItems
      .map((i) => {
        const v = getVal(i, col.id) as TimeRangeValue | null | undefined;
        if (!v?.start || !v?.end) return null;
        const s = new Date(v.start as string);
        const e = new Date(v.end as string);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
        return { s, e };
      })
      .filter((x): x is { s: Date; e: Date } => x !== null);
  }

  // Sum for TIME_RANGE = total unique calendar days covered (union of all intervals).
  // Avg/min/max/median still use per-item durations.
  function mergedDays(intervals: { s: Date; e: Date }[]): number {
    if (intervals.length === 0) return 0;
    const sorted = [...intervals].sort((a, b) => a.s.getTime() - b.s.getTime());
    let total = 0;
    let curS = sorted[0].s;
    let curE = sorted[0].e;
    for (let i = 1; i < sorted.length; i++) {
      const { s, e } = sorted[i];
      if (s.getTime() <= curE.getTime()) {
        if (e.getTime() > curE.getTime()) curE = e;
      } else {
        total += Math.round((curE.getTime() - curS.getTime()) / 86_400_000) + 1;
        curS = s;
        curE = e;
      }
    }
    total += Math.round((curE.getTime() - curS.getTime()) / 86_400_000) + 1;
    return total;
  }

  function computeTimeVals(): number[] {
    if (col.type === ColumnType.TIME) {
      return effectiveItems
        .map((i) => parseTimeToMinutes((getVal(i, col.id) as string) ?? ''))
        .filter((m): m is number => m !== null);
    }
    if (col.type === ColumnType.TIME_RANGE) {
      return computeTimeRangeIntervals().map(({ s, e }) =>
        Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1),
      );
    }
    return [];
  }

  function computeValue(): string | null {
    const { calc } = config;
    if (calc === 'none') return null;

    if (isCountOnly) {
      if (calc === 'count') {
        const filled = effectiveItems.filter((i) => {
          const v = getVal(i, col.id);
          if (v == null || v === '') return false;
          if (Array.isArray(v)) return v.length > 0;
          return true;
        }).length;
        return formatGroupedNumber(filled, 0);
      }
      return null;
    }

    if (isCheckbox) {
      if (calc === 'count') {
        const checked = effectiveItems.filter((i) => Boolean(getVal(i, col.id))).length;
        return formatGroupedNumber(checked, 0);
      }
      return null;
    }

    if (isTimeType) {
      const mins = computeTimeVals();
      if (mins.length === 0) return null;
      if (calc === 'count') return formatGroupedNumber(mins.length, 0);
      if (calc === 'sum') {
        if (col.type === ColumnType.TIME_RANGE) {
          const merged = mergedDays(computeTimeRangeIntervals());
          return `${merged}d`;
        }
        return formatMinutes(mins.reduce((a, b) => a + b, 0));
      }
      const total = mins.reduce((a, b) => a + b, 0);
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
    if (calc === 'count') return formatGroupedNumber(vals.length, 0);
    const total = vals.reduce((a, b) => a + b, 0);
    let result: number;
    if (calc === 'sum') result = total;
    else if (calc === 'avg') result = total / vals.length;
    else if (calc === 'median') result = median(vals);
    else if (calc === 'min') result = Math.min(...vals);
    else if (calc === 'max') result = Math.max(...vals);
    else return null;

    const formatted = formatGroupedNumber(result, 2);
    return applyUnit(formatted, config.unit, config.unitAlign);
  }

  const value = isInteractive ? computeValue() : null;
  const badge = isInteractive && config.calc !== 'none' ? CALC_BADGE[config.calc] : null;
  const showActive = isInteractive && config.calc !== 'none';
  const showHoverTrigger = isCountOnly && config.calc === 'none';

  // While a formula is recording, a summary cell can be clicked to add its live aggregate to
  // the formula — for any column type except SIMPLE_FORMULA. Excluding formula columns is the
  // data-loop guard: a summary never aggregates a formula column, so no formula → summary →
  // formula cycle can form. Personal-hub summaries (getValue) insert kind 'p' refs, and are only
  // offered when the formula itself lives in the Personal Hub — a personal summary can't be
  // recomputed from a regular board (it depends on the owner's private, assignee-filtered rows),
  // so it must not be referenced there.
  const isPersonalSummary = !!getValue;
  const canInsertSummary =
    isRecording && col.type !== ColumnType.SIMPLE_FORMULA &&
    config.calc !== 'none' && value != null && items.length > 0 &&
    (!isPersonalSummary || !!session?.origin.isPersonal);

  const insertSummary = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    insertRef({
      kind: getValue ? 'p' : 'b',
      boardId: col.boardId ?? items[0]?.boardId ?? '',
      columnId: col.id,
      itemId: null,
      agg: config.calc as SummaryCalc,
      groupId: items[0]?.groupId,
    });
  };

  return (
    <div
      role="gridcell"
      aria-label={canInsertSummary
        ? `Add ${col.name} ${config.calc} to the formula`
        : `${col.name} ${config.calc}: ${value ?? 'none'}`}
      style={{ width: `${colWidth}px` }}
      onMouseDown={canInsertSummary ? insertSummary : undefined}
      data-formula-insertable={canInsertSummary ? 'true' : undefined}
      className={`group relative flex flex-shrink-0 items-center border-r border-[#d2d2d4] last:border-r-0 py-2 px-2 ${canInsertSummary ? 'cursor-pointer hover:bg-indigo-100/60 transition-colors' : ''}`}
    >
      {!canInsertSummary && showActive && (
        <button
          ref={btnRef}
          type="button"
          onClick={handleOpen}
          className="absolute left-2 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-normal leading-none transition-colors select-none flex-shrink-0 hover:opacity-80"
          style={{ backgroundColor: config.cumulative ? '#fdba74' : '#3b82f6cf', color: 'white' }}
          aria-label={`Open summary settings for ${col.name}${config.cumulative ? ' (includes groups above)' : ''}`}
          aria-haspopup="dialog"
          title="Click to configure summary"
        >
          {badge}
        </button>
      )}
      {showHoverTrigger && (
        <button
          ref={btnRef}
          type="button"
          onClick={handleOpen}
          className="absolute left-2 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          aria-label={`Enable summary for ${col.name}`}
          aria-haspopup="dialog"
          title="Click to add summary"
        >
          <span className="text-[12px] leading-none">∑</span>
        </button>
      )}
      <span className="flex-1 text-center text-sm font-normal text-gray-500 truncate">
        {showActive && value != null ? value : showActive ? <span className="text-gray-300">—</span> : null}
      </span>

      {anchorRect && (
        <SummaryPopover
          anchorRect={anchorRect}
          config={config}
          onChange={handleChange}
          onClose={() => setAnchorRect(null)}
          isCheckbox={isCheckbox}
          isTimeType={isTimeType}
          isCountOnly={isCountOnly}
          hideScope={boardTotal}
        />
      )}
    </div>
  );
};

// ─── GroupSummaryRow ──────────────────────────────────────────────────────────

interface Props {
  items: Item[];
  columns: Column[];
  /** Items from every group above this one (for cumulative "this + groups above" summaries). */
  itemsAbove?: Item[];
  /** Per-group cumulative flags keyed by column id (independent of the shared column config). */
  cumulativeByColumn?: Record<string, boolean>;
  /** Persist a per-group cumulative toggle for a source column. */
  onSetCumulative?: (columnId: string, cumulative: boolean) => void;
  /**
   * Cells (or spacers) rendered between the sticky item section and the first
   * summarized column — used by Personal Hub to reserve the exact width of its
   * leading cross-group personal columns so source-column summaries stay aligned
   * with the data rows above. Also forces the row to render even when `columns`
   * alone has nothing summarizable.
   */
  leadingExtraCells?: React.ReactNode;
  /** Cells (or spacers) rendered after the summarized columns (Personal Hub board-only columns). */
  trailingExtraCells?: React.ReactNode;
}

const GroupSummaryRow: React.FC<Props> = ({ items, columns, itemsAbove, cumulativeByColumn, onSetCumulative, leadingExtraCells, trailingExtraCells }) => {
  const { columnWidths } = useBoardRender();

  const hasSummaryColumns = columns.some(
    (c) => AGGREGATABLE_TYPES.has(c.type) || COUNT_ONLY_TYPES.has(c.type),
  );
  // Still render (for alignment) when the caller supplies its own leading/trailing
  // cells, even if the source columns themselves have nothing to summarize.
  if (!hasSummaryColumns && !leadingExtraCells && !trailingExtraCells) return null;

  const nonArchived = items.filter((i) => !i.isArchived);
  const nonArchivedAbove = itemsAbove?.filter((i) => !i.isArchived);
  const numberCols = columns.filter((c) => c.type === ColumnType.NUMBER);
  const itemSectionWidth = (columnWidths[ITEM_COL_ID] ?? 298) - 16;

  return (
    <div
      role="row"
      aria-label="Group summary row"
      className="flex flex-nowrap items-stretch border-t border-[#d2d2d4] w-max rounded-bl-xl bg-white"
    >
      <div
        className="flex-shrink-0 sticky left-4 z-[1] bg-white border-r border-[#d2d2d4]"
        style={{ width: `${itemSectionWidth}px`, borderBottomLeftRadius: '6px' }}
        aria-hidden="true"
      />
      {leadingExtraCells}
      {columns.map((col) => (
        <SummaryCell
          key={col.id}
          col={col}
          items={nonArchived}
          itemsAbove={nonArchivedAbove}
          numberCols={numberCols}
          cumulative={cumulativeByColumn?.[col.id] ?? false}
          onCumulativeChange={onSetCumulative ? (b) => onSetCumulative(col.id, b) : undefined}
        />
      ))}
      {trailingExtraCells}
    </div>
  );
};

export default GroupSummaryRow;

/** True when at least one column can show a summary — used to gate the board-total footer. */
export const hasSummarizableColumns = (columns: { type: ColumnType }[]): boolean =>
  columns.some((c) => AGGREGATABLE_TYPES.has(c.type) || COUNT_ONLY_TYPES.has(c.type));

// ─── BoardSummaryRow ──────────────────────────────────────────────────────────

interface BoardSummaryRowProps {
  /** Every item on the board (all groups) — the row totals the whole column. */
  items: Item[];
  columns: Column[];
  /** Leading cells/spacers before the summarized columns (Personal Hub cross-group columns). */
  leadingExtraCells?: React.ReactNode;
  /** Trailing cells/spacers after the summarized columns. */
  trailingExtraCells?: React.ReactNode;
  /** Sticky-left label shown in the item section. */
  label?: string;
}

/**
 * A board-wide total row: the same SummaryCell (calc/unit/formatting) as a group
 * summary, but aggregating EVERY item across ALL groups — so it always reflects the
 * whole column, including groups added later, with no per-cell wiring. It reuses each
 * column's own summaryConfig (shared with the group rows), so a column set to "Sum"
 * shows group sums per group and the grand sum here. Meant to be placed in a
 * sticky-to-bottom footer by the caller. Cumulative scope doesn't apply (it already
 * spans everything).
 */
export const BoardSummaryRow: React.FC<BoardSummaryRowProps> = ({
  items, columns, leadingExtraCells, trailingExtraCells, label = 'Board total',
}) => {
  const { columnWidths } = useBoardRender();

  const hasSummaryColumns = columns.some(
    (c) => AGGREGATABLE_TYPES.has(c.type) || COUNT_ONLY_TYPES.has(c.type),
  );
  if (!hasSummaryColumns && !leadingExtraCells && !trailingExtraCells) return null;

  const nonArchived = items.filter((i) => !i.isArchived);
  const numberCols = columns.filter((c) => c.type === ColumnType.NUMBER);
  const itemSectionWidth = (columnWidths[ITEM_COL_ID] ?? 298) - 16;

  return (
    <div
      role="row"
      aria-label={label}
      className="flex flex-nowrap items-stretch border-t-2 border-black w-max bg-white"
    >
      <div
        className="flex-shrink-0 sticky left-4 z-[1] bg-white border-r border-[#d2d2d4] flex items-center pl-7 pr-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
        style={{ width: `${itemSectionWidth}px` }}
      >
        {label}
      </div>
      {leadingExtraCells}
      {columns.map((col) => (
        <SummaryCell
          key={col.id}
          col={col}
          items={nonArchived}
          numberCols={numberCols}
          cumulative={false}
          boardTotal
        />
      ))}
      {trailingExtraCells}
    </div>
  );
};
