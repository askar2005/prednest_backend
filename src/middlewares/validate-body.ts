import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../utils/app-error.js';

export const validateBody = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  console.log('[VALIDATE-BODY]', req.method, req.url,
    'content-type:', req.headers['content-type'],
    'body:', JSON.stringify(req.body),
    'body-type:', typeof req.body);

  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    return next(new AppError('Request body is empty. Make sure Content-Type is application/json.', 400));
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = flat.fieldErrors as Record<string, string[]>;
    const fieldMessages: Record<string, string> = {};
    for (const [k, msgs] of Object.entries(fieldErrors)) {
      fieldMessages[k] = (msgs as string[])[0] || 'Required';
    }
    const firstError = Object.values(fieldMessages)[0] || 'Validation failed';
    console.log('[VALIDATE-BODY] FAILED:', fieldMessages);
    return next(new AppError(firstError, 400, fieldMessages));
  }
  req.body = parsed.data;
  next();
};
