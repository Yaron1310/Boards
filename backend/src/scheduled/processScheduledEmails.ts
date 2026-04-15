import type { ScheduledEvent } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';

export const processScheduledEmailsHandler = async (_event: ScheduledEvent): Promise<void> => {
    logger.info('processScheduledEmails: no scheduled email jobs configured.');
};
