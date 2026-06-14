import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface FormulaEditContextValue {
  /** True when a formula cell in this row is being edited. */
  isFormulaEditing: boolean;
  /** Called by the active formula cell to register/deregister its insert handler for cell addresses. */
  setInsertHandler: (fn: ((cellAddress: string) => void) | null) => void;
  /** Called by number cells to insert their cell address into the active formula. */
  insertCellAddress: (cellAddress: string) => void;
}

const FormulaEditContext = createContext<FormulaEditContextValue>({
  isFormulaEditing: false,
  setInsertHandler: () => {},
  insertCellAddress: () => {},
});

export const FormulaEditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isFormulaEditing, setIsFormulaEditing] = useState(false);
  const insertHandlerRef = useRef<((cellAddress: string) => void) | null>(null);

  const setInsertHandler = useCallback((fn: ((cellAddress: string) => void) | null) => {
    insertHandlerRef.current = fn;
    setIsFormulaEditing(fn !== null);
  }, []);

  const insertCellAddress = useCallback((cellAddress: string) => {
    insertHandlerRef.current?.(cellAddress);
  }, []);

  return (
    <FormulaEditContext.Provider value={{ isFormulaEditing, setInsertHandler, insertCellAddress }}>
      {children}
    </FormulaEditContext.Provider>
  );
};

export const useFormulaEdit = () => useContext(FormulaEditContext);
