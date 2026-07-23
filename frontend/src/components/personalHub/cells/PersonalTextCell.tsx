import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import { getTextDir } from '../../../utils/textDir';
import type { TextColumnSettings, Column } from '../../../types';
import type { PersonalCellProps } from './types';

const LONG_TEXT_THRESHOLD = 16;
const DEFAULT_MAX_LENGTH = 1000;

const PersonalTextCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable, userId }) => {
  const rawValue = typeof value === 'string' ? value : '';
  const settings = column.settings as TextColumnSettings;
  const { mutate } = useUpdatePersonalItemValue(userId);
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState(rawValue);
  const [modalOpen, setModalOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const isLong = rawValue.length > LONG_TEXT_THRESHOLD;

  const commit = (next: string, stopEdit: () => void) => {
    if (next !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: rawValue }) });
      mutate({ itemId, columnId: column.id, value: next });
    }
    stopEdit();
  };

  const handleMouseEnter = () => {
    if (!cellRef.current) return;
    const rect = cellRef.current.getBoundingClientRect();
    setTooltipPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    setTooltipVisible(true);
  };

  return (
    <>
      <CellWrapper column={column as unknown as Column} isReadOnly={!editable || isLong}>
        {(isEditing, stopEdit) => {
          if (!isLong) {
            if (isEditing) {
              if (settings?.multiline) {
                return (
                  <textarea
                    value={draft}
                    autoFocus
                    maxLength={settings?.maxLength ?? DEFAULT_MAX_LENGTH}
                    rows={3}
                    dir={getTextDir(draft)}
                    className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none resize-none text-center"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(draft, stopEdit)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); } }}
                    aria-label={column.name}
                  />
                );
              }
              return (
                <input
                  type="text"
                  value={draft}
                  autoFocus
                  maxLength={settings?.maxLength ?? DEFAULT_MAX_LENGTH}
                  dir={getTextDir(draft)}
                  className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none text-center"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(draft, stopEdit)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(draft, stopEdit); }
                    if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); }
                  }}
                  aria-label={column.name}
                />
              );
            }
            return (
              <div dir={getTextDir(rawValue)} className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center">
                {rawValue || <span className="text-gray-300 text-xs">—</span>}
              </div>
            );
          }

          return (
            <div
              ref={cellRef}
              dir={getTextDir(rawValue)}
              className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-50/30 transition-colors"
              onClick={() => editable && (setDraft(rawValue), setModalOpen(true))}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={() => setTooltipVisible(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (editable && (e.key === 'Enter' || e.key === ' ')) { setDraft(rawValue); setModalOpen(true); } }}
              aria-label={`${column.name}: ${rawValue}`}
            >
              {rawValue}
            </div>
          );
        }}
      </CellWrapper>

      {isLong && tooltipVisible && ReactDOM.createPortal(
        <div className="fixed z-[9999] pointer-events-none -translate-x-1/2 -translate-y-full" style={{ top: tooltipPos.top, left: tooltipPos.left }}>
          <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl max-w-[260px] break-words leading-relaxed">
            {rawValue}
          </div>
          <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1" />
        </div>,
        document.body,
      )}

      {modalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9998]" role="dialog" aria-modal="true" aria-label={`Edit ${column.name}`}>
          <div className="bg-white rounded-xl shadow-2xl p-5 w-96 max-w-[90vw] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-700">{column.name}</h3>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              maxLength={settings?.maxLength ?? DEFAULT_MAX_LENGTH}
              dir={getTextDir(draft)}
              className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-200 rounded-lg outline-none resize-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow"
              onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(rawValue); setModalOpen(false); } }}
              aria-label={column.name}
            />
            <p className="text-xs text-gray-400 text-right -mt-1">{draft.length} / {settings?.maxLength ?? DEFAULT_MAX_LENGTH}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setDraft(rawValue); setModalOpen(false); }} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { commit(draft, () => {}); setModalOpen(false); }}
                className="px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default React.memo(PersonalTextCell);
