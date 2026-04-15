import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { newsletterCampaignsCollection, newsletterEditionsCollection, usersCollection, academiesCollection, unsubscriptionsCollection } from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBNewsletterCampaign, DBNewsletterEdition, DBUser, UserRole, DBTriggerEnrollment } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import sanitizeHtml from 'sanitize-html';
import { sendNewsletterEmail } from '../services/email.service.js';
import { calcNextScheduledFor } from '../utils/scheduling.js';
import { getAi } from '../services/gemini.service.js';
import { buildNewsletterHtml, getAcademyTheme, resolveRecipients, replaceVariables } from '../services/marketing.service.js';

const NEWSLETTER_ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'section', 'article', 'header', 'footer',
    'blockquote', 'pre', 'code',
];

const sanitizeNewsletterHtml = (dirty: string): string =>
    sanitizeHtml(dirty, {
        allowedTags: NEWSLETTER_ALLOWED_TAGS,
        allowedAttributes: {
            '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'cellpadding', 'cellspacing', 'border'],
            'a': ['href', 'target', 'rel'],
            'img': ['src', 'alt', 'width', 'height'],
            'td': ['colspan', 'rowspan'],
            'th': ['colspan', 'rowspan'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
    });

// GET /marketing/campaigns
export const getCampaigns = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const { status } = req.query;
        let query = newsletterCampaignsCollection
            .where('academyId', '==', user.academyId)
            .orderBy('createdAt', 'desc');

        const snapshot = await query.get();
        let campaigns = querySnapshotToArray<DBNewsletterCampaign>(snapshot);

        if (status) {
            campaigns = campaigns.filter(c => c.status === status);
        }

        res.json(campaigns);
    } catch (error) {
        logger.error('Error fetching campaigns:', error);
        res.status(500).json({ message: 'Failed to fetch campaigns.' });
    }
};

// POST /marketing/campaigns
export const createCampaign = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const {
            name,
            campaignType,
            triggerType,
            triggerCourseId,
            recipientGroup,
            recipientFilter,
            frequency,
            scheduledDay,
            scheduledTime,
            timezone,
            autoCreateNextDraft,
        } = req.body;

        const isTrigger = campaignType === 'trigger';

        if (!name || !frequency) {
            return res.status(400).json({ message: 'name and frequency are required.' });
        }

        if (isTrigger) {
            if (!triggerType || !['registration', 'course_enrollment', 'course_completion'].includes(triggerType)) {
                return res.status(400).json({ message: 'triggerType is required for trigger campaigns.' });
            }
            if ((triggerType === 'course_enrollment' || triggerType === 'course_completion') && !triggerCourseId) {
                return res.status(400).json({ message: 'triggerCourseId is required for course enrollment/completion triggers.' });
            }
            if (frequency === 'one_time') {
                return res.status(400).json({ message: 'Trigger campaigns cannot use one-time frequency.' });
            }
        }

        if (!recipientGroup) {
            return res.status(400).json({ message: 'recipientGroup is required.' });
        }
        const validRecipientGroups = ['all_users', 'organization'];
        if (!validRecipientGroups.includes(recipientGroup)) {
            return res.status(400).json({ message: 'Invalid recipientGroup.' });
        }

        const validFrequencies = ['one_time', 'weekly', 'biweekly', 'monthly'];
        if (!validFrequencies.includes(frequency)) {
            return res.status(400).json({ message: 'Invalid frequency.' });
        }

        const now = new Date();
        const newCampaign: Omit<DBNewsletterCampaign, 'id'> = {
            academyId: user.academyId,
            name: sanitizeText(name),
            campaignType: isTrigger ? 'trigger' : 'scheduled',
            triggerType: isTrigger ? triggerType : undefined,
            triggerCourseId: isTrigger && (triggerType === 'course_enrollment' || triggerType === 'course_completion') ? triggerCourseId : undefined,
            recipientGroup,
            recipientFilter: recipientFilter || undefined,
            frequency,
            scheduledDay: scheduledDay ?? undefined,
            scheduledTime: scheduledTime ?? undefined,
            timezone: timezone ?? undefined,
            status: 'active',
            autoCreateNextDraft: isTrigger ? false : (autoCreateNextDraft ?? true),
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await newsletterCampaignsCollection.add(newCampaign);
        const created = { id: docRef.id, ...newCampaign };
        res.status(201).json(created);
    } catch (error) {
        logger.error('Error creating campaign:', error);
        res.status(500).json({ message: 'Failed to create campaign.' });
    }
};

