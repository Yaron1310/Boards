import React, { useState } from 'react';
import { useUpdatePersonalItemValue } from '../../hooks/queries/usePersonalHubQueries';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { ColumnType } from '../../types';
import type { PersonalColumn, StatusColumnSettings, DropdownColumnSettings, PersonColumnSettings, TimeRangeValue } from '../../types';

interface Props {
  column: PersonalColumn;
  itemId: string;
  value: unknown;
  editable: boolean;
}

const TagsEditor: React.FC<{ column: PersonalColumn; value: unknown; editable: boolean; commit: (v: unknown) => void }> = ({ column, value, editable, commit }) => {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    commit([...tags, trimmed]);
    setDraft('');
  };
  const removeTag = (tag: string) => commit(tags.filter((t) => t !== tag));

  return (
    <div className="flex flex-wrap items-center gap-1 w-full h-full px-2 py-1">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded-full">
          {tag}
          {editable && (
            <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} className="text-indigo-400 hover:text-indigo-700">
              ×
            </button>
          )}
        </span>
      ))}
      {editable && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          onBlur={addTag}
          placeholder={tags.length === 0 ? 'Add tag…' : ''}
          className="flex-1 min-w-[40px] text-xs bg-transparent outline-none"
          aria-label={`Add tag to ${column.name}`}
        />
      )}
    </div>
  );
};

const PersonEditor: React.FC<{ column: PersonalColumn; value: unknown; editable: boolean; commit: (v: unknown) => void }> = ({ column, value, editable, commit }) => {
  const settings = column.settings as PersonColumnSettings;
  const multiple = settings?.multiple ?? true;
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const [open, setOpen] = useState(false);
  const { data: allUsers = [] } = useUsersQuery({ limit: 200 }, editable);
  const selectedUsers = allUsers.filter((u) => selected.includes(u.id));

  const toggle = (userId: string) => {
    if (selected.includes(userId)) {
      commit(selected.filter((id) => id !== userId));
    } else {
      commit(multiple ? [...selected, userId] : [userId]);
      if (!multiple) setOpen(false);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center px-1">
      <button
        type="button"
        onClick={() => editable && setOpen((o) => !o)}
        className="w-full text-xs truncate text-center py-1"
        disabled={!editable}
        aria-label={`${column.name}: ${selectedUsers.map((u) => u.name).join(', ') || 'none'}`}
      >
        {selectedUsers.length > 0 ? selectedUsers.map((u) => u.name).join(', ') : <span className="text-gray-300">—</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg z-[9999] max-h-48 overflow-y-auto" role="listbox" aria-label={`Select ${column.name}`}>
            {allUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={selected.includes(u.id)}
                onClick={() => toggle(u.id)}
                className={`flex items-center w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${selected.includes(u.id) ? 'bg-indigo-50 text-indigo-700' : ''}`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const PersonalColumnCell: React.FC<Props> = ({ column, itemId, value, editable }) => {
  const { mutate } = useUpdatePersonalItemValue();
  const commit = (next: unknown) => mutate({ itemId, columnId: column.id, value: next });

  const baseClass = 'w-full h-full px-2 py-1 text-sm bg-transparent outline-none';

  switch (column.type) {
    case ColumnType.CHECKBOX:
      return (
        <div className="flex items-center justify-center w-full h-full">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={!editable}
            onChange={(e) => commit(e.target.checked)}
            aria-label={column.name}
          />
        </div>
      );

    case ColumnType.NUMBER:
      return (
        <input
          type="number"
          className={baseClass}
          defaultValue={typeof value === 'number' ? value : ''}
          disabled={!editable}
          onBlur={(e) => commit(e.target.value === '' ? null : Number(e.target.value))}
          aria-label={column.name}
        />
      );

    case ColumnType.DATE:
      return (
        <input
          type="date"
          className={baseClass}
          defaultValue={typeof value === 'string' ? value : ''}
          disabled={!editable}
          onBlur={(e) => commit(e.target.value || null)}
          aria-label={column.name}
        />
      );

    case ColumnType.STATUS: {
      const settings = column.settings as StatusColumnSettings;
      const options = settings?.options ?? [];
      const current = options.find((o) => o.id === value);
      return (
        <select
          className={baseClass}
          value={typeof value === 'string' ? value : ''}
          disabled={!editable}
          onChange={(e) => commit(e.target.value || null)}
          style={current ? { color: current.color } : undefined}
          aria-label={column.name}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      );
    }

    case ColumnType.DROPDOWN: {
      const settings = column.settings as DropdownColumnSettings;
      const options = settings?.options ?? [];
      return (
        <select
          className={baseClass}
          value={typeof value === 'string' ? value : ''}
          disabled={!editable}
          onChange={(e) => commit(e.target.value || null)}
          aria-label={column.name}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      );
    }

    case ColumnType.TIME:
      return (
        <input
          type="time"
          className={baseClass}
          defaultValue={typeof value === 'string' ? value : ''}
          disabled={!editable}
          onBlur={(e) => commit(e.target.value || null)}
          aria-label={column.name}
        />
      );

    case ColumnType.TIME_RANGE: {
      const range = (value ?? {}) as Partial<TimeRangeValue>;
      const toDateStr = (v: unknown) => (v ? String(v).slice(0, 10) : '');
      return (
        <div className="flex items-center gap-1 w-full h-full px-1">
          <input
            type="date"
            className="w-1/2 text-xs bg-transparent outline-none"
            defaultValue={toDateStr(range.start)}
            disabled={!editable}
            onBlur={(e) => commit({ ...range, start: e.target.value || null })}
            aria-label={`${column.name} start date`}
          />
          <span className="text-gray-300 text-xs">–</span>
          <input
            type="date"
            className="w-1/2 text-xs bg-transparent outline-none"
            defaultValue={toDateStr(range.end)}
            disabled={!editable}
            onBlur={(e) => commit({ ...range, end: e.target.value || null })}
            aria-label={`${column.name} end date`}
          />
        </div>
      );
    }

    case ColumnType.TAGS:
      return <TagsEditor column={column} value={value} editable={editable} commit={commit} />;

    case ColumnType.PERSON:
      return <PersonEditor column={column} value={value} editable={editable} commit={commit} />;

    default:
      // EMAIL, PHONE, LINK, LOCATION, SIMPLE_FORMULA — free-text fallback. Formulas
      // aren't evaluated here since personal columns aren't tied to a single board's
      // real column grid, so there's nothing consistent to compute against.
      return (
        <input
          type="text"
          className={baseClass}
          defaultValue={typeof value === 'string' ? value : ''}
          disabled={!editable}
          onBlur={(e) => commit(e.target.value || null)}
          aria-label={column.name}
        />
      );
  }
};

export default PersonalColumnCell;
