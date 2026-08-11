import { evaluateFormula, type CellRef, type FormulaRow } from './formulaEngine';
import type { Item, PersonalColumn, SimpleFormulaColumnSettings } from '../types';
import type { PersonalGridContext } from '../components/personalHub/cells/types';

/**
 * One definition of how a Personal Hub table is laid out and how its formulas are evaluated,
 * shared by the Hub itself and by anything that has to reproduce a hub value without the Hub
 * being rendered (a board formula referencing a personal summary). Keeping both on the same
 * functions is what stops the two from drifting into different numbers.
 */

const assignedTime = (item: Item): number =>
  item.lastAssignedAt ? new Date(item.lastAssignedAt).getTime() : 0;

/**
 * The Hub's row order, rebuilt from the owner's assigned items alone: newest-assigned first,
 * then grouped by board in the order those boards first appear. That's the same pair of rules
 * the Hub renders by, so row 1 here is row 1 there — which matters because a personal formula
 * may address rows by position.
 */
export function hubRowOrder(items: Item[]): string[] {
  const sorted = [...items].sort((a, b) => assignedTime(b) - assignedTime(a));
  const byBoard = new Map<string, string[]>();
  for (const item of sorted) {
    const rows = byBoard.get(item.boardId);
    if (rows) rows.push(item.id);
    else byBoard.set(item.boardId, [item.id]);
  }
  return [...byBoard.values()].flat();
}

/**
 * The personal columns sharing one grid — the cross-group ("all groups") ones, or a single
 * board's — in display order. Column B is `[0]`, C is `[1]`, matching the Hub's header row.
 */
export function hubGridColumns(columns: PersonalColumn[], boardId?: string): PersonalColumn[] {
  const scoped = boardId
    ? columns.filter((c) => c.scope === 'board' && c.boardId === boardId)
    : columns.filter((c) => c.scope === 'all');
  return [...scoped].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Build a per-item evaluator for a personal Simple Formula column, using the same grid
 * addressing the cells use. Returned per-item so a summary can aggregate over exactly the items
 * it's scoped to (this board, or the whole hub), the same way a board formula column does.
 *
 * `resolveRef` handles anything the grid can't answer itself (a reference to another board);
 * callers with no resolver to offer leave it out, and those references contribute 0.
 */
export const makePersonalFormulaEvaluator = (
  col: PersonalColumn,
  grid: PersonalGridContext,
  resolveRef?: (ref: CellRef, itemId: string) => number | null | undefined,
) => {
  const settings = col.settings as SimpleFormulaColumnSettings;
  const defaultFormula = settings?.defaultFormula ?? '';
  // Rows carry their item id so a formula naming a specific row ({ref:p:…:<itemId>}) resolves
  // from this grid rather than falling through as unavailable.
  const allRows: FormulaRow[] = grid.rowOrder.map((id) => ({ id, values: grid.valuesByItem[id] ?? {} }));

  return (item: Item): number | null => {
    const stored = grid.valuesByItem[item.id]?.[col.id];
    const formula = typeof stored === 'string' ? stored : defaultFormula;
    if (!formula) return null;
    const idx = grid.rowOrder.indexOf(item.id);
    const r = evaluateFormula(formula, {}, {
      allItems: allRows,
      columns: grid.columns,
      currentRowIndex: idx >= 0 ? idx : undefined,
      // Personal refs are serialized against the grid's own board — empty for a cross-group
      // grid, which spans every board. Passing it is what lets same-table references resolve
      // here instead of being treated as pointing somewhere else entirely.
      homeBoardId: grid.boardId ?? '',
      hubOwnerId: grid.ownerId,
      resolveRef: resolveRef ? (ref, forItemId) => resolveRef(ref, forItemId ?? item.id) : undefined,
    });
    return r !== null && !isNaN(r) ? r : null;
  };
};
