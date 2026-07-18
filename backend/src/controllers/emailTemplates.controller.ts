import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import sanitizeHtml from 'sanitize-html';
import { emailTemplatesCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';
import { DBEmailTemplate } from '../types/index.js';
import { sendTestEmailFromTemplate } from '../services/email.service.js';

// ---------------------------------------------------------------------------
// Default templates — used to auto-seed Firestore on first GET if missing
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATES: Omit<DBEmailTemplate, 'updatedAt' | 'updatedBy'>[] = [
    {
        id: 'email_verification',
        name: 'Email Verification',
        description: 'Sent to new users to verify their email address before they can log in.',
        subject: 'Verify Your Email for {{organizationName}}',
        variables: ['userName', 'organizationName', 'verificationLink'],
        html: `<p>Hello {{userName}},</p>
<p>Welcome! Before you can log in, please verify your email address by clicking the button below. This link is valid for 24 hours.</p>
<p><a href="{{verificationLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Verify My Email</a></p>
<p>If you did not create an account, you can safely ignore this email.</p>
<p>Thanks,<br/>The {{organizationName}} Team</p>`,
    },
    {
        id: 'invite_organization_admin',
        name: 'Organization Admin Invitation',
        description: 'Sent by a system admin when a new Organization Admin is invited to set up their account. Kept app-branded (not organization-branded) since the recipient has no organization yet.',
        subject: "You've been invited as an Organization Admin for {{organizationName}}",
        variables: ['userName', 'organizationName', 'verificationLink'],
        html: `<p>Hello {{userName}},</p>
<p>You've been invited to join <strong>{{organizationName}}</strong> as an Organization Admin. Please set up your account by verifying your email address below. This link is valid for 24 hours.</p>
<p><a href="{{verificationLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Verify My Email</a></p>
<p>If you did not expect this invitation, you can safely ignore this email.</p>
<p>Thanks,<br/>The Logyx Team</p>`,
    },
    {
        id: 'notify_organization_admin',
        name: 'Organization Admin Access Notification',
        description: 'Sent when an existing user is promoted to Organization Admin.',
        subject: "You've been invited as an Organization Admin for {{organizationName}}",
        variables: ['userName', 'organizationName', 'loginLink'],
        html: `<p>Hello {{userName}},</p>
<p>You've been added to <strong>{{organizationName}}</strong> as an Organization Admin. You can now log in and manage this organization.</p>
<p><a href="{{loginLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Login to {{organizationName}}</a></p>
<p>If you did not expect this invitation, you can safely ignore this email.</p>
<p>Thanks,<br/>The {{organizationName}} Team</p>`,
    },
    {
        id: 'invite_org_manager',
        name: 'Organization Manager Invitation',
        description: 'Sent when a new Organization Manager is invited to set up their account.',
        subject: "You've been invited as an Organization Manager for {{entityName}}",
        variables: ['userName', 'entityName', 'verificationLink'],
        html: `<p>Hello {{userName}},</p>
<p>You've been invited to join <strong>{{entityName}}</strong> as an Organization Manager. Please set up your account by verifying your email address below. This link is valid for 24 hours.</p>
<p><a href="{{verificationLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Verify My Email</a></p>
<p>If you did not expect this invitation, you can safely ignore this email.</p>
<p>Thanks,<br/>The {{entityName}} Team</p>`,
    },
    {
        id: 'approval_request',
        name: 'Approval Request (to Manager)',
        description: "Sent to an organization manager when a new user registers and awaits approval.",
        subject: 'New User Registration Request: {{newUserName}}',
        variables: ['newUserName', 'newUserEmail', 'approvalLink'],
        html: `<p>Hello,</p>
<p>A new user, <strong>{{newUserName}}</strong> (<em>{{newUserEmail}}</em>), has registered and is awaiting your approval.</p>
<p>Please review their request and click the link below to approve their account. This link will expire in 48 hours.</p>
<p><a href="{{approvalLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Approve User</a></p>
<p>If you do not recognize this request, you can safely ignore this email.</p>
<p>Thanks,<br/>The Logyx Team</p>`,
    },
    {
        id: 'account_approved',
        name: 'Account Approved',
        description: 'Sent to a user when an organization manager approves their account.',
        subject: 'Your Account Has Been Approved!',
        variables: ['userName', 'loginLink'],
        html: `<p>Hello {{userName}},</p>
<p>Great news! Your account for Logyx has been approved by your organization's administrator.</p>
<p>You can now log in and start using the application.</p>
<p><a href="{{loginLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Log In Now</a></p>
<p>Welcome aboard!</p>
<p>Thanks,<br/>The Logyx Team</p>`,
    },
    {
        id: 'password_reset',
        name: 'Password Reset',
        description: "Sent when a user requests a password reset.",
        subject: 'Reset Your Password for {{organizationName}}',
        variables: ['userName', 'organizationName', 'resetLink'],
        html: `<p>Hello {{userName}},</p>
<p>We received a request to reset your password for <strong>{{organizationName}}</strong>. Please click the button below to set a new password. This link is valid for 24 hours and can only be used once.</p>
<p><a href="{{resetLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Reset Password</a></p>
<p>If you did not request a password reset, you can safely ignore this email.</p>
<p>Thanks,<br/>The {{organizationName}} Team</p>`,
    },
    {
        id: 'usage_alert',
        name: 'Token Usage Alert',
        description: 'Sent to organization admins when AI token usage reaches a high threshold (75% or 95%).',
        subject: 'Usage Alert for {{organizationName}}',
        variables: ['organizationName', 'usagePercentage', 'warningLevel'],
        html: `<p>Hello,</p>
<p>This is a <strong>{{warningLevel}}</strong> notification that your organization, <strong>{{organizationName}}</strong>, has reached <strong>{{usagePercentage}}%</strong> of its monthly AI token usage limit.</p>
<p>If you reach 100%, new AI requests will be paused until the next billing cycle begins.</p>
<p>To prevent service interruption, you can increase your limit by visiting the Billing Settings page in your admin dashboard.</p>
<p>Thanks,<br/>The Logyx Team</p>`,
    },
    {
        id: 'welcome',
        name: 'Welcome Email',
        description: 'Sent after a user successfully verifies their email or completes a payment-based signup.',
        subject: 'Welcome to {{organizationName}}, {{userName}}!',
        variables: ['userName', 'organizationName', 'dashboardLink'],
        html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .header { text-align: center; margin-bottom: 30px; }
    .welcome-text { font-size: 24px; font-weight: bold; color: #1f2937; }
    .content { padding: 0 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><span class="welcome-text">Welcome to {{organizationName}}</span></div>
    <div class="content">
      <p>Hello {{userName}},</p>
      <p>We're excited to have you join us! {{organizationName}} is your new organization for business management.</p>
      <p>Your account is now fully active. You can start exploring your boards, items, and dashboards right away.</p>
      <div class="button-container">
        <a href="{{dashboardLink}}" class="button">Go to Dashboard</a>
      </div>
      <p>If you have any questions or need a hand getting started, we're here to help.</p>
      <p>Best regards,<br/>The {{organizationName}} Team</p>
    </div>
    <div class="footer">&copy; {{currentYear}} {{organizationName}}. All rights reserved.</div>
  </div>
</body>
</html>`,
    },
    {
        id: 'user_invitation',
        name: 'User Invitation',
        description: 'Sent to pre-approved users who have been invited to join an organization.',
        subject: "You've been invited to join {{orgName}}",
        variables: ['orgName', 'organizationName', 'partOfText', 'registrationLink'],
        html: `<p>Hello,</p>
<p>You've been invited to join <strong>{{orgName}}</strong>{{partOfText}}.</p>
<p>To get started, please create your account using the button below. Make sure to sign up with this email address.</p>
<p><a href="{{registrationLink}}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Create My Account</a></p>
<p>If you did not expect this invitation, you can safely ignore this email.</p>
<p>Thanks,<br/>The {{orgName}} Team</p>`,
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureDefaultsExist = async (): Promise<void> => {
    const snapshot = await emailTemplatesCollection.get();
    const existingIds = new Set(snapshot.docs.map(d => d.id));
    const now = new Date();
    const batch = emailTemplatesCollection.firestore.batch();
    let writes = 0;
    // Templates that must always be kept in sync with the latest default (bug fixes, new variables).
    const FORCE_UPDATE_IDS = new Set(['user_invitation', 'invite_organization_admin', 'notify_organization_admin']);

    for (const tpl of DEFAULT_TEMPLATES) {
        if (!existingIds.has(tpl.id) || FORCE_UPDATE_IDS.has(tpl.id)) {
            const docRef = emailTemplatesCollection.doc(tpl.id);
            batch.set(docRef, { ...tpl, updatedAt: now });
            writes++;
        }
    }
    if (writes > 0) {
        await batch.commit();
        logger.info(`Seeded ${writes} missing email template(s) into Firestore.`);
    }
};

// ---------------------------------------------------------------------------
// Controller handlers
// ---------------------------------------------------------------------------

export const getEmailTemplates = async (req: Request, res: Response) => {
    try {
        await ensureDefaultsExist();
        const snapshot = await emailTemplatesCollection.get();
        const templates = snapshot.docs.map(d => snapshotToData(d));
        // Sort to match DEFAULT_TEMPLATES order
        const order = DEFAULT_TEMPLATES.map(t => t.id);
        templates.sort((a, b) => {
            const ai = order.indexOf((a as any).id ?? '');
            const bi = order.indexOf((b as any).id ?? '');
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        res.json(templates);
    } catch (error) {
        logger.error('Error fetching email templates:', error);
        res.status(500).json({ message: 'Failed to fetch email templates.' });
    }
};

export const getEmailTemplate = async (req: Request, res: Response) => {
    const { templateId } = req.params;
    try {
        const doc = await emailTemplatesCollection.doc(templateId).get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Email template not found.' });
        }
        res.json(snapshotToData(doc));
    } catch (error) {
        logger.error(`Error fetching email template ${req.params.templateId}:`, error);
        res.status(500).json({ message: 'Failed to fetch email template.' });
    }
};

export const updateEmailTemplate = async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const { subject, html } = req.body as { subject: string; html: string };
    const requestingUser = (req as any).user;

    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
        return res.status(400).json({ message: 'Subject is required.' });
    }
    if (!html || typeof html !== 'string' || html.trim() === '') {
        return res.status(400).json({ message: 'HTML body is required.' });
    }

    // Allow most HTML/CSS needed for email templates but sanitize script injections
    const sanitizedHtml = sanitizeHtml(html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            'html', 'head', 'body', 'style', 'meta', 'title',
            'table', 'tbody', 'thead', 'tfoot', 'tr', 'th', 'td',
            'img', 'center', 'font',
        ]),
        allowedAttributes: {
            '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing'],
            'a': ['href', 'target', 'rel'],
            'img': ['src', 'alt', 'width', 'height'],
            'meta': ['charset', 'name', 'content', 'http-equiv'],
            'td': ['colspan', 'rowspan'],
            'th': ['colspan', 'rowspan', 'scope'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        disallowedTagsMode: 'discard',
    });

    try {
        const docRef = emailTemplatesCollection.doc(templateId);
        const existing = await docRef.get();
        if (!existing.exists) {
            return res.status(404).json({ message: 'Email template not found.' });
        }

        await docRef.update({
            subject: subject.trim(),
            html: sanitizedHtml,
            updatedAt: new Date(),
            updatedBy: requestingUser?.email ?? 'system',
        });

        const updated = await docRef.get();
        res.json(snapshotToData(updated));
    } catch (error) {
        logger.error(`Error updating email template ${templateId}:`, error);
        res.status(500).json({ message: 'Failed to update email template.' });
    }
};

export const resetEmailTemplate = async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const requestingUser = (req as any).user;

    const defaultTpl = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (!defaultTpl) {
        return res.status(404).json({ message: 'No default template found for this ID.' });
    }

    try {
        const docRef = emailTemplatesCollection.doc(templateId);
        await docRef.set({
            ...defaultTpl,
            updatedAt: new Date(),
            updatedBy: requestingUser?.email ?? 'system',
        });
        const updated = await docRef.get();
        res.json(snapshotToData(updated));
    } catch (error) {
        logger.error(`Error resetting email template ${templateId}:`, error);
        res.status(500).json({ message: 'Failed to reset email template.' });
    }
};

export const sendTestEmail = async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const { toEmail } = req.body as { toEmail: string };

    if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
        return res.status(400).json({ message: 'A valid recipient email address is required.' });
    }

    try {
        const doc = await emailTemplatesCollection.doc(templateId).get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Email template not found.' });
        }
        const template = snapshotToData(doc) as DBEmailTemplate;
        const result = await sendTestEmailFromTemplate(template, toEmail);
        if (result.success) {
            res.json({ message: `Test email sent successfully to ${toEmail}.` });
        } else {
            res.status(500).json({ message: 'Failed to send test email. Check SMTP configuration.' });
        }
    } catch (error) {
        logger.error(`Error sending test email for template ${templateId}:`, error);
        res.status(500).json({ message: 'Failed to send test email.' });
    }
};
