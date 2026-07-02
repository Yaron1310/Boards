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
  crossGroupColumns: PersonalColumn[];
  boardOnlyColumns: PersonalColumn[];
  personalValuesByItem: Record<string, Record<string, unknown>>;
  isOwn: boolean;
  onOpenDetail: (item: Item) => void;
}

const renderPersonalCells = (
  columns: PersonalColumn[],
  itemId: string,
  personalValuesByItem: Record<string, Record<string, unknown>>,
  isOwn: boolean,
): React.ReactNode =>
  columns.length === 0 ? null : (
    <>
      {columns.map((col) => (
        <div
          key={col.id}
          role="gridcell"
          style={{ width: `${PERSONAL_COL_WIDTH}px` }}
          className="flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0"
        >
          <PersonalColumnCell
            column={col}
            itemId={itemId}
            value={personalValuesByItem[itemId]?.[col.id]}
            editable={isOwn}
          />
        </div>
      ))}
    </>
  );

/**
 * Resolves whether an assigned item lives in a top-level group or a subitem
 * group, and renders it accordingly — subitems get their own card using the
 * subitem group's own columns (matching the source board exactly), instead
 * of being mixed into the parent board's item table with the wrong columns.
 *
 * Column order: item name → cross-group personal columns → real board
 * columns → board-only personal columns.
 */
const PersonalHubItemRow: React.FC<Props> = ({
  item,
  boardId,
  crossGroupColumns,
  boardOnlyColumns,
  personalValuesByItem,
  isOwn,
  onOpenDetail,
}) => {
  const { data: group, isLoading, isError } = useGroup(boardId, item.groupId);

  const leadingCells = renderPersonalCells(crossGroupColumns, item.id, personalValuesByItem, isOwn);
  const trailingCells = renderPersonalCells(boardOnlyColumns, item.id, personalValuesByItem, isOwn);

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
    return (
      <PersonalHubSubitemCard
        item={item}
        boardId={boardId}
        group={group}
        crossGroupColumns={crossGroupColumns}
        boardOnlyColumns={boardOnlyColumns}
        personalValuesByItem={personalValuesByItem}
        isOwn={isOwn}
      />
    );
  }

  return (
    <ItemRow
      item={item}
      onOpenDetail={onOpenDetail}
      groupColor="#6366f1"
      leadingExtraCells={leadingCells}
      extraCells={trailingCells}
    />
  );
};

export default PersonalHubItemRow;