// PUT /marketing/campaigns/:id
export const updateCampaign = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { id } = req.params;
    try {
        const doc = await newsletterCampaignsCollection.doc(id).get();
        if (!doc.exists || doc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        const {
            name,
            campaignType,
            triggerType,
            triggerCourseId,
            recipientGroup,
            recipientFilter,
            frequency,
            scheduledDay,
            scheduledTime,
            timezone,
            autoCreateNextDraft,
        } = req.body;

        const updates: Partial<DBNewsletterCampaign> = { updatedAt: new Date() };
        if (name !== undefined) updates.name = sanitizeText(name);
        if (campaignType !== undefined) updates.campaignType = campaignType;
        if (triggerType !== undefined) updates.triggerType = triggerType;
        if (triggerCourseId !== undefined) updates.triggerCourseId = triggerCourseId;
        if (recipientGroup !== undefined) updates.recipientGroup = recipientGroup;
        if (recipientFilter !== undefined) updates.recipientFilter = recipientFilter;
        if (frequency !== undefined) updates.frequency = frequency;
        if (scheduledDay !== undefined) updates.scheduledDay = scheduledDay;
        if (scheduledTime !== undefined) updates.scheduledTime = scheduledTime;
        if (timezone !== undefined) updates.timezone = timezone;
        if (autoCreateNextDraft !== undefined) updates.autoCreateNextDraft = autoCreateNextDraft;

        await newsletterCampaignsCollection.doc(id).update(updates);
        const updated = snapshotToData<DBNewsletterCampaign>(await newsletterCampaignsCollection.doc(id).get());
        res.json(updated);
    } catch (error) {
        logger.error('Error updating campaign:', error);
        res.status(500).json({ message: 'Failed to update campaign.' });
    }
};

// PUT /marketing/campaigns/:id/status
export const updateCampaignStatus = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { id } = req.params;
    try {
        const doc = await newsletterCampaignsCollection.doc(id).get();
        if (!doc.exists || doc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        const { status } = req.body;
        const validStatuses = ['active', 'paused', 'archived'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be active, paused, or archived.' });
        }

        await newsletterCampaignsCollection.doc(id).update({ status, updatedAt: new Date() });
        res.json({ id, status });
    } catch (error) {
        logger.error('Error updating campaign status:', error);
        res.status(500).json({ message: 'Failed to update campaign status.' });
    }
};

// DELETE /marketing/campaigns/:id
export const deleteCampaign = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { id } = req.params;
    try {
        const doc = await newsletterCampaignsCollection.doc(id).get();
        if (!doc.exists || doc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        await newsletterCampaignsCollection.doc(id).delete();
        res.status(204).send();
    } catch (error) {
        logger.error('Error deleting campaign:', error);
        res.status(500).json({ message: 'Failed to delete campaign.' });
    }
};

// ─── EDITION HANDLERS ────────────────────────────────────────────────────────

// GET /marketing/campaigns/:campaignId/editions
export const getEditions = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId } = req.params;
    try {
        const campaignDoc = await newsletterCampaignsCollection.doc(campaignId).get();
        if (!campaignDoc.exists || campaignDoc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        const snap = await newsletterEditionsCollection
            .where('campaignId', '==', campaignId)
            .where('academyId', '==', user.academyId)
            .orderBy('createdAt', 'desc')
            .get();

        res.json(querySnapshotToArray<DBNewsletterEdition>(snap));
    } catch (error) {
        logger.error('Error fetching editions:', error);
        res.status(500).json({ message: 'Failed to fetch editions.' });
    }
};

