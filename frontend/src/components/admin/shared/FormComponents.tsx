
import React, { useRef, useLayoutEffect, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiHelpCircle } from 'react-icons/fi';

// --- Reusable Tooltip Component using a Portal ---
export const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 10, // Position above the icon
        left: rect.left + rect.width / 2, // Center align with the icon
      });
      setVisible(true);
    }
  };

  const hideTooltip = () => {
    setVisible(false);
  };

  const tooltipContent = (
    <div
      className="fixed p-3 bg-gray-800 text-white text-xs rounded-md shadow-xl transition-opacity duration-200 pointer-events-none z-[9999] leading-relaxed text-left w-72 transform -translate-x-1/2 -translate-y-full"
      style={{ ...position, visibility: visible ? 'visible' : 'hidden', opacity: visible ? 1 : 0 }}
    >
      {text}
      <div 
        className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-gray-800"
        style={{ transform: 'translateX(-50%)' }}
      ></div>
    </div>
  );

  return (
    <div
      ref={iconRef}
      className="relative ml-2 inline-block align-middle"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      aria-label={t('common.moreInformation')}
    >
      <FiHelpCircle className="h-4 w-4 text-gray-400 hover:text-blue-500 cursor-help transition-colors" />
      {ReactDOM.createPortal(tooltipContent, document.body)}
    </div>
  );
};

// --- Auto-Resizing Textarea Component ---
export const AutoResizingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      const newHeight = element.scrollHeight;
      // Only apply the new height if it's greater than 0.
      // This prevents setting height to '0px' when the component is hidden.
      if (newHeight > 0) {
        element.style.height = `${newHeight}px`;
      }
    }
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [props.value]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    // This observer will fire when the element's size changes,
    // including when it becomes visible after being hidden.
    const observer = new ResizeObserver(() => {
        adjustHeight();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={textareaRef}
      {...props}
      style={{ ...props.style, overflow: 'hidden', resize: 'none' }}
      onInput={(e) => {
        adjustHeight();
        props.onInput?.(e);
      }}
    />
  );
};
