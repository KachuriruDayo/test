import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import mongoose from 'mongoose'
import fs from 'fs';
import path from 'path'

import helmet from 'helmet' // Защита от XSS (Межсайтовый скриптинг)
import rateLimit from 'express-rate-limit' // Защита от DDoS

import { DB_ADDRESS } from './config'
import errorHandler from './middlewares/error-handler'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'

const { PORT = 3000 } = process.env
const app = express()

const tempDir = path.join(__dirname, 'public', process.env.UPLOAD_PATH_TEMP || 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Папка создана: ${tempDir}`);
}

// Защита от XSS (Межсайтовый скриптинг)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "http://localhost:3000", "data:"],
    }
  }
}))
app.set('trust proxy', 1)


app.use(cookieParser())

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }))

// Защита от XSS (Межсайтовый скриптинг)
app.use('/images', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Защита от Path Traversal
app.use(serveStatic(path.join(__dirname, 'public')))

// Защита от переполнения буфера
app.use(json({ limit: '10kb' }))
app.use(urlencoded({ extended: true, limit: '10kb' }))

// Защита от DDoS
app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 минут
      max: 20,
      message: 'Слишком много запросов с этого IP, попробуйте позже',
      standardHeaders: true,
      legacyHeaders: false,
    })
  )

app.options('*', cors())
app.use(routes)

app.use(errors())
app.use(errorHandler)

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () => console.log('ok'))
    } catch (error) {
        console.error(error)
    }
}

bootstrap()