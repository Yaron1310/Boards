
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { db } from './firestore.service.js';
import { DBAuditLog } from '../types/index.js';

const auditLogsRef = db.collection('auditLogs');

/** Number of READ events within the detection window that triggers an anomaly. */
const ANOMALY_READ_THRESHOLD = 50;
/** Detection window in milliseconds (5 minutes). */
const ANOMALY_WINDOW_MS = 5 * 60 * 1000;
/** Audit log retention period: 24 months (Israeli Privacy Protection Law requirement). */
const AUDIT_LOG_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export type AuditEntryInput = Omit<DBAuditLog, 'id' | 'timestamp' | 'expiresAt'>;

/**
 * Writes a structured entry to the auditLogs Firestore collection.
 * Each document gets an expiresAt timestamp 12 months in the future,
 * which Firestore's TTL policy uses to auto-delete the document.
 * Failures are logged but never thrown — audit logging must not break request flow.
 */
export async function logAudit(entry: AuditEntryInput): Promise<void> {
    try {
        const ref = auditLogsRef.doc();
        await ref.set({
            id: ref.id,
            ...entry,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + AUDIT_LOG_TTL_MS),
        });
    } catch (error) {
        logger.error('Failed to write audit log entry:', error);
    }
}

/**
 * Writes an audit log entry and then checks whether the actor has exceeded
 * the anomalous-read threshold within the last 5 minutes.
 * Uses a count() aggregation query (billed as 1 read regardless of result size)
 * instead of fetching documents, keeping the cost to 1 read per audit event.
 */
export async function logAuditAndCheckAnomaly(entry: AuditEntryInput): Promise<void> {
    await logAudit(entry);

    if (entry.action !== 'READ') return;

    try {
        const windowStart = admin.firestore.Timestamp.fromMillis(Date.now() - ANOMALY_WINDOW_MS);

        const countResult = await auditLogsRef
            .where('actorUserId', '==', entry.actorUserId)
            .where('action', '==', 'READ')
            .where('timestamp', '>=', windowStart)
            .count()
            .get();

        const readCount = countResult.data().count;

        if (readCount >= ANOMALY_READ_THRESHOLD) {
            logger.warn('ANOMALY DETECTED: excessive reads', {
                userId: entry.actorUserId,
                resourceType: entry.resourceType,
                readCount,
                windowMinutes: ANOMALY_WINDOW_MS / 60000,
            });

            await logAudit({
                actorUserId: entry.actorUserId,
                actorRole: entry.actorRole,
                action: 'ANOMALY',
                resourceType: entry.resourceType,
                resourceId: 'bulk_read',
                organizationId: entry.organizationId,
                academyId: entry.academyId,
                ipAddress: entry.ipAddress,
                userAgent: entry.userAgent,
                details: `User exceeded ${ANOMALY_READ_THRESHOLD} ${entry.resourceType} reads in ${ANOMALY_WINDOW_MS / 60000} minutes (detected: ${readCount})`,
            });
        }
    } catch (error) {
        logger.error('Anomaly detection check failed:', error);
    }
}

/**
 * Extracts the client IP address from the request, respecting the
 * X-Forwarded-For header set by Firebase Hosting / Cloud Run.
 */
export function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
        return first.trim();
    }
    return req.ip ?? 'unknown';
}
