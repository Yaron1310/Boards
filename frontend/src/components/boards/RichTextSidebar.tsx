import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  FiX, FiBold, FiItalic, FiUnderline, FiList, FiAlignLeft, FiAlignCenter, FiAlignRight,
  FiCornerUpLeft, FiCornerUpRight,
} from 'react-icons/fi';
import { MdFormatStrikethrough, MdFormatListNumbered, MdBorderColor } from 'react-icons/md';
import { splitDirWrapper, wrapWithDir, type TextDirection } from '../../utils/sanitizeHtml';

const ClearFormattingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={size} height={size} fill="currentColor" stroke="currentColor" aria-hidden="true">
    <path d="M216,24H72A40,40,0,0,0,32,64v72a24,24,0,0,0,24,24h48l-7.89,46.67A8.42,8.42,0,0,0,96,208a32,32,0,0,0,64,0,8.42,8.42,0,0,0-.11-1.33L152,160h48a24,24,0,0,0,24-24V32A8,8,0,0,0,216,24ZM72,40H176V80a8,8,0,0,0,16,0V40h16v64H48V64A24,24,0,0,1,72,40ZM200,144H152a16,16,0,0,0-15.84,18.26l0,.2L144,208.6a16,16,0,0,1-32,0l7.8-46.14,0-.2A16,16,0,0,0,104,144H56a8,8,0,0,1-8-8V120H208v16A8,8,0,0,1,200,144Z" />
    <line x1="10" y1="10" x2="216" y2="216" stroke="currentColor" strokeWidth="25" strokeLinecap="round" fill="none" />
  </svg>
);

const HIGHLIGHT_COLOR = '#fef08a';
const FONT_SIZE_MARKER = '7';

const FONT_SIZES = [
  { label: 'Small', px: '12px' },
  { label: 'Normal', px: '14px' },
  { label: 'Large', px: '18px' },
  { label: 'Huge', px: '24px' },
];

interface RichTextSidebarProps {
  title: string;
  fieldName: string;
  value: string;
  onSave: (html: string) => void;
  onClose: () => void;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, active, disabled, onClick, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
    disabled={disabled}
    className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
    aria-label={label}
    aria-pressed={active}
  >
    {children}
  </button>
);

