import multer from 'multer';

// Use memory storage to avoid disk I/O — Firebase Cloud Functions has ephemeral filesystem
const storage = multer.memoryStorage();

// File filter for images only
const imageFileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

export const uploadImage = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// File filter for chat attachments — images + common document types
const chatFileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed. Allowed: images, PDF, Word, Excel, PowerPoint, text.'));
    }
};

export const uploadChatFiles = multer({
    storage,
    fileFilter: chatFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
}).array('files', 5); // up to 5 files at once
