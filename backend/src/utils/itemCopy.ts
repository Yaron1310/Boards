import type { DBItem } from '../types/index.js';

/**
 * Builds the Firestore data for a copy of `source` (item duplicate / group duplicate).
 * Per-item state that belongs only to the original is reset rather than copied:
 * chat counters, the attached form and its submitted state, time-range dependency links
 * (they point at the original's cells), and archive markers. `emptyValues` copies the
 * row only — no column values and none of the mirrored top-level fields.
 */
export function buildItemCopy(
  source: DBItem,
  overrides: { id: string; groupId: string; order: number; createdBy: string; timestamp: unknown; name?: string; values?: DBItem['values'] },
  emptyValues: boolean,
): Record<string, unknown> {
  const {
    chatMessageCount: _chatMessageCount,
    chatLastMessageAt: _chatLastMessageAt,
    chatSeenBy: _chatSeenBy,
    formResponseCount: _formResponseCount,
    formSubmitted: _formSubmitted,
    dependencies: _dependencies,
    archivedVia: _archivedVia,
    ...rest
  } = source as DBItem & Record<string, unknown>;

  return {
    ...rest,
    id: overrides.id,
    groupId: overrides.groupId,
    order: overrides.order,
    name: overrides.name ?? source.name,
    createdBy: overrides.createdBy,
    isArchived: false,
    createdAt: overrides.timestamp,
    updatedAt: overrides.timestamp,
    lastAssignedAt: overrides.timestamp,
    ...(emptyValues
      ? { values: {}, status: null, assignees: [], dueDate: null }
      : { values: overrides.values ?? source.values ?? {} }),
  };
}
