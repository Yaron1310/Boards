import ExcelJS from 'exceljs';
import { ColumnType } from '../types';
import * as wm from '../services/workManagementService';

export interface ImportResult {
  boardId: string;
  boardName: string;
  groupCount: number;
  itemCount: number;
}

function getCellValue(val: ExcelJS.CellValue | null | undefined): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toLocaleDateString();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('error' in obj) return '';
    if ('richText' in obj) {
      return (obj.richText as Array<{ text: string }>).map((r) => r.text).join('');
    }
    if ('result' in obj) {
      return getCellValue(obj.result as ExcelJS.CellValue);
    }
    if ('text' in obj) {
      return String(obj.text);
    }
    return String(val);
  }
  return String(val);
}

function parseRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const vals = (row.values as (ExcelJS.CellValue | null | undefined)[]) || [];
    const cells: string[] = [];
    for (let i = 1; i < vals.length; i++) {
      cells.push(getCellValue(vals[i]));
    }
    rows.push(cells);
  });
  return rows;
}

export async function importBoardFromXlsx(
  file: File,
  workspaceId: string,
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in file.');

  const rows = parseRows(sheet);

  // Row 1: board name
  const boardName = rows[0]?.[0]?.trim() || 'Imported Board';

  // Row 2: optional description; if non-empty it's the description and row 3 is the spacer
  let cursor = 1;
  let description: string | undefined;
  const possibleDesc = rows[cursor]?.[0]?.trim();
  if (possibleDesc) {
    description = possibleDesc;
    cursor++;
  }
  cursor++; // skip spacer row

  interface ParsedGroup {
    name: string;
    items: Array<{ name: string; rawValues: string[] }>;
  }

  const parsedGroups: ParsedGroup[] = [];
  let columnNames: string[] = [];

  while (cursor < rows.length) {
    const groupNameCell = rows[cursor]?.[0]?.trim();
    if (!groupNameCell) { cursor++; continue; }

    const groupName = groupNameCell;
    cursor++;

    // Headers row: first cell is "Name", rest are column names
    const headerRow = rows[cursor] || [];
    cursor++;
    const thisHeaders = headerRow.slice(1).map((h) => h.trim()).filter(Boolean);
    if (!columnNames.length && thisHeaders.length) columnNames = thisHeaders;

    // Item rows until empty row
    const items: Array<{ name: string; rawValues: string[] }> = [];
    while (cursor < rows.length) {
      const itemName = rows[cursor]?.[0]?.trim();
      if (!itemName) break;
      const rawValues = (rows[cursor] || []).slice(1).map((v) => v?.trim() ?? '');
      items.push({ name: itemName, rawValues });
      cursor++;
    }
    cursor++; // skip empty spacer row

    parsedGroups.push({ name: groupName, items });
  }

  if (!parsedGroups.length) throw new Error('No groups found in file.');

  // 1. Create board
  const board = await wm.createBoard({ name: boardName, description, workspaceId });

  // 2. Create columns (TEXT type — xlsx carries no type metadata)
  const columnIdMap: Record<string, string> = {};
  for (const colName of columnNames) {
    const col = await wm.createColumn(board.id, { name: colName, type: ColumnType.TEXT });
    columnIdMap[colName] = col.id;
  }

  // 3. Create groups and items
  let totalItems = 0;
  for (let gi = 0; gi < parsedGroups.length; gi++) {
    const pg = parsedGroups[gi];
    const group = await wm.createGroup(board.id, { name: pg.name, order: gi });

    for (let ii = 0; ii < pg.items.length; ii++) {
      const item = pg.items[ii];
      const values: Record<string, string> = {};
      columnNames.forEach((colName, idx) => {
        const colId = columnIdMap[colName];
        if (colId && item.rawValues[idx]) {
          values[colId] = item.rawValues[idx];
        }
      });

      await wm.createItem({
        name: item.name,
        workspaceId,
        boardId: board.id,
        groupId: group.id,
        order: ii,
        values,
      });
      totalItems++;
    }
  }

  return {
    boardId: board.id,
    boardName: board.name,
    groupCount: parsedGroups.length,
    itemCount: totalItems,
  };
}
