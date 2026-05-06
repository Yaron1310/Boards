import { Router, Request, Response, NextFunction } from 'express';
import { uploadChatFiles } from '../middleware/upload.middleware.js';
import * as itemChatController from '../controllers/itemChat.controller.js';

export const itemChatRouter = Router({ mergeParams: true });

// Only run multer when the request is actually multipart (has file attachments).
// Text-only messages are sent as JSON to avoid Cloud Run stream-consumption issues.
const conditionalUpload = (req: Request, res: Response, next: NextFunction) => {
  const ct = req.headers['content-type'] ?? '';
  if (ct.includes('multipart/form-data')) {
    uploadChatFiles(req, res, (err) => {
      if (err) {
        const msg = (err as NodeJS.ErrnoException).message ?? 'Upload error';
        const code = (err as { code?: string }).code;
        if (code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 10 MB per file.' });
        }
        return res.status(400).json({ message: msg });
      }
      next();
    });
  } else {
    next();
  }
};

itemChatRouter.get('/', itemChatController.getChatMessages);
itemChatRouter.post('/', conditionalUpload, itemChatController.postChatMessage);
