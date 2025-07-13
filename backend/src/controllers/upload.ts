import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import path from 'path'
import BadRequestError from '../errors/bad-request-error'

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml'
]

const isFilenameSafe = (filename: string): boolean => {
  const unsafeChars = /[<>:"/\\|?*]|^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
  return !unsafeChars.test(filename)
}

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {

    console.log(req.file);
    console.log(req.file?.mimetype);
    console.log(req.file?.originalname);
    console.log(req.file?.size);

  if (!req.file) {
    return next(new BadRequestError('Файл не загружен'))
  }

  if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      throw new BadRequestError('Недопустимый тип файла')
  }

  if (!isFilenameSafe(req.file.originalname)) {
      throw new BadRequestError('Недопустимое имя файла')
  }

  if (req.file.size < 2 * 1024) {
    return next(new BadRequestError('Размер файла должен быть больше 2KB'))
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  if (req.file.size > MAX_FILE_SIZE) {
    return next(new BadRequestError('Размер файла не должен превышать 5MB'))
  }

  try {
    const fileName = process.env.UPLOAD_PATH_TEMP
      ? path.join('/', process.env.UPLOAD_PATH_TEMP, req.file.filename)
      : path.join('/', req.file.filename)
    return res.status(constants.HTTP_STATUS_CREATED).send({ fileName })
  } catch (error) {
    return next(error)
  }
}

export default {}
