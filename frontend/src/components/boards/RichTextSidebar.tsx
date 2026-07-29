import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { FiX, FiBold, FiItalic, FiUnderline, FiList } from 'react-icons/fi';
import { MdFormatStrikethrough, MdFormatListNumbered, MdBorderColor } from 'react-icons/md';
import { sanitizeRichText } from '../../utils/sanitizeHtml';

const HIGHLIGHT_COLOR = '#fef08a';

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
  onClick: () => void;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, active, onClick, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`p-2 rounded-lg transition-colors ${active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
    aria-label={label}
    aria-pressed={active}
  >
    {children}
  </button>
);

const RichTextSidebar: React.FC<RichTextSidebarProps> = ({ title, fieldName, value, onSave, onClose }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeRichText(value || '');
    }
    editorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    const html = sanitizeRichText(editorRef.current?.innerHTML ?? '');
    onSave(html);
  };

  const handleClose = () => {
    commit();
    onClose();
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
  };

  const toggleHighlight = () => {
    editorRef.current?.focus();
    document.execCommand('hiliteColor', false, isHighlighted ? 'transparent' : HIGHLIGHT_COLOR);
    setIsHighlighted((v) => !v);
  };

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-[10200] w-full max-w-[45rem] bg-white shadow-2xl flex flex-col"
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
          onClick={handleClose}
          className="ml-2 flex-shrink-0 p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
          aria-label="Close and save"
        >
          <FiX size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0"
        role="toolbar"
        aria-label="Rich text formatting"
      >
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
        <ToolbarButton label="Bullet list" onClick={() => exec('insertUnorderedList')}>
          <FiList size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => exec('insertOrderedList')}>
          <MdFormatListNumbered size={16} aria-hidden="true" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton label="Clear formatting" onClick={() => exec('removeFormat')}>
          <span className="text-xs font-semibold px-0.5">Tx</span>
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-full text-sm text-gray-800 leading-relaxed outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          role="textbox"
          aria-multiline="true"
          aria-label={`${fieldName} rich text content`}
          onBlur={commit}
        />
      </div>

      <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400 flex-shrink-0">
        Changes save automatically as you edit.
      </div>
    </div>,
    document.body,
  );
};

export default RichTextSidebar;
