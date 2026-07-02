import React, { useState, useRef, useEffect } from 'react';
import { FiRotateCcw, FiChevronDown } from 'react-icons/fi';
import { useUndo } from '../../contexts/UndoContext';

const UndoButton: React.FC = () => {
  const { history, canUndo, undo } = useUndo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative flex flex-shrink-0" ref={ref}>
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => undo()}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded-l-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${canUndo ? 'text-red-700 border-red-300 hover:bg-red-50' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        aria-label={canUndo ? `Undo: ${history[0]?.label}` : 'Nothing to undo'}
        title={canUndo ? `Undo: ${history[0]?.label} (Ctrl+Z)` : 'Nothing to undo (Ctrl+Z)'}
      >
        <FiRotateCcw size={13} aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center px-1.5 py-1.5 text-sm border border-l-0 rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${canUndo ? 'text-red-700 border-red-300 hover:bg-red-50' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        aria-label="Show undo history"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FiChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 w-max min-w-[200px] max-w-[min(560px,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto"
          role="listbox"
          aria-label="Undo history"
        >
          {history.map((action, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={false}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors whitespace-nowrap"
              onClick={() => { undo(i + 1); setOpen(false); }}
            >
              <FiRotateCcw size={11} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default UndoButton;
