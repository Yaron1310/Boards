import nodemailer from 'nodemailer';
import * as logger from "firebase-functions/logger";
import path from 'path';
import fs from 'fs';
import { emailTemplatesCollection } from '../db/collections.js';
import type { DBEmailTemplate } from '../types/index.js';

let transporter: nodemailer.Transporter | null = null;

const initializeTransporter = () => {
    if (transporter) {
        return;
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
        logger.error("SMTP configuration is missing from environment variables. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS. Email functionality will be disabled.");
        transporter = null;
        return;
    }

    try {
        transporter = nodemailer.createTransport({
            host: host,
            port: port,
            secure: port === 465,
            auth: { user, pass },
        });

        transporter.verify((error) => {
            if (error) {
                logger.error('Nodemailer transporter verification failed. Emails will not be sent.', error);
                transporter = null;
            } else {
                logger.info('Nodemailer transporter is configured and ready to send emails.');
            }
        });
    } catch (error) {
        logger.error('Failed to create nodemailer transporter:', error);
        transporter = null;
    }
};

const isEmailServiceAvailable = (): boolean => transporter !== null;

const ensureTransporter = async () => {
    if (!transporter) {
        initializeTransporter();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

/**
 * Replace all {{variableName}} placeholders in a string with the provided values.
 * Unknown placeholders are left as-is.
 */
export const renderTemplate = (template: string, vars: Record<string, string>): string =>
    Object.entries(vars).reduce(
        (result, [key, value]) => result.split(`{{${key}}}`).join(value),
        template
    );

/**
 * Fetch a template from Firestore. Returns null if not found (caller falls back to hardcoded).
 */
const fetchTemplate = async (templateId: string): Promise<DBEmailTemplate | null> => {
    try {
        const doc = await emailTemplatesCollection.doc(templateId).get();
        if (!doc.exists) return null;
        return doc.data() as DBEmailTemplate;
    } catch (err) {
        logger.warn(`Could not fetch email template "${templateId}" from Firestore — using hardcoded fallback.`, err);
        return null;
    }
};

// ---------------------------------------------------------------------------
// Public: send a test email using a raw template document
// ---------------------------------------------------------------------------

export const sendTestEmailFromTemplate = async (
    template: DBEmailTemplate,
    toEmail: string
): Promise<{ success: boolean; error?: any }> => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;

    // Render with sample values so the admin sees real-ish content
    const sampleVars: Record<string, string> = {};
    for (const v of template.variables ?? []) {
        sampleVars[v] = `[${v}]`;
    }
    const subject = renderTemplate(template.subject, sampleVars);
    const html = renderTemplate(template.html, sampleVars);

    try {
        await transporter!.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: toEmail, subject, html });
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send test email to ${toEmail}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------
// Email sending functions
// ---------------------------------------------------------------------------

export const sendAccountVerificationEmail = async (
    userEmail: string,
    userName: string,
    verificationLink: string,
    academyName: string,
    inviteRole?: 'org_admin' | 'org_manager',
    orgName?: string
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send verification email to ${userEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;

    let templateId: string;
    let vars: Record<string, string>;

    if (inviteRole === 'org_admin') {
        templateId = 'invite_academy_admin';
        vars = { userName, academyName, verificationLink };
    } else if (inviteRole === 'org_manager') {
        templateId = 'invite_org_manager';
        vars = { userName, entityName: orgName || academyName, verificationLink };
    } else {
        templateId = 'email_verification';
        vars = { userName, academyName, verificationLink };
    }

    const tpl = await fetchTemplate(templateId);
    const subject = tpl ? renderTemplate(tpl.subject, vars) : buildFallbackVerificationSubject(inviteRole, academyName, orgName);
    const html = tpl ? renderTemplate(tpl.html, vars) : buildFallbackVerificationHtml(userName, inviteRole, academyName, orgName, verificationLink);

    try {
        await transporter!.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
            text: `Hello ${userName}, please verify your email by visiting this link: ${verificationLink}`,
        });
        logger.info(`Verification email sent successfully to user: ${userEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send verification email to ${userEmail}`, error);
        return { success: false, error };
    }
};

