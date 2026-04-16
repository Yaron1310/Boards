import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, TextColumnSettings } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const TextCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = (item.values[column.id] ?? '') as string;
  const settings = column.settings as TextColumnSettings;
  const { mutate } = useUpdateItem();
  const [draft, setDraft] = useState(rawValue);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    if (draft !== rawValue) {
      mutate({ id: item.id, patch: { values: { [column.id]: draft } } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          if (settings?.multiline) {
            return (
              <textarea
                value={draft}
                autoFocus
                maxLength={settings?.maxLength}
                rows={3}
                className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none resize-none"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(stopEdit)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); }
                }}
                aria-label={column.name}
              />
            );
          }
          return (
            <input
              type="text"
              value={draft}
              autoFocus
              maxLength={settings?.maxLength}
              className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(stopEdit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); }
              }}
              aria-label={column.name}
            />
          );
        }
        return (
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full">
            {rawValue || <span className="text-gray-300 text-xs">—</span>}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default TextCell;
