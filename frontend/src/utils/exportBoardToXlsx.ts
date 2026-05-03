import ExcelJS from 'exceljs';
import type { Board, Group, Item, Column, User } from '../types';
import { ColumnType } from '../types';
import type { SimpleFormulaColumnSettings } from '../types';

function formatCellValue(value: unknown, col: Column, users: User[]): string | number {
  if (value == null) return '';
  switch (col.type) {
    case ColumnType.PERSON: {
      const ids = Array.isArray(value) ? value : [value];
      return ids
        .map((id) => users.find((u) => u.id === id)?.name ?? String(id))
        .join(', ');
    }
    case ColumnType.NUMBER:
      return isNaN(Number(value)) ? '' : Number(value);
    case ColumnType.CHECKBOX:
      return value ? 'Yes' : 'No';
    case ColumnType.TAGS:
      return Array.isArray(value) ? value.join(', ') : String(value);
    case ColumnType.TIME_RANGE: {
      const tr = value as { start?: string | Date; end?: string | Date };
      const fmt = (d: string | Date | undefined) =>
        d ? new Date(d).toLocaleDateString() : '';
      return tr.start || tr.end ? `${fmt(tr.start)} – ${fmt(tr.end)}` : '';
    }
    case ColumnType.DATE:
      return value ? new Date(value as string | Date).toLocaleDateString() : '';
    case ColumnType.LOCATION: {
      const loc = value as { address?: string };
      return loc.address ?? String(value);
    }
    default:
      return String(value);
  }
}

function hexToArgb(hex: string): string {
  const clean = hex.replace('#', '');
  return `FF${clean.toUpperCase()}`;
}

function isDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function colIndexToLetter(colIndex: number): string {
  let letter = '';
  let n = colIndex;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function convertToExcelFormula(
  formula: string,
  columns: Column[],
  rowNumber: number,
): string {
  // Col 1 (A) = Name, col 2 (B) = columns[0], col 3 (C) = columns[1], ...
  const colNameToLetter = new Map<string, string>(
    columns.map((col, i) => [col.name, colIndexToLetter(i + 2)]),
  );

  const excelFormula = formula.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const trimmed = name.trim();
    const asNum = Number(trimmed);
    if (trimmed !== '' && !isNaN(asNum)) return trimmed; // numeric literal like {42}
    const letter = colNameToLetter.get(trimmed);
    return letter ? `${letter}${rowNumber}` : '0';
  });

  return `=${excelFormula}`;
}

export async function exportBoardToXlsx(
  board: Board,
  groups: Group[],
  columns: Column[],
  itemsByGroup: Record<string, Item[]>,
  users: User[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(board.name.slice(0, 31));

  const colCount = columns.length + 1; // Name + dynamic columns
  let currentRow = 1;

  // --- Board title row ---
  sheet.addRow([board.name]);
  sheet.getCell(currentRow, 1).font = { bold: true, size: 16 };
  sheet.mergeCells(currentRow, 1, currentRow, colCount);
  currentRow++;

  // --- Board description row (if present) ---
  if (board.description) {
    sheet.addRow([board.description]);
    sheet.getCell(currentRow, 1).font = { italic: true, color: { argb: 'FF6B7280' } };
    sheet.mergeCells(currentRow, 1, currentRow, colCount);
    currentRow++;
  }

  // Spacer
  sheet.addRow([]);
  currentRow++;

  for (const group of groups) {
    const groupColor = group.color ?? '#6366f1';
    const groupArgb = hexToArgb(groupColor);

    // Group name row
    const groupRow = sheet.addRow([group.name]);
    groupRow.getCell(1).font = { bold: true, size: 12, color: { argb: groupArgb } };
    sheet.mergeCells(currentRow, 1, currentRow, colCount);
    currentRow++;

    // Column header row
    const headerValues = ['Name', ...columns.map((c) => c.name)];
    const headerRow = sheet.addRow(headerValues);
    const headerBg = '2D2D2D';
    headerRow.eachCell((cell, colIdx) => {
      if (colIdx > colCount) return;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${headerBg}` } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 22;
    currentRow++;

    // Item rows
    const items = itemsByGroup[group.id] ?? [];
    items.forEach((item, idx) => {
      const rowValues: (string | number | ExcelJS.CellFormulaValue)[] = [item.name];

      for (const col of columns) {
        if (col.type === ColumnType.SIMPLE_FORMULA) {
          const settings = col.settings as SimpleFormulaColumnSettings;
          const formula = settings.defaultFormula;
          if (formula) {
            rowValues.push({ formula: convertToExcelFormula(formula, columns, currentRow) } as ExcelJS.CellFormulaValue);
          } else {
            rowValues.push('');
          }
        } else {
          rowValues.push(formatCellValue(item.values[col.id], col, users));
        }
      }

      const itemRow = sheet.addRow(rowValues);
      const rowBg = idx % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
      itemRow.eachCell((cell, colIdx) => {
        if (colIdx > colCount) return;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rowBg}` } };
        cell.alignment = { vertical: 'middle' };
      });

      // Color all status columns
      columns.forEach((col, colArrayIdx) => {
        if (col.type !== ColumnType.STATUS) return;
        const statusValue = item.values[col.id] as string | undefined;
        const settings = col.settings as { options?: { id: string; label: string; color: string }[] };
        const option = settings.options?.find((o) => o.id === statusValue || o.label === statusValue);
        if (option?.color) {
          const statusCell = itemRow.getCell(colArrayIdx + 2); // +1 for Name, +1 for 1-index
          const bg = option.color.replace('#', '');
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bg}` } };
          statusCell.font = { color: { argb: isDark(option.color) ? 'FFFFFFFF' : 'FF000000' }, bold: true };
          statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });

      currentRow++;
    });

    // Spacer between groups
    sheet.addRow([]);
    currentRow++;
  }

  // Column widths
  sheet.getColumn(1).width = 28;
  columns.forEach((_, i) => {
    sheet.getColumn(i + 2).width = 18;
  });

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${board.name}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
