
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
// Boards: /organizations/{orgId}/boards/{boardId}
export const boardsCollection = (orgId: string) =>
  db.collection('organizations').doc(orgId).collection('boards');

// Groups: /organizations/{orgId}/boards/{boardId}/groups/{groupId}
export const groupsCollection = (orgId: string, boardId: string) =>
  boardsCollection(orgId).doc(boardId).collection('groups');

// Items (flat, org-level for cross-board dashboards):
// /organizations/{orgId}/items/{itemId}
export const itemsCollection = (orgId: string) =>
  db.collection('organizations').doc(orgId).collection('items');

// Column definitions (board-scoped):
// /organizations/{orgId}/boards/{boardId}/columns/{columnId}
export const columnsCollection = (orgId: string, boardId: string) =>
  boardsCollection(orgId).doc(boardId).collection('columns');

// Board version stamps (one doc per board, touched on every item/group mutation):
// /organizations/{orgId}/boardVersions/{boardId}
export const boardVersionsCollection = (orgId: string) =>
  db.collection('organizations').doc(orgId).collection('boardVersions');

// Board members subcollection (Phase 9):
// /organizations/{orgId}/boards/{boardId}/members/{userId}
export const boardMembersCollection = (orgId: string, boardId: string) =>
  boardsCollection(orgId).doc(boardId).collection('members');

// Notifications (Phase 9):
// /organizations/{orgId}/notifications/{notificationId}
export const notificationsCollection = (orgId: string) =>
  db.collection('organizations').doc(orgId).collection('notifications');

// Item chat messages (subcollection on each item):
// /organizations/{orgId}/items/{itemId}/chatMessages/{messageId}
export const itemChatMessagesCollection = (orgId: string, itemId: string) =>
  itemsCollection(orgId).doc(itemId).collection('chatMessages');

// Webhooks (top-level collection for O(1) public lookup by webhookId):
// /webhooks/{webhookId}
export const webhooksCollection = db.collection('webhooks');
