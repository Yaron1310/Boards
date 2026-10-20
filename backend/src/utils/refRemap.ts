// Rewrites formula `{ref:<kind>:<boardId>:<columnId>:<row>[:owner[:period]]}` tokens when a board is
// duplicated, so same-board references point at the copy instead of the original. References to other
// boards are left untouched; item/group IDs with no mapping (not copied) are also left as-is.

export interface RefRemapMaps {
  oldBoardId: string;
  newBoardId: string;
  groupIdMap: Map<string, string>;
  itemIdMap: Map<string, string>;
}

const REF_TOKEN = /\{ref:([^{}]*)\}/g;

export function remapRefsInString(input: string, maps: RefRemapMaps): string {
  if (!input.includes('{ref:')) return input;
  return input.replace(REF_TOKEN, (token, inner: string) => {
    const parts = inner.split(':');
    // parts: [ 'ref'-less inner starts at kind ] -> kind, boardId, columnId, row, ...
    if (parts.length < 4 || parts[1] !== maps.oldBoardId) return token;
    parts[1] = maps.newBoardId;
    const row = parts[3];
    if (row.startsWith('sum#')) {
      const segs = row.split('#');
      if (segs[2] && maps.groupIdMap.has(segs[2])) segs[2] = maps.groupIdMap.get(segs[2])!;
      parts[3] = segs.join('#');
    } else if (maps.itemIdMap.has(row)) {
      parts[3] = maps.itemIdMap.get(row)!;
    }
    return `{ref:${parts.join(':')}}`;
  });
}

/** Deep-walks plain JSON-like data, remapping refs in every string. Returns a new value. */
export function remapRefsDeep<T>(value: T, maps: RefRemapMaps): T {
  if (typeof value === 'string') return remapRefsInString(value, maps) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => remapRefsDeep(v, maps)) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = remapRefsDeep(v, maps);
    return out as T;
  }
  return value;
}
