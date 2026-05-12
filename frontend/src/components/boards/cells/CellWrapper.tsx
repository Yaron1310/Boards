import React, { useState } from 'react';
import type { Column } from '../../../types';
import { calculateColumnWidth } from '../../../utils/columnWidths';
import { useBoardRender } from '../../../contexts/BoardRenderContext';

interface CellWrapperProps {
  column: Column;
  isReadOnly?: boolean;
  children: (isEditing: boolean, stopEdit: () => void) => React.ReactNode;
}

const CellWrapper: React.FC<CellWrapperProps> = ({ column, isReadOnly = false, children }) => {
  const [isEditing, setIsEditing] = useState(false);
  const { boardView, columnWidths } = useBoardRender();
  const colWidth = columnWidths[column.id] ?? column.width ?? calculateColumnWidth(column.name, column.type);

  const startEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!isReadOnly && !isEditing) {
      e.stopPropagation();
      setIsEditing(true);
    }
  };

  const stopEdit = () => setIsEditing(false);

  return (
    <div
      role="gridcell"
      aria-label={column.name}
      style={{ width: `${colWidth}px` }}
      className={`relative flex flex-shrink-0 items-center justify-center ${boardView !== 'rows' ? 'border-r border-[#d2d2d4] last:border-r-0' : ''} ${
        isEditing ? 'z-20 ring-1 ring-inset ring-indigo-400' : !isReadOnly ? 'hover:bg-indigo-50/30 cursor-pointer' : ''
      }`}
      onClick={isEditing ? undefined : startEdit}
      tabIndex={isEditing ? -1 : 0}
      onKeyDown={(e) => {
        if (!isEditing && (e.key === 'Enter' || e.key === ' ')) startEdit(e);
      }}
    >
      {children(isEditing, stopEdit)}
    </div>
  );
};

export default CellWrapper;
