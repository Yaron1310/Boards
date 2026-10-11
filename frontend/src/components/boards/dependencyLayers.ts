// Stacking: the arrows and the cells' dependency dots belong to the board grid, so they sit
// just above the cells and BELOW everything that floats over the board — sticky column
// headers (z 21), group menus, popovers and every modal (z 30 and up). They used to be at
// 9999/10000, which painted them on top of menus and modals opened over the board.
// The dots sit one level above the arrows so the arrows' hover hit-area never covers them.
export const DEP_OVERLAY_Z_INDEX = 1;
export const DEP_DOT_Z_INDEX = 2;
