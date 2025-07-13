import { Request, Express } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { extname, join } from 'path';
import crypto from 'crypto';

const allowedMimeTypes = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
];

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: Express.Multer.File,
        cb: (error: Error | null, destination: string) => void
    ) => {
        const dest = process.env.UPLOAD_PATH_TEMP
            ? join(__dirname, `../public/${process.env.UPLOAD_PATH_TEMP}`)
            : join(__dirname, '../public');
        cb(null, dest);
    },

    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, filename: string) => void
    ) => {
        const ext = extname(file.originalname).toLowerCase().slice(0, 10);
        const safeName = crypto.randomBytes(16).toString('hex') + ext;
        cb(null, safeName);
    },
});

const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        // просто отклоняем файл, не кидаем ошибку
        return cb(null, false);
    }
    cb(null, true);
};

export default multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter,
});
