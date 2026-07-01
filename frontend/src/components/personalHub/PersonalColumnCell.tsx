import React from 'react';
import { useUpdatePersonalItemValue } from '../../hooks/queries/usePersonalHubQueries';
import { ColumnType } from '../../types';
import type { PersonalColumn, StatusColumnSettings, DropdownColumnSettings } from '../../types';

interface Props {
  column: PersonalColumn;
  itemId: string;
  value: unknown;
  editable: boolean;
}

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

    default:
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