const buildFallbackVerificationSubject = (inviteRole?: string, academyName?: string, orgName?: string): string => {
    if (inviteRole === 'org_admin') return `You've been invited as an Workspace Admin for ${academyName}`;
    if (inviteRole === 'org_manager') return `You've been invited as an Workspace Manager for ${orgName || academyName}`;
    return `Verify Your Email for ${academyName}`;
};

const buildFallbackVerificationHtml = (
    userName: string, inviteRole?: string, academyName?: string, orgName?: string, verificationLink?: string
): string => {
    let introLine: string;
    let ignoreNote: string;
    if (inviteRole === 'org_admin') {
        introLine = `You've been invited to join <strong>${academyName}</strong> as an Workspace Admin. Please set up your account by verifying your email address below. This link is valid for 24 hours.`;
        ignoreNote = 'If you did not expect this invitation, you can safely ignore this email.';
    } else if (inviteRole === 'org_manager') {
        const entityName = orgName || academyName;
        introLine = `You've been invited to join <strong>${entityName}</strong> as an Workspace Manager. Please set up your account by verifying your email address below. This link is valid for 24 hours.`;
        ignoreNote = 'If you did not expect this invitation, you can safely ignore this email.';
    } else {
        introLine = 'Welcome! Before you can log in, please verify your email address by clicking the button below. This link is valid for 24 hours.';
        ignoreNote = 'If you did not create an account, you can safely ignore this email.';
    }
    return `<p>Hello ${userName},</p><p>${introLine}</p><p><a href="${verificationLink}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Verify My Email</a></p><p>${ignoreNote}</p><p>Thanks,<br/>The Gymind Team</p>`;
};

// ---------------------------------------------------------------------------

