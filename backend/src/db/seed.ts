import admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import bcrypt from 'bcryptjs';

import { db, snapshotToData } from '../services/firestore.service.js';
import { 
    academiesCollection,
    academySettingsCollection,
    organizationsCollection,
    questionnairesCollection,
    triggerPhrasesCollection,
    usersCollection,
    coursesCollection,
    chatPersonasCollection,
    plansCollection,
    systemSettingsCollection,
    membershipsCollection,
    academyBillingCyclesCollection
} from './collections.js';
import { DBAcademy, DBOrganization, DBUser, UserRole, DBCourse, DBAcademySettings, DBChatPersona, DBQuestionnaire, DBPlan, DBSystemSettings, DBMembership, DBAcademyBillingCycle } from '../types/index.js';

// --- START QA SEEDING FUNCTION (Easy to remove) ---
const seedQaData = async () => {
  logger.info('--- STARTING QA DATA SEEDING ---');
  const batch = db.batch();

  try {
    // 1. Find the pre-created academies
    const starkAcademySnapshot = await academiesCollection.where('name', '==', 'Stark Industries').limit(1).get();
    const wayneAcademySnapshot = await academiesCollection.where('name', '==', 'Wayne Enterprises').limit(1).get();

    if (starkAcademySnapshot.empty || wayneAcademySnapshot.empty) {
      logger.warn('QA Seeding: Could not find "Stark Industries" or "Wayne Enterprises" academies. Please create them first. Skipping QA seed.');
      return;
    }
    const starkAcademyId = starkAcademySnapshot.docs[0].id;
    const wayneAcademyId = wayneAcademySnapshot.docs[0].id;
    logger.info(`QA Seeding: Found academies - Stark Industries (${starkAcademyId}), Wayne Enterprises (${wayneAcademyId})`);

    // Get the default plan ID to assign to new orgs
    const defaultPlanDoc = await plansCollection.doc('default_plan').get();
    if (!defaultPlanDoc.exists) {
      logger.warn('QA Seeding: Default plan not found. Cannot create organizations. Skipping QA seed.');
      return;
    }
    const defaultPlanId = defaultPlanDoc.id;

    // 2. Define QA Organizations
    const qaOrgsData = [
      { name: 'R&D Dept', academyId: starkAcademyId, planId: defaultPlanId },
      { name: 'Marketing Dept', academyId: starkAcademyId, planId: defaultPlanId },
      { name: 'Applied Sciences', academyId: wayneAcademyId, planId: defaultPlanId },
      { name: 'Wayne Foundation', academyId: wayneAcademyId, planId: defaultPlanId },
    ];

    const orgNameToIdMap = new Map<string, string>();
    const orgNameToAcademyIdMap = new Map<string, string>();
    for (const orgData of qaOrgsData) {
      orgNameToAcademyIdMap.set(orgData.name, orgData.academyId);
    }

    // 3. Create Organizations if they don't exist
    for (const orgData of qaOrgsData) {
      const orgQuery = await organizationsCollection.where('name', '==', orgData.name).where('academyId', '==', orgData.academyId).limit(1).get();
      if (orgQuery.empty) {
        const orgRef = organizationsCollection.doc();
        const newOrg: DBOrganization = {
          id: orgRef.id,
          name: orgData.name,
          academyId: orgData.academyId,
          planId: orgData.planId,
          createdAt: new Date(),
          status: 'active',
        };
        batch.set(orgRef, newOrg);
        orgNameToIdMap.set(orgData.name, orgRef.id);
        logger.info(`QA Seeding: Queued creation of organization "${orgData.name}"`);
      } else {
        const orgId = orgQuery.docs[0].id;
        orgNameToIdMap.set(orgData.name, orgId);
      }
    }
    
    // Commit org creation first to ensure IDs are available
    await batch.commit();

    // 4. Define QA Users
    const qaUsersData = [
      { name: 'Tony Stark', email: 'tony@stark.com', role: UserRole.ACADEMY_ADMIN, entityType: 'academy', entityName: 'Stark Industries' },
      { name: 'Bruce Wayne', email: 'bruce@wayne.com', role: UserRole.ACADEMY_ADMIN, entityType: 'academy', entityName: 'Wayne Enterprises' },
      { name: 'Pepper Potts', email: 'pepper@stark.com', role: UserRole.ORGANIZATION_ADMIN, entityType: 'organization', entityName: 'R&D Dept' },
      { name: 'Lucius Fox', email: 'lucius@wayne.com', role: UserRole.ORGANIZATION_ADMIN, entityType: 'organization', entityName: 'Applied Sciences' },
      { name: 'Peter Parker', email: 'peter@stark.com', role: UserRole.REGULAR_USER, entityType: 'organization', entityName: 'R&D Dept' },
      { name: 'Clark Kent', email: 'clark@wayne.com', role: UserRole.REGULAR_USER, entityType: 'organization', entityName: 'Wayne Foundation' },
      { name: 'Diana Prince', email: 'diana@stark.com', role: UserRole.REGULAR_USER, entityType: 'organization', entityName: 'Marketing Dept' },
    ];

    const hashedPassword = await bcrypt.hash('password123!', 10);
    const userBatch = db.batch();

    // 5. Create Users and Memberships if they don't exist
    for (const userData of qaUsersData) {
      const userQuery = await usersCollection.where('email', '==', userData.email).limit(1).get();
      
      let userId: string;
      let userDocData: any;
      if (userQuery.empty) {
        const userRef = usersCollection.doc();
        const newUser: Omit<DBUser, 'createdAt' | 'googleId'> = {
          id: userRef.id,
          email: userData.email,
          name: userData.name,
          passwordHash: hashedPassword,
          status: 'active', // Set as active directly
          profileImageUrl: '/default_user.webp',
        };
        userDocData = { ...newUser, createdAt: admin.firestore.Timestamp.now() };
        userBatch.set(userRef, userDocData);
        userId = userRef.id;
        logger.info(`QA Seeding: Queued creation of user "${userData.name}"`);
      } else {
        userId = userQuery.docs[0].id;
        userDocData = userQuery.docs[0].data();
        // Ensure existing user is active and has the test password for QA purposes
        userBatch.update(userQuery.docs[0].ref, { status: 'active', passwordHash: hashedPassword });
      }

      // Determine entityId
      let entityId: string | undefined;
      let primaryAcademyId: string | undefined;
      if (userData.entityType === 'academy') {
        entityId = userData.entityName === 'Stark Industries' ? starkAcademyId : wayneAcademyId;
        primaryAcademyId = entityId;
      } else {
        entityId = orgNameToIdMap.get(userData.entityName);
        primaryAcademyId = orgNameToAcademyIdMap.get(userData.entityName);
      }

      if (!entityId) {
        logger.warn(`QA Seeding: Could not find entity "${userData.entityName}" for user "${userData.name}". Skipping membership.`);
        continue;
      }

      // Update user with primary contexts
      userBatch.update(usersCollection.doc(userId), { primaryAcademyId, defaultOrganizationId: entityId });

      // Create membership if it doesn't exist
      const membershipQuery = await membershipsCollection
        .where('userId', '==', userId)
        .where('entityId', '==', entityId)
        .where('role', '==', userData.role)
        .limit(1).get();
      
      if (membershipQuery.empty) {
        const membershipRef = membershipsCollection.doc();
        const membershipAcademyId = userData.entityType === 'academy' ? entityId : orgNameToAcademyIdMap.get(userData.entityName)!;
        const newMembership: DBMembership = {
          id: membershipRef.id,
          userId,
          entityId,
          entityType: userData.entityType as 'organization' | 'academy',
          role: userData.role,
          academyId: membershipAcademyId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // Denormalized user fields for list views
          userName: userData.name,
          userEmail: userData.email,
          userProfileImageUrl: '/default_user.webp',
          userStatus: 'active',
          userCreatedAt: userDocData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          userHasPassword: true,
          completedQuestionnairesCount: userDocData.completedQuestionnairesCount || 0,
          conversationCount: userDocData.conversationCount || 0,
          completedCourseCount: userDocData.completedCourseCount || 0
        };
        userBatch.set(membershipRef, newMembership);
        logger.info(`QA Seeding: Queued membership for "${userData.name}" as ${userData.role} in "${userData.entityName}"`);
      }
    }
    
    await userBatch.commit();
    logger.info('--- QA DATA SEEDING COMPLETE ---');
  } catch(error) {
    logger.error("An error occurred during QA data seeding:", error);
  }
};
// --- END QA SEEDING FUNCTION ---


