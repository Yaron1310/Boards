import { UserRole, BoardRole, type ColumnVisibility, type Column } from '../types';
import { useAuthSession } from './useAuthSession';
import { useBoardMembers } from './queries/useBoardMemberQueries';

const TIER_RANK: Record<ColumnVisibility, number> = {
  org_admins: 0,
  edit_members: 1,
  org_users: 2,
  view_users: 3,
};

/** True when the viewer's tier satisfies the column's configured visibility (or the column has
 *  none set, which defaults to 'view_users' — visible to everyone, for backward compatibility). */
export function canSeeColumn(column: Pick<Column, 'visibility'>, viewerTier: ColumnVisibility): boolean {
  const required = column.visibility ?? 'view_users';
  return TIER_RANK[viewerTier] <= TIER_RANK[required];
}

/**
 * Resolves the current viewer's column-visibility tier for a board — the most restrictive
 * ColumnVisibility level they satisfy: 'org_admins' (org/workspace admins), 'edit_members'
 * (org editors, board editors/admins, or anyone whose workspace grants edit access),
 * 'org_users' (any other authenticated org member, including read-only), or 'view_users'
 * (a public view-link viewer with no real org session).
 *
 * PublicBoardViewPage mocks an authenticated session (role: 'regular_user') so the rest of the
 * app renders normally, but it deliberately leaves `selectedWorkspace.orgId` blank — that's the
 * one reliable signal that this is a public viewer, not a real org member, so it always resolves
 * to the lowest tier regardless of the mocked role.
 */
export function useColumnVisibilityTier(boardId: string | undefined): ColumnVisibility {
  const { user, selectedWorkspace } = useAuthSession();
  const hasOrgSession = !!selectedWorkspace?.orgId;
  const { data: boardMembers = [] } = useBoardMembers(boardId ?? '', !!boardId && hasOrgSession);

  if (!hasOrgSession) return 'view_users';

  if (
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN
  ) {
    return 'org_admins';
  }

  const myBoardRole = boardMembers.find((m) => m.userId === user?.id)?.role;
  const isBoardEditor = myBoardRole === BoardRole.EDITOR || myBoardRole === BoardRole.ADMIN;
  const isEditMember =
    user?.role === UserRole.ORG_EDITOR ||
    isBoardEditor ||
    selectedWorkspace?.workspacePermissions === 'edit';
  if (isEditMember) return 'edit_members';

  return 'org_users';
}
