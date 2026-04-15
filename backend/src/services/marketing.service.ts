
import { 
    membershipsCollection, 
    organizationsCollection, 
    userCourseProgressCollection, 
    usersCollection,
    academySettingsCollection,
    unsubscriptionsCollection
} from '../db/collections.js';
import { querySnapshotToArray } from './firestore.service.js';
import { 
    DBNewsletterCampaign, 
    DBMembership, 
    UserRole, 
    DBUserCourseProgress, 
    DBUser,
    DBAcademySettings
} from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { env } from '../config/env.js';
import https from 'https';

/** Fetch an external image and return it as a base64 string and its content type */
export async function fetchImageAsBase64(url: string): Promise<{ base64: string; contentType: string } | null> {
    if (!url) return null;
    
    // If it's already a data URI
    if (url.startsWith('data:image')) {
        const match = url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (match) {
            return { contentType: match[1], base64: match[2] };
        }
        const parts = url.split('base64,');
        return parts.length > 1 ? { base64: parts[1], contentType: 'image/png' } : null; // Fallback
    }

    return new Promise((resolve) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                resolve(null);
                return;
            }
            const contentType = res.headers['content-type'] || 'image/png';
            const data: any[] = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                resolve({
                    base64: buffer.toString('base64'),
                    contentType
                });
            });
        }).on('error', () => {
            resolve(null);
        });
    });
}

/** Resolve recipient {email, name, organizationName} triplets for a campaign */
export async function resolveRecipients(campaign: DBNewsletterCampaign): Promise<{ email: string; name: string; organizationName: string }[]> {
    const results: { email: string; name: string; organizationName: string }[] = [];
    const orgCache: Record<string, string> = {};

    const getOrgName = async (orgId?: string): Promise<string> => {
        if (!orgId) return '';
        if (orgCache[orgId]) return orgCache[orgId];
        const doc = await organizationsCollection.doc(orgId).get();
        const name = doc.data()?.name || '';
        orgCache[orgId] = name;
        return name;
    };

    // Fetch all unsubscriptions for this campaign at once for efficient filtering
    const unsubSnap = await unsubscriptionsCollection.where('campaignId', '==', campaign.id).get();
    const unsubscribedEmails = new Set(unsubSnap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data().email));

    if (campaign.recipientGroup === 'all_users') {
        const snap = await membershipsCollection
            .where('academyId', '==', campaign.academyId)
            .where('role', '==', UserRole.REGULAR_USER)
            .get();
        const memberships = querySnapshotToArray<DBMembership>(snap);
        for (const m of memberships) {
            if (m.userEmail && m.userStatus === 'active' && !unsubscribedEmails.has(m.userEmail)) {
                const organizationName = m.entityType === 'organization' ? await getOrgName(m.entityId) : '';
                results.push({ email: m.userEmail, name: m.userName || m.userEmail, organizationName });
            }
        }
    } else if (campaign.recipientGroup === 'organization' && campaign.recipientFilter) {
        const organizationName = await getOrgName(campaign.recipientFilter);
        const snap = await membershipsCollection
            .where('academyId', '==', campaign.academyId)
            .where('entityId', '==', campaign.recipientFilter)
            .where('entityType', '==', 'organization')
            .get();
        const memberships = querySnapshotToArray<DBMembership>(snap);
        for (const m of memberships) {
            if (m.userEmail && m.userStatus === 'active' && !unsubscribedEmails.has(m.userEmail)) {
                results.push({ email: m.userEmail, name: m.userName || m.userEmail, organizationName });
            }
        }
    } else if ((campaign.recipientGroup === 'course_enrolled' || campaign.recipientGroup === 'course_completed') && campaign.recipientFilter) {
        let query = userCourseProgressCollection
            .where('academyId', '==', campaign.academyId)
            .where('courseId', '==', campaign.recipientFilter);
        if (campaign.recipientGroup === 'course_completed') {
            query = query.where('status', '==', 'completed');
        }
        const snap = await query.get();
        const progressDocs = querySnapshotToArray<DBUserCourseProgress>(snap);
        const userIds = [...new Set(progressDocs.map(p => p.userId))];

        const BATCH = 30;
        for (let i = 0; i < userIds.length; i += BATCH) {
            const batch = userIds.slice(i, i + BATCH);
            const userSnap = await usersCollection.where('__name__', 'in', batch).get();
            const users = querySnapshotToArray<DBUser>(userSnap);
            for (const u of users) {
                if (u.email && u.status === 'active' && !unsubscribedEmails.has(u.email)) {
                    const orgName = await getOrgName(u.defaultOrganizationId);
                    results.push({ email: u.email, name: u.name || u.email, organizationName: orgName });
                }
            }
        }
    }

    const seen = new Set<string>();
    return results.filter(r => {
        if (seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
    });
}

/** Fetch academy theme for newsletter rendering */
export async function getAcademyTheme(academyId: string, academyName: string): Promise<{ headerBgColor: string; titleColor: string; logoUrl: string; academyName: string }> {
    const settingsDoc = await academySettingsCollection.doc(academyId).get();
    const settings = settingsDoc.exists ? settingsDoc.data() as DBAcademySettings : null;
    return {
        headerBgColor: settings?.sidebarColor ?? '#4f46e5',
        titleColor: settings?.displayNameColor ?? '#ffffff',
        logoUrl: settings?.logoUrl ?? '',
        academyName: settings?.appName ?? academyName,
    };
}

