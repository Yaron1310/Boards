import type { PersonalColumn } from '../../../types';

export interface PersonalCellProps {
  column: PersonalColumn;
  itemId: string;
  itemName: string;
  value: unknown;
  editable: boolean;
}
