import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { SubitemAssignPromptState } from '../../../hooks/useSubitemAssignPrompt';

interface Props {
  prompt: SubitemAssignPromptState;
  /** Display name for a user id. */
  nameOf: (userId: string) => string;
  busy: boolean;
  error: string | null;
  onAnswer: (yes: boolean) => void;
}

const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * "Include subitems?" / "Include future subitems?" — asked after people are added to or removed
 * from a parent item's Person cell. Yes applies the same change to its subitems (and to subitems
 * added later); No leaves the subitems alone.
 */
const SubitemAssignPrompt: React.FC<Props> = ({ prompt, nameOf, busy, error, onAnswer }) => {
  const { itemName, added, removed, summary } = prompt;
  const count = summary.subitemCount;
  const hasSubitems = count > 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onAnswer(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, onAnswer]);

  const title = added.length > 0 && removed.length === 0
    ? (hasSubitems ? 'Include subitems?' : 'Include future subitems?')
    : added.length === 0
      ? 'Remove from subitems too?'
      : 'Update subitems too?';

  const addedNames = listNames(added.map(nameOf));
  const removedNames = listNames(removed.map(nameOf));

  return createPortal(
    <div
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => { e.stopPropagation(); if (!busy) onAnswer(false); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="subitem-assign-title"
        aria-describedby="subitem-assign-body"
        className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="subitem-assign-title" className="text-base font-semibold text-gray-800">{title}</h2>
        <div id="subitem-assign-body" className="mt-2 space-y-1.5 text-sm text-gray-600">
          <p>
            “{itemName}” {hasSubitems ? `has ${count} subitem${count === 1 ? '' : 's'}.` : 'has no subitems yet.'}
          </p>
          {added.length > 0 && (
            <p>
              {hasSubitems
                ? <>Also assign <strong>{addedNames}</strong> to them, and to subitems added later?</>
                : <>Assign <strong>{addedNames}</strong> to subitems added later?</>}
            </p>
          )}
          {removed.length > 0 && (
            <p>Also remove <strong>{removedNames}</strong> from its subitems{added.length > 0 ? '' : ' (and from subitems added later)'}?</p>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            disabled={busy}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            aria-label="No, leave the subitems as they are"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            disabled={busy}
            autoFocus
            className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            aria-label="Yes, apply to the subitems too"
          >
            {busy ? 'Saving…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SubitemAssignPrompt;