// POST /marketing/campaigns/:campaignId/editions
export const createEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId } = req.params;
    try {
        const campaignDoc = await newsletterCampaignsCollection.doc(campaignId).get();
        if (!campaignDoc.exists || campaignDoc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        const campaignData = campaignDoc.data() as DBNewsletterCampaign;
        const isTrigger = campaignData.campaignType === 'trigger';

        const { subject, htmlContent, scheduledFor, title, subtitle, mainText, showLogoInHeader } = req.body;

        // For trigger campaigns, auto-assign order as max existing order + 1
        let order: number | undefined;
        if (isTrigger) {
            const existingSnap = await newsletterEditionsCollection
                .where('campaignId', '==', campaignId)
                .get();
            const existingEditions = querySnapshotToArray<DBNewsletterEdition>(existingSnap);
            const maxOrder = existingEditions.reduce((max, e) => Math.max(max, e.order ?? 0), 0);
            order = maxOrder + 1;
        }

        const now = new Date();
        const newEdition: Omit<DBNewsletterEdition, 'id'> = {
            campaignId,
            academyId: user.academyId,
            subject: sanitizeText(subject ?? ''),
            htmlContent: sanitizeNewsletterHtml(htmlContent ?? ''),
            title: sanitizeText(title ?? ''),
            subtitle: sanitizeText(subtitle ?? ''),
            mainText: sanitizeText(mainText ?? ''),
            showLogoInHeader: !!showLogoInHeader,
            status: 'draft',
            scheduledFor: isTrigger ? undefined : (scheduledFor ? new Date(scheduledFor) : undefined),
            order,
            totalRecipients: 0,
            successCount: 0,
            failCount: 0,
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await newsletterEditionsCollection.add(newEdition);
        res.status(201).json({ id: docRef.id, ...newEdition });
    } catch (error) {
        logger.error('Error creating edition:', error);
        res.status(500).json({ message: 'Failed to create edition.' });
    }
};

// GET /marketing/campaigns/:campaignId/editions/:id
export const getEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const doc = await newsletterEditionsCollection.doc(id).get();
        const data = doc.data();
        if (!doc.exists || data?.academyId !== user.academyId || data?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }
        res.json(snapshotToData<DBNewsletterEdition>(doc));
    } catch (error) {
        logger.error('Error fetching edition:', error);
        res.status(500).json({ message: 'Failed to fetch edition.' });
    }
};

// PUT /marketing/campaigns/:campaignId/editions/:id
export const updateEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const doc = await newsletterEditionsCollection.doc(id).get();
        const data = doc.data();
        if (!doc.exists || data?.academyId !== user.academyId || data?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }
        if (data?.status === 'sent' || data?.status === 'sending') {
            return res.status(400).json({ message: 'Cannot edit an edition that is sent or sending.' });
        }

        const { subject, htmlContent, scheduledFor, title, subtitle, mainText, status, showLogoInHeader } = req.body;
        const updates: Partial<DBNewsletterEdition> = { updatedAt: new Date() };
        if (subject !== undefined) updates.subject = sanitizeText(subject);
        if (htmlContent !== undefined) updates.htmlContent = sanitizeNewsletterHtml(htmlContent);
        if (scheduledFor !== undefined) updates.scheduledFor = scheduledFor ? new Date(scheduledFor) : undefined;
        if (title !== undefined) updates.title = sanitizeText(title);
        if (subtitle !== undefined) updates.subtitle = sanitizeText(subtitle);
        if (mainText !== undefined) updates.mainText = sanitizeText(mainText);
        if (showLogoInHeader !== undefined) updates.showLogoInHeader = !!showLogoInHeader;

        // Manual status transitions only: draft ↔ scheduled (Final)
        if (status === 'draft' || status === 'scheduled') {
            updates.status = status;
        }

        await newsletterEditionsCollection.doc(id).update(updates);
        const updated = snapshotToData<DBNewsletterEdition>(await newsletterEditionsCollection.doc(id).get());
        res.json(updated);
    } catch (error) {
        logger.error('Error updating edition:', error);
        res.status(500).json({ message: 'Failed to update edition.' });
    }
};

