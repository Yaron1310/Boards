import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface UndoAction {
  label: string;
  undo: () => void;
}

interface UndoContextValue {
  push: (action: UndoAction) => void;
  undo: (count?: number) => void;
  history: UndoAction[];
  canUndo: boolean;
}

const UndoContext = createContext<UndoContextValue>({
  push: () => {},
  undo: () => {},
  history: [],
  canUndo: false,
});

const MAX_HISTORY = 20;

export const UndoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    setHistory((prev) => [action, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const undo = useCallback((count = 1) => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const n = Math.min(count, prev.length);
      prev.slice(0, n).forEach((a) => a.undo());
      return prev.slice(n);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  return (
    <UndoContext.Provider value={{ push, undo, history, canUndo: history.length > 0 }}>
      {children}
    </UndoContext.Provider>
  );
};

export const useUndo = () => useContext(UndoContext);
