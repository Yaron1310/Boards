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
 * The rows a Hub actually shows, rebuilt from the owner's assigned items: an assigned subitem
 * never gets a row of its own — the item hosting it does (see PersonalHubBoardGroup), and an
 * archived host hides it altogether. Boards come in the order they first appear among the
 * newest-assigned items; within a board, directly assigned items come first, then promoted hosts.
 *
 * `parentIdOf` names a subitem's hosting item (undefined for a top-level item, or when its group
 * is unknown — the Hub then shows it as a row of its own too). `parentsById` holds the hosts
 * that were fetched; a host that couldn't be is left out, as on the Hub.
 */
export function hubDisplayRows(
  assigned: Item[],
  parentIdOf: (item: Item) => string | undefined,
  parentsById: ReadonlyMap<string, Item>,
): Item[] {
  const sorted = assigned.filter((i) => !i.isArchived).sort((a, b) => assignedTime(b) - assignedTime(a));
  const byBoard = new Map<string, { top: Item[]; hosts: Item[] }>();
  for (const item of sorted) {
    const entry = byBoard.get(item.boardId) ?? { top: [], hosts: [] };
    byBoard.set(item.boardId, entry);
    const parentId = parentIdOf(item);
    if (!parentId) { entry.top.push(item); continue; }
    const host = parentsById.get(parentId);
    if (host && !host.isArchived && !entry.hosts.some((h) => h.id === host.id)) entry.hosts.push(host);
  }
  return [...byBoard.values()].flatMap(({ top, hosts }) => {
    const topIds = new Set(top.map((i) => i.id));
    return [...top, ...hosts.filter((h) => !topIds.has(h.id))];
  });
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
