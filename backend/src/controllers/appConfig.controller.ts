
import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';

import { academySettingsCollection } from '../db/collections.js';
import { snapshotToData, storage } from '../services/firestore.service.js';
import { JwtUserPayload, DBAcademySettings, PublicPlanConfig } from '../types/index.js';
import { sanitizeText, sanitizeImageUrl, sanitizeColor, sanitizeUrl } from '../utils/sanitizer.js';

/**
 * Upload a base64 data-URI image to Firebase Storage and return the public URL.
 * Stores under: academyLogos/{academyId}/logo.png
 */
async function uploadLogoToStorage(dataUri: string, academyId: string): Promise<string> {
    // Extract the base64 content and mime type
    const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URI format');

    const buffer = Buffer.from(match[2], 'base64');
    const bucket = storage.bucket();
    const filePath = `academyLogos/${academyId}/logo.png`;
    const file = bucket.file(filePath);

    await file.save(buffer, {
        metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
        public: true,
    });

    // Append a cache-busting query param so browsers fetch the new file after re-upload
    return `${file.publicUrl()}?v=${Date.now()}`;
}

export const getThemeSettings = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const doc = await academySettingsCollection.doc(user.academyId).get();
        if (!doc.exists) {
            // Return frontend defaults if no settings document exists, including the academy ID
            return res.status(200).json({
                id: user.academyId,
                sidebarColor: '#004e89',
                enableSidebarGradient: true,
                sidebarHueRotation: 270,
                sidebarGradientHeight: 85,
                sidebarGradientMaskOpacity: 40,
                appName: 'Gymind',
                logoUrl: '/default_user.webp', // Updated default
                displayNameColor: '#ffffff',
                sidebarLinkColor: '#e5e7eb',
                publicPlansPage: { enabled: false, enableGradient: true, pageHeader: '', headerFontWeight: 'font-extrabold', selectedPlans: [] }
            });
        }
        const settings = snapshotToData<DBAcademySettings>(doc)!;
        
        // Provide defaults for new public gradient settings based on sidebar settings if missing, for backward compatibility
        const publicGradientDefaults = {
            gradientHueRotation: settings.publicPlansPage?.gradientHueRotation ?? (settings.sidebarHueRotation ?? 270),
            gradientHeight: settings.publicPlansPage?.gradientHeight ?? (settings.sidebarGradientHeight ?? 85),
            gradientMaskOpacity: settings.publicPlansPage?.gradientMaskOpacity ?? (settings.sidebarGradientMaskOpacity ?? 40),
        };

        res.json({
            ...settings,
            enableSidebarGradient: settings.enableSidebarGradient ?? true,
            sidebarHueRotation: settings.sidebarHueRotation ?? 270,
            sidebarGradientHeight: settings.sidebarGradientHeight ?? 85,
            sidebarGradientMaskOpacity: settings.sidebarGradientMaskOpacity ?? 40,
            displayNameColor: settings.displayNameColor || '#ffffff',
            sidebarLinkColor: settings.sidebarLinkColor || '#e5e7eb',
            publicPlansPage: { 
                ...(settings.publicPlansPage || { enabled: false, pageHeader: '', headerFontWeight: 'font-extrabold', selectedPlans: [] }),
                enableGradient: settings.publicPlansPage?.enableGradient ?? true, // Default true for backward compatibility
                ...publicGradientDefaults
            }
        });
    } catch (error) {
        logger.error("Error fetching academy settings:", error);
        res.status(500).json({ message: 'Failed to fetch academy settings.' });
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
        logoUpload,
        displayNameColor,
        sidebarLinkColor,
        publicPlansPage,
        description,
        contactEmail,
        contactPhone,
        website,
        socialMedia
    } = req.body;
    
    try {
        const docRef = academySettingsCollection.doc(user.academyId);
        const dataToUpdate: {[key: string]: any} = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Theme — upload logo to Firebase Storage instead of storing data URI
        const sanitizedLogoUpload = sanitizeImageUrl(logoUpload);
        if (sanitizedLogoUpload && typeof sanitizedLogoUpload === 'string' && sanitizedLogoUpload.startsWith('data:image')) {
            try {
                const publicUrl = await uploadLogoToStorage(sanitizedLogoUpload, user.academyId);
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

        // Academy Public Profile
        if (description !== undefined) dataToUpdate.description = sanitizeText(description);
        if (contactEmail !== undefined) dataToUpdate.contactEmail = sanitizeText(contactEmail); // Basic sanitization
        if (contactPhone !== undefined) dataToUpdate.contactPhone = sanitizeText(contactPhone);
        if (website !== undefined) dataToUpdate.website = sanitizeUrl(website);
        if (socialMedia) {
            dataToUpdate.socialMedia = {};
            if (socialMedia.twitter) dataToUpdate.socialMedia.twitter = sanitizeUrl(socialMedia.twitter);
            if (socialMedia.linkedin) dataToUpdate.socialMedia.linkedin = sanitizeUrl(socialMedia.linkedin);
            if (socialMedia.facebook) dataToUpdate.socialMedia.facebook = sanitizeUrl(socialMedia.facebook);
            if (socialMedia.instagram) dataToUpdate.socialMedia.instagram = sanitizeUrl(socialMedia.instagram);
        }
        
        // Public Plans Page Configuration
        if (publicPlansPage) {
            const sanitizedPlans = (publicPlansPage.selectedPlans || []).slice(0, 4).map((p: any) => ({
                planId: sanitizeText(p.planId),
                displayName: sanitizeText(p.displayName),
                billingCycle: sanitizeText(p.billingCycle),
                description: sanitizeText(p.description),
                bullets: (p.bullets || []).map((b: string) => sanitizeText(b)),
                buttonText: sanitizeText(p.buttonText),
                tagText: sanitizeText(p.tagText),
                tagColor: sanitizeColor(p.tagColor),
                tagTextColor: sanitizeColor(p.tagTextColor),
            }));

            dataToUpdate.publicPlansPage = {
                enabled: !!publicPlansPage.enabled,
                enableGradient: publicPlansPage.enableGradient !== undefined ? !!publicPlansPage.enableGradient : true,
                gradientHueRotation: publicPlansPage.gradientHueRotation !== undefined ? Number(publicPlansPage.gradientHueRotation) : 270,
                gradientHeight: publicPlansPage.gradientHeight !== undefined ? Number(publicPlansPage.gradientHeight) : 85,
                gradientMaskOpacity: publicPlansPage.gradientMaskOpacity !== undefined ? Number(publicPlansPage.gradientMaskOpacity) : 40,
                pageHeader: sanitizeText(publicPlansPage.pageHeader),
                headerFontWeight: sanitizeText(publicPlansPage.headerFontWeight || 'font-extrabold'),
                cardBackgroundColor: sanitizeColor(publicPlansPage.cardBackgroundColor || '#ffffff00'),
                cardBorderColor: sanitizeColor(publicPlansPage.cardBorderColor || '#e5e7eb'),
                cardFontColor: sanitizeColor(publicPlansPage.cardFontColor || '#1f2937'),
                buttonBackgroundColor: sanitizeColor(publicPlansPage.buttonBackgroundColor || '#2563EB'),
                buttonTextColor: sanitizeColor(publicPlansPage.buttonTextColor || '#FFFFFF'),
                customized: true,
                selectedPlans: sanitizedPlans
            };
        }

        await docRef.set(dataToUpdate, { merge: true });
        
        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));

    } catch (error: any) {
        logger.error("Error updating academy settings:", error);
        res.status(500).json({ message: 'Failed to update academy settings.' });
    }
};

