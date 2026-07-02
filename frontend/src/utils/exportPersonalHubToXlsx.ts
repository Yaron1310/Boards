import ExcelJS from 'exceljs';
import type { Item, User } from '../types';

/** Flat export of the items currently visible in a Personal Hub — one row per item, grouped by source board. */
export async function exportPersonalHubToXlsx(
  hubTitle: string,
  itemsByBoard: Record<string, Item[]>,
  boardNames: Record<string, string>,
  users: User[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Personal Hub'.slice(0, 31));

  sheet.addRow([hubTitle]);
  sheet.getCell(1, 1).font = { bold: true, size: 16 };
  sheet.mergeCells(1, 1, 1, 5);
  sheet.addRow([]);

  const headerRow = sheet.addRow(['Board', 'Item', 'Status', 'Assignees', 'Due Date']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  });

  for (const [boardId, items] of Object.entries(itemsByBoard)) {
    const boardName = boardNames[boardId] ?? boardId;
    for (const item of items) {
      const assigneeNames = (item.assignees ?? [])
        .map((id) => users.find((u) => u.id === id)?.name ?? id)
        .join(', ');
      const dueDate = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '';
      sheet.addRow([boardName, item.name, item.status ?? '', assigneeNames, dueDate]);
    }
  }

  sheet.columns.forEach((col) => { col.width = 24; });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'personal_hub_export.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
