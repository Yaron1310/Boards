import { DBNewsletterCampaign } from '../types/index.js';

/**
 * Given a campaign and a reference date (typically the date the previous issue was sent),
 * return the Date when the next issue should be scheduled.
 *
 * - weekly:   7 days after referenceDate, time set to scheduledTime in campaign timezone
 * - biweekly: 14 days after referenceDate, same
 * - monthly:  same scheduledDay of next month, same scheduledTime
 * - one_time: returns null (no next date)
 */
export function calcNextScheduledFor(campaign: DBNewsletterCampaign, referenceDate: Date): Date | null {
    if (campaign.frequency === 'one_time') return null;

    const tz = campaign.timezone ?? 'UTC';
    const timeStr = campaign.scheduledTime ?? '09:00';
    const [hourStr, minuteStr] = timeStr.split(':');
    const hour = parseInt(hourStr ?? '9', 10);
    const minute = parseInt(minuteStr ?? '0', 10);

    const ref = new Date(referenceDate);

    if (campaign.frequency === 'weekly') {
        const nextDate = new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
        return setTimeInTimezone(nextDate, hour, minute, tz);
    }

    if (campaign.frequency === 'biweekly') {
        const nextDate = new Date(ref.getTime() + 14 * 24 * 60 * 60 * 1000);
        return setTimeInTimezone(nextDate, hour, minute, tz);
    }

    if (campaign.frequency === 'monthly') {
        const scheduledDay = campaign.scheduledDay ?? 1;
        // Move to next month, same day
        const next = new Date(ref);
        next.setMonth(next.getMonth() + 1);
        // Clamp to valid day (e.g. Feb 30 → Feb 28)
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(scheduledDay, maxDay));
        return setTimeInTimezone(next, hour, minute, tz);
    }

    return null;
}

/**
 * Calculate the first send date for a trigger enrollment.
 * Finds the next occurrence of the campaign's scheduledDay + scheduledTime after the trigger date.
 *
 * For weekly/biweekly: find next occurrence of scheduledDay (day of week) after triggerDate
 * For monthly: find next occurrence of scheduledDay (day of month) after triggerDate
 */
export function calcNextTriggerSendDate(campaign: DBNewsletterCampaign, triggerDate: Date): Date | null {
    if (campaign.frequency === 'one_time') return null;

    const tz = campaign.timezone ?? 'UTC';
    const timeStr = campaign.scheduledTime ?? '09:00';
    const [hourStr, minuteStr] = timeStr.split(':');
    const hour = parseInt(hourStr ?? '9', 10);
    const minute = parseInt(minuteStr ?? '0', 10);

    const scheduledDay = campaign.scheduledDay ?? 0;
    const ref = new Date(triggerDate);

    if (campaign.frequency === 'monthly') {
        // Find the next occurrence of scheduledDay (day of month)
        const candidate = new Date(ref);
        candidate.setDate(scheduledDay);
        candidate.setHours(hour, minute, 0, 0);
        if (candidate <= ref) {
            candidate.setMonth(candidate.getMonth() + 1);
            candidate.setDate(Math.min(scheduledDay, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()));
        }
        return setTimeInTimezone(candidate, hour, minute, tz);
    }

    // weekly or biweekly: find next occurrence of scheduledDay (day of week, 0=Sun..6=Sat)
    const candidate = new Date(ref);
    const diff = (scheduledDay - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + (diff === 0 ? 7 : diff));
    return setTimeInTimezone(candidate, hour, minute, tz);
}

/**
 * Set the hour/minute of a Date in a given IANA timezone by computing the UTC offset.
 */
function setTimeInTimezone(date: Date, hour: number, minute: number, tz: string): Date {
    // Use Intl to find the offset for the given timezone at the target date
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(date);

        const year = parseInt(parts.find(p => p.type === 'year')!.value, 10);
        const month = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
        const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);

        // Create a local date string for midnight in the target timezone
        const localMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));

        // Compute the UTC offset at that timezone
        const testDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: 'numeric', minute: 'numeric', hour12: false,
        });
        const tzParts = formatter.formatToParts(testDate);
        const tzHour = parseInt(tzParts.find(p => p.type === 'hour')?.value ?? '0', 10);
        const tzMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value ?? '0', 10);

        const hourDiff = hour - tzHour;
        const minuteDiff = minute - tzMinute;

        const result = new Date(Date.UTC(year, month, day, hour + hourDiff, minute + minuteDiff, 0));
        void localMidnight; // suppress unused warning
        return result;
    } catch {
        // Fallback: just set hour/minute in UTC
        const fallback = new Date(date);
        fallback.setUTCHours(hour, minute, 0, 0);
        return fallback;
    }
}