export const sendApprovalRequestEmail = async (
    managerEmail: string,
    newUser: { name: string; email: string },
    approvalLink: string
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send approval request to ${managerEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const vars = { newUserName: newUser.name, newUserEmail: newUser.email, approvalLink };

    const tpl = await fetchTemplate('approval_request');
    const subject = tpl ? renderTemplate(tpl.subject, vars) : `New User Registration Request: ${newUser.name}`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hello,</p><p>A new user, <strong>${newUser.name}</strong> (<em>${newUser.email}</em>), has registered and is awaiting your approval.</p><p>Please review their request and click the link below to approve their account. This link will expire in 48 hours.</p><p><a href="${approvalLink}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Approve User</a></p><p>If you do not recognize this request, you can safely ignore this email.</p><p>Thanks,<br/>The Gymind Team</p>`;

    try {
        await transporter!.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: managerEmail,
            subject,
            html,
            text: `A new user, ${newUser.name} (${newUser.email}), has registered and is awaiting your approval. Please visit the following link to approve them: ${approvalLink}`,
        });
        logger.info(`Approval request email sent successfully to manager: ${managerEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send approval request email to ${managerEmail}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------

export const sendAccountApprovedEmail = async (userEmail: string, userName: string, loginLink: string) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send account approved email to ${userEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const vars = { userName, loginLink };

    const tpl = await fetchTemplate('account_approved');
    const subject = tpl ? renderTemplate(tpl.subject, vars) : 'Your Account Has Been Approved!';
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hello ${userName},</p><p>Great news! Your account for Gymind has been approved by your workspace's administrator.</p><p>You can now log in and start using the application.</p><p><a href="${loginLink}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Log In Now</a></p><p>Welcome aboard!</p><p>Thanks,<br/>The Gymind Team</p>`;

    try {
        await transporter!.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
            text: `Hello ${userName}, Your account has been approved. You can now log in at: ${loginLink}`,
        });
        logger.info(`Account approved email sent successfully to user: ${userEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send account approved email to ${userEmail}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------

export const sendPasswordResetEmail = async (
    userEmail: string,
    userName: string,
    resetLink: string,
    academyName: string
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send password reset email to ${userEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const vars = { userName, academyName, resetLink };

    const tpl = await fetchTemplate('password_reset');
    const subject = tpl ? renderTemplate(tpl.subject, vars) : `Reset Your Password for ${academyName}`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hello ${userName},</p><p>We received a request to reset your password. Please click the button below to set a new password. This link is valid for 24 hours and can only be used once.</p><p><a href="${resetLink}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Reset Password</a></p><p>If you did not request a password reset, you can safely ignore this email.</p><p>Thanks,<br/>The Gymind Team</p>`;

    try {
        await transporter!.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
            text: `Hello ${userName}, please reset your password by visiting this link: ${resetLink}`,
        });
        logger.info(`Password reset email sent successfully to user: ${userEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send password reset email to ${userEmail}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------

export const sendUsageNotificationEmail = async (
    adminEmails: string[],
    academyName: string,
    usagePercentage: number
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send usage notification for ${academyName} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }
    if (adminEmails.length === 0) {
        return { success: false, error: 'No admin emails provided.' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const warningLevel = usagePercentage >= 95 ? 'critical' : 'high';
    const vars = { academyName, usagePercentage: String(usagePercentage), warningLevel };

    const tpl = await fetchTemplate('usage_alert');
    const subject = tpl ? renderTemplate(tpl.subject, vars) : `Usage Alert for ${academyName}`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hello,</p><p>This is a notification that your workspace, <strong>${academyName}</strong>, has reached ${usagePercentage}% of its monthly AI token usage limit.</p><p>This is a ${warningLevel} alert. If you reach 100%, new AI requests will be paused until the next billing cycle begins.</p><p>To prevent service interruption, you can increase your limit for the current month by visiting the Billing Settings page in your admin dashboard.</p><p>Thanks,<br/>The Gymind Team</p>`;

    try {
        await transporter!.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: adminEmails.join(','),
            subject,
            html,
            text: `Your workspace, ${academyName}, has reached ${usagePercentage}% of its monthly AI token usage limit. Please visit your dashboard to manage your billing.`,
        });
        logger.info(`Usage notification email sent successfully to admins of ${academyName}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send usage notification email for ${academyName}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------

export const sendWelcomeEmail = async (userEmail: string, userName: string) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send welcome email to ${userEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const frontendUrl = process.env.FRONTEND_URL || 'https://studio.gymind.app';
    const logoPath = path.join(process.cwd(), 'src', 'assets', 'email_logo.png');
    const hasLogo = fs.existsSync(logoPath);

    const vars = {
        userName,
        dashboardLink: `${frontendUrl}/login`,
        currentYear: String(new Date().getFullYear()),
    };

    const tpl = await fetchTemplate('welcome');
    const subject = tpl ? renderTemplate(tpl.subject, vars) : `Welcome to Gymind, ${userName}!`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : buildFallbackWelcomeHtml(userName, frontendUrl, hasLogo);

    try {
        const mailOptions: nodemailer.SendMailOptions = {
            from: `"${fromName}" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
            text: `Welcome to Gymind, ${userName}! Your account is now active. Log in at ${frontendUrl}/login`,
        };
        if (!tpl && hasLogo) {
            mailOptions.attachments = [{ filename: 'logo.png', path: logoPath, cid: 'logo' }];
        }
        await transporter!.sendMail(mailOptions);
        logger.info(`Welcome email sent successfully to user: ${userEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send welcome email to ${userEmail}`, error);
        return { success: false, error };
    }
};

const buildFallbackWelcomeHtml = (userName: string, frontendUrl: string, hasLogo: boolean): string => `
    <!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}
    .container{max-width:600px;margin:20px auto;padding:20px;border:1px solid #e5e7eb;border-radius:8px}
    .header{display:flex;align-items:center;justify-content:center;margin-bottom:30px;gap:10px}
    .logo{max-width:120px;height:auto;vertical-align:middle}
    .welcome-text{font-size:24px;font-weight:bold;color:#1f2937;margin:0}
    .content{padding:0 20px}
    .footer{text-align:center;margin-top:30px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:20px}
    .button-container{text-align:center;margin:30px 0}
    .button{background-color:#2563eb;color:#ffffff!important;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block}
    </style></head><body><div class="container">
    <div class="header"><span class="welcome-text">Welcome to</span>
    ${hasLogo ? '<img src="cid:logo" alt="Gymind Logo" class="logo">' : '<span class="welcome-text" style="color:#2563eb;">Gymind</span>'}</div>
    <div class="content"><p>Hello ${userName},</p>
    <p>We're excited to have you join us! Gymind is a new space to learn, grow, and transform.</p>
    <p>Your account is now fully active. You can start exploring our AI-powered mentors, courses, and more right away.</p>
    <div class="button-container"><a href="${frontendUrl}/login" class="button">Go to Dashboard</a></div>
    <p>If you have any questions or need a hand getting started, we're here to help.</p>
    <p>Best regards,<br/>The Gymind Team</p></div>
    <div class="footer">&copy; ${new Date().getFullYear()} Gymind. All rights reserved.</div>
    </div></body></html>`;

