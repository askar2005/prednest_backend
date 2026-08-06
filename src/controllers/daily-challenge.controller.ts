import { Request, Response, NextFunction } from 'express';
import { dailyChallengeService } from '../services/daily-challenge.service.js';
import { AppError } from '../utils/app-error.js';

function p(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  if (typeof v === 'string') return v;
  return '';
}

export const dailyChallengeController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await dailyChallengeService.list({
          search: p(req.query.search),
          status: p(req.query.status),
          page: Number(p(req.query.page)) || 1,
          limit: Number(p(req.query.limit)) || 20,
        })
      );
    } catch (e) {
      next(e);
    }
  },

  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await dailyChallengeService.get(p(req.params.id)));
    } catch (e) {
      next(e);
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await dailyChallengeService.create(req.body));
    } catch (e) {
      next(e);
    }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await dailyChallengeService.update(p(req.params.id), req.body));
    } catch (e) {
      next(e);
    }
  },

  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await dailyChallengeService.remove(p(req.params.id));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  },

  duplicate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await dailyChallengeService.duplicate(p(req.params.id)));
    } catch (e) {
      next(e);
    }
  },

  archive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await dailyChallengeService.archive(p(req.params.id)));
    } catch (e) {
      next(e);
    }
  },

  counts: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await dailyChallengeService.counts());
    } catch (e) {
      next(e);
    }
  },

  advance: async (req: Request, res: Response, next: NextFunction) => {
    try {
      let target = new Date();
      const dateStr = Array.isArray(req.body?.date) ? req.body.date[0] : req.body?.date;
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (isNaN(parsed.getTime())) throw new AppError('Invalid date. Use YYYY-MM-DD', 400);
        target = parsed;
      }
      res.json(await dailyChallengeService.ensureDayPublished(target));
    } catch (e) {
      next(e);
    }
  },

  getToday: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await dailyChallengeService.getToday(req.user!.id)); }
    catch (e) { next(e); }
  },

  submit: async (req: Request, res: Response, next: NextFunction) => {
    try { const { selectedAnswer } = req.body; res.json(await dailyChallengeService.submit(req.user!.id, p(req.params.id), selectedAnswer)); }
    catch (e) { next(e); }
  },

  history: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await dailyChallengeService.getHistory(req.user!.id, {
          page: Number(p(req.query.page)) || 1,
          limit: Number(p(req.query.limit)) || 20,
        })
      );
    } catch (e) { next(e); }
  },

  streak: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await dailyChallengeService.getStreak(req.user!.id)); }
    catch (e) { next(e); }
  },
};