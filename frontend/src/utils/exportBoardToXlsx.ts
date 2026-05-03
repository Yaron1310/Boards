import ExcelJS from 'exceljs';
import type { Board, Group, Item, Column, User } from '../types';
import { ColumnType } from '../types';

function formatCellValue(value: unknown, col: Column, users: User[]): string {
  if (value == null) return '';
  switch (col.type) {
    case ColumnType.PERSON: {
      const ids = Array.isArray(value) ? value : [value];
      return ids
        .map((id) => users.find((u) => u.id === id)?.name ?? String(id))
        .join(', ');
    }
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

  // --- Board title row ---
  sheet.addRow([board.name]);
  const titleCell = sheet.getCell(1, 1);
  titleCell.font = { bold: true, size: 16 };
  sheet.mergeCells(1, 1, 1, colCount);
  sheet.addRow([]); // spacer

  for (const group of groups) {
    const groupColor = group.color ?? '#6366f1';
    const groupArgb = hexToArgb(groupColor);

    // Group name row
    const groupRow = sheet.addRow([group.name]);
    const groupNameCell = groupRow.getCell(1);
    groupNameCell.font = { bold: true, size: 12, color: { argb: groupArgb } };
    sheet.mergeCells(groupRow.number, 1, groupRow.number, colCount);

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

    // Item rows
    const items = itemsByGroup[group.id] ?? [];
    items.forEach((item, idx) => {
      const rowValues = [
        item.name,
        ...columns.map((col) => formatCellValue(item.values[col.id], col, users)),
      ];
      const itemRow = sheet.addRow(rowValues);
      const rowBg = idx % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
      itemRow.eachCell((cell, colIdx) => {
        if (colIdx > colCount) return;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rowBg}` } };
        cell.alignment = { vertical: 'middle' };
      });

      // Color status cells
      const statusColIndex = columns.findIndex((c) => c.type === ColumnType.STATUS);
      if (statusColIndex !== -1) {
        const statusValue = item.values[columns[statusColIndex].id] as string | undefined;
        const settings = columns[statusColIndex].settings as { options?: { id: string; label: string; color: string }[] };
        const option = settings.options?.find((o) => o.id === statusValue || o.label === statusValue);
        if (option?.color) {
          const statusCell = itemRow.getCell(statusColIndex + 2); // +1 for Name col, +1 for 1-index
          const bg = option.color.replace('#', '');
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bg}` } };
          statusCell.font = { color: { argb: isDark(option.color) ? 'FFFFFFFF' : 'FF000000' }, bold: true };
          statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    });

    sheet.addRow([]); // spacer between groups
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