// ---------------------------------------------------------------------------

export const sendNewsletterEmail = async (
    to: string,
    subject: string,
    htmlContent: string,
    academyName: string
): Promise<{ success: boolean; error?: any }> => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send newsletter email to ${to} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || academyName;
    const fromEmail = process.env.SMTP_USER!;

    try {
        await transporter!.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html: htmlContent, text: `Newsletter from ${academyName}: ${subject}` });
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send newsletter email to ${to}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------

export const retryEmailServiceInitialization = () => {
    logger.info('Retrying email service initialization...');
    transporter = null;
    initializeTransporter();
};

// ---------------------------------------------------------------------------

export const sendWoocommerceWelcomeEmail = async (
    userEmail: string,
    userName: string,
    academyName: string,
    isNewUser: boolean
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send WooCommerce welcome email to ${userEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const frontendUrl = process.env.FRONTEND_URL || 'https://studio.gymind.app';
    const logoPath = path.join(process.cwd(), 'src', 'assets', 'email_logo.png');
    const hasLogo = fs.existsSync(logoPath);

    const templateId = isNewUser ? 'woocommerce_welcome_new' : 'woocommerce_welcome_existing';
    const vars: Record<string, string> = {
        userName,
        academyName,
        currentYear: String(new Date().getFullYear()),
        ...(isNewUser
            ? { registrationLink: `${frontendUrl}/register`, userEmail }
            : { loginLink: `${frontendUrl}/login` }),
    };

    const tpl = await fetchTemplate(templateId);
    const subject = tpl ? renderTemplate(tpl.subject, vars) : `Welcome to ${academyName} — Get Started Now`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : buildFallbackWoocommerceHtml(userName, academyName, frontendUrl, isNewUser, userEmail, hasLogo);

    try {
        const mailOptions: nodemailer.SendMailOptions = {
            from: `"${fromName}" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
            text: isNewUser
                ? `Hello ${userName}, thank you for your purchase! Please register at ${frontendUrl}/register using ${userEmail} as your email address.`
                : `Hello ${userName}, thank you for your purchase! Log in at ${frontendUrl}/login to get started.`,
        };
        if (!tpl && hasLogo) {
            mailOptions.attachments = [{ filename: 'logo.png', path: logoPath, cid: 'logo' }];
        }
        await transporter!.sendMail(mailOptions);
        logger.info(`WooCommerce welcome email sent successfully to: ${userEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send WooCommerce welcome email to ${userEmail}`, error);
        return { success: false, error };
    }
};

const buildFallbackWoocommerceHtml = (
    userName: string, academyName: string, frontendUrl: string, isNewUser: boolean, userEmail: string, hasLogo: boolean
): string => {
    const actionUrl = isNewUser ? `${frontendUrl}/register` : `${frontendUrl}/login`;
    const buttonLabel = isNewUser ? 'Complete Your Registration' : 'Log In to Your Account';
    const actionInstruction = isNewUser
        ? `To get started, please register your account using the button below. Use <strong>${userEmail}</strong> as your email address when registering.`
        : 'Your account is ready. Click the button below to log in and start exploring.';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}
    .container{max-width:600px;margin:20px auto;padding:20px;border:1px solid #e5e7eb;border-radius:8px}
    .header{display:flex;align-items:center;justify-content:center;margin-bottom:30px;gap:10px}
    .logo{max-width:120px;height:auto;vertical-align:middle}
    .welcome-text{font-size:24px;font-weight:bold;color:#1f2937;margin:0}
    .content{padding:0 20px}
    .footer{text-align:center;margin-top:30px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:20px}
    .button-container{text-align:center;margin:30px 0}
    .button{background-color:#2563eb;color:#ffffff!important;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block}
    </style></head><body><div class="container">
    <div class="header"><span class="welcome-text">Welcome to</span>
    ${hasLogo ? '<img src="cid:logo" alt="Gymind Logo" class="logo">' : `<span class="welcome-text" style="color:#2563eb;">${academyName}</span>`}</div>
    <div class="content"><p>Hello ${userName},</p>
    <p>Thank you for your purchase! We're thrilled to have you join <strong>${academyName}</strong>.</p>
    <p>${actionInstruction}</p>
    <div class="button-container"><a href="${actionUrl}" class="button">${buttonLabel}</a></div>
    <p>If you have any questions or need help getting started, we're here for you.</p>
    <p>Best regards,<br/>The ${academyName} Team</p></div>
    <div class="footer">&copy; ${new Date().getFullYear()} ${academyName}. All rights reserved.</div>
    </div></body></html>`;
};

// ---------------------------------------------------------------------------

export const sendUserInvitationEmail = async (
    userEmail: string,
    orgName: string,
    academyName: string,
    registrationLink: string
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send invitation email to ${userEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const vars = { orgName, academyName, registrationLink };

    const tpl = await fetchTemplate('user_invitation');
    const subject = tpl ? renderTemplate(tpl.subject, vars) : `You've been invited to join ${orgName} on Gymind`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hello,</p><p>You've been invited to join <strong>${orgName}</strong> (part of <strong>${academyName}</strong>) on Gymind.</p><p>To get started, please create your account using the button below. Make sure to sign up with this email address.</p><p><a href="${registrationLink}" style="background-color:#2563eb;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Create My Account</a></p><p>If you did not expect this invitation, you can safely ignore this email.</p><p>Thanks,<br/>The Gymind Team</p>`;

    try {
        await transporter!.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: userEmail,
            subject,
            html,
            text: `You've been invited to join ${orgName} on Gymind. Create your account at: ${registrationLink}`,
        });
        logger.info(`Invitation email sent successfully to: ${userEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send invitation email to ${userEmail}`, error);
        return { success: false, error };
    }
};

// ---------------------------------------------------------------------------

export const sendNewsletterReminder3DayEmail = async (
    adminEmail: string,
    campaignName: string,
    academyName: string
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send 3-day reminder to ${adminEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const vars = { campaignName, academyName };

    const tpl = await fetchTemplate('newsletter_reminder_3day');
    const subject = tpl
        ? renderTemplate(tpl.subject, vars)
        : `Reminder: Your newsletter "${campaignName}" is due in 3 days`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hi,</p><p>Your newsletter campaign <strong>${campaignName}</strong> has a scheduled edition due in <strong>3 days</strong>, but the content is still empty.</p><p>Please log in and write your newsletter content to ensure it's sent on time.</p><p>Best,<br>${academyName}</p>`;

    try {
        await transporter!.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: adminEmail, subject, html });
        logger.info(`3-day newsletter reminder sent to: ${adminEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send 3-day reminder to ${adminEmail}`, error);
        return { success: false, error };
    }
};

export const sendNewsletterReminder1DayEmail = async (
    adminEmail: string,
    campaignName: string,
    academyName: string
) => {
    await ensureTransporter();
    if (!isEmailServiceAvailable()) {
        logger.error(`Could not send 1-day reminder to ${adminEmail} because email service is not initialized.`);
        return { success: false, error: 'Email service not available' };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Gymind';
    const fromEmail = process.env.SMTP_USER!;
    const vars = { campaignName, academyName };

    const tpl = await fetchTemplate('newsletter_reminder_1day');
    const subject = tpl
        ? renderTemplate(tpl.subject, vars)
        : `Urgent: Your newsletter "${campaignName}" is due tomorrow`;
    const html = tpl
        ? renderTemplate(tpl.html, vars)
        : `<p>Hi,</p><p><strong>Warning:</strong> Your newsletter campaign <strong>${campaignName}</strong> has a scheduled edition due <strong>tomorrow</strong>, but the content is still empty.</p><p>If the content is not added before the scheduled send time, the edition will be skipped automatically.</p><p>Please log in now and add your newsletter content.</p><p>Best,<br>${academyName}</p>`;

    try {
        await transporter!.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: adminEmail, subject, html });
        logger.info(`1-day newsletter reminder sent to: ${adminEmail}`);
        return { success: true };
    } catch (error) {
        logger.error(`Failed to send 1-day reminder to ${adminEmail}`, error);
        return { success: false, error };
    }
};