// DELETE /marketing/campaigns/:campaignId/editions/:id
export const deleteEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const doc = await newsletterEditionsCollection.doc(id).get();
        const data = doc.data();
        if (!doc.exists || data?.academyId !== user.academyId || data?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }
        if (data?.status !== 'draft') {
            return res.status(400).json({ message: 'Only draft editions can be deleted.' });
        }
        await newsletterEditionsCollection.doc(id).delete();
        res.status(204).send();
    } catch (error) {
        logger.error('Error deleting edition:', error);
        res.status(500).json({ message: 'Failed to delete edition.' });
    }
};

// POST /marketing/campaigns/:campaignId/editions/:id/duplicate
export const duplicateEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const doc = await newsletterEditionsCollection.doc(id).get();
        const data = doc.data();
        if (!doc.exists || data?.academyId !== user.academyId || data?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }

        const { scheduledFor } = req.body ?? {};

        // For trigger campaigns, auto-assign order at the end
        const campaignDoc2 = await newsletterCampaignsCollection.doc(campaignId).get();
        const campaignData2 = campaignDoc2.data() as DBNewsletterCampaign | undefined;
        const isTriggerDup = campaignData2?.campaignType === 'trigger';
        let dupOrder: number | undefined;
        if (isTriggerDup) {
            const existingSnap = await newsletterEditionsCollection.where('campaignId', '==', campaignId).get();
            const existingEditions = querySnapshotToArray<DBNewsletterEdition>(existingSnap);
            dupOrder = existingEditions.reduce((max, e) => Math.max(max, e.order ?? 0), 0) + 1;
        }

        const now = new Date();
        const duplicate: Omit<DBNewsletterEdition, 'id'> = {
            campaignId,
            academyId: user.academyId,
            subject: `${data?.subject ?? ''} (Copy)`,
            htmlContent: data?.htmlContent ?? '',
            title: `${data?.title ?? ''} (Copy)`,
            subtitle: data?.subtitle ?? '',
            mainText: data?.mainText ?? '',
            status: 'draft',
            scheduledFor: isTriggerDup ? undefined : (scheduledFor ? new Date(scheduledFor) : undefined),
            order: dupOrder,
            totalRecipients: 0,
            successCount: 0,
            failCount: 0,
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await newsletterEditionsCollection.add(duplicate);
        res.status(201).json({ id: docRef.id, ...duplicate });
    } catch (error) {
        logger.error('Error duplicating edition:', error);
        res.status(500).json({ message: 'Failed to duplicate edition.' });
    }
};

// POST /marketing/campaigns/:campaignId/editions/:id/test-send
export const testSendEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const [editionDoc, adminDoc] = await Promise.all([
            newsletterEditionsCollection.doc(id).get(),
            usersCollection.doc(user.id).get(),
        ]);

        const editionData = editionDoc.data();
        if (!editionDoc.exists || editionData?.academyId !== user.academyId || editionData?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }

        const adminData = snapshotToData<DBUser>(adminDoc);
        if (!adminData?.email) {
            return res.status(400).json({ message: 'Admin email not found.' });
        }

        const academyDoc = await academiesCollection.doc(user.academyId).get();
        const academyName = academyDoc.data()?.name ?? 'Your Academy';

        // Build HTML from template if edition has structured fields, otherwise fall back to raw htmlContent
        const theme = await getAcademyTheme(user.academyId, academyName);
        const rawSubject = editionData?.title || editionData?.subject || '(No subject)';
        const testRecipient = { name: adminData.name || adminData.email, organizationName: '' };
        const emailSubject = replaceVariables(rawSubject, testRecipient, academyName);
        const html = editionData?.title
            ? buildNewsletterHtml(
                { title: editionData.title, subtitle: editionData.subtitle ?? '', mainText: editionData.mainText ?? '', showLogoInHeader: editionData.showLogoInHeader },
                theme,
                { email: adminData.email, name: adminData.name || adminData.email, organizationName: '', campaignId }
              )
            : editionData?.htmlContent ?? '';

        const result = await sendNewsletterEmail(
            adminData.email,
            `[TEST] ${emailSubject}`,
            html,
            academyName
        );

        if (!result.success) {
            return res.status(500).json({ message: 'Failed to send test email.' });
        }
        res.json({ message: `Test email sent to ${adminData.email}` });
    } catch (error) {
        logger.error('Error sending test email:', error);
        res.status(500).json({ message: 'Failed to send test email.' });
    }
};

