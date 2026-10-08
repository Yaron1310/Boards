import React from 'react';
import type { HoursPeriodChoice } from '../../utils/hoursLog';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS_BACK = 6;

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const fieldClass = 'h-6 px-1 text-xs text-gray-700 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500';

/**
 * Time-period filter for one Hours Log column in the "User hub" menu: All time, a year, a month
 * of a year, or a custom range of days. Only entries logged within it are counted — in the menu's
 * values and in the reference a click inserts.
 */
const HoursPeriodPicker: React.FC<{
  columnName: string;
  value: HoursPeriodChoice;
  onChange: (next: HoursPeriodChoice) => void;
}> = ({ columnName, value, onChange }) => {
  const now = new Date();
  const thisYear = now.getFullYear();
  const years = Array.from({ length: YEARS_BACK }, (_, i) => thisYear - i);
  // A year chosen earlier that has since dropped out of the list still has to show as selected.
  const yearOptions = 'year' in value && !years.includes(value.year) ? [...years, value.year] : years;

  const switchMode = (mode: HoursPeriodChoice['mode']) => {
    if (mode === 'all') onChange({ mode });
    else if (mode === 'year') onChange({ mode, year: thisYear });
    else if (mode === 'month') onChange({ mode, year: thisYear, month: now.getMonth() + 1 });
    else onChange({ mode, from: isoDay(new Date(thisYear, now.getMonth(), 1)), to: isoDay(now) });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <select
        value={value.mode}
        onChange={(e) => switchMode(e.target.value as HoursPeriodChoice['mode'])}
        className={fieldClass}
        aria-label={`Time period for ${columnName}`}
      >
        <option value="all">All time</option>
        <option value="year">Year</option>
        <option value="month">Month</option>
        <option value="custom">Custom range</option>
      </select>

      {value.mode === 'month' && (
        <select
          value={value.month}
          onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
          className={fieldClass}
          aria-label={`Month for ${columnName}`}
        >
          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
      )}

      {(value.mode === 'year' || value.mode === 'month') && (
        <select
          value={value.year}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
          className={fieldClass}
          aria-label={`Year for ${columnName}`}
        >
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}

      {value.mode === 'custom' && (
        // The two dates stay together, so when they don't fit beside the select they move to the
        // next line as a pair rather than leaving the dash stranded.
        <span className="flex items-center gap-1">
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={fieldClass}
            aria-label={`From date for ${columnName}`}
          />
          <span className="text-xs text-gray-400" aria-hidden="true">–</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={fieldClass}
            aria-label={`To date for ${columnName}`}
          />
        </span>
      )}
    </div>
  );
};

export default HoursPeriodPicker;
