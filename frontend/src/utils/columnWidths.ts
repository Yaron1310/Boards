import { ColumnType } from '../types';

export const COLUMN_TYPE_MIN_WIDTHS: Partial<Record<ColumnType, number>> = {
  [ColumnType.TIME_RANGE]: 170,
};

export const ITEM_NAME_WIDTH = 'w-[298px]';
export const ITEM_NAME_MIN_WIDTH = 'min-w-[298px]';
export const GROUP_SECTION_WIDTH = 'w-[282px]';
export const ITEM_SECTION_WIDTH = 'w-[282px]';
export const DRAG_HANDLE_WIDTH = 'w-5';
export const CHECKBOX_WIDTH = 'w-6';

const MAX_COLUMN_WIDTH = 250;
const MIN_COLUMN_WIDTH = 100;

// Fixed pixel budget consumed by non-name elements in the column header:
// px-3 both sides (24) + drag handle (12) + gap (8) + type icon (13) + gap (6)
// + gap (8) + sort button (16) + gap (4) + 3-dots button (16) + px-3 (already counted)
const COLUMN_HEADER_OVERHEAD = 107;

let _canvas: HTMLCanvasElement | null = null;

function measureTextWidth(text: string): number {
  if (typeof document === 'undefined') return text.length * 8;
  if (!_canvas) _canvas = document.createElement('canvas');
  const ctx = _canvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = '600 14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return Math.ceil(ctx.measureText(text).width);
}

const _widthCache = new Map<string, number>();

export function calculateColumnWidth(columnName: string, columnType?: ColumnType): number {
  const cacheKey = `${columnName}|${columnType ?? ''}`;
  const cached = _widthCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const textWidth = measureTextWidth(columnName);
  const typeMin = columnType ? (COLUMN_TYPE_MIN_WIDTHS[columnType] ?? MIN_COLUMN_WIDTH) : MIN_COLUMN_WIDTH;
  const width = Math.max(typeMin, Math.min(MAX_COLUMN_WIDTH, COLUMN_HEADER_OVERHEAD + textWidth));
  _widthCache.set(cacheKey, width);
  return width;
}
