import { ColumnType } from '../types';

export const COLUMN_WIDTH_MAP: Record<ColumnType, string> = {
  [ColumnType.TEXT]: 'w-[200px]',
  [ColumnType.NUMBER]: 'w-[100px]',
  [ColumnType.DATE]: 'w-[120px]',
  [ColumnType.STATUS]: 'w-[140px]',
  [ColumnType.PERSON]: 'w-[160px]',
  [ColumnType.DROPDOWN]: 'w-[140px]',
  [ColumnType.CHECKBOX]: 'w-[70px]',
  [ColumnType.TAGS]: 'w-[160px]',
  [ColumnType.TIME]: 'w-[100px]',
  [ColumnType.EMAIL]: 'w-[180px]',
  [ColumnType.PHONE]: 'w-[150px]',
  [ColumnType.LOCATION]: 'w-[180px]',
  [ColumnType.TIME_RANGE]: 'w-[240px]',
  [ColumnType.SIMPLE_FORMULA]: 'w-[120px]',
};

export const ITEM_NAME_WIDTH = 'w-[240px]';
export const ITEM_NAME_MIN_WIDTH = 'min-w-[240px]';
export const ITEM_SECTION_WIDTH = 'w-[224px]';
export const DRAG_HANDLE_WIDTH = 'w-5';
export const CHECKBOX_WIDTH = 'w-6';
