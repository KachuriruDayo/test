import { NextFunction, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'

export default function serveStatic(baseDir: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const safePath = decodeURIComponent(req.path.replace(/\0/g, ''))

            if (safePath.includes('..')) {
                return res.status(403).send({ message: 'Доступ запрещён' })
            }

            const resolvedPath = path.resolve(baseDir, `.${  safePath}`)

            if (!resolvedPath.startsWith(path.resolve(baseDir))) {
                return res.status(403).send({ message: 'Доступ запрещён' })
            }

            fs.access(resolvedPath, fs.constants.F_OK, (err) => {
                if (err) {
                    return next()
                }

                return res.sendFile(resolvedPath, (error) => {
                    if (error) {
                        next(error)
                    }
                })
            })
        } catch (error) {
            return next(error)
        }
    }
}
