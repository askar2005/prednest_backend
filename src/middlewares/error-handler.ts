import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message, details: error.details ?? null });
  }

  if (error instanceof SyntaxError && 'statusCode' in (error as any)) {
    return res.status((error as any).statusCode).json({ message: error.message });
  }

  logger.error(error);
  res.status(500).json({ message: 'Internal server error' });
}
