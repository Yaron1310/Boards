import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { MdOutlineEditNote } from 'react-icons/md';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useBoardRender } from '../../../contexts/BoardRenderContext';
import type { Item, Column, TextColumnSettings } from '../../../types';
import CellWrapper from './CellWrapper';
import { getTextDir } from '../../../utils/textDir';
import { richTextToPlainText } from '../../../utils/sanitizeHtml';
import RichTextSidebar from '../RichTextSidebar';

interface Props { item: Item; column: Column }

const LONG_TEXT_THRESHOLD = 16;
const DEFAULT_MAX_LENGTH = 1000;

const TextCellInner: React.FC<Props> = ({ item, column }) => {
  const stored = item.values[column.id];
  const rawValue = typeof stored === 'string' ? stored : '';
  const settings = column.settings as TextColumnSettings;
  const { mutate } = useUpdateItem();
  const { push: pushUndo } = useUndo();
  // Long and rich text open their own modal/sidebar, which is why the wrapper is handed
  // isReadOnly — its edit gate never fires for them, so both surfaces check this instead.
  // They still open on a read-only board: the content is longer than the cell can show,
  // and reading it is exactly what a viewer is there for.
  const { isBoardReadOnly } = useBoardRender();
  const [draft, setDraft] = useState(rawValue);
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const isLong = rawValue.length > LONG_TEXT_THRESHOLD;

  const saveValue = (next: string) => {
    if (next !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${item.name}"`, undo: () => mutate({ id: item.id, patch: { values: { [column.id]: rawValue } } }) });
      mutate({ id: item.id, patch: { values: { [column.id]: next } } });
    }
  };

  const commit = (stopEdit: () => void) => {
    saveValue(draft);
    stopEdit();
  };

  const commitModal = () => {
    saveValue(draft);
    setModalOpen(false);
  };

  const cancelModal = () => {
    setDraft(rawValue);
    setModalOpen(false);
  };

  const handleMouseEnter = () => {
    if (!cellRef.current) return;
    const rect = cellRef.current.getBoundingClientRect();
    setTooltipPos({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
    setTooltipVisible(true);
  };

  if (settings?.richText) {
    const preview = richTextToPlainText(rawValue);
    const hasContent = preview.length > 0;

    if (!hasContent) {
      // Nothing saved yet: behaves like a normal plain-text cell (typeable inline).
      // The icon is still available to jump straight into the rich-text sidebar.
      return (
        <>
          <CellWrapper column={column}>
            {(isEditing, stopEdit) => {
              if (isEditing) {
                return (
                  <textarea
                    value={draft}
                    autoFocus
                    rows={Math.min(6, draft.split('\n').length)}
                    dir={getTextDir(draft)}
                    className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none resize-none text-center"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(stopEdit)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(stopEdit); }
                      if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); }
                    }}
                    aria-label={`${column.name} (Shift+Enter for a new line)`}
                  />
                );
              }
              return (
                <div className="group/richcell relative flex items-center w-full h-full px-3 py-2">
                  <div className="flex-1 min-w-0 pr-7 text-center">
                    <span className="text-gray-300 text-xs">—</span>
                  </div>
                  {!isBoardReadOnly && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover/richcell:opacity-100 group-focus-within/richcell:opacity-100 focus:opacity-100 transition-opacity"
                    aria-label={`Open rich text editor for ${column.name}`}
                  >
                    <MdOutlineEditNote size={16} aria-hidden="true" />
                  </button>
                  )}
                </div>
              );
            }}
          </CellWrapper>

          {sidebarOpen && (
            <RichTextSidebar
              title={item.name}
              fieldName={column.name}
              value={rawValue}
              onSave={saveValue}
              onClose={() => setSidebarOpen(false)}
              readOnly={isBoardReadOnly}
            />
          )}
        </>
      );
    }

    return (
      <>
        <CellWrapper column={column} isReadOnly>
          {() => (
            <div
              ref={cellRef}
              tabIndex={0}
              className="group/richcell relative flex items-center w-full h-full px-3 py-2 focus:outline-none focus-within:ring-1 focus-within:ring-inset focus-within:ring-indigo-400 cursor-pointer"
              onClick={() => setSidebarOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSidebarOpen(true); } }}
            >
              <div dir={getTextDir(preview)} className="flex-1 min-w-0 pr-7 text-sm text-gray-700 truncate text-center">
                {preview}
              </div>
              {!isBoardReadOnly && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover/richcell:opacity-100 group-focus-within/richcell:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Open rich text editor for ${column.name}`}
              >
                <MdOutlineEditNote size={16} aria-hidden="true" />
              </button>
              )}
            </div>
          )}
        </CellWrapper>

        {sidebarOpen && (
          <RichTextSidebar
            title={item.name}
            fieldName={column.name}
            value={rawValue}
            onSave={saveValue}
            onClose={() => setSidebarOpen(false)}
            readOnly={isBoardReadOnly}
          />
        )}
      </>
    );
  }

  return (
    <>
      <CellWrapper column={column} isReadOnly={isLong}>
        {(isEditing, stopEdit) => {
          if (!isLong) {
            if (isEditing) {
              return (
                <textarea
                  value={draft}
                  autoFocus
                  maxLength={settings?.maxLength ?? DEFAULT_MAX_LENGTH}
                  rows={Math.min(6, draft.split('\n').length)}
                  dir={getTextDir(draft)}
                  className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none resize-none text-center"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(stopEdit)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(stopEdit); }
                    if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); }
                  }}
                  aria-label={`${column.name} (Shift+Enter for a new line)`}
                />
              );
            }
            return (
              <div dir={getTextDir(rawValue)} className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center whitespace-pre-wrap">
                {rawValue || <span className="text-gray-300 text-xs">—</span>}
              </div>
            );
          }

          /* Long text: tooltip on hover, modal on click */
          return (
            <div
              ref={cellRef}
              dir={getTextDir(rawValue)}
              className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-50/30 transition-colors"
              onClick={() => { setDraft(rawValue); setModalOpen(true); }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={() => setTooltipVisible(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { setDraft(rawValue); setModalOpen(true); }
              }}
              aria-label={`${column.name}: ${rawValue}. Press Enter to edit`}
            >
              {rawValue}
            </div>
          );
        }}
      </CellWrapper>

      {/* Tooltip — portaled to avoid clipping */}
      {isLong && tooltipVisible && ReactDOM.createPortal(
        <div
          className="fixed z-[9999] pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <div dir={getTextDir(rawValue)} className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl max-w-[260px] break-words leading-relaxed">
            {rawValue}
          </div>
          <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1" />
        </div>,
        document.body,
      )}

      {/* Edit modal */}
      {modalOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9998]"
          role="dialog"
          aria-modal="true"
          aria-label={isBoardReadOnly ? column.name : `Edit ${column.name}`}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-5 w-96 max-w-[90vw] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-700">{column.name}</h3>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={isBoardReadOnly}
              rows={5}
              maxLength={settings?.maxLength ?? DEFAULT_MAX_LENGTH}
              dir={getTextDir(draft)}
              className={`w-full px-3 py-2 text-sm text-gray-800 border border-gray-200 rounded-lg outline-none resize-none transition-shadow ${
                isBoardReadOnly ? 'bg-gray-50' : 'focus:ring-2 focus:ring-indigo-400 focus:border-transparent'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelModal();
              }}
              aria-label={column.name}
            />
            {!isBoardReadOnly && (
              <p className="text-xs text-gray-400 text-right -mt-1">
                {draft.length} / {settings?.maxLength ?? DEFAULT_MAX_LENGTH}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelModal}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {isBoardReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!isBoardReadOnly && (
                <button
                  type="button"
                  onClick={commitModal}
                  className="px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

const TextCell = React.memo(TextCellInner);
export default TextCell;
