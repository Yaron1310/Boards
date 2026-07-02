import React from 'react';
import { useGroup } from '../../hooks/queries/useGroupQueries';
import ItemRow from '../boards/ItemRow';
import PersonalHubSubitemCard from './PersonalHubSubitemCard';
import PersonalColumnCell from './PersonalColumnCell';
import { PERSONAL_COL_WIDTH } from './constants';
import type { Item, PersonalColumn } from '../../types';

interface Props {
  item: Item;
  boardId: string;
  personalColumns: PersonalColumn[];
  personalValuesByItem: Record<string, Record<string, unknown>>;
  isOwn: boolean;
  onOpenDetail: (item: Item) => void;
}

/**
 * Resolves whether an assigned item lives in a top-level group or a subitem
 * group, and renders it accordingly — subitems get their own card using the
 * subitem group's own columns (matching the source board exactly), instead
 * of being mixed into the parent board's item table with the wrong columns.
 */
const PersonalHubItemRow: React.FC<Props> = ({ item, boardId, personalColumns, personalValuesByItem, isOwn, onOpenDetail }) => {
  const { data: group, isLoading, isError } = useGroup(boardId, item.groupId);

  const extraCells = personalColumns.length > 0 ? (
    <>
      {personalColumns.map((col) => (
        <div
          key={col.id}
          role="gridcell"
          style={{ width: `${PERSONAL_COL_WIDTH}px` }}
          className="flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0"
        >
          <PersonalColumnCell
            column={col}
            itemId={item.id}
            value={personalValuesByItem[item.id]?.[col.id]}
            editable={isOwn}
          />
        </div>
      ))}
    </>
  ) : null;

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-xs text-gray-300 italic" role="row">
        Loading…
      </div>
    );
  }

  // If the item's group can no longer be resolved (e.g. it was deleted),
  // fall back to the normal row instead of hiding the item.
  if (!isError && group?.parentItemId) {
    return <PersonalHubSubitemCard item={item} boardId={boardId} group={group} extraCells={extraCells} />;
  }

  return <ItemRow item={item} onOpenDetail={onOpenDetail} groupColor="#6366f1" extraCells={extraCells} />;
};

export default PersonalHubItemRow;
