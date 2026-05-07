import React, { createContext, useContext } from 'react';
import type { Item, Column } from '../types';

export type BoardView = 'table' | 'rows' | 'gantt';

interface BoardRenderContextValue {
  visibleItems: Item[];
  columns: Column[];
  boardView: BoardView;
}

const BoardRenderContext = createContext<BoardRenderContextValue | null>(null);

export const BoardRenderProvider: React.FC<{
  visibleItems: Item[];
  columns: Column[];
  boardView?: BoardView;
  children: React.ReactNode;
}> = ({ visibleItems, columns, boardView = 'table', children }) => {
  return (
    <BoardRenderContext.Provider value={{ visibleItems, columns, boardView }}>
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
