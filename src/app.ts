import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { env } from './config/env.js';

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const corsOrigins = env.CLIENT_ORIGIN.split(',').map((o) => o.trim());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));
app.use(morgan('combined'));

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'PrepNest Backend',
    version: '1.0.0',
    message: 'PrepNest Backend API is running successfully.',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);
