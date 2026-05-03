import React, { createContext, useContext } from 'react';
import type { Item, Column } from '../types';

interface BoardRenderContextValue {
  visibleItems: Item[];
  columns: Column[];
}

const BoardRenderContext = createContext<BoardRenderContextValue | null>(null);

export const BoardRenderProvider: React.FC<{
  visibleItems: Item[];
  columns: Column[];
  children: React.ReactNode;
}> = ({ visibleItems, columns, children }) => {
  return (
    <BoardRenderContext.Provider value={{ visibleItems, columns }}>
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
