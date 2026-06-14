import ExcelJS from 'exceljs';
import { ColumnType } from '../types';
import type { StatusOption } from '../types';
import * as wm from '../services/workManagementService';
import { getUsers } from '../services/geminiService';
import type { User } from '../types';

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

// Converts ExcelJS ARGB string (e.g. "FF6366F1") to a CSS hex color ("#6366f1").
function argbToHex(argb: string | undefined): string | undefined {
  if (!argb || argb.length < 8) return undefined;
  return `#${argb.slice(2).toLowerCase()}`;
}

// Returns the ARGB string if the cell has a solid colored fill that looks like
// a status indicator (excludes white, near-white, light-gray row stripes, and
// the light header background used by this app's export).
function getCellStatusArgb(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill;
  if (!fill || fill.type !== 'pattern' || fill.pattern === 'none') return null;
  const argb = (fill as ExcelJS.FillPattern).fgColor?.argb;
  if (!argb || argb.length < 8) return null;
  const hex = argb.slice(2).toUpperCase();
  // Skip transparent / white / alternating-row gray / header gray
  const excluded = new Set(['FFFFFF', 'EFEFEF', 'D9D9D9', '000000']);
  if (excluded.has(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  if (luminance > 230) return null; // very light = not a status color
  return argb;
}

// Returns true if the cell's font color is white (or near-white).
// Status cells in this app's export always use white text, so this is the
// most reliable signal that a column is a STATUS column.
function cellHasWhiteText(cell: ExcelJS.Cell): boolean {
  const argb = cell.font?.color?.argb;
  if (!argb || argb.length < 8) return false;
  const hex = argb.slice(2).toUpperCase();
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 200; // white or near-white font
}

// ── Column spec ───────────────────────────────────────────────────────────────

interface ColumnSpec {
  name: string;
  type: ColumnType;
  /** Indices into the item's rawCells array (0 = first column after Name). */
  rawIndices: number[];
}

const START_SUFFIX = ' - Start';
const END_SUFFIX = ' - End';
const PERSON_HEADERS = new Set(['person', 'people', 'user']);

function isUrlLike(text: string): boolean {
  return /^https?:\/\//i.test(text) || /^www\./i.test(text);
}

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
    if (PERSON_HEADERS.has(h.toLowerCase())) {
      specs.push({ name: h, type: ColumnType.PERSON, rawIndices: [i] });
    } else {
      specs.push({ name: h, type: ColumnType.TEXT, rawIndices: [i] });
    }
    i++;
  }
  return specs;
}

// Builds a stable option id from a label string.
function labelToOptionId(label: string): string {
  const slug = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return slug || `opt_${Math.random().toString(36).slice(2, 7)}`;
}

