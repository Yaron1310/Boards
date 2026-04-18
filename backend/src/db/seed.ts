import admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import bcrypt from 'bcryptjs';

import { db } from '../services/firestore.service.js';
import {
    organizationsCollection,
    organizationSettingsCollection,
    workspacesCollection,
    usersCollection,
    systemSettingsCollection,
    membershipsCollection,
} from './collections.js';
import { DBOrganization, DBWorkspace, DBUser, UserRole, DBOrganizationSettings, DBMembership } from '../types/index.js';

export const seedDefaultData = async () => {
  const batch = db.batch();

  // --- 1. Seed Default Workspace ---
  let orgId: string;
  const organizationDocRef = organizationsCollection.doc('default_organization');
  const organizationDoc = await organizationDocRef.get();

  if (!organizationDoc.exists) {
    logger.info('Seeding initial Default Workspace...');
    const defaultOrganization: DBOrganization = {
      id: organizationDocRef.id,
      name: 'Default Workspace',
      createdAt: new Date(),
    };
    batch.set(organizationDocRef, defaultOrganization);
    orgId = defaultOrganization.id;
  } else {
    orgId = organizationDoc.id;
  }

  // --- 2. Seed Default System Settings ---
  const tokenLimitsDocRef = systemSettingsCollection.doc('settings');
  const tokenLimitsDoc = await tokenLimitsDocRef.get();
  if (!tokenLimitsDoc.exists) {
    logger.info('Seeding initial System Settings...');
    batch.set(tokenLimitsDocRef, {});
  }

  // --- 3. Seed Default Workspace Settings (Theme) ---
  const settingsDocRef = organizationSettingsCollection.doc(orgId);
  const organizationSettingsDoc = await settingsDocRef.get();
  if (!organizationSettingsDoc.exists) {
    logger.info(`Seeding initial settings for Workspace ID: ${orgId}`);
    const defaultSettings: Omit<DBOrganizationSettings, 'updatedAt'> = {
      id: orgId,
      sidebarColor: '#004e89',
      enableSidebarGradient: true,
      appName: 'Logyx',
      logoUrl: '/default_user.webp',
      displayNameColor: '#ffffff',
      sidebarLinkColor: '#e5e7eb',
      description: 'Welcome to Logyx.',
      contactEmail: 'contact@example.com',
    };
    batch.set(settingsDocRef, { ...defaultSettings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  // --- 4. Seed Default Workspace ---
  let defaultWorkspaceId: string;
  const orgDocRef = workspacesCollection.doc('default_org');
  const orgDoc = await orgDocRef.get();

  if (!orgDoc.exists) {
    logger.info(`Seeding initial default workspace for Workspace ID: ${orgId}`);
    const defaultWorkspace: DBWorkspace = {
      id: orgDocRef.id,
      name: 'Default Workspace',
      orgId: orgId,
      createdAt: new Date(),
      status: 'active',
    };
    batch.set(orgDocRef, defaultWorkspace);
    defaultWorkspaceId = defaultWorkspace.id;
  } else {
    defaultWorkspaceId = orgDoc.id;
  }

  // --- 5. Seed System Admin User ---
  const adminDocRef = usersCollection.doc('system_admin_user');
  const adminDoc = await adminDocRef.get();
  if (!adminDoc.exists) {
    logger.info('Seeding default System Admin user and membership...');
    const systemAdmin: Omit<DBUser, 'createdAt' | 'googleId'> = {
      id: adminDocRef.id,
      email: 'admin@system.com',
      name: 'System Admin',
      passwordHash: await bcrypt.hash('password', 10),
      status: 'active',
      profileImageUrl: '/default_user.webp',
      primaryOrganizationId: orgId,
      defaultWorkspaceId: defaultWorkspaceId,
    };
    const adminDocData = { ...systemAdmin, createdAt: admin.firestore.Timestamp.now() };
    batch.set(adminDocRef, adminDocData);

    const membershipRef = membershipsCollection.doc();
    const adminMembership: DBMembership = {
      id: membershipRef.id,
      userId: systemAdmin.id,
      entityId: defaultWorkspaceId,
      entityType: 'workspace',
      role: UserRole.SYSTEM_ADMIN,
      orgId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      userName: systemAdmin.name,
      userEmail: systemAdmin.email,
      userProfileImageUrl: systemAdmin.profileImageUrl,
      userStatus: 'active',
      userCreatedAt: adminDocData.createdAt,
      userHasPassword: true,
    };
    batch.set(membershipRef, adminMembership);
  }

  try {
    await batch.commit();
    logger.info('Data seeding check complete. Any necessary items were seeded.');
  } catch (error: any) {
    if (error.code === 'INVALID_ARGUMENT' && error.message.includes('batch must not be empty')) {
      logger.info('Data seeding check complete. No new data needed.');
    } else {
      logger.error("Seeding Error: Failed during batch commit.", { code: error.code, message: error.message });
      throw error;
    }
  }
};
