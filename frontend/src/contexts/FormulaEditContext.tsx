import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface FormulaEditContextValue {
  /** True when a formula cell in this row is being edited. */
  isFormulaEditing: boolean;
  /** Called by the active formula cell to register/deregister its insert handler. */
  setInsertHandler: (fn: ((colName: string) => void) | null) => void;
  /** Called by number cells to insert their column name into the active formula. */
  insertColumnRef: (colName: string) => void;
}

const FormulaEditContext = createContext<FormulaEditContextValue>({
  isFormulaEditing: false,
  setInsertHandler: () => {},
  insertColumnRef: () => {},
});

export const FormulaEditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State-backed flag so consumers re-render when editing starts/stops
  const [isFormulaEditing, setIsFormulaEditing] = useState(false);
  // Ref-backed handler so updating it on every draft keystroke doesn't re-render siblings
  const insertHandlerRef = useRef<((colName: string) => void) | null>(null);

  const setInsertHandler = useCallback((fn: ((colName: string) => void) | null) => {
    insertHandlerRef.current = fn;
    setIsFormulaEditing(fn !== null);
  }, []);

  const insertColumnRef = useCallback((colName: string) => {
    insertHandlerRef.current?.(colName);
  }, []);

  return (
    <FormulaEditContext.Provider value={{ isFormulaEditing, setInsertHandler, insertColumnRef }}>
      {children}
    </FormulaEditContext.Provider>
  );
};

export const useFormulaEdit = () => useContext(FormulaEditContext);
