
import { db } from '../services/firestore.service.js';

export const usersCollection = db.collection('users');
export const organizationsCollection = db.collection('organizations');
export const workspacesCollection = db.collection('workspaces');
export const organizationSettingsCollection = db.collection('organizationSettings');
export const preapprovedUsersCollection = db.collection('preapprovedUsers');
export const systemSettingsCollection = db.collection('systemSettings');
export const userAccessStatusCollection = db.collection('userAccessStatus');
export const membershipsCollection = db.collection('memberships');
export const emailTemplatesCollection = db.collection('emailTemplates');
export const auditLogsCollection = db.collection('auditLogs');

// --- PHASE 4: Work Management Collections ---
// Boards: /workspaces/{workspaceId}/boards/{boardId}
export const boardsCollection = (workspaceId: string) =>
  db.collection('workspaces').doc(workspaceId).collection('boards');

// Groups: /workspaces/{workspaceId}/boards/{boardId}/groups/{groupId}
export const groupsCollection = (workspaceId: string, boardId: string) =>
  boardsCollection(workspaceId).doc(boardId).collection('groups');

// Items (flat, org-level for cross-board dashboards):
// /workspaces/{workspaceId}/items/{itemId}
export const itemsCollection = (workspaceId: string) =>
  db.collection('workspaces').doc(workspaceId).collection('items');

// Column definitions (board-scoped):
// /workspaces/{workspaceId}/boards/{boardId}/columns/{columnId}
export const columnsCollection = (workspaceId: string, boardId: string) =>
  boardsCollection(workspaceId).doc(boardId).collection('columns');

// Board version stamps (one doc per board, touched on every item/group mutation):
// /workspaces/{workspaceId}/boardVersions/{boardId}
export const boardVersionsCollection = (workspaceId: string) =>
  db.collection('workspaces').doc(workspaceId).collection('boardVersions');

// Board members subcollection (Phase 9):
// /workspaces/{workspaceId}/boards/{boardId}/members/{userId}
export const boardMembersCollection = (workspaceId: string, boardId: string) =>
  boardsCollection(workspaceId).doc(boardId).collection('members');

// Notifications (Phase 9):
// /workspaces/{workspaceId}/notifications/{notificationId}
export const notificationsCollection = (workspaceId: string) =>
  db.collection('workspaces').doc(workspaceId).collection('notifications');
