
import { db } from '../services/firestore.service.js';

export const usersCollection = db.collection('users');
export const organizationsCollection = db.collection('workspaces');
export const academiesCollection = db.collection('organizations');
export const academySettingsCollection = db.collection('academySettings');
export const preapprovedUsersCollection = db.collection('preapprovedUsers');
export const systemSettingsCollection = db.collection('systemSettings');
export const userAccessStatusCollection = db.collection('userAccessStatus');
export const membershipsCollection = db.collection('memberships');
export const emailTemplatesCollection = db.collection('emailTemplates');
export const auditLogsCollection = db.collection('auditLogs');
