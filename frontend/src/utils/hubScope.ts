import { BOARD_TOTAL_GROUP_ID, HUB_ROWS_GROUP_ID, type CellRef } from './formulaEngine';
import { ColumnType } from '../types';
import type { PersonalColumn } from '../types';

/** Stands in for "the viewer's own hub" in the per-owner maps, where `undefined` can't be a key. */
export const SELF_OWNER = 'self';

/**
 * Which of each hub's boards a set of references needs rebuilt (see `hubScopeByOwner` in
 * useForeignCellValues): a board group's total needs only its own board; the whole-hub total,
 * and anything involving a personal formula column, needs every board. `null` = not decidable
 * yet, because that hub's column definitions have not loaded. An owner absent from the map
 * needs no hub rebuild at all.
 */
export function hubScopes(
  allRefs: CellRef[],
  viewerId: string | undefined,
  personalColumnsByOwner: ReadonlyMap<string, PersonalColumn[]>,
): Map<string, 'all' | Set<string> | null> {
  const m = new Map<string, 'all' | Set<string> | null>();
  const widen = (owner: string, boardId: string | null) => {
    const cur = m.get(owner);
    if (cur === 'all' || cur === null) return;
    if (boardId === null) { m.set(owner, 'all'); return; }
    m.set(owner, new Set([...(cur ?? []), boardId]));
  };
  for (const r of allRefs) {
    const owner = r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER;
    if (r.kind === 'b') {
      if (r.agg && r.groupId === HUB_ROWS_GROUP_ID) widen(owner, r.boardId);
      continue;
    }
    if (r.kind !== 'p') continue;
    const cols = personalColumnsByOwner.get(owner);
    if (r.agg) {
      if (r.groupId === BOARD_TOTAL_GROUP_ID) { widen(owner, null); continue; }
      if (!cols) { if (m.get(owner) !== 'all') m.set(owner, null); continue; }
      const col = cols.find((c) => c.id === r.columnId);
      widen(owner, col?.type === ColumnType.SIMPLE_FORMULA ? null : r.boardId);
    } else if (cols?.find((c) => c.id === r.columnId)?.type === ColumnType.SIMPLE_FORMULA) {
      widen(owner, null);
    }
  }
  return m;
}