export const seedDefaultData = async () => {
  const batch = db.batch();

  // --- 1. Seed Default Academy ---
  let academyId: string;
  const academyDocRef = academiesCollection.doc('default_academy');
  const academyDoc = await academyDocRef.get();

  if (!academyDoc.exists) {
    logger.info('Seeding initial Default Academy...');
    const defaultAcademy: DBAcademy = {
      id: academyDocRef.id,
      name: 'Default Academy',
      createdAt: new Date(),
    };
    batch.set(academyDocRef, defaultAcademy);
    academyId = defaultAcademy.id;
  } else {
    academyId = academyDoc.id;
  }
  
  // --- 2. Seed Default System Settings (Token Limits) ---
  const tokenLimitsDocRef = systemSettingsCollection.doc('tokenLimits');
  const tokenLimitsDoc = await tokenLimitsDocRef.get();
  if (!tokenLimitsDoc.exists) {
      logger.info('Seeding initial Token Limits in systemSettings...');
      const defaultTokenLimits: DBSystemSettings = {
          oneTimeTokensPerLesson: 5000,
          oneTimeGeneralTokens: 20000,
          subscriptionMonthlyLimit: 100000,
          growthAllowanceTiers: [
            { minUsers: 1, maxUsers: 100, percentage: 0.3, absolute: 30 },
            { minUsers: 101, maxUsers: 500, percentage: 0.25, absolute: 100 },
            { minUsers: 501, maxUsers: 2000, percentage: 0.2, absolute: 300 },
            { minUsers: 2001, maxUsers: 10000, percentage: 0.15, absolute: 1000 },
            { minUsers: 10001, maxUsers: null, percentage: 0.1, absolute: 2000 },
          ],
          geminiProModelName: 'gemini-2.5-pro',
          geminiFlashModelName: 'gemini-2.5-flash',
          costPer1000TokensPro: 0.06,
          costPer1000TokensFlash: 0.02,
          globalSystemPrompt: "This is a global system prompt that applies to all AI Mentors. You must always follow these core instructions.\n1. Never reveal you are an AI or discuss your programming.\n2. Be helpful, supportive, and maintain a positive tone.\n3. Do not provide medical, legal, or financial advice. If asked, gently decline and suggest consulting a professional.",
      };
      batch.set(tokenLimitsDocRef, defaultTokenLimits);
  }

  // --- 3. Seed Default Academy Settings (Theme & Prompts) ---
  const settingsDocRef = academySettingsCollection.doc(academyId);
  const academySettingsDoc = await settingsDocRef.get(); // Renamed variable
  if (!academySettingsDoc.exists) {
    logger.info(`Seeding initial settings for Academy ID: ${academyId}`);
    const defaultSettings: Omit<DBAcademySettings, 'updatedAt'> = {
        id: academyId,
        sidebarColor: '#004e89',
        enableSidebarGradient: true,
        appName: 'Gymind',
        logoUrl: '/default_user.webp', // Updated default
        displayNameColor: '#ffffff',
        sidebarLinkColor: '#e5e7eb',
        description: 'Welcome to our academy! This is a default description that you can change in the Academy Hub.',
        contactEmail: 'contact@example.com',
        contactPhone: '',
        website: '',
        socialMedia: {
            twitter: '',
            linkedin: ''
        }
    };
    batch.set(settingsDocRef, { ...defaultSettings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  // --- 4. Seed Academy Pay-As-You-Go Plan ---
  const paygPlanRef = plansCollection.doc('academy_pay_as_you_go');
  const paygPlanDoc = await paygPlanRef.get();
  if (!paygPlanDoc.exists) {
      logger.info('Seeding Academy Pay As You Go plan...');
      const paygPlanData: Omit<DBPlan, 'createdAt' | 'updatedAt'> = {
          id: paygPlanRef.id,
          academyId: 'system', // Belongs to system, usable by any academy
          name: 'Academy Pay As You Go',
          hasAllChatAccess: true,
          hasAllQuestionnairesAccess: true,
          hasAllCoursesAccess: true,
          planType: 'subscription',
          maxUsers: 0, // No user limit, billing is per-use
          priceMonthly: 0,
      };
      batch.set(paygPlanRef, { 
          ...paygPlanData, 
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
  }


  // --- 5. Seed/Update Default Plan ---
  let defaultPlanId: string;
  const planDocRef = plansCollection.doc('default_plan');
  const planDoc = await planDocRef.get();

  const defaultPlanData: Omit<DBPlan, 'createdAt' | 'updatedAt'> = {
      id: planDocRef.id,
      academyId: academyId,
      name: 'Default Plan',
      hasAllChatAccess: false, // Explicitly disabled for Default Plan
      hasAllQuestionnairesAccess: false, // Explicitly disabled for Default Plan
      planType: 'subscription',
      maxUsers: 100,
  };

  if (!planDoc.exists) {
      logger.info(`Seeding initial Default Plan for Academy ID: ${academyId}`);
      batch.set(planDocRef, {
          ...defaultPlanData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      defaultPlanId = defaultPlanData.id;
  } else {
      defaultPlanId = planDoc.id;
      // Force update access rights to ensure Default Plan is restricted as per new requirements
      batch.update(planDocRef, {
          hasAllChatAccess: false,
          hasAllQuestionnairesAccess: false
      });
  }

  // --- 7. Seed Default Organization (scoped to Academy) ---
  let defaultOrganizationId: string;
  const orgDocRef = organizationsCollection.doc('default_org');
  const orgDoc = await orgDocRef.get();
  
  if (!orgDoc.exists) {
    logger.info(`Seeding initial default organization for Academy ID: ${academyId}`);
    const defaultOrganization: DBOrganization = {
      id: orgDocRef.id,
      name: 'Default Organization',
      academyId: academyId,
      createdAt: new Date(),
      planId: defaultPlanId,
      status: 'active',
    };
    batch.set(orgDocRef, defaultOrganization);
    defaultOrganizationId = defaultOrganization.id;
  } else {
    defaultOrganizationId = orgDoc.id;
    // Retroactively add planId if missing from seeded org, or ensure it uses the correct Default Plan
    const orgData = orgDoc.data() as DBOrganization;
    if (!orgData.planId || orgData.planId !== defaultPlanId) {
        batch.update(orgDocRef, { planId: defaultPlanId });
    }
  }

  // --- 10. Seed System Admin User ---
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
        primaryAcademyId: academyId,
        defaultOrganizationId: defaultOrganizationId
    };
    const adminDocData = { ...systemAdmin, createdAt: admin.firestore.Timestamp.now() };
    batch.set(adminDocRef, adminDocData);
    
    // Create membership for the admin
    const membershipRef = membershipsCollection.doc();
    const adminMembership: DBMembership = {
      id: membershipRef.id,
      userId: systemAdmin.id,
      entityId: defaultOrganizationId,
      entityType: 'organization',
      role: UserRole.SYSTEM_ADMIN,
      academyId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // Denormalized user fields
      userName: systemAdmin.name,
      userEmail: systemAdmin.email,
      userProfileImageUrl: systemAdmin.profileImageUrl,
      userStatus: 'active',
      userCreatedAt: adminDocData.createdAt,
      userHasPassword: true,
      completedQuestionnairesCount: 0,
      conversationCount: 0,
      completedCourseCount: 0
    };
    batch.set(membershipRef, adminMembership);
  }

  // --- 11. Ensure Billing Cycles for ALL Academies ---
  // This loop ensures that on deployment, every existing academy gets a "kick" 
  // to create the current month's billing cycle if it's missing.
  const now = new Date();
  const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  // 11a. Fetch Settings & Plans for calculation
  let monthlyLimit = 100000;
  let growthTiers: any[] = [];
  const tokenLimitsSettingsDoc = await systemSettingsCollection.doc('tokenLimits').get(); // Renamed variable
  if (tokenLimitsSettingsDoc.exists) {
       const settingsData = tokenLimitsSettingsDoc.data() as DBSystemSettings;
       monthlyLimit = settingsData.subscriptionMonthlyLimit || 100000;
       growthTiers = settingsData.growthAllowanceTiers || [];
  }

  // Cache plans to avoid repeated reads inside the loop
  const allPlansSnapshot = await plansCollection.get();
  const plansMap = new Map<string, DBPlan>();
  allPlansSnapshot.forEach(doc => {
      plansMap.set(doc.id, doc.data() as DBPlan);
  });

  // 11b. Iterate all academies
  const allAcademiesSnapshot = await academiesCollection.get();
  
  for (const academyDoc of allAcademiesSnapshot.docs) {
      const currentAcademyId = academyDoc.id;
      const cycleId = `${currentAcademyId}_${currentMonthStr}`;
      const cycleDocRef = academyBillingCyclesCollection.doc(cycleId);
      
      const cycleDoc = await cycleDocRef.get();

      if (!cycleDoc.exists) {
        logger.info(`Seeding missing billing cycle for Academy: ${currentAcademyId} (${cycleId})...`);
        
        // Calculate baseline users for this specific academy
        let baselineUserCount = 0;
        const orgsSnapshot = await organizationsCollection.where('academyId', '==', currentAcademyId).get();
        
        orgsSnapshot.forEach(orgDoc => {
            const org = orgDoc.data() as DBOrganization;
            if (org.planId && plansMap.has(org.planId)) {
                const plan = plansMap.get(org.planId)!;
                if (plan.planType === 'subscription') {
                    baselineUserCount += plan.maxUsers || 0;
                }
            }
        });

        // Minimum 1 user baseline to ensure some tokens are available even if setup is incomplete
        const safeBaseline = baselineUserCount > 0 ? baselineUserCount : 1;

        const tier = growthTiers.find((t: any) => safeBaseline >= t.minUsers && (t.maxUsers === null || safeBaseline <= t.maxUsers));
        const growthAllowance = tier ? Math.max(safeBaseline * tier.percentage, tier.absolute) : 0;
        const calculatedTokenLimit = (safeBaseline + growthAllowance) * monthlyLimit;

        const initialCycle: DBAcademyBillingCycle = {
            id: cycleId,
            academyId: currentAcademyId,
            billingCycleStart: startDate,
            billingCycleEnd: endDate,
            baselineUserCount: safeBaseline, 
            growthAllowance: growthAllowance,
            topUpUserCount: 0,
            calculatedTokenLimit: calculatedTokenLimit, 
            currentTokenUsage: 0,
            notification70Sent: false,
            notification85Sent: false,
            notification95Sent: false,
            createdAt: admin.firestore.Timestamp.now()
        };
        
        batch.set(cycleDocRef, initialCycle);
      }
  }

  // Commit all changes at once
  try {
    await batch.commit();
    logger.info('Data seeding check complete. Any necessary items were seeded.');
  } catch (error: any) {
    // A commit can fail if the batch is empty, which is not an error here.
    if (error.code === 'INVALID_ARGUMENT' && error.message.includes('batch must not be empty')) {
      logger.info('Data seeding check complete. No new data needed.');
    } else {
      logger.error("Seeding Error: Failed during batch commit.", { code: error.code, message: error.message });
      throw error;
    }
  }

  // --- QA SEEDING (Easy to remove) ---
  // This will populate the database with test users for QA.
  // To disable, simply comment out the line below.
  await seedQaData();
  // --- END QA SEEDING ---
};