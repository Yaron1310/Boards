
import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { academySettingsCollection, academiesCollection, plansCollection, pendingCheckoutsCollection, coursesCollection, chatPersonasCollection, questionnairesCollection } from '../db/collections.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { DBAcademySettings, DBPlan } from '../types/index.js';

export const getPublicAcademyDetails = async (req: Request, res: Response) => {
    const { academyName: encodedAcademyName } = req.params;

    // Prevent caching of this response to ensure toggle state changes are reflected immediately
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    if (!encodedAcademyName) {
        return res.status(400).json({ message: "Academy name is required." });
    }
    const academyName = decodeURIComponent(encodedAcademyName);


    try {
        // Find academy by name to get its ID
        const academySnapshot = await academiesCollection.where('name', '==', academyName).limit(1).get();
        if (academySnapshot.empty) {
            return res.status(404).json({ message: "Academy not found." });
        }
        const academyId = academySnapshot.docs[0].id;

        // 1. Fetch Academy Settings (Theme & Public Page Config)
        const settingsDoc = await academySettingsCollection.doc(academyId).get();
        if (!settingsDoc.exists) {
            return res.status(404).json({ message: "Academy settings not found." });
        }
        const settings = snapshotToData<DBAcademySettings>(settingsDoc)!;

        // 2. Check if Public Page is enabled
        // We return 404 to indicate the page "does not exist" to the public
        if (!settings.publicPlansPage?.enabled) {
            return res.status(404).json({ message: "Public plans page not found." });
        }

        // 3. Fetch Academy Name (already have it, but can confirm from doc)
        const academyDoc = await academiesCollection.doc(academyId).get();
        const fetchedAcademyName = academyDoc.exists ? academyDoc.data()?.name : settings.appName;

        // 4. Fetch Details for Selected Plans
        // We only fetch the plans that are configured in the public page
        const selectedConfigs = settings.publicPlansPage.selectedPlans || [];
        const planIds = selectedConfigs.map(p => p.planId);
        
        let plansData: any[] = [];
        
        if (planIds.length > 0) {
            // Firestore 'in' query supports up to 10/30 items, we have max 4 here.
            const plansSnapshot = await plansCollection.where('id', 'in', planIds).get();
            const dbPlans = querySnapshotToArray<DBPlan>(plansSnapshot);
            const plansMap = new Map(dbPlans.map(p => [p.id, p]));

            // Combine DB data with Display Overrides
            plansData = selectedConfigs.map(config => {
                const dbPlan = plansMap.get(config.planId);
                if (!dbPlan) return null; // Skip if plan was deleted from DB

                return {
                    id: dbPlan.id,
                    dbName: dbPlan.name,
                    priceMonthly: dbPlan.priceMonthly,
                    currency: dbPlan.currency,
                    isForSingleUser: dbPlan.isForSingleUser,
                    // Overrides from public config
                    displayName: config.displayName,
                    billingCycle: config.billingCycle,
                    description: config.description,
                    bullets: config.bullets,
                    buttonText: config.buttonText,
                    tagText: config.tagText,
                    tagColor: config.tagColor,
                    tagTextColor: config.tagTextColor
                };
            }).filter(Boolean);
        }

        // Use defaults if decoupled settings aren't present (backward compatibility)
        const gradientHue = settings.publicPlansPage.gradientHueRotation ?? (settings.sidebarHueRotation || 270);
        const gradientHeight = settings.publicPlansPage.gradientHeight ?? (settings.sidebarGradientHeight || 85);
        const gradientOpacity = settings.publicPlansPage.gradientMaskOpacity ?? (settings.sidebarGradientMaskOpacity || 40);

        const isCustomized = settings.publicPlansPage.customized === true;
        const themeCardAccentColor = settings.sidebarLinkColor || '#e5e7eb';

        const publicResponse = {
            academyId,
            academyName: fetchedAcademyName,
            appName: settings.appName,
            logoUrl: settings.logoUrl,
            theme: {
                sidebarColor: settings.sidebarColor,
                displayNameColor: settings.displayNameColor,
            },
            publicPlansPage: {
                enableGradient: settings.publicPlansPage.enableGradient !== undefined ? settings.publicPlansPage.enableGradient : true,
                gradientHueRotation: gradientHue,
                gradientHeight: gradientHeight,
                gradientMaskOpacity: gradientOpacity,
                pageHeader: settings.publicPlansPage.pageHeader,
                headerFontWeight: settings.publicPlansPage.headerFontWeight,
                cardBackgroundColor: isCustomized ? settings.publicPlansPage.cardBackgroundColor : '#ffffff00',
                cardBorderColor: isCustomized ? settings.publicPlansPage.cardBorderColor : themeCardAccentColor,
                cardFontColor: isCustomized ? settings.publicPlansPage.cardFontColor : themeCardAccentColor,
                buttonBackgroundColor: isCustomized ? settings.publicPlansPage.buttonBackgroundColor : themeCardAccentColor,
                buttonTextColor: isCustomized ? settings.publicPlansPage.buttonTextColor : settings.sidebarColor,
            },
            plans: plansData
        };

        res.json(publicResponse);

    } catch (error) {
        logger.error(`Error fetching public academy details for ${academyName}:`, error);
        res.status(500).json({ message: "Internal server error." });
    }
};

