import React, { useState, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiHelpCircle, FiXCircle } from 'react-icons/fi';

export const CURRENCIES = [
    { code: 'USD', symbol: '$', label: 'US Dollar', country: 'United States' },
    { code: 'EUR', symbol: '€', label: 'Euro', country: 'Eurozone' },
    { code: 'GBP', symbol: '£', label: 'Pound Sterling', country: 'United Kingdom' },
    { code: 'ILS', symbol: '₪', label: 'New Shekel', country: 'Israel' },
    { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', country: 'Australia' },
    { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar', country: 'Canada' },
    { code: 'CNY', symbol: '¥', label: 'Yuan Renminbi', country: 'China' },
    { code: 'JPY', symbol: '¥', label: 'Yen', country: 'Japan' },
    { code: 'INR', symbol: '₹', label: 'Indian Rupee', country: 'India' },
    { code: 'CHF', symbol: 'Fr', label: 'Swiss Franc', country: 'Switzerland' },
    { code: 'BRL', symbol: 'R$', label: 'Brazilian Real', country: 'Brazil' },
];

export const FONT_WEIGHTS = [
    { value: 'font-thin', label: 'Thin' },
    { value: 'font-extralight', label: 'Extra Light' },
    { value: 'font-light', label: 'Light' },
    { value: 'font-normal', label: 'Normal' },
    { value: 'font-medium', label: 'Medium' },
    { value: 'font-semibold', label: 'Semibold' },
    { value: 'font-bold', label: 'Bold' },
    { value: 'font-extrabold', label: 'Extra Bold' },
    { value: 'font-black', label: 'Black' },
];

export const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const iconRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // #modal-root exists and is intended for this purpose. Fallback to body is safe.
  const portalRoot = document.getElementById('modal-root') || document.body;

  const handleMouseEnter = () => {
    if (!iconRef.current) return;
    // Set a preliminary position to render the tooltip off-screen but in the DOM
    // so we can measure its dimensions in useLayoutEffect.
    setPosition({ top: -9999, left: -9999 });
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  // This effect runs after the tooltip is rendered and visible, so we can get its dimensions
  useLayoutEffect(() => {
    if (isVisible && tooltipRef.current && iconRef.current) {
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const iconRect = iconRef.current.getBoundingClientRect();

        // Default position: above and centered on the icon
        let top = iconRect.top - tooltipRect.height - 8; // 8px for margin
        let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);

        // Adjust if it goes off the top of the screen
        if (top < 5) { // Add a small buffer
            top = iconRect.bottom + 8; // Position below the icon
        }
        
        // Adjust if it goes off the left of the screen
        if (left < 5) {
            left = 5;
        }

        // Adjust if it goes off the right of the screen
        if (left + tooltipRect.width > window.innerWidth - 5) {
            left = window.innerWidth - tooltipRect.width - 5;
        }

        setPosition({ top, left });
    }
  }, [isVisible]);

  return (
    <>
      <div 
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block align-middle ml-2 cursor-help"
        aria-label={t('common.moreInformation')}
      >
        <FiHelpCircle className="h-4 w-4 text-gray-400 hover:text-blue-500 transition-colors" />
      </div>

      {isVisible && ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed p-3 bg-gray-800 text-white text-xs rounded-md shadow-xl z-[9999] leading-relaxed text-left max-w-xs animate-tooltip-fade-in"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            // Use opacity to hide during the split-second position calculation
            opacity: position.top === -9999 ? 0 : 1, 
          }}
        >
          {text}
        </div>,
        portalRoot
      )}
    </>
  );
};


export const ModalWrapper = ({ title, onClose, children, size = 'max-w-2xl' }: { title: string, onClose: () => void, children: React.ReactNode, size?: string }) => {
    const { t } = useTranslation();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className={`bg-white rounded-lg shadow-xl w-full ${size} max-h-[90vh] flex flex-col`}>
                <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" aria-label={t('common.close')}><FiXCircle size={24}/></button>
                </div>
                <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};