// POST /marketing/campaigns/:campaignId/editions/:id/send
export const sendEditionNow = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const [editionDoc, campaignDoc, academyDoc] = await Promise.all([
            newsletterEditionsCollection.doc(id).get(),
            newsletterCampaignsCollection.doc(campaignId).get(),
            academiesCollection.doc(user.academyId).get(),
        ]);

        const editionData = editionDoc.data();
        if (!editionDoc.exists || editionData?.academyId !== user.academyId || editionData?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }
        if (editionData?.status === 'sent' || editionData?.status === 'sending') {
            return res.status(400).json({ message: 'Edition has already been sent.' });
        }
        if (editionData?.status === 'draft') {
            return res.status(400).json({ message: 'Please save the edition as "Final" before sending.' });
        }

        const campaignData = snapshotToData<DBNewsletterCampaign>(campaignDoc);
        if (!campaignData) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        if (campaignData.campaignType === 'trigger') {
            return res.status(400).json({ message: 'Trigger campaign editions are sent automatically and cannot be sent manually.' });
        }

        const academyName = academyDoc.data()?.name ?? 'Your Academy';

        // Mark as sending
        await newsletterEditionsCollection.doc(id).update({ status: 'sending', updatedAt: new Date() });

        const recipients = await resolveRecipients(campaignData);
        const rawSubject = editionData?.title || editionData?.subject || '(No subject)';
        // Build HTML from template if edition has structured fields
        const theme = await getAcademyTheme(user.academyId, academyName);
        const editionFields = {
            title: editionData?.title ?? '',
            subtitle: editionData?.subtitle ?? '',
            mainText: editionData?.mainText ?? '',
            showLogoInHeader: editionData?.showLogoInHeader,
        };
        const useTemplate = !!editionData?.title;

        let successCount = 0;
        let failCount = 0;
        const BATCH_SIZE = 50;

        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const batch = recipients.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async r => {
                    const subject = replaceVariables(rawSubject, { name: r.name, organizationName: r.organizationName }, academyName);
                    const html = useTemplate
                        ? buildNewsletterHtml(editionFields, theme, { email: r.email, name: r.name, organizationName: r.organizationName, campaignId })
                        : editionData?.htmlContent ?? '';
                    const result = await sendNewsletterEmail(r.email, subject, html, academyName);
                    if (result.success) successCount++;
                    else failCount++;
                })
            );
            // 2-second pause between batches (not for last batch)
            if (i + BATCH_SIZE < recipients.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        const sentAt = new Date();
        await newsletterEditionsCollection.doc(id).update({
            status: 'sent',
            sentAt,
            totalRecipients: recipients.length,
            successCount,
            failCount,
            updatedAt: sentAt,
        });

        // Auto-create next draft if enabled
        if (campaignData.autoCreateNextDraft && campaignData.frequency !== 'one_time') {
            const nextDate = calcNextScheduledFor(campaignData, sentAt);
            if (nextDate) {
                await newsletterEditionsCollection.add({
                    campaignId,
                    academyId: user.academyId,
                    subject: '',
                    htmlContent: '',
                    title: '',
                    subtitle: '',
                    mainText: '',
                    status: 'draft',
                    scheduledFor: nextDate,
                    totalRecipients: 0,
                    successCount: 0,
                    failCount: 0,
                    createdBy: user.id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
        }

        res.json({ totalRecipients: recipients.length, successCount, failCount });
    } catch (error) {
        logger.error('Error sending edition:', error);
        // Mark as failed if we errored out
        try {
            await newsletterEditionsCollection.doc(req.params.id).update({ status: 'failed', updatedAt: new Date() });
        } catch { /* ignore secondary error */ }
        res.status(500).json({ message: 'Failed to send edition.' });
    }
};

// POST /marketing/campaigns/:campaignId/editions/preview-html
export const previewEditionHtml = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const { title, subtitle, mainText, showLogoInHeader } = req.body;
        const [academyDoc, adminDoc] = await Promise.all([
            academiesCollection.doc(user.academyId).get(),
            usersCollection.doc(user.id).get(),
        ]);
        const academyName = academyDoc.data()?.name ?? 'Your Academy';
        const adminData = snapshotToData<DBUser>(adminDoc);
        const theme = await getAcademyTheme(user.academyId, academyName);
        const html = buildNewsletterHtml(
            { title: title ?? '', subtitle: subtitle ?? '', mainText: mainText ?? '', showLogoInHeader: !!showLogoInHeader },
            theme,
            { email: adminData?.email ?? 'user@example.com', name: adminData?.name ?? 'John Doe', organizationName: 'My Organization', campaignId: req.params.campaignId }
        );
        res.json({ html });
    } catch (error) {
        logger.error('Error building preview:', error);
        res.status(500).json({ message: 'Failed to build preview.' });
    }
};