export const getPublicSinglePlanPage = async (req: Request, res: Response) => {
    const { academyName: encodedAcademyName, planId } = req.params;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');

    if (!encodedAcademyName || !planId) {
        return res.status(400).json({ message: "Academy name and plan ID are required." });
    }
    const academyName = decodeURIComponent(encodedAcademyName);

    try {
        const academySnapshot = await academiesCollection.where('name', '==', academyName).limit(1).get();
        if (academySnapshot.empty) {
            return res.status(404).json({ message: "Academy not found." });
        }
        const academyId = academySnapshot.docs[0].id;

        const [settingsDoc, planDoc] = await Promise.all([
            academySettingsCollection.doc(academyId).get(),
            plansCollection.doc(planId).get(),
        ]);

        if (!settingsDoc.exists) {
            return res.status(404).json({ message: "Academy settings not found." });
        }
        if (!planDoc.exists) {
            return res.status(404).json({ message: "Plan not found." });
        }

        const settings = snapshotToData<DBAcademySettings>(settingsDoc)!;
        const plan = snapshotToData<DBPlan>(planDoc)!;

        // Verify plan belongs to this academy
        if (plan.academyId !== academyId) {
            return res.status(404).json({ message: "Plan not found." });
        }

        // Count accessible resources
        let courseCount = 0;
        let mentorCount = 0;
        let questionnaireCount = 0;

        if (plan.hasAllCoursesAccess) {
            const snap = await coursesCollection.where('academyId', '==', academyId).get();
            courseCount = snap.size;
        } else {
            courseCount = plan.accessibleCourseIds?.length || 0;
        }

        if (plan.hasAllChatAccess !== false) {
            const snap = await chatPersonasCollection.where('academyId', '==', academyId).get();
            mentorCount = snap.size;
        } else {
            mentorCount = plan.accessibleChatPersonaIds?.length || 0;
        }

        if (plan.hasAllQuestionnairesAccess !== false) {
            const snap = await questionnairesCollection.where('academyId', '==', academyId).get();
            questionnaireCount = snap.size;
        } else {
            questionnaireCount = plan.accessibleQuestionnaireIds?.length || 0;
        }

        const isCustomized = settings.publicPlansPage?.customized === true;
        const themeCardAccentColor = settings.sidebarLinkColor || '#e5e7eb';
        const ppp = settings.publicPlansPage;

        const gradientHue = ppp?.gradientHueRotation ?? (settings.sidebarHueRotation || 270);
        const gradientHeight = ppp?.gradientHeight ?? (settings.sidebarGradientHeight || 85);
        const gradientOpacity = ppp?.gradientMaskOpacity ?? (settings.sidebarGradientMaskOpacity || 40);

        // Look up display overrides from publicPlansPage.selectedPlans config
        const planConfig = (ppp?.selectedPlans || []).find((c: any) => c.planId === planId);

        const academyDoc = await academiesCollection.doc(academyId).get();
        const fetchedAcademyName = academyDoc.exists ? academyDoc.data()?.name : settings.appName;

        res.json({
            academyId,
            academyName: fetchedAcademyName,
            appName: settings.appName,
            logoUrl: settings.logoUrl,
            theme: {
                sidebarColor: settings.sidebarColor,
                displayNameColor: settings.displayNameColor,
            },
            publicPlansPage: {
                enableGradient: ppp?.enableGradient ?? true,
                gradientHueRotation: gradientHue,
                gradientHeight: gradientHeight,
                gradientMaskOpacity: gradientOpacity,
                cardBackgroundColor: isCustomized ? ppp?.cardBackgroundColor : '#ffffff00',
                cardBorderColor: isCustomized ? ppp?.cardBorderColor : themeCardAccentColor,
                cardFontColor: isCustomized ? ppp?.cardFontColor : themeCardAccentColor,
                buttonBackgroundColor: isCustomized ? ppp?.buttonBackgroundColor : themeCardAccentColor,
                buttonTextColor: isCustomized ? ppp?.buttonTextColor : settings.sidebarColor,
            },
            plan: {
                id: plan.id,
                displayName: planConfig?.displayName || plan.name,
                billingCycle: planConfig?.billingCycle,
                priceMonthly: plan.priceMonthly,
                currency: plan.currency,
                maxUsers: plan.maxUsers || 0,
                courseCount,
                mentorCount,
                questionnaireCount,
            }
        });

    } catch (error) {
        logger.error(`Error fetching single plan page for ${academyName}/${planId}:`, error);
        res.status(500).json({ message: "Internal server error." });
    }
};

