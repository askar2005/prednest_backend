import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error.js';
import { verifyToken } from '../services/token.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(new AppError('Unauthorized', 401));
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(new AppError('Unauthorized', 401));
  try {
    const payload = verifyToken(token);
    if (payload.role !== 'ADMIN') return next(new AppError('Forbidden', 403));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(new AppError('Unauthorized', 401));
  try {
    const payload = verifyToken(token);
    if (payload.role !== 'USER' && payload.role !== 'STUDENT') return next(new AppError('Forbidden', 403));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}
