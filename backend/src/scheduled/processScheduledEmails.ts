import type { ScheduledEvent } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import {
    newsletterEditionsCollection,
    newsletterCampaignsCollection,
    usersCollection,
    academiesCollection,
    triggerEnrollmentsCollection,
    unsubscriptionsCollection,
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { sendNewsletterEmail, sendNewsletterReminder3DayEmail, sendNewsletterReminder1DayEmail } from '../services/email.service.js';
import { calcNextScheduledFor } from '../utils/scheduling.js';
import {
    DBNewsletterCampaign,
    DBNewsletterEdition,
    DBUser,
    DBTriggerEnrollment,
} from '../types/index.js';
import { resolveRecipients, buildNewsletterHtml, getAcademyTheme, replaceVariables } from '../services/marketing.service.js';
import { calcNextTriggerSendDate } from '../utils/scheduling.js';

const BATCH_SIZE = 50;

/** Create next draft edition for a campaign after a send (or skip) */
async function createNextDraft(
    campaign: DBNewsletterCampaign,
    prevEdition: DBNewsletterEdition,
    prevSentAt: Date
): Promise<void> {
    if (!campaign.autoCreateNextDraft || campaign.frequency === 'one_time') return;

    const nextDate = calcNextScheduledFor(campaign, prevSentAt);
    if (!nextDate) return;

    await newsletterEditionsCollection.add({
        campaignId: campaign.id,
        academyId: campaign.academyId,
        subject: '',
        htmlContent: '',
        status: 'draft',
        scheduledFor: nextDate,
        totalRecipients: 0,
        successCount: 0,
        failCount: 0,
        createdBy: prevEdition.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

/** Send batched emails for an edition, return {successCount, failCount} */
async function sendEditionEmails(
    edition: DBNewsletterEdition,
    campaign: DBNewsletterCampaign,
    academyName: string
): Promise<{ successCount: number; failCount: number; totalRecipients: number }> {
    const recipients = await resolveRecipients(campaign);
    const theme = await getAcademyTheme(campaign.academyId, academyName);
    const useTemplate = !!edition.title;
    const editionFields = {
        title: edition.title ?? '',
        subtitle: edition.subtitle ?? '',
        mainText: edition.mainText ?? '',
        showLogoInHeader: edition.showLogoInHeader,
    };
    const rawSubject = edition.title || edition.subject || '(No subject)';
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        await Promise.all(
            batch.map(async r => {
                const subject = replaceVariables(rawSubject, { name: r.name, organizationName: r.organizationName }, academyName);
                const html = useTemplate
                    ? buildNewsletterHtml(editionFields, theme, { email: r.email, name: r.name, organizationName: r.organizationName, campaignId: campaign.id })
                    : edition.htmlContent;
                const result = await sendNewsletterEmail(r.email, subject, html, academyName);
                if (result.success) successCount++;
                else failCount++;
            })
        );
        if (i + BATCH_SIZE < recipients.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    return { successCount, failCount, totalRecipients: recipients.length };
}

export const processScheduledEmailsHandler = async (_event: ScheduledEvent): Promise<void> => {
    const now = new Date();
    logger.info(`processScheduledEmails running at ${now.toISOString()}`);

    // ─── 1. Process due scheduled editions ───────────────────────────────
    const dueEditionsSnap = await newsletterEditionsCollection
        .where('status', '==', 'scheduled')
        .where('scheduledFor', '<=', now)
        .get();

    const dueEditions = querySnapshotToArray<DBNewsletterEdition>(dueEditionsSnap);
    logger.info(`Found ${dueEditions.length} due scheduled edition(s)`);

    for (const edition of dueEditions) {
        try {
            const campaignDoc = await newsletterCampaignsCollection.doc(edition.campaignId).get();
            const campaign = snapshotToData<DBNewsletterCampaign>(campaignDoc);
            if (!campaign || campaign.status === 'paused' || campaign.status === 'archived') {
                logger.info(`Skipping edition ${edition.id} — campaign not active`);
                continue;
            }

            const academyDoc = await academiesCollection.doc(edition.academyId).get();
            const academyName = academyDoc.data()?.name ?? 'Your Academy';

            // Skip empty editions
            if (!edition.htmlContent || edition.htmlContent.trim() === '') {
                logger.warn(`Edition ${edition.id} has no content — marking failed`);
                await newsletterEditionsCollection.doc(edition.id).update({
                    status: 'failed',
                    updatedAt: now,
                });
                await createNextDraft(campaign, edition, now);
                continue;
            }

            // Mark as sending
            await newsletterEditionsCollection.doc(edition.id).update({ status: 'sending', updatedAt: now });

            const { successCount, failCount, totalRecipients } = await sendEditionEmails(edition, campaign, academyName);
            const sentAt = new Date();

            await newsletterEditionsCollection.doc(edition.id).update({
                status: 'sent',
                sentAt,
                totalRecipients,
                successCount,
                failCount,
                updatedAt: sentAt,
            });

            logger.info(`Edition ${edition.id} sent: ${successCount}/${totalRecipients} delivered`);
            await createNextDraft(campaign, edition, sentAt);
        } catch (err) {
            logger.error(`Error processing edition ${edition.id}:`, err);
            try {
                await newsletterEditionsCollection.doc(edition.id).update({ status: 'failed', updatedAt: new Date() });
            } catch { /* ignore */ }
        }
    }

    // ─── 2. Admin deadline reminders ─────────────────────────────────────
    const activeCampaignsSnap = await newsletterCampaignsCollection
        .where('status', '==', 'active')
        .get();

    const activeCampaigns = querySnapshotToArray<DBNewsletterCampaign>(activeCampaignsSnap)
        .filter(c => c.frequency !== 'one_time');

    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const TWO_AND_HALF_DAYS_MS = 2.5 * 24 * 60 * 60 * 1000;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const EIGHTEEN_HOURS_MS = 18 * 60 * 60 * 1000;

    for (const campaign of activeCampaigns) {
        try {
            // Find next draft for this campaign
            const draftSnap = await newsletterEditionsCollection
                .where('campaignId', '==', campaign.id)
                .where('status', '==', 'draft')
                .orderBy('scheduledFor', 'asc')
                .limit(1)
                .get();

            if (draftSnap.empty) continue;

            const draft = snapshotToData<DBNewsletterEdition>(draftSnap.docs[0]);
            if (!draft?.scheduledFor) continue;

            const scheduledFor = draft.scheduledFor instanceof Date
                ? draft.scheduledFor
                : new Date((draft.scheduledFor as any).toDate?.() ?? draft.scheduledFor);

            if (!draft.htmlContent || draft.htmlContent.trim() === '') {
                const diff = scheduledFor.getTime() - now.getTime();

                // Get admin user
                const adminDoc = await usersCollection.doc(campaign.createdBy).get();
                const admin = snapshotToData<DBUser>(adminDoc);
                if (!admin?.email) continue;

                const academyDoc = await academiesCollection.doc(campaign.academyId).get();
                const academyName = academyDoc.data()?.name ?? 'Your Academy';

                if (diff <= THREE_DAYS_MS && diff > TWO_AND_HALF_DAYS_MS && !draft.reminder3DaySent) {
                    await sendNewsletterReminder3DayEmail(admin.email, campaign.name, academyName);
                    await newsletterEditionsCollection.doc(draft.id).update({ reminder3DaySent: true, updatedAt: new Date() });
                    logger.info(`3-day reminder sent for edition ${draft.id}`);
                } else if (diff <= ONE_DAY_MS && diff > EIGHTEEN_HOURS_MS && !draft.reminder1DaySent) {
                    await sendNewsletterReminder1DayEmail(admin.email, campaign.name, academyName);
                    await newsletterEditionsCollection.doc(draft.id).update({ reminder1DaySent: true, updatedAt: new Date() });
                    logger.info(`1-day reminder sent for edition ${draft.id}`);
                }
            }
        } catch (err) {
            logger.error(`Error processing reminders for campaign ${campaign.id}:`, err);
        }
    }

    // ─── 3. Process trigger campaign sends ──────────────────────────────
    try {
        const dueEnrollmentsSnap = await triggerEnrollmentsCollection
            .where('status', '==', 'active')
            .where('nextSendAfter', '<=', now)
            .get();

        const dueEnrollments = querySnapshotToArray<DBTriggerEnrollment>(dueEnrollmentsSnap);
        logger.info(`Found ${dueEnrollments.length} due trigger enrollment(s)`);

        // Group by campaignId for efficiency
        const byCampaign = new Map<string, DBTriggerEnrollment[]>();
        for (const enrollment of dueEnrollments) {
            const list = byCampaign.get(enrollment.campaignId) ?? [];
            list.push(enrollment);
            byCampaign.set(enrollment.campaignId, list);
        }

        for (const [campId, enrollments] of byCampaign) {
            try {
                const campaignDoc = await newsletterCampaignsCollection.doc(campId).get();
                const campaign = snapshotToData<DBNewsletterCampaign>(campaignDoc);
                if (!campaign || campaign.status !== 'active') {
                    logger.info(`Skipping trigger campaign ${campId} — not active`);
                    continue;
                }

                const academyDoc = await academiesCollection.doc(campaign.academyId).get();
                const academyName = academyDoc.data()?.name ?? 'Your Academy';
                const theme = await getAcademyTheme(campaign.academyId, academyName);

                // Fetch all editions sorted by order
                const editionsSnap = await newsletterEditionsCollection
                    .where('campaignId', '==', campId)
                    .get();
                const allEditions = querySnapshotToArray<DBNewsletterEdition>(editionsSnap)
                    .filter(e => e.status === 'draft' || e.status === 'scheduled')
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                // Get max order to know when enrollments are complete
                const maxOrder = allEditions.length > 0 ? Math.max(...allEditions.map(e => e.order ?? 0)) : 0;

                // Fetch unsubscriptions for this campaign
                const unsubSnap = await unsubscriptionsCollection.where('campaignId', '==', campId).get();
                const unsubEmails = new Set(unsubSnap.docs.map(d => d.data().email));

                for (const enrollment of enrollments) {
                    try {
                        // Check unsubscription
                        if (unsubEmails.has(enrollment.userEmail)) {
                            await triggerEnrollmentsCollection.doc(enrollment.id).update({
                                status: 'cancelled',
                                updatedAt: new Date(),
                            });
                            logger.info(`Trigger enrollment ${enrollment.id} cancelled — user unsubscribed`);
                            continue;
                        }

                        // Find edition at the enrollment's nextEditionOrder
                        let edition = allEditions.find(e => e.order === enrollment.nextEditionOrder);

                        // If missing (deleted), skip to next available order
                        if (!edition) {
                            const nextAvailable = allEditions.find(e => (e.order ?? 0) > enrollment.nextEditionOrder);
                            if (!nextAvailable) {
                                // All editions exhausted
                                await triggerEnrollmentsCollection.doc(enrollment.id).update({
                                    status: 'completed',
                                    updatedAt: new Date(),
                                });
                                logger.info(`Trigger enrollment ${enrollment.id} completed — no more editions`);
                                continue;
                            }
                            edition = nextAvailable;
                        }

                        // Check if edition has content
                        if (!edition.title && !edition.htmlContent?.trim()) {
                            logger.warn(`Trigger edition ${edition.id} has no content — skipping for enrollment ${enrollment.id}`);
                            continue;
                        }

                        // Fetch user info for personalization
                        const userDoc = await usersCollection.doc(enrollment.userId).get();
                        const userData = snapshotToData<DBUser>(userDoc);
                        const recipientName = userData?.name ?? enrollment.userEmail;
                        const orgName = '';

                        const rawSubject = edition.title || edition.subject || '(No subject)';
                        const subject = replaceVariables(rawSubject, { name: recipientName, organizationName: orgName }, academyName);
                        const html = edition.title
                            ? buildNewsletterHtml(
                                { title: edition.title, subtitle: edition.subtitle ?? '', mainText: edition.mainText ?? '', showLogoInHeader: edition.showLogoInHeader },
                                theme,
                                { email: enrollment.userEmail, name: recipientName, organizationName: orgName, campaignId: campId }
                              )
                            : edition.htmlContent;

                        const result = await sendNewsletterEmail(enrollment.userEmail, subject, html, academyName);

                        if (result.success) {
                            const newOrder = (edition.order ?? enrollment.nextEditionOrder) + 1;
                            const isComplete = newOrder > maxOrder;
                            const nextSendAfter = isComplete ? now : calcNextTriggerSendDate(campaign, now);

                            await triggerEnrollmentsCollection.doc(enrollment.id).update({
                                nextEditionOrder: newOrder,
                                nextSendAfter: nextSendAfter ?? now,
                                status: isComplete ? 'completed' : 'active',
                                updatedAt: new Date(),
                            });
                            logger.info(`Trigger edition ${edition.id} sent to ${enrollment.userEmail} (enrollment ${enrollment.id})`);
                        } else {
                            logger.error(`Failed to send trigger edition ${edition.id} to ${enrollment.userEmail}`);
                        }
                    } catch (err) {
                        logger.error(`Error processing trigger enrollment ${enrollment.id}:`, err);
                    }
                }
            } catch (err) {
                logger.error(`Error processing trigger campaign ${campId}:`, err);
            }
        }
    } catch (err) {
        logger.error('Error processing trigger campaigns:', err);
    }

    logger.info('processScheduledEmails complete');
};
