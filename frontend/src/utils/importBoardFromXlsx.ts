import ExcelJS from 'exceljs';
import { ColumnType } from '../types';
import * as wm from '../services/workManagementService';

export interface ImportResult {
  boardId: string;
  boardName: string;
  groupCount: number;
  itemCount: number;
}

// ── Raw cell value helpers ────────────────────────────────────────────────────

type RawCell = ExcelJS.CellValue | null | undefined;

function cellToText(val: RawCell): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toLocaleDateString();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('error' in obj) return '';
    if ('richText' in obj) {
      return (obj.richText as Array<{ text: string }>).map((r) => r.text).join('');
    }
    if ('result' in obj) return cellToText(obj.result as RawCell);
    if ('text' in obj) return String(obj.text);
    return String(val);
  }
  return String(val);
}

// Returns an ISO date string (YYYY-MM-DD) for date cells, empty string otherwise.
function cellToDateIso(val: RawCell): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const text = cellToText(val).trim();
  if (!text) return '';
  // Try YYYY-MM-DD first, then common locale formats like DD/MM/YYYY
  const iso = new Date(text);
  if (!isNaN(iso.getTime())) return iso.toISOString().split('T')[0];
  // DD/MM/YYYY → YYYY-MM-DD
  const parts = text.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const parsed = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return text; // keep as-is if unparseable
}

function parseRows(sheet: ExcelJS.Worksheet): RawCell[][] {
  const rows: RawCell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const vals = (row.values as RawCell[]) || [];
    const cells: RawCell[] = [];
    for (let i = 1; i < vals.length; i++) cells.push(vals[i] ?? null);
    rows.push(cells);
  });
  return rows;
}

// ── Column spec ───────────────────────────────────────────────────────────────

interface ColumnSpec {
  name: string;
  type: ColumnType;
  /** Indices into the item's raw cells array (0 = first column after Name). */
  rawIndices: number[];
}

const START_SUFFIX = ' - Start';
const END_SUFFIX = ' - End';

function buildColumnSpecs(headers: string[]): ColumnSpec[] {
  const specs: ColumnSpec[] = [];
  let i = 0;
  while (i < headers.length) {
    const h = headers[i];
    if (i + 1 < headers.length && h.endsWith(START_SUFFIX)) {
      const base = h.slice(0, -START_SUFFIX.length);
      if (headers[i + 1] === `${base}${END_SUFFIX}`) {
        specs.push({ name: base, type: ColumnType.TIME_RANGE, rawIndices: [i, i + 1] });
        i += 2;
        continue;
      }
    }
    specs.push({ name: h, type: ColumnType.TEXT, rawIndices: [i] });
    i++;
  }
  return specs;
}

// ── Main export ───────────────────────────────────────────────────────────────

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
  const boardName = cellToText(rows[0]?.[0]).trim() || 'Imported Board';

  // Row 2: optional description; row 3 (or 2 if no description) is the spacer
  let cursor = 1;
  let description: string | undefined;
  const possibleDesc = cellToText(rows[cursor]?.[0]).trim();
  if (possibleDesc) { description = possibleDesc; cursor++; }
  cursor++; // skip spacer

  // ── Parse group blocks ─────────────────────────────────────────────────────
  interface ParsedGroup {
    name: string;
    items: Array<{ name: string; rawCells: RawCell[] }>;
  }

  const parsedGroups: ParsedGroup[] = [];
  let columnSpecs: ColumnSpec[] = [];

  while (cursor < rows.length) {
    const groupName = cellToText(rows[cursor]?.[0]).trim();
    if (!groupName) { cursor++; continue; }
    cursor++;

    // Headers row: cell 0 = "Name", cells 1+ = column names
    const headerRow = rows[cursor] ?? [];
    cursor++;
    const headerNames = headerRow.slice(1).map((c) => cellToText(c).trim()).filter(Boolean);
    if (!columnSpecs.length && headerNames.length) {
      columnSpecs = buildColumnSpecs(headerNames);
    }

    // Item rows until empty row
    const items: Array<{ name: string; rawCells: RawCell[] }> = [];
    while (cursor < rows.length) {
      const itemName = cellToText(rows[cursor]?.[0]).trim();
      if (!itemName) break;
      items.push({ name: itemName, rawCells: rows[cursor] ?? [] });
      cursor++;
    }
    cursor++; // skip empty spacer

    parsedGroups.push({ name: groupName, items });
  }

  if (!parsedGroups.length) throw new Error('No groups found in file.');

  // ── Create board ───────────────────────────────────────────────────────────
  const board = await wm.createBoard({ name: boardName, description, workspaceId });

  // ── Create columns and fix ordering ───────────────────────────────────────
  // createColumn in the backend never sets `order`, so we must call reorderColumns
  // after creation to guarantee the column sequence matches the xlsx.
  const createdCols: Array<{ id: string; spec: ColumnSpec }> = [];
  for (const spec of columnSpecs) {
    const col = await wm.createColumn(board.id, { name: spec.name, type: spec.type });
    createdCols.push({ id: col.id, spec });
  }
  if (createdCols.length > 0) {
    await wm.reorderColumns(board.id, createdCols.map((c, i) => ({ id: c.id, order: i })));
  }

  // ── Create groups and items ────────────────────────────────────────────────
  let totalItems = 0;
  for (let gi = 0; gi < parsedGroups.length; gi++) {
    const pg = parsedGroups[gi];
    const group = await wm.createGroup(board.id, { name: pg.name, order: gi });

    for (let ii = 0; ii < pg.items.length; ii++) {
      const item = pg.items[ii];
      // rawCells[0] = item name, rawCells[1+] = column values
      const rawValues = item.rawCells.slice(1);

      const values: Record<string, unknown> = {};
      for (const { id, spec } of createdCols) {
        if (spec.type === ColumnType.TIME_RANGE) {
          const startIso = cellToDateIso(rawValues[spec.rawIndices[0]]);
          const endIso = cellToDateIso(rawValues[spec.rawIndices[1]]);
          if (startIso || endIso) values[id] = { start: startIso, end: endIso };
        } else {
          const text = cellToText(rawValues[spec.rawIndices[0]]).trim();
          if (text) values[id] = text;
        }
      }

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
