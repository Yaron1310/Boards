import ExcelJS from 'exceljs';

export const PERMISSION_LABELS = { edit: 'Edit', read_only: 'Read only' } as const;

/** Recognizes the handful of ways someone might type a permission in a spreadsheet cell.
 *  Blank is treated as "unset" (defaults to Edit), anything else unrecognized comes back as
 *  invalid so the row can be flagged instead of silently guessed. */
export function normalizePermissionCell(raw: unknown): { permissions: 'edit' | 'read_only'; wasInvalid: boolean } {
  if (typeof raw !== 'string' || !raw.trim()) return { permissions: 'edit', wasInvalid: false };
  const v = raw.trim().toLowerCase();
  if (['edit', 'editor'].includes(v)) return { permissions: 'edit', wasInvalid: false };
  if (['read_only', 'read only', 'readonly', 'view', 'viewer'].includes(v)) return { permissions: 'read_only', wasInvalid: false };
  return { permissions: 'edit', wasInvalid: true };
}

/** Parses an uploaded invite sheet into {email, name?, permissions} rows. Column A = email (any
 *  row whose first cell isn't an email — a header row included — is simply not a data row),
 *  column B = name, column C = permission. Returns the parsed rows plus the emails whose
 *  Permission cell had an unrecognized value (defaulted to Edit). */
export function parseInviteRows(sheetRows: unknown[][]): {
  rows: { email: string; name?: string; permissions: 'edit' | 'read_only' }[];
  invalidPermissionEmails: string[];
} {
  const dataRows = sheetRows.filter((row) => typeof row[0] === 'string' && (row[0] as string).includes('@'));
  const invalidPermissionEmails: string[] = [];
  const rows = dataRows.map((row) => {
    const email = (row[0] as string).trim();
    const name = typeof row[1] === 'string' ? row[1].trim() : undefined;
    const { permissions, wasInvalid } = normalizePermissionCell(row[2]);
    if (wasInvalid) invalidPermissionEmails.push(email);
    return { email, name: name || undefined, permissions };
  });
  return { rows, invalidPermissionEmails };
}

/** Downloads a ready-to-fill invite sheet: Email / Name / Permission columns, with the
 *  Permission column pre-armed with an Edit/Read only dropdown for a generous number of rows. */
export async function downloadInviteTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invites');
  sheet.addRow(['Email', 'Name', 'Permission']);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 16;

  const ROW_COUNT = 200;
  for (let i = 2; i <= ROW_COUNT + 1; i++) {
    sheet.getCell(`C${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Edit,Read only"'],
      showErrorMessage: true,
      errorTitle: 'Invalid permission',
      error: 'Choose Edit or Read only from the dropdown.',
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'invite-users-template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
