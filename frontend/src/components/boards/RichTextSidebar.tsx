import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  FiX, FiBold, FiItalic, FiUnderline, FiList, FiAlignLeft, FiAlignCenter, FiAlignRight,
  FiCornerUpLeft, FiCornerUpRight, FiChevronDown,
} from 'react-icons/fi';
import { MdFormatStrikethrough, MdFormatListNumbered } from 'react-icons/md';
import { TbHighlight } from 'react-icons/tb';
import { splitDirWrapper, wrapWithDir, type TextDirection } from '../../utils/sanitizeHtml';

const ClearFormattingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={size} height={size} fill="currentColor" stroke="currentColor" aria-hidden="true">
    <path d="M216,24H72A40,40,0,0,0,32,64v72a24,24,0,0,0,24,24h48l-7.89,46.67A8.42,8.42,0,0,0,96,208a32,32,0,0,0,64,0,8.42,8.42,0,0,0-.11-1.33L152,160h48a24,24,0,0,0,24-24V32A8,8,0,0,0,216,24ZM72,40H176V80a8,8,0,0,0,16,0V40h16v64H48V64A24,24,0,0,1,72,40ZM200,144H152a16,16,0,0,0-15.84,18.26l0,.2L144,208.6a16,16,0,0,1-32,0l7.8-46.14,0-.2A16,16,0,0,0,104,144H56a8,8,0,0,1-8-8V120H208v16A8,8,0,0,1,200,144Z" />
    <line x1="10" y1="10" x2="216" y2="216" stroke="currentColor" strokeWidth="25" strokeLinecap="round" fill="none" />
  </svg>
);

const LtrIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="3" y1="5" x2="21" y2="5" />
    <line x1="3" y1="10" x2="15" y2="10" />
    <line x1="3" y1="15" x2="15" y2="15" />
    <line x1="3" y1="20" x2="12" y2="20" />
    <path d="M14 20 h7" />
    <path d="M18 17 l3 3 l-3 3" />
  </svg>
);

const RtlIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="21" y1="5" x2="3" y2="5" />
    <line x1="21" y1="10" x2="9" y2="10" />
    <line x1="21" y1="15" x2="9" y2="15" />
    <line x1="21" y1="20" x2="12" y2="20" />
    <path d="M10 20 h-7" />
    <path d="M6 17 l-3 3 l3 3" />
  </svg>
);

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Red', value: '#fecaca' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Turquoise', value: '#99f6e4' },
];
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 200;

// Word-style preset sizes.
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];

/** Strips the zero-width spaces `applyFontSize` uses as caret anchors when nothing is selected. */
function stripZeroWidth(html: string): string {
  return html.replace(/\u200B/g, '');
}

