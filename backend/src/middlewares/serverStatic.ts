import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export default function serveStatic(baseDir: string) {
    const absBaseDir = path.resolve(baseDir);

    return (req: Request, res: Response, next: NextFunction) => {
        try {
            // Декодируем URI, удаляем нулевые байты
            const safePath = decodeURIComponent(req.path.replace(/\0/g, ''));

            // Явная проверка на попытку Path Traversal
            if (safePath.includes('..')) {
                console.warn(`[serveStatic] Path Traversal attempt: ${safePath}`);
                return res.status(403).json({ message: 'Доступ запрещён' });
            }

            // Формируем абсолютный путь к файлу
            const filePath = path.resolve(absBaseDir, `.${safePath}`);

            // Проверяем, что файл лежит внутри базовой директории
            if (!filePath.startsWith(absBaseDir)) {
                console.warn(`[serveStatic] Path Traversal attempt: ${filePath}`);
                return res.status(403).json({ message: 'Доступ запрещён' });
            }

            // Проверяем, что файл существует и это именно файл (а не директория)
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    // Файл не найден — передаём управление дальше
                    return next();
                }

                if (!stats.isFile()) {
                    // Если это не файл — тоже передаём дальше
                    return next();
                }

                // Отдаём файл клиенту
                res.sendFile(filePath, (err) => {
                    if (err) {
                        next(err);
                    }
                });
            });
        } catch (error) {
            // Ловим синхронные ошибки
            next(error);
        }
    };
}
