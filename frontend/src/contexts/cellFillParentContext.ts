import { createContext } from 'react';

/**
 * True where a cell is rendered inside a parent that already sets its width (the Personal Hub's
 * personal-column cells sit in a fixed PERSONAL_COL_WIDTH box). CellWrapper then fills that box
 * instead of sizing itself from the column, so its edit frame lines up exactly with the cell.
 */
export const CellFillParentContext = createContext(false);