export const regenerateApiKey = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const newApiKey = `gymind_sk_${crypto.randomBytes(24).toString('hex')}`;
        const docRef = academySettingsCollection.doc(user.academyId);

        await docRef.set({
            apiKey: newApiKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error) {
        logger.error("Error regenerating API key:", error);
        res.status(500).json({ message: 'Failed to regenerate API key.' });
    }
};

export const enableBridge = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const docRef = academySettingsCollection.doc(user.academyId);
        const doc = await docRef.get();
        const settings = doc.exists ? snapshotToData<DBAcademySettings>(doc) : null;

        const dataToUpdate: Record<string, any> = {
            bridgeEnabled: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!settings?.bridgeSecretKey) {
            dataToUpdate.bridgeSecretKey = crypto.randomBytes(32).toString('hex');
        }

        await docRef.set(dataToUpdate, { merge: true });

        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error) {
        logger.error("Error enabling bridge:", error);
        res.status(500).json({ message: 'Failed to enable bridge.' });
    }
};

export const disableBridge = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const docRef = academySettingsCollection.doc(user.academyId);

        await docRef.set({
            bridgeEnabled: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error) {
        logger.error("Error disabling bridge:", error);
        res.status(500).json({ message: 'Failed to disable bridge.' });
    }
};

export const regenerateBridgeKey = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const newKey = crypto.randomBytes(32).toString('hex');
        const docRef = academySettingsCollection.doc(user.academyId);

        await docRef.set({
            bridgeSecretKey: newKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error) {
        logger.error("Error regenerating bridge key:", error);
        res.status(500).json({ message: 'Failed to regenerate bridge key.' });
    }
};

