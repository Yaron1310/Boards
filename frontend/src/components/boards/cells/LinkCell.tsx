import React, { useEffect, useState } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import type { Item, Column } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Looks like a web address — prepend https://
  if (/^(www\.|\w[\w-]*\.\w)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const LinkCellInner: React.FC<Props> = ({ item, column }) => {
  const rawValue = (item.values[column.id] ?? '') as string;
  const { mutate } = useUpdateItem();
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState(rawValue);
  const [inputError, setInputError] = useState(false);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    const normalized = normalizeUrl(draft);
    if (normalized && !isValidUrl(normalized)) {
      setInputError(true);
      return;
    }
    setInputError(false);
    if (normalized !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${item.name}"`, undo: () => mutate({ id: item.id, patch: { values: { [column.id]: rawValue } } }) });
      mutate({ id: item.id, patch: { values: { [column.id]: normalized } } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <div className="w-full px-2 py-1 flex flex-col gap-1">
              <input
                type="url"
                value={draft}
                autoFocus
                placeholder="https://..."
                className={`w-full px-2 py-1 text-sm text-gray-800 bg-white outline-none border rounded text-center ${inputError ? 'border-red-400' : 'border-gray-300 focus:border-indigo-400'}`}
                onChange={(e) => { setDraft(e.target.value); setInputError(false); }}
                onBlur={() => commit(stopEdit)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                  if (e.key === 'Escape') { setDraft(rawValue); setInputError(false); stopEdit(); }
                }}
                aria-label={column.name}
                aria-invalid={inputError}
              />
              {inputError && (
                <span className="text-xs text-red-500 text-center" role="alert">Enter a valid http(s) URL</span>
              )}
            </div>
          );
        }
        return (
          <div className="px-3 py-2 text-sm truncate w-full text-center">
            {rawValue && isValidUrl(rawValue) ? (
              <a
                href={rawValue}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open link ${rawValue}`}
              >
                <span className="truncate max-w-[160px]">{rawValue.replace(/^https?:\/\//, '')}</span>
                <FiExternalLink size={11} aria-hidden="true" className="shrink-0" />
              </a>
            ) : rawValue ? (
              <span className="text-gray-500 text-xs truncate">{rawValue}</span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>
        );
      }}
    </CellWrapper>
  );
};

const LinkCell = React.memo(LinkCellInner);
export default LinkCell;
