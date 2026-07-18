import React, { createContext, useContext } from 'react';
import type { Item, Column } from '../types';

export type BoardView = 'table' | 'rows' | 'gantt' | 'dashboard';

/** Pixel width for each column keyed by column.id; '__item_name__' for the item name column. */
export type ColumnWidthMap = Record<string, number>;

interface BoardRenderContextValue {
  visibleItems: Item[];
  columns: Column[];
  boardView: BoardView;
  columnWidths: ColumnWidthMap;
  isBoardReadOnly: boolean;
  openChat: (item: Item) => void;
  /** False when `visibleItems` is a filtered subset of a board's groups (e.g. Personal Hub's
   *  assignee-scoped rows) — tells formula cells that a same-board group-summary reference
   *  cannot be aggregated from `visibleItems` and must be resolved against the full source board. */
  groupsComplete: boolean;
}

const BoardRenderContext = createContext<BoardRenderContextValue | null>(null);

export const BoardRenderProvider: React.FC<{
  visibleItems: Item[];
  columns: Column[];
  boardView?: BoardView;
  columnWidths?: ColumnWidthMap;
  isBoardReadOnly?: boolean;
  openChat?: (item: Item) => void;
  groupsComplete?: boolean;
  children: React.ReactNode;
}> = ({
  visibleItems,
  columns,
  boardView = 'table',
  columnWidths = {},
  isBoardReadOnly = false,
  openChat = () => {},
  groupsComplete = true,
  children,
}) => {
  return (
    <BoardRenderContext.Provider value={{ visibleItems, columns, boardView, columnWidths, isBoardReadOnly, openChat, groupsComplete }}>
      {children}
    </BoardRenderContext.Provider>
  );
};

export const useBoardRender = () => {
  const context = useContext(BoardRenderContext);
  if (!context) {
    throw new Error('useBoardRender must be used within a BoardRenderProvider');
  }
  return context;
};