/** Replace personalization variables in text */
export function replaceVariables(
    text: string,
    recipient: { name: string; organizationName: string } | undefined,
    academyName: string
): string {
    let result = text;
    result = result.replace(/\{user_name\}/g, recipient?.name ?? '{user_name}');
    result = result.replace(/\{academy_name\}/g, academyName);
    result = result.replace(/\{organization_name\}/g, recipient?.organizationName ?? '{organization_name}');
    return result;
}

/** Build the full newsletter HTML from edition fields + academy theme settings */
export function buildNewsletterHtml(
    edition: { title: string; subtitle: string; mainText: string; showLogoInHeader?: boolean },
    theme: { headerBgColor: string; titleColor: string; logoUrl: string; academyName: string },
    recipient?: { email: string; name: string; organizationName: string; campaignId: string }
): string {
    // Apply personalization variables before escaping
    const personalizedTitle = replaceVariables(edition.title, recipient, theme.academyName);
    const personalizedSubtitle = replaceVariables(edition.subtitle, recipient, theme.academyName);
    const personalizedMainText = replaceVariables(edition.mainText, recipient, theme.academyName);

    const escapedTitle = sanitizeText(personalizedTitle);
    const escapedSubtitle = sanitizeText(personalizedSubtitle);
    const mainHtml = personalizedMainText
        .split(/\n\n+/)
        .map(p => `<p style="margin:0 0 16px;line-height:1.6;">${sanitizeText(p).replace(/\n/g, '<br>')}</p>`)
        .join('');

    const logoImgHtml = theme.logoUrl
        ? `<img src="${theme.logoUrl}" alt="${sanitizeText(theme.academyName)}" width="40" height="40" style="width:40px;height:40px;display:block;object-fit:contain;" />`
        : '';

    // Header logo: displayed directly on the header background
    const headerLogoHtml = (edition.showLogoInHeader && logoImgHtml)
        ? `<div class="mobile-logo-container" style="display:inline-block;vertical-align:middle;margin-right:12px;line-height:0;">${logoImgHtml}</div>`
        : '';

    // Footer logo: displayed directly on the footer background
    const footerLogoHtml = theme.logoUrl
        ? `<div style="display:inline-block;line-height:0;">${logoImgHtml}</div>`
        : '';

    const unsubscribeUrl = recipient
        ? `${env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(recipient.email)}&campaignId=${recipient.campaignId}&academyName=${encodeURIComponent(theme.academyName)}`
        : '#';

    // Gymind logo served from the frontend public assets
    const gymindLogoSrc = `${env.FRONTEND_URL}/email_logo.png`;

    return `<!DOCTYPE html>
<html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <style>
      @media screen and (max-width: 600px) {
        .mobile-full-width { width: 100% !important; max-width: 100% !important; }
        .mobile-no-padding { padding: 0 !important; background: #ffffff !important; }
        .mobile-header { border-radius: 8px 8px 0 0 !important; }
        .mobile-cell-padding { padding: 32px 20px !important; }
        .mobile-body { background: #ffffff !important; }
        .mobile-center { display: block !important; text-align: center !important; margin: 0 auto !important; }
        .mobile-logo-container { display: block !important; margin: 0 auto 16px !important; text-align: center !important; }
        .mobile-logo-container img { margin: 0 auto !important; }
      }
    </style>
</head>
<body class="mobile-body" style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" class="mobile-no-padding" style="background:#f4f4f5;"><tr><td align="center" style="padding:24px 16px;" class="mobile-no-padding">
<table width="600" cellpadding="0" cellspacing="0" class="mobile-full-width" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <tr><td style="background:${theme.headerBgColor};padding:32px 40px;text-align:center;" class="mobile-cell-padding mobile-header">
    <div class="mobile-center" style="display:inline-block;text-align:left;">
      ${headerLogoHtml}
      <div class="mobile-center" style="display:inline-block;vertical-align:middle;text-align:center;">
        ${escapedTitle ? `<h1 style="margin:0 0 8px;font-size:24px;color:${theme.titleColor};font-weight:700;display:inline-block;">${escapedTitle}</h1>` : ''}
        ${escapedSubtitle ? `<p style="margin:0;font-size:16px;color:${theme.titleColor};opacity:0.85;">${escapedSubtitle}</p>` : ''}
      </div>
    </div>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px 40px;color:#374151;font-size:15px;" class="mobile-cell-padding">
    ${mainHtml || '<p style="color:#9ca3af;font-style:italic;">No content</p>'}
  </td></tr>
  <!-- Academy Footer -->
  <tr><td style="padding:24px 40px;text-align:center;background:${theme.headerBgColor};" class="mobile-cell-padding">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="padding-right:10px;vertical-align:middle;">
          ${footerLogoHtml}
        </td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:23px;font-weight:600;color:${theme.titleColor};">${sanitizeText(theme.academyName)}</p>
        </td>
      </tr>
    </table>
  </td></tr>
  <!-- System Footer -->
  <tr><td style="padding:16px 40px;text-align:center;background:#f4f4f5;color:#9ca3af;font-size:11px;" class="mobile-cell-padding">
    <div style="margin-bottom:8px;">
      Powered by <img src="${gymindLogoSrc}" alt="Gymind" height="18" style="height:18px;vertical-align:middle;margin-left:2px;opacity:0.8;margin-bottom:4px;" />
    </div>
    <div>
      <a href="${unsubscribeUrl}" target="_blank" style="color:#9ca3af;text-decoration:underline;">Stop receiving newsletters from ${sanitizeText(theme.academyName)}</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
