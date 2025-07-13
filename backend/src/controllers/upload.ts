import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import { constants } from 'http2';
import { join, basename } from 'path';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import BadRequestError from '../errors/bad-request-error';

const ALLOWED_MIME_TYPES = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
];

const isFilenameSafe = (filename: string): boolean => {
    const unsafeChars = /[<>:"/\\|?*]|^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    return !unsafeChars.test(filename);
};

export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'));
    }

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        return next(new BadRequestError('Недопустимый тип файла'));
    }

    if (!isFilenameSafe(req.file.originalname)) {
        return next(new BadRequestError('Недопустимое имя файла'));
    }

    if (req.file.size < 2 * 1024) {
        return next(new BadRequestError('Размер файла должен быть больше 2KB'));
    }

    if (req.file.size > 10 * 1024 * 1024) {
        return next(new BadRequestError('Размер файла не должен превышать 10MB'));
    }

    const tempPath = join(
        __dirname,
        '../public/',
        process.env.UPLOAD_PATH_TEMP || '',
        req.file.filename
    );

    const cleanFileName = `${Date.now()}-${randomUUID()}`;
    let cleanPath = '';

    try {
        const metadata = await sharp(tempPath).metadata();

        if (!metadata.format || !metadata.width || !metadata.height) {
            throw new BadRequestError('Файл не является валидным изображением');
        }

        const safeExt = metadata.format === 'jpeg' ? '.jpg' : `.${metadata.format}`;
        cleanPath = tempPath.replace(req.file.filename, `${cleanFileName}${safeExt}`);

        await sharp(tempPath).toFile(cleanPath);
        await unlink(tempPath).catch(() => {});

        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName: basename(cleanPath),
            originalName: req.file.originalname,
        });
    } catch (error) {
        await unlink(tempPath).catch(() => {});
        if (cleanPath) {
            await unlink(cleanPath).catch(() => {});
        }
        return next(error);
    }
};