// POST /marketing/campaigns/:campaignId/editions/ai-generate
export const aiGenerateEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId } = req.params;
    try {
        const campaignDoc = await newsletterCampaignsCollection.doc(campaignId).get();
        if (!campaignDoc.exists || campaignDoc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }

        const { conversationHistory, currentEdition, userMessage } = req.body;
        if (!userMessage) {
            return res.status(400).json({ message: 'userMessage is required.' });
        }

        const campaign = snapshotToData<DBNewsletterCampaign>(campaignDoc)!;

        // Fetch last 5 sent editions for context
        const previousEditionsSnap = await newsletterEditionsCollection
            .where('campaignId', '==', campaignId)
            .where('status', '==', 'sent')
            .orderBy('sentAt', 'desc')
            .limit(5)
            .get();
        const previousEditions = querySnapshotToArray<DBNewsletterEdition>(previousEditionsSnap);

        const previousContext = previousEditions.length > 0
            ? `Previous editions sent in this campaign (most recent first):\n${previousEditions.map((ed, i) => `${i + 1}. Title: "${ed.title || ed.subject}"`).join('\n')}`
            : 'This is the first edition in this campaign.';

        const recipientDesc: Record<string, string> = {
            all_users: 'all users in the academy',
            organization: 'members of a specific organization',
            course_enrolled: 'users enrolled in a specific course',
            course_completed: 'users who completed a specific course',
        };

        const systemInstruction = `You are an expert email newsletter writer helping an academy admin create professional newsletter content.

Campaign: "${campaign.name}"
Recipients: ${recipientDesc[campaign.recipientGroup] ?? campaign.recipientGroup}
${previousContext}

Current draft state:
- Title: "${currentEdition?.title ?? ''}"
- Subtitle: "${currentEdition?.subtitle ?? ''}"
- Main Text: "${currentEdition?.mainText ?? ''}"

The newsletter has 3 content fields (design/layout is handled separately):
- "title": The main headline (also used as the email subject line). Keep concise and compelling.
- "subtitle": A secondary heading or tagline below the title. Optional but recommended.
- "mainText": The body content as plain text. Use line breaks for paragraphs. No HTML needed.

Personalization variables (use these in title, subtitle, or mainText when appropriate):
- {user_name} — replaced with the recipient's name
- {academy_name} — replaced with the academy name
- {organization_name} — replaced with the recipient's organization name
Use these variables to make the content feel personal. For example, start with "Hi {user_name}," or reference "{academy_name}" when mentioning the academy.

Your task:
1. Help the admin write great newsletter content based on their description.
2. Write clear, professional, and engaging text appropriate for the audience.
3. Maintain consistent tone with previous editions when they exist.
4. The mainText should be well-structured plain text with paragraph breaks (double newlines).
5. Use personalization variables where it makes sense to create a personal touch.

Return ONLY valid JSON with these fields:
{
  "updatedEdition": { "title": "...", "subtitle": "...", "mainText": "..." },
  "aiResponse": "Natural language response to the user explaining what you did or asking a follow-up question"
}`;

        const ai = getAi();
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
            },
            history: (conversationHistory ?? []).map((m: { role: string; text: string }) => ({
                role: m.role,
                parts: [{ text: m.text }],
            })),
        });

        const result = await chat.sendMessage({ message: userMessage });
        const responseText = result.text;
        if (!responseText) throw new Error('Empty response from AI');

        const parsed = JSON.parse(responseText);
        res.json(parsed);
    } catch (error) {
        logger.error('Error in aiGenerateEdition:', error);
        res.status(500).json({ message: 'Failed to generate edition content.' });
    }
};

