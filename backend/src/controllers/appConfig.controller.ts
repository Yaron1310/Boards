
import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import crypto from 'crypto';

import { organizationSettingsCollection } from '../db/collections.js';
import { snapshotToData, storage } from '../services/firestore.service.js';
import { JwtUserPayload, DBOrganizationSettings, ColumnType, PersonalHubTemplateColumn } from '../types/index.js';
import { sanitizeText, sanitizeImageUrl, sanitizeColor, sanitizeUrl } from '../utils/sanitizer.js';

const VALID_COLUMN_TYPES = new Set<string>(Object.values(ColumnType));

/**
 * Upload an image file to Firebase Storage and return the public URL.
 */
async function uploadImageFileToStorage(buffer: Buffer, storagePath: string, contentType: string = 'image/webp', cacheControl: string = 'public, max-age=86400'): Promise<string> {
    const file = storage.bucket().file(storagePath);
    await file.save(buffer, {
        metadata: { contentType, cacheControl },
        public: true,
    });
    return `${file.publicUrl()}?v=${Date.now()}`;
}

/**
 * Upload organization logo to Firebase Storage.
 */
async function uploadLogoToStorage(buffer: Buffer, orgId: string): Promise<string> {
    return uploadImageFileToStorage(buffer, `organizationLogos/${orgId}/logo.webp`, 'image/webp', 'public, max-age=31536000');
}

export const getThemeSettings = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const doc = await organizationSettingsCollection.doc(user.orgId).get();
        if (!doc.exists) {
            return res.status(200).json({
                id: user.orgId,
                sidebarColor: '#004e89',
                enableSidebarGradient: true,
                sidebarHueRotation: 270,
                sidebarGradientHeight: 85,
                sidebarGradientMaskOpacity: 40,
                appName: 'Logyx',
                logoUrl: '/default_user.webp',
                displayNameColor: '#ffffff',
                sidebarLinkColor: '#e5e7eb',
                logoCircle: true,
            });
        }
        const settings = snapshotToData<DBOrganizationSettings>(doc)!;
        res.json({
            ...settings,
            enableSidebarGradient: settings.enableSidebarGradient ?? true,
            sidebarHueRotation: settings.sidebarHueRotation ?? 270,
            sidebarGradientHeight: settings.sidebarGradientHeight ?? 85,
            sidebarGradientMaskOpacity: settings.sidebarGradientMaskOpacity ?? 40,
            displayNameColor: settings.displayNameColor || '#ffffff',
            sidebarLinkColor: settings.sidebarLinkColor || '#e5e7eb',
        });
    } catch (error) {
        logger.error("Error fetching workspace settings:", error);
        res.status(500).json({ message: 'Failed to fetch workspace settings.' });
    }
};