export const downloadBridge = async (_req: Request, res: Response) => {
    try {
        const assetsDir = path.join(process.cwd(), 'src', 'assets');
        const bridgePath = path.join(assetsDir, 'bridge.js');

        if (!fs.existsSync(bridgePath)) {
            res.status(500).json({ message: 'Bridge assets not found on server.' });
            return;
        }

        const setupGuide = `Gymind Bridge Server - Setup Guide
=====================================

Prerequisites
-------------
- Node.js 18 or later
- npm (comes with Node.js)

Installation
------------
1. Create a project folder and move gymind-bridge.js there
2. Run: npm init -y && npm install jsonwebtoken dotenv
3. Create a .env file with the following content:

   BRIDGE_SECRET=<paste your bridge security key here>
   BRIDGE_VIDEO_DIR=/path/to/your/videos
   BRIDGE_PORT=3900
   BRIDGE_ALLOWED_ORIGINS=https://www.gymind.app

4. Place your video files in the video directory
5. Start the server: node gymind-bridge.js
6. Expose publicly via HTTPS (nginx, Caddy, or Cloudflare Tunnel)

Testing
-------
Visit: https://your-domain.com/health
Expected response: { "status": "ok" }

Video URL Format
----------------
Use in lessons: https://your-domain.com/video/path/to/file.mp4
This maps to: <BRIDGE_VIDEO_DIR>/path/to/file.mp4
`;

        const zipName = 'gymind-bridge.zip';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err: Error) => {
            logger.error("Archive error:", err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Failed to create zip.' });
            }
        });
        archive.pipe(res);

        archive.file(bridgePath, { name: 'gymind-bridge/gymind-bridge.js' });
        archive.append(setupGuide, { name: 'gymind-bridge/SETUP-GUIDE.txt' });

        await archive.finalize();
    } catch (error) {
        logger.error("Error downloading bridge file:", error);
        res.status(500).json({ message: 'Failed to download bridge file.' });
    }
};

export const downloadBridgeZip = async (req: Request, res: Response) => {
    try {
        const platform = req.params.platform;
        if (platform !== 'linux' && platform !== 'windows') {
            res.status(400).json({ message: 'Invalid platform. Use "linux" or "windows".' });
            return;
        }

        const assetsDir = path.join(process.cwd(), 'src', 'assets');
        const bridgePath = path.join(assetsDir, 'bridge.js');
        const scriptFile = platform === 'linux' ? 'install-bridge.sh' : 'install-bridge.ps1';
        const scriptPath = path.join(assetsDir, scriptFile);
        const installerName = platform === 'linux' ? 'install.sh' : 'install.ps1';

        if (!fs.existsSync(bridgePath) || !fs.existsSync(scriptPath)) {
            res.status(500).json({ message: 'Bridge assets not found on server.' });
            return;
        }

        const zipName = `gymind-bridge-${platform}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err: Error) => {
            logger.error("Archive error:", err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Failed to create zip.' });
            }
        });
        archive.pipe(res);

        // Add files inside a gymind-bridge/ folder
        archive.file(bridgePath, { name: 'gymind-bridge/gymind-bridge.js' });
        archive.file(scriptPath, { name: `gymind-bridge/${installerName}` });

        await archive.finalize();
    } catch (error) {
        logger.error("Error creating bridge zip:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to download bridge installer.' });
        }
    }
};