// PUT /marketing/campaigns/:campaignId/editions/:id/reorder
export const reorderEdition = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { campaignId, id } = req.params;
    try {
        const [campaignDoc, editionDoc] = await Promise.all([
            newsletterCampaignsCollection.doc(campaignId).get(),
            newsletterEditionsCollection.doc(id).get(),
        ]);

        const campaignData = campaignDoc.exists ? campaignDoc.data() as DBNewsletterCampaign : null;
        if (!campaignData || campaignData.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Campaign not found.' });
        }
        if (campaignData.campaignType !== 'trigger') {
            return res.status(400).json({ message: 'Reordering is only available for trigger campaigns.' });
        }

        const editionData = editionDoc.data();
        if (!editionDoc.exists || editionData?.campaignId !== campaignId) {
            return res.status(404).json({ message: 'Edition not found.' });
        }
        if (editionData?.status === 'sent' || editionData?.status === 'sending') {
            return res.status(400).json({ message: 'Cannot reorder sent or sending editions.' });
        }

        const { direction } = req.body;
        if (direction !== 'up' && direction !== 'down') {
            return res.status(400).json({ message: 'direction must be "up" or "down".' });
        }

        const currentOrder = editionData?.order ?? 0;

        // Fetch all editions for this campaign to find the neighbor
        const allSnap = await newsletterEditionsCollection
            .where('campaignId', '==', campaignId)
            .get();
        const allEditions = querySnapshotToArray<DBNewsletterEdition>(allSnap)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const currentIdx = allEditions.findIndex(e => e.id === id);
        const neighborIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;

        if (neighborIdx < 0 || neighborIdx >= allEditions.length) {
            return res.status(400).json({ message: `Cannot move ${direction}; already at the ${direction === 'up' ? 'top' : 'bottom'}.` });
        }

        const neighbor = allEditions[neighborIdx];
        const neighborOrder = neighbor.order ?? 0;

        // Swap order values
        const now = new Date();
        await Promise.all([
            newsletterEditionsCollection.doc(id).update({ order: neighborOrder, updatedAt: now }),
            newsletterEditionsCollection.doc(neighbor.id).update({ order: currentOrder, updatedAt: now }),
        ]);

        // Return all editions sorted by new order
        const updatedSnap = await newsletterEditionsCollection
            .where('campaignId', '==', campaignId)
            .get();
        const updatedEditions = querySnapshotToArray<DBNewsletterEdition>(updatedSnap)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        res.json(updatedEditions);
    } catch (error) {
        logger.error('Error reordering edition:', error);
        res.status(500).json({ message: 'Failed to reorder edition.' });
    }
};

// POST /marketing/unsubscribe (public — no auth required)
export const unsubscribe = async (req: Request, res: Response) => {
    try {
        const email = (req.query.email as string)?.trim();
        const campaignId = (req.query.campaignId as string)?.trim();

        if (!email || !campaignId) {
            return res.status(400).json({ message: 'email and campaignId are required.' });
        }

        // Check if already unsubscribed
        const existing = await unsubscriptionsCollection
            .where('email', '==', email)
            .where('campaignId', '==', campaignId)
            .limit(1)
            .get();

        if (existing.empty) {
            await unsubscriptionsCollection.add({
                email,
                campaignId,
                createdAt: new Date(),
            });
        }

        res.json({ message: 'Successfully unsubscribed.' });
    } catch (error) {
        logger.error('Error processing unsubscribe:', error);
        res.status(500).json({ message: 'Failed to process unsubscribe request.' });
    }
};
