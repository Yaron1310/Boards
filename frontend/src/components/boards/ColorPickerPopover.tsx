import React, { useRef } from 'react';

export const PRESET_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#22C55E', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280', // gray
];

interface ColorPickerPopoverProps {
  value: string;
  onChange: (color: string) => void;
}

const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({ value, onChange }) => {
  const customInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-5 gap-1.5">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Select color ${color}`}
            onClick={() => onChange(color)}
            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
            style={{
              backgroundColor: color,
              borderColor: value === color ? '#1E40AF' : 'transparent',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
        aria-label="Open custom color picker"
        onClick={() => customInputRef.current?.click()}
      >
        <span
          className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
          style={{ backgroundColor: PRESET_COLORS.includes(value) ? '#ffffff' : value }}
          aria-hidden="true"
        />
        Custom color
        <input
          ref={customInputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          aria-label="Custom color input"
          tabIndex={-1}
        />
      </button>
    </div>
  );
};

export default ColorPickerPopover;
