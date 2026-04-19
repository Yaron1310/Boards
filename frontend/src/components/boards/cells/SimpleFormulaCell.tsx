import React from 'react';
import { useColumns } from '../../../hooks/queries/useColumnQueries';
import type { Item, Column, SimpleFormulaColumnSettings } from '../../../types';

interface Props { item: Item; column: Column }

const compute = (
  operation: SimpleFormulaColumnSettings['operation'],
  a: number,
  b: number,
): number => {
  switch (operation) {
    case 'add': return a + b;
    case 'subtract': return a - b;
    case 'multiply': return a * b;
    case 'divide': return b !== 0 ? a / b : 0;
  }
};

const SimpleFormulaCell: React.FC<Props> = ({ item, column }) => {
  const { data: columns = [] } = useColumns(item.boardId);
  const settings = column.settings as SimpleFormulaColumnSettings;

  const result = React.useMemo(() => {
    if (!settings?.operation || !settings?.fields?.length) return null;
    const [fieldA, fieldB] = settings.fields;
    const colA = columns.find((c) => c.id === fieldA);
    const colB = columns.find((c) => c.id === fieldB);
    if (!colA || !colB) return null;
    const a = Number(item.values[fieldA] ?? 0);
    const b = Number(item.values[fieldB] ?? 0);
    if (isNaN(a) || isNaN(b)) return null;
    return compute(settings.operation, a, b);
  }, [settings, columns, item.values]);

  return (
    <div
      role="gridcell"
      aria-label={`${column.name} (computed)`}
      className="flex items-center min-w-[120px] px-3 py-2 border-r border-gray-100 last:border-r-0 bg-gray-50/60"
      title="Computed value — read only"
    >
      <span className="text-sm text-gray-600 truncate w-full text-right">
        {result != null ? (Number.isInteger(result) ? result : result.toFixed(2)) : <span className="text-gray-300 text-xs">—</span>}
      </span>
    </div>
  );
};

export default SimpleFormulaCell;
