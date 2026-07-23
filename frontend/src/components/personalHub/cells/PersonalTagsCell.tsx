import React, { useEffect, useMemo, useState } from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { Column } from '../../../types';
import type { PersonalCellProps } from './types';

const PersonalTagsCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable, userId }) => {
  const rawValue = useMemo(() => (value ?? []) as string[], [value]);
  const { mutate } = useUpdatePersonalItemValue(userId);
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState('');
  const [tags, setTags] = useState<string[]>(rawValue);

  useEffect(() => { setTags(rawValue); }, [rawValue]);

  const commitAll = (nextTags: string[], stopEdit: () => void) => {
    pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: rawValue }) });
    mutate({ itemId, columnId: column.id, value: nextTags });
    stopEdit();
  };

  const addTag = (stopEdit: () => void) => {
    const trimmed = draft.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const next = [...tags, trimmed];
      setTags(next);
      setDraft('');
      commitAll(next, stopEdit);
    } else {
      setDraft('');
      if (!trimmed) stopEdit();
    }
  };

  const removeTag = (tag: string, stopEdit: () => void) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    commitAll(next, stopEdit);
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <div className="flex flex-wrap items-center gap-1 px-2 py-1 w-full min-h-[36px]">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 font-medium">
                  {tag}
                  <button type="button" className="ml-0.5 hover:text-indigo-900 focus:outline-none" onClick={(e) => { e.stopPropagation(); removeTag(tag, stopEdit); }} aria-label={`Remove tag ${tag}`}>
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={draft}
                autoFocus
                placeholder="Add tag..."
                className="flex-1 min-w-[80px] text-xs outline-none bg-transparent py-0.5"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(stopEdit); }
                  if (e.key === 'Escape') { setDraft(''); stopEdit(); }
                  if (e.key === 'Backspace' && !draft && tags.length > 0) removeTag(tags[tags.length - 1], stopEdit);
                }}
                onBlur={() => addTag(stopEdit)}
                aria-label={`Add tag to ${column.name}`}
              />
            </div>
          );
        }
        return (
          <div className="px-3 py-2 flex flex-wrap justify-center gap-1 w-full">
            {rawValue.length > 0 ? rawValue.map((tag) => (
              <span key={tag} className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-medium">
                {tag}
              </span>
            )) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default React.memo(PersonalTagsCell);