/** Walks up from a selection node to find the nearest inline font-size, defaulting otherwise. */
function getFontSizeAt(node: Node | null, root: HTMLElement | null): number {
  let el: HTMLElement | null = node && node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement ?? null;
  while (el && el !== root?.parentElement) {
    if (el.style?.fontSize) {
      const match = /^([\d.]+)px$/.exec(el.style.fontSize);
      if (match) return Math.round(parseFloat(match[1]));
    }
    if (el === root) break;
    el = el.parentElement;
  }
  return DEFAULT_FONT_SIZE;
}

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
    title={label}
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
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fontSizeInput, setFontSizeInput] = useState(String(DEFAULT_FONT_SIZE));
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false);
  const [direction, setDirection] = useState<TextDirection>('ltr');
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  useEffect(() => {
    if (!colorMenuOpen && !fontSizeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (colorMenuOpen && colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setColorMenuOpen(false);
      }
      if (fontSizeMenuOpen && fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(e.target as Node)) {
        setFontSizeMenuOpen(false);
        setFontSizeInput(String(currentFontSize));
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorMenuOpen, fontSizeMenuOpen, currentFontSize]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !editorRef.current || !editorRef.current.contains(sel.anchorNode)) return;
      const size = getFontSizeAt(sel.anchorNode, editorRef.current);
      setCurrentFontSize(size);
      setFontSizeInput(String(size));
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

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
    const current = wrapWithDir(stripZeroWidth(editorRef.current?.innerHTML ?? ''), dir);
    setIsDirty(current !== initialHtmlRef.current);
  };

  const handleSave = () => {
    const html = wrapWithDir(stripZeroWidth(editorRef.current?.innerHTML ?? ''), direction);
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
    document.execCommand('hiliteColor', false, isHighlighted ? 'transparent' : highlightColor);
    setIsHighlighted((v) => !v);
    checkDirty();
  };

  const selectHighlightColor = (color: string) => {
    editorRef.current?.focus();
    document.execCommand('hiliteColor', false, color);
    setHighlightColor(color);
    setIsHighlighted(true);
    setColorMenuOpen(false);
    checkDirty();
  };

  const applyDirection = (dir: TextDirection) => {
    setDirection(dir);
    editorRef.current?.setAttribute('dir', dir);
    editorRef.current?.focus();
    checkDirty(dir);
  };

  // Applies a font size to the current selection (or, for a collapsed caret, arms an
  // empty span so subsequently typed text picks it up) — bypasses execCommand('fontSize'),
  // whose legacy <font size="7"> marker isn't created until the *next* keystroke for a
  // collapsed caret, which left stray unconverted huge/legacy-sized text behind.
  const applyFontSize = (size: number) => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    editor.focus();
    const span = document.createElement('span');
    span.style.fontSize = `${size}px`;

    if (sel.isCollapsed) {
      span.appendChild(document.createTextNode('\u200B'));
      range.insertNode(span);
      const caret = document.createRange();
      caret.setStart(span.firstChild as Node, 1);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
    } else {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      const newSelection = document.createRange();
      newSelection.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newSelection);
    }

    setCurrentFontSize(size);
    setFontSizeInput(String(size));
    checkDirty();
  };

  const selectFontSize = (size: number) => {
    applyFontSize(size);
    setFontSizeMenuOpen(false);
  };

  const commitFontSizeInput = () => {
    const parsed = parseInt(fontSizeInput, 10);
    if (Number.isFinite(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
      applyFontSize(parsed);
    } else {
      setFontSizeInput(String(currentFontSize));
    }
    setFontSizeMenuOpen(false);
  };

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-[10200] w-full max-w-[50rem] bg-white shadow-2xl flex flex-col overflow-x-hidden"
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

        <div className="relative flex items-center border border-gray-200 rounded-lg bg-white" ref={fontSizeMenuRef}>
          <label className="sr-only" htmlFor="rt-font-size">Font size</label>
          <input
            id="rt-font-size"
            type="text"
            inputMode="numeric"
            value={fontSizeInput}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setFontSizeInput(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitFontSizeInput(); editorRef.current?.focus(); }
              if (e.key === 'Escape') { e.preventDefault(); setFontSizeInput(String(currentFontSize)); }
            }}
            onBlur={() => { if (!fontSizeMenuOpen) commitFontSizeInput(); }}
            title="Font size"
            aria-label="Font size"
            className="w-9 text-sm text-gray-700 text-center outline-none rounded-l-lg py-1.5 bg-transparent"
          />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setFontSizeMenuOpen((v) => !v); }}
            title="Choose font size"
            aria-label="Choose font size"
            aria-haspopup="true"
            aria-expanded={fontSizeMenuOpen}
            className="px-1 py-1.5 text-gray-500 hover:bg-gray-100 rounded-r-lg transition-colors"
          >
            <FiChevronDown size={12} aria-hidden="true" />
          </button>

          {fontSizeMenuOpen && (
            <div
              className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto w-16"
              role="listbox"
              aria-label="Font sizes"
            >
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectFontSize(size); }}
                  role="option"
                  aria-selected={size === currentFontSize}
                  className={`w-full text-left px-3 py-1 text-sm transition-colors ${size === currentFontSize ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>

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
        <div className="relative flex items-center" ref={colorMenuRef}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setColorMenuOpen((v) => !v); }}
            title="Choose highlight color"
            aria-label="Choose highlight color"
            aria-haspopup="true"
            aria-expanded={colorMenuOpen}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <FiChevronDown size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); toggleHighlight(); }}
            title="Highlight"
            aria-label="Highlight"
            aria-pressed={isHighlighted}
            className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors ${isHighlighted ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <TbHighlight size={16} aria-hidden="true" />
            <span className="block w-4 h-1 rounded-sm" style={{ backgroundColor: highlightColor }} aria-hidden="true" />
          </button>

          {colorMenuOpen && (
            <div
              className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5"
              role="menu"
              aria-label="Highlight colors"
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectHighlightColor(c.value); }}
                  title={c.name}
                  aria-label={c.name}
                  role="menuitem"
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${highlightColor === c.value ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          )}
        </div>

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
          <LtrIcon size={16} />
        </ToolbarButton>
        <ToolbarButton label="Right to left" active={direction === 'rtl'} onClick={() => applyDirection('rtl')}>
          <RtlIcon size={16} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton label="Clear formatting" onClick={() => exec('removeFormat')}>
          <ClearFormattingIcon size={16} />
        </ToolbarButton>
      </div>

      {/* Editor area — gray gutter around the white text box */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100" style={{ paddingLeft: 15, paddingRight: 15, paddingTop: 15, paddingBottom: 15 }}>
        <div
          className="min-h-full bg-white rounded-lg border border-gray-200 px-4 py-3 cursor-text"
          onClick={(e) => { if (e.target === e.currentTarget) editorRef.current?.focus(); }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-full text-sm text-gray-800 leading-relaxed outline-none break-words [overflow-wrap:anywhere] [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside"
            role="textbox"
            aria-multiline="true"
            aria-label={`${fieldName} rich text content`}
            onInput={() => checkDirty()}
          />
        </div>
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