// Fetches all users for a workspace and returns a case-insensitive name → id map.
async function buildUserNameMap(workspaceId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | null = null;
  do {
    const page = await getUsers({ workspaceId, limit: 200, ...(cursor ? { cursor } : {}) });
    for (const u of page.data as User[]) {
      if (u.name) map.set(u.name.toLowerCase().trim(), u.id);
    }
    cursor = page.cursor;
  } while (cursor);
  return map;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function importBoardFromXlsx(
  file: File,
  workspaceId: string,
): Promise<ImportResult> {
  const userNameMap = await buildUserNameMap(workspaceId);

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

  interface ParsedItem {
    name: string;
    rawCells: RawCell[];
    // Per-column ARGB fill color (null if no colored fill). Indexed parallel to
    // rawCells.slice(1) — i.e. cellArgbs[0] corresponds to the first data column.
    cellArgbs: (string | null)[];
  }

  interface ParsedGroup {
    name: string;
    color?: string;
    items: ParsedItem[];
  }

  const parsedGroups: ParsedGroup[] = [];
  let columnSpecs: ColumnSpec[] = [];

  // colorMap[specIndex] maps ARGB → first label seen for that color.
  // Populated while scanning item rows; used after scanning to build STATUS options.
  let colorMap: Map<string, string>[] = [];
  // colHasWhiteText[specIndex] — true if any item cell in this column had white text.
  // White text is the reliable indicator that a column is a STATUS column.
  let colHasWhiteText: boolean[] = [];
  // colAllValuesUrlLike[specIndex] — true if every non-empty TEXT cell in this column looks like a URL.
  let colAllValuesUrlLike: boolean[] = [];
  let colHasAnyValue: boolean[] = [];

  while (cursor < rows.length) {
    const groupName = cellToText(rows[cursor]?.[0]).trim();
    if (!groupName) { cursor++; continue; }
    // Read the font color from the original sheet cell (cursor is 0-indexed; sheet rows are 1-indexed)
    const groupColor = argbToHex(sheet.getRow(cursor + 1).getCell(1).font?.color?.argb);
    cursor++;

    // Headers row: cell 0 = "Name", cells 1+ = column names
    const headerRow = rows[cursor] ?? [];
    cursor++;
    const headerNames = headerRow.slice(1).map((c) => cellToText(c).trim()).filter(Boolean);
    if (!columnSpecs.length && headerNames.length) {
      columnSpecs = buildColumnSpecs(headerNames);
      colorMap = columnSpecs.map(() => new Map<string, string>());
      colHasWhiteText = columnSpecs.map(() => false);
      colAllValuesUrlLike = columnSpecs.map(() => true);
      colHasAnyValue = columnSpecs.map(() => false);
    }

    // Item rows until empty row
    const items: ParsedItem[] = [];
    while (cursor < rows.length) {
      const itemName = cellToText(rows[cursor]?.[0]).trim();
      if (!itemName) break;

      const rawCells = rows[cursor] ?? [];
      // rows[cursor] → sheet row cursor+1 (1-indexed).
      // Data columns start at sheet column 2 (column A is item name).
      const sheetRow = sheet.getRow(cursor + 1);
      const cellArgbs: (string | null)[] = columnSpecs.map((spec) => {
        // spec.rawIndices[0] is 0-based index into rawCells.slice(1),
        // so sheet column index = spec.rawIndices[0] + 2.
        const cell = sheetRow.getCell(spec.rawIndices[0] + 2);
        return getCellStatusArgb(cell);
      });

      // Populate colorMap, colHasWhiteText, and URL tracking for each column
      columnSpecs.forEach((spec, si) => {
        const sheetCell = sheetRow.getCell(spec.rawIndices[0] + 2);
        if (cellHasWhiteText(sheetCell)) colHasWhiteText[si] = true;
        const argb = cellArgbs[si];
        if (argb && !colorMap[si].has(argb)) {
          const label = cellToText(rawCells[spec.rawIndices[0] + 1]).trim();
          colorMap[si].set(argb, label);
        }
        if (spec.type === ColumnType.TEXT) {
          const text = cellToText(rawCells[spec.rawIndices[0] + 1]).trim();
          if (text) {
            colHasAnyValue[si] = true;
            if (!isUrlLike(text)) colAllValuesUrlLike[si] = false;
          }
        }
      });

      items.push({ name: itemName, rawCells, cellArgbs });
      cursor++;
    }
    cursor++; // skip empty spacer

    parsedGroups.push({ name: groupName, color: groupColor, items });
  }

  if (!parsedGroups.length) throw new Error('No groups found in file.');

  // ── Detect STATUS columns and build their options ─────────────────────────
  // A column is STATUS if at least one cell has a recognisable colored fill.
  // TIME_RANGE columns are never re-typed (they were explicitly detected by header).

  interface StatusColInfo {
    options: StatusOption[];
    argbToOptionId: Map<string, string>;
  }

  const statusInfoBySpec: (StatusColInfo | null)[] = columnSpecs.map((spec, si) => {
    if (spec.type === ColumnType.TIME_RANGE) return null;
    if (!colHasWhiteText[si]) return null;

    const options: StatusOption[] = [];
    const argbToOptionId = new Map<string, string>();

    for (const [argb, label] of colorMap[si].entries()) {
      const id = labelToOptionId(label) || `opt_${options.length}`;
      const color = `#${argb.slice(2).toLowerCase()}`;
      options.push({ id, label, color });
      argbToOptionId.set(argb, id);
    }

    return { options, argbToOptionId };
  });

  // Promote TEXT columns whose every non-empty value looks like a URL to LINK.
  columnSpecs.forEach((spec, si) => {
    if (spec.type === ColumnType.TEXT && colHasAnyValue[si] && colAllValuesUrlLike[si]) {
      columnSpecs[si] = { ...spec, type: ColumnType.LINK };
    }
  });

  // ── Create board ───────────────────────────────────────────────────────────
  const board = await wm.createBoard({ name: boardName, description, workspaceId });

  // ── Create columns and fix ordering ───────────────────────────────────────
  const createdCols: Array<{ id: string; spec: ColumnSpec; statusInfo: StatusColInfo | null }> = [];
  for (let si = 0; si < columnSpecs.length; si++) {
    const spec = columnSpecs[si];
    const statusInfo = statusInfoBySpec[si];

    const colType = statusInfo ? ColumnType.STATUS : spec.type;
    const settings = statusInfo ? { options: statusInfo.options } : undefined;

    const col = await wm.createColumn(board.id, {
      name: spec.name,
      type: colType,
      ...(settings ? { settings } : {}),
    });
    createdCols.push({ id: col.id, spec: { ...spec, type: colType }, statusInfo });
  }
  if (createdCols.length > 0) {
    await wm.reorderColumns(board.id, createdCols.map((c, i) => ({ id: c.id, order: i })));
  }

  // ── Create groups and items ────────────────────────────────────────────────
  let totalItems = 0;
  for (let gi = 0; gi < parsedGroups.length; gi++) {
    const pg = parsedGroups[gi];
    const group = await wm.createGroup(board.id, { name: pg.name, order: gi, color: pg.color });

    for (let ii = 0; ii < pg.items.length; ii++) {
      const item = pg.items[ii];
      // rawCells[0] = item name, rawCells[1+] = column values
      const rawValues = item.rawCells.slice(1);

      const values: Record<string, unknown> = {};
      for (let ci = 0; ci < createdCols.length; ci++) {
        const { id, spec, statusInfo } = createdCols[ci];

        if (spec.type === ColumnType.TIME_RANGE) {
          const startIso = cellToDateIso(rawValues[spec.rawIndices[0]]);
          const endIso = cellToDateIso(rawValues[spec.rawIndices[1]]);
          if (startIso || endIso) {
            const startMs = startIso ? new Date(startIso).getTime() : NaN;
            const endMs = endIso ? new Date(endIso).getTime() : NaN;
            const durMs = endMs - startMs;
            // Inclusive day count: same-day span is 1 day, start → start+1 day is 2, etc.
            const durationDays = !isNaN(durMs) && durMs >= 0 ? Math.round(durMs / 86_400_000) + 1 : undefined;
            values[id] = { start: startIso, end: endIso, ...(durationDays !== undefined ? { durationDays } : {}) };
          }
        } else if (statusInfo) {
          // Match by fill color first (most reliable), then fall back to text label match.
          const argb = item.cellArgbs[ci];
          let optionId: string | undefined;
          if (argb) {
            optionId = statusInfo.argbToOptionId.get(argb);
          }
          if (!optionId) {
            const label = cellToText(rawValues[spec.rawIndices[0]]).trim();
            optionId = statusInfo.options.find((o) => o.label === label)?.id;
          }
          if (optionId) values[id] = optionId;
        } else if (spec.type === ColumnType.PERSON) {
          const text = cellToText(rawValues[spec.rawIndices[0]]).trim();
          if (text) {
            const ids = text.split(',').map((n) => userNameMap.get(n.toLowerCase().trim())).filter((id): id is string => !!id);
            if (ids.length) values[id] = ids;
          }
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