const RichTextSidebar: React.FC<RichTextSidebarProps> = ({ title, fieldName, value, onSave, onClose }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialHtmlRef = useRef('');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [direction, setDirection] = useState<TextDirection>('ltr');
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  useEffect(() => {
    const { dir, inner } = splitDirWrapper(value || '');
    setDirection(dir);
    if (editorRef.current) {
      editorRef.current.innerHTML = inner;
      editorRef.current.setAttribute('dir', dir);
    }
    initialHtmlRef.current = wrapWithDir(inner, dir);
    editorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkDirty = (dir: TextDirection = direction) => {
    const current = wrapWithDir(editorRef.current?.innerHTML ?? '', dir);
    setIsDirty(current !== initialHtmlRef.current);
  };

  const handleSave = () => {
    const html = wrapWithDir(editorRef.current?.innerHTML ?? '', direction);
    onSave(html);
    onClose();
  };

  const handleCancelClick = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) setShowDiscardConfirm(false);
        else handleCancelClick();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiscardConfirm, isDirty]);

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    checkDirty();
  };

  const toggleHighlight = () => {
    editorRef.current?.focus();
    document.execCommand('hiliteColor', false, isHighlighted ? 'transparent' : HIGHLIGHT_COLOR);
    setIsHighlighted((v) => !v);
    checkDirty();
  };

  const applyDirection = (dir: TextDirection) => {
    setDirection(dir);
    editorRef.current?.setAttribute('dir', dir);
    editorRef.current?.focus();
    checkDirty(dir);
  };

  const applyFontSize = (px: string) => {
    editorRef.current?.focus();
    document.execCommand('fontSize', false, FONT_SIZE_MARKER);
    const container = editorRef.current;
    if (container) {
      container.querySelectorAll(`font[size="${FONT_SIZE_MARKER}"]`).forEach((fontEl) => {
        const span = document.createElement('span');
        span.style.fontSize = px;
        while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
        fontEl.replaceWith(span);
      });
    }
    checkDirty();
  };

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-[10200] w-full max-w-[45rem] bg-white shadow-2xl flex flex-col overflow-x-hidden"
      role="region"
      aria-label={`Rich text editor for ${fieldName} on ${title}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-indigo-600 text-white flex-shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate">{title}</span>
          <span className="text-xs text-indigo-200 truncate">{fieldName}</span>
        </div>
        <button
          type="button"
          onClick={handleCancelClick}
          className="ml-2 flex-shrink-0 p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
          aria-label="Close"
        >
          <FiX size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0"
        role="toolbar"
        aria-label="Rich text formatting"
      >
        <ToolbarButton label="Undo" onClick={() => exec('undo')}>
          <FiCornerUpLeft size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => exec('redo')}>
          <FiCornerUpRight size={16} aria-hidden="true" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <label className="sr-only" htmlFor="rt-font-size">Font size</label>
        <select
          id="rt-font-size"
          defaultValue=""
          onChange={(e) => {
            const px = e.target.value;
            if (px) applyFontSize(px);
            e.target.value = '';
          }}
          className="text-sm text-gray-600 border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label="Font size"
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.px} value={s.px}>{s.label}</option>
          ))}
        </select>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton label="Bold" onClick={() => exec('bold')}>
          <FiBold size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => exec('italic')}>
          <FiItalic size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => exec('underline')}>
          <FiUnderline size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" onClick={() => exec('strikeThrough')}>
          <MdFormatStrikethrough size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Highlight" active={isHighlighted} onClick={toggleHighlight}>
          <MdBorderColor size={16} aria-hidden="true" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton label="Align left" onClick={() => exec('justifyLeft')}>
          <FiAlignLeft size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Align center" onClick={() => exec('justifyCenter')}>
          <FiAlignCenter size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Align right" onClick={() => exec('justifyRight')}>
          <FiAlignRight size={16} aria-hidden="true" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton label="Bullet list" onClick={() => exec('insertUnorderedList')}>
          <FiList size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => exec('insertOrderedList')}>
          <MdFormatListNumbered size={16} aria-hidden="true" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton label="Left to right" active={direction === 'ltr'} onClick={() => applyDirection('ltr')}>
          <span className="text-xs font-semibold px-0.5">LTR</span>
        </ToolbarButton>
        <ToolbarButton label="Right to left" active={direction === 'rtl'} onClick={() => applyDirection('rtl')}>
          <span className="text-xs font-semibold px-0.5">RTL</span>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton label="Clear formatting" onClick={() => exec('removeFormat')}>
          <ClearFormattingIcon size={16} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-3">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-full text-sm text-gray-800 leading-relaxed outline-none break-words [overflow-wrap:anywhere] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          role="textbox"
          aria-multiline="true"
          aria-label={`${fieldName} rich text content`}
          onInput={() => checkDirty()}
        />
      </div>

      {/* Footer: Save / Cancel */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 flex-shrink-0">
        <button
          type="button"
          onClick={handleCancelClick}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          Save
        </button>
      </div>

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center" role="alertdialog" aria-modal="true" aria-label="Exit without saving?">
          <div className="bg-white rounded-xl shadow-2xl p-5 w-80 max-w-[85%] flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-gray-800">Exit without saving?</h3>
            <p className="text-sm text-gray-600">All your edits will be lost. This can't be undone.</p>
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Go back to edit
              </button>
              <button
                type="button"
                onClick={() => { setShowDiscardConfirm(false); onClose(); }}
                className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Exit without saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

export default RichTextSidebar;