export const getPublicPlanDetails = async (req: Request, res: Response) => {
    const { planId } = req.params;
    if (!planId) {
        return res.status(400).json({ message: "Plan ID is required." });
    }

    try {
        const planDoc = await plansCollection.doc(planId).get();
        if (!planDoc.exists) {
            return res.status(404).json({ message: "Plan not found." });
        }
        
        const plan = snapshotToData<DBPlan>(planDoc)!;
        const { academyId, name, priceMonthly, currency, isForSingleUser } = plan;

        const academyDoc = await academiesCollection.doc(academyId).get();
        const academyName = academyDoc.exists ? academyDoc.data()?.name : 'Gymind';
        
        let logoUrl = '/logo_gym.webp'; // Default Gymind logo
        let sidebarColor = '#004e89'; // Default Gymind blue
        const settingsDoc = await academySettingsCollection.doc(academyId).get();
        if (settingsDoc.exists) {
            const settings = snapshotToData<DBAcademySettings>(settingsDoc)!;
            logoUrl = settings.logoUrl || '/logo_gym.webp';
            sidebarColor = settings.sidebarColor || '#004e89';
        }

        res.json({
            id: plan.id,
            name,
            price: priceMonthly,
            currency,
            isForSingleUser: isForSingleUser ?? false,
            academyName,
            academyId,
            logoUrl,
            sidebarColor
        });
    } catch (error) {
        logger.error(`Error fetching public plan details for ${planId}:`, error);
        res.status(500).json({ message: "Internal server error." });
    }
};

export const getPublicSingleUserPlans = async (req: Request, res: Response) => {
    const { academyId } = req.params;
    if (!academyId) {
        return res.status(400).json({ message: "Academy ID is required." });
    }

    try {
        const snapshot = await plansCollection
            .where('academyId', '==', academyId)
            .where('isForSingleUser', '==', true)
            .where('status', '==', 'active')
            .get();

        const plans = querySnapshotToArray<DBPlan>(snapshot).map(plan => ({
            id: plan.id,
            name: plan.name,
            priceMonthly: plan.priceMonthly,
            currency: plan.currency,
            planType: plan.planType,
            hasAllChatAccess: plan.hasAllChatAccess,
            hasAllQuestionnairesAccess: plan.hasAllQuestionnairesAccess,
            hasAllCoursesAccess: plan.hasAllCoursesAccess,
        }));

        res.json(plans);
    } catch (error) {
        logger.error(`Error fetching single-user plans for academy ${academyId}:`, error);
        res.status(500).json({ message: "Failed to fetch available plans." });
    }
};

export const getCheckoutSessionData = async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required." });
    }

    try {
        const sessionDoc = await pendingCheckoutsCollection.doc(sessionId).get();
        if (!sessionDoc.exists) {
            return res.status(404).json({ message: "Checkout session not found or expired." });
        }
        
        // Return data but omit sensitive info like password
        const { password, ...rest } = sessionDoc.data()!;
        res.json(rest);

    } catch (error) {
        logger.error(`Error fetching checkout session data for ${sessionId}:`, error);
        res.status(500).json({ message: "Internal server error." });
    }
};
