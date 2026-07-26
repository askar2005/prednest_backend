import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR-HANDLER]', error instanceof Error ? error.name : typeof error, error instanceof Error ? error.message : error);
  if (error instanceof Error) {
    console.error('[ERROR-HANDLER] stack:', error.stack);
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message, details: error.details ?? null });
  }

  if (error instanceof SyntaxError && 'statusCode' in (error as any)) {
    return res.status((error as any).statusCode).json({ message: error.message });
  }

  logger.error(error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  const stack = error instanceof Error ? error.stack : undefined;
  res.status(500).json({ message, stack });
}
