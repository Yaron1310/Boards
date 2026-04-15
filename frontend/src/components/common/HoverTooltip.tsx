import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';

interface HoverTooltipProps {
  text: string;
  children: React.ReactNode;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({ text, children }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 10, // Position above the element
        left: rect.left + rect.width / 2, // Center align with the element
      });
      setVisible(true);
    }
  };

  const hideTooltip = () => {
    setVisible(false);
  };

  const tooltipContent = (
    <div
      className="fixed p-2 bg-gray-800 text-white text-xs rounded shadow-xl pointer-events-none z-[9999] transform -translate-x-1/2 -translate-y-full whitespace-nowrap animate-tooltip-fade-in"
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
      ref={containerRef} 
      className="inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {ReactDOM.createPortal(tooltipContent, document.body)}
    </div>
  );
};

export default HoverTooltip;
