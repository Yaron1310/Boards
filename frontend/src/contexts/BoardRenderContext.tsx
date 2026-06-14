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
}

const BoardRenderContext = createContext<BoardRenderContextValue | null>(null);

export const BoardRenderProvider: React.FC<{
  visibleItems: Item[];
  columns: Column[];
  boardView?: BoardView;
  columnWidths?: ColumnWidthMap;
  isBoardReadOnly?: boolean;
  children: React.ReactNode;
}> = ({ visibleItems, columns, boardView = 'table', columnWidths = {}, isBoardReadOnly = false, children }) => {
  return (
    <BoardRenderContext.Provider value={{ visibleItems, columns, boardView, columnWidths, isBoardReadOnly }}>
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
