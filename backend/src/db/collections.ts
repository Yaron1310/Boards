
import { db } from '../services/firestore.service.js';

export const usersCollection = db.collection('users');
export const organizationsCollection = db.collection('workspaces');
export const academiesCollection = db.collection('workspaces');
export const academySettingsCollection = db.collection('academySettings');
export const preapprovedUsersCollection = db.collection('preapprovedUsers');
export const systemSettingsCollection = db.collection('systemSettings');
export const userAccessStatusCollection = db.collection('userAccessStatus');
export const membershipsCollection = db.collection('memberships');
export const emailTemplatesCollection = db.collection('emailTemplates');
export const auditLogsCollection = db.collection('auditLogs');

// --- PHASE 4: Work Management Collections ---
// Boards: /workspaces/{organizationId}/boards/{boardId}
export const boardsCollection = (organizationId: string) =>
  db.collection('workspaces').doc(organizationId).collection('boards');

// Groups: /workspaces/{organizationId}/boards/{boardId}/groups/{groupId}
export const groupsCollection = (organizationId: string, boardId: string) =>
  boardsCollection(organizationId).doc(boardId).collection('groups');

// Items (flat, org-level for cross-board dashboards):
// /workspaces/{organizationId}/items/{itemId}
export const itemsCollection = (organizationId: string) =>
  db.collection('workspaces').doc(organizationId).collection('items');

// Column definitions (global to organization):
// /workspaces/{organizationId}/columns/{columnId}
export const columnsCollection = (organizationId: string) =>
  db.collection('workspaces').doc(organizationId).collection('columns');

// Board version stamps (one doc per board, touched on every item/group mutation):
// /workspaces/{organizationId}/boardVersions/{boardId}
export const boardVersionsCollection = (organizationId: string) =>
  db.collection('workspaces').doc(organizationId).collection('boardVersions');
