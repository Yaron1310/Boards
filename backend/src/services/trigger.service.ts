import * as logger from 'firebase-functions/logger';
import {
    newsletterCampaignsCollection,
    triggerEnrollmentsCollection,
    unsubscriptionsCollection,
} from '../db/collections.js';
import { querySnapshotToArray } from './firestore.service.js';
import { DBNewsletterCampaign, DBTriggerEnrollment } from '../types/index.js';
import { calcNextTriggerSendDate } from '../utils/scheduling.js';

/**
 * Enroll a user in all matching active trigger campaigns.
 * Called when a user registers or completes a course.
 */
export async function enrollUserInTriggerCampaigns(
    academyId: string,
    userId: string,
    userEmail: string,
    triggerType: 'registration' | 'course_enrollment' | 'course_completion',
    courseId?: string
): Promise<void> {
    try {
        // Find active trigger campaigns matching the trigger type
        let query = newsletterCampaignsCollection
            .where('academyId', '==', academyId)
            .where('campaignType', '==', 'trigger')
            .where('triggerType', '==', triggerType)
            .where('status', '==', 'active');

        const campaignsSnap = await query.get();
        let campaigns = querySnapshotToArray<DBNewsletterCampaign>(campaignsSnap);

        // For course_enrollment/course_completion triggers, filter by the specific course
        if ((triggerType === 'course_enrollment' || triggerType === 'course_completion') && courseId) {
            campaigns = campaigns.filter(c => c.triggerCourseId === courseId);
        }

        if (campaigns.length === 0) return;

        const now = new Date();

        for (const campaign of campaigns) {
            try {
                // Deduplicate: check if enrollment already exists
                const existingSnap = await triggerEnrollmentsCollection
                    .where('userId', '==', userId)
                    .where('campaignId', '==', campaign.id)
                    .limit(1)
                    .get();

                if (!existingSnap.empty) {
                    logger.info(`User ${userId} already enrolled in trigger campaign ${campaign.id}, skipping`);
                    continue;
                }

                // Check unsubscription
                const unsubSnap = await unsubscriptionsCollection
                    .where('email', '==', userEmail)
                    .where('campaignId', '==', campaign.id)
                    .limit(1)
                    .get();

                if (!unsubSnap.empty) {
                    logger.info(`User ${userEmail} unsubscribed from campaign ${campaign.id}, skipping`);
                    continue;
                }

                // Calculate the first send date based on campaign schedule
                const nextSendAfter = calcNextTriggerSendDate(campaign, now);
                if (!nextSendAfter) {
                    logger.warn(`Could not calculate next send date for campaign ${campaign.id}`);
                    continue;
                }

                const enrollment: Omit<DBTriggerEnrollment, 'id'> = {
                    campaignId: campaign.id,
                    academyId,
                    userId,
                    userEmail,
                    triggerType,
                    triggerCourseId: (triggerType === 'course_enrollment' || triggerType === 'course_completion') ? courseId : undefined,
                    triggerDate: now,
                    nextEditionOrder: 1,
                    nextSendAfter,
                    status: 'active',
                    createdAt: now,
                    updatedAt: now,
                };

                await triggerEnrollmentsCollection.add(enrollment);
                logger.info(`Enrolled user ${userId} in trigger campaign ${campaign.id}`);
            } catch (err) {
                logger.error(`Error enrolling user ${userId} in campaign ${campaign.id}:`, err);
            }
        }
    } catch (err) {
        logger.error('Error in enrollUserInTriggerCampaigns:', err);
    }
}
