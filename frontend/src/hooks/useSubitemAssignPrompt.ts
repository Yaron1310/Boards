import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as wm from '../services/workManagementService';
import type { SubitemSummary } from '../services/workManagementService';
import { useUndo } from '../contexts/UndoContext';

export interface SubitemAssignPromptState {
  itemId: string;
  itemName: string;
  parentColumnId: string;
  /** People just added to the parent who aren't yet on all its subitems + future ones. */
  added: string[];
  /** People just removed from the parent who are still on some subitem or the future list. */
  removed: string[];
  summary: SubitemSummary;
}

/**
 * After someone is added to / removed from a parent item's PERSON cell, asks whether to do the
 * same on its subitems ("Include subitems?") — or, when it has none yet, on subitems added later
 * ("Include future subitems?"). Answering Yes applies it on the server and pushes one Undo step.
 */
export function useSubitemAssignPrompt() {
  const qc = useQueryClient();
  const { push: pushUndo } = useUndo();
  const [prompt, setPrompt] = useState<SubitemAssignPromptState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['items'] });
    void qc.invalidateQueries({ queryKey: ['columns'] });
  };

  /** Call when the person picker closes, with the cell's people before and after the edit. */
  const ask = async (itemId: string, itemName: string, parentColumnId: string, before: string[], after: string[]) => {
    const added = after.filter((u) => !before.includes(u));
    const removed = before.filter((u) => !after.includes(u));
    if (added.length === 0 && removed.length === 0) return;

    let summary: SubitemSummary;
    try {
      summary = await wm.getSubitemSummary(itemId, [...added, ...removed]);
    } catch {
      return; // Can't tell what the subitems hold — the parent edit itself already went through.
    }
    const relevantAdded = added.filter((u) =>
      !(summary.futureAssignees.includes(u) && (summary.onSubitems[u] ?? 0) >= summary.subitemCount));
    const relevantRemoved = removed.filter((u) =>
      (summary.onSubitems[u] ?? 0) > 0 || summary.futureAssignees.includes(u));
    if (relevantAdded.length === 0 && relevantRemoved.length === 0) return;

    setError(null);
    setPrompt({ itemId, itemName, parentColumnId, added: relevantAdded, removed: relevantRemoved, summary });
  };

  const answer = async (yes: boolean) => {
    if (!prompt) return;
    if (!yes) { setPrompt(null); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await wm.assignItemSubitems(prompt.itemId, {
        add: prompt.added,
        remove: prompt.removed,
        parentColumnId: prompt.parentColumnId,
      });
      refresh();
      const inverse = Object.fromEntries(
        Object.entries(result.perItem).map(([id, c]) => [id, { add: c.remove, remove: c.add }]),
      );
      const { itemId, itemName } = prompt;
      pushUndo({
        label: `Updated subitems of "${itemName}"`,
        undo: () => {
          void wm.assignItemSubitems(itemId, { exact: { perItem: inverse, autoAssignees: result.autoAssigneesBefore } }).then(refresh);
        },
      });
      setPrompt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the subitems.');
    } finally {
      setBusy(false);
    }
  };

  return { prompt, busy, error, ask, answer };
}
