import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../utils/app-error.js';

export const validateBody = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = flat.fieldErrors as Record<string, string[]>;
    const firstError = (Object.values(fieldErrors).flat()[0] as string) || 'Validation failed';
    return next(new AppError(firstError, 400, fieldErrors));
  }
  req.body = parsed.data;
  next();
};
