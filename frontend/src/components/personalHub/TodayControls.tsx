import React from 'react';
import { FiSun } from 'react-icons/fi';

/** Personal Hub "Today" wiring handed to each board group: which items are on the owner's Today
 *  list, and how to add/remove one. */
export interface TodayWiring {
  ids: ReadonlySet<string>;
  /** False when the viewer can't edit this hub — the ☀ then only shows on items already in Today. */
  canEdit: boolean;
  /** `done` = removed by ticking the Today section's Done box (vs. un-marking the ☀). */
  setInToday: (itemId: string, boardId: string, itemName: string, inToday: boolean, done?: boolean) => void;
}

/**
 * The ☀ next to an item's name: shows on hover to add the item to Today, and stays visible
 * (filled) while it is in Today — clicking it then takes it back out.
 */
export const TodaySunToggle: React.FC<{ itemId: string; boardId: string; itemName: string; today: TodayWiring }> = ({ itemId, boardId, itemName, today }) => {
  const inToday = today.ids.has(itemId);
  if (!today.canEdit && !inToday) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (today.canEdit) today.setInToday(itemId, boardId, itemName, !inToday); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      disabled={!today.canEdit}
      className={`flex items-center justify-center w-5 h-5 ml-1 rounded flex-shrink-0 transition-opacity ${
        inToday
          ? 'text-amber-500 hover:bg-amber-50'
          : 'text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-500 hover:bg-amber-50'
      }`}
      title={inToday ? 'In Today — click to remove' : 'Add to Today'}
      aria-label={inToday ? `Remove ${itemName} from Today` : `Add ${itemName} to Today`}
      aria-pressed={inToday}
    >
      <FiSun size={13} fill={inToday ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
};

/** The Today section's "Done" checkbox — ticking it takes the item off the Today list. */
export const TodayDoneCheckbox: React.FC<{ itemId: string; boardId: string; itemName: string; today: TodayWiring }> = ({ itemId, boardId, itemName, today }) => (
  <label
    className="flex items-center justify-center w-[34px] flex-shrink-0 border-r border-[#d2d2d4] cursor-pointer"
    onClick={(e) => e.stopPropagation()}
    title="Done — remove from Today"
  >
    <input
      type="checkbox"
      checked={false}
      disabled={!today.canEdit}
      onChange={() => today.setInToday(itemId, boardId, itemName, false, true)}
      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
      aria-label={`Mark ${itemName} done for today`}
    />
  </label>
);