export const updateThemeSettings = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const {
        sidebarColor,
        enableSidebarGradient,
        sidebarHueRotation,
        sidebarGradientHeight,
        sidebarGradientMaskOpacity,
        appName,
        logoUrl,
        logoBase64,
        displayNameColor,
        sidebarLinkColor,
        logoCircle,
        description,
        contactEmail,
        contactPhone,
        website,
        socialMedia,
        workingDays,
    } = req.body;

    try {
        const docRef = organizationSettingsCollection.doc(user.orgId);
        const dataToUpdate: {[key: string]: any} = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (logoBase64) {
            try {
                const base64Data = logoBase64.replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                const publicUrl = await uploadLogoToStorage(buffer, user.orgId);
                dataToUpdate.logoUrl = publicUrl;
            } catch (uploadErr) {
                logger.error('Failed to upload logo to Storage:', uploadErr);
                return res.status(500).json({ message: 'Failed to upload logo image.' });
            }
        } else if (logoUrl !== undefined) {
            dataToUpdate.logoUrl = sanitizeImageUrl(logoUrl);
        }

        if (sidebarColor !== undefined) dataToUpdate.sidebarColor = sanitizeColor(sidebarColor);
        if (enableSidebarGradient !== undefined) dataToUpdate.enableSidebarGradient = !!enableSidebarGradient;
        if (sidebarHueRotation !== undefined) dataToUpdate.sidebarHueRotation = Number(sidebarHueRotation);
        if (sidebarGradientHeight !== undefined) dataToUpdate.sidebarGradientHeight = Number(sidebarGradientHeight);
        if (sidebarGradientMaskOpacity !== undefined) dataToUpdate.sidebarGradientMaskOpacity = Number(sidebarGradientMaskOpacity);
        if (appName !== undefined) dataToUpdate.appName = sanitizeText(appName);
        if (displayNameColor !== undefined) dataToUpdate.displayNameColor = sanitizeColor(displayNameColor);
        if (sidebarLinkColor !== undefined) dataToUpdate.sidebarLinkColor = sanitizeColor(sidebarLinkColor);
        if (logoCircle !== undefined) dataToUpdate.logoCircle = !!logoCircle;
        if (description !== undefined) dataToUpdate.description = sanitizeText(description);
        if (contactEmail !== undefined) dataToUpdate.contactEmail = sanitizeText(contactEmail);
        if (contactPhone !== undefined) dataToUpdate.contactPhone = sanitizeText(contactPhone);
        if (website !== undefined) dataToUpdate.website = sanitizeUrl(website);
        if (socialMedia) {
            dataToUpdate.socialMedia = {};
            if (socialMedia.twitter) dataToUpdate.socialMedia.twitter = sanitizeUrl(socialMedia.twitter);
            if (socialMedia.linkedin) dataToUpdate.socialMedia.linkedin = sanitizeUrl(socialMedia.linkedin);
            if (socialMedia.facebook) dataToUpdate.socialMedia.facebook = sanitizeUrl(socialMedia.facebook);
            if (socialMedia.instagram) dataToUpdate.socialMedia.instagram = sanitizeUrl(socialMedia.instagram);
        }
        if (Array.isArray(workingDays)) {
            dataToUpdate.workingDays = workingDays
                .map((d: unknown) => Number(d))
                .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6);
        }

        await docRef.set(dataToUpdate, { merge: true });

        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error: any) {
        logger.error("Error updating workspace settings:", error);
        res.status(500).json({ message: 'Failed to update workspace settings.' });
    }
};

// ---------------------------------------------------------------------------
// Personal Hub default template — org-admin-configured "all groups" columns,
// materialized into a user's own personalColumns the first time they have none.
// ---------------------------------------------------------------------------
export const getPersonalHubTemplate = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const doc = await organizationSettingsCollection.doc(user.orgId).get();
        const settings = doc.exists ? snapshotToData<DBOrganizationSettings>(doc) : null;
        const columns = settings?.personalHubTemplate?.columns ?? [];
        res.json({ columns: [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
    } catch (error) {
        logger.error('Error fetching personal hub template:', error);
        res.status(500).json({ message: 'Failed to fetch personal hub template.' });
    }
};

export const updatePersonalHubTemplate = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { columns } = req.body;

    if (!Array.isArray(columns)) {
        return res.status(400).json({ message: 'columns must be an array.' });
    }

    const sanitized: PersonalHubTemplateColumn[] = [];
    for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        if (!c || typeof c !== 'object') return res.status(400).json({ message: `Invalid column at index ${i}.` });
        const { id, name, type, settings } = c as { id?: unknown; name?: unknown; type?: unknown; settings?: unknown };
        if (!name || typeof name !== 'string') return res.status(400).json({ message: `Column at index ${i} is missing a name.` });
        if (!type || !VALID_COLUMN_TYPES.has(type as string)) {
            return res.status(400).json({ message: `Column "${name}" has an invalid type.` });
        }
        sanitized.push({
            id: typeof id === 'string' && id ? id : organizationSettingsCollection.doc().id,
            name: sanitizeText(name),
            type: type as ColumnType,
            settings: (settings && typeof settings === 'object' ? settings : {}) as PersonalHubTemplateColumn['settings'],
            order: i,
        });
    }

    try {
        const docRef = organizationSettingsCollection.doc(user.orgId);
        await docRef.set({
            personalHubTemplate: {
                columns: sanitized,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        res.json({ columns: sanitized });
    } catch (error) {
        logger.error('Error updating personal hub template:', error);
        res.status(500).json({ message: 'Failed to update personal hub template.' });
    }
};

export const regenerateApiKey = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const newApiKey = `sk_${crypto.randomBytes(24).toString('hex')}`;
        const docRef = organizationSettingsCollection.doc(user.orgId);
        await docRef.set({
            apiKey: newApiKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error) {
        logger.error("Error regenerating API key:", error);
        res.status(500).json({ message: 'Failed to regenerate API key.' });
    }
};
