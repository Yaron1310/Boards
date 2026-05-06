import React, { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import { searchEmojis, getEmojisByCategory } from './emojiData';

interface EmojiPickerProps {
  selected: string;
  onChange: (emoji: string) => void;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ selected, onChange }) => {
  const [search, setSearch] = useState('');

  const categories = useMemo(() => getEmojisByCategory(), []);

  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    return searchEmojis(q);
  }, [search]);

  const displayData = searchResults
    ? [{ label: 'Results', emojis: searchResults }]
    : categories.map((c) => ({ label: c.label, emojis: c.emojis }));

  return (
    <div>
      <div className="relative mb-2">
        <FiSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emojis… (e.g. spider, rocket)"
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Search emojis"
        />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '220px' }}>
        <div className="p-2">
          <button
            type="button"
            onClick={() => onChange('')}
            className={`mb-2 px-2 py-1 rounded text-sm transition-all ${!selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            aria-label="No emoji"
          >
            None
          </button>

          {displayData.map((cat) => (
            cat.emojis.length > 0 && (
              <div key={cat.label} className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">{cat.label}</p>
                <div className="flex flex-wrap gap-0.5">
                  {cat.emojis.map((entry, idx) => (
                    <button
                      key={`${entry.emoji}-${idx}`}
                      type="button"
                      onClick={() => onChange(entry.emoji)}
                      className={`text-xl w-9 h-9 rounded transition-all flex items-center justify-center ${selected === entry.emoji ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'hover:bg-gray-100'}`}
                      aria-label={`Select ${entry.keywords[0] ?? entry.emoji}`}
                      title={entry.keywords[0] ?? entry.emoji}
                    >
                      {entry.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )
          ))}

          {displayData.every((c) => c.emojis.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">No emojis found.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmojiPicker;
