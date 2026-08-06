import { Request, Response, NextFunction } from 'express';
import { dailyChallengeService } from '../services/daily-challenge.service.js';

function p(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : v ?? '';
}

export const dailyChallengeController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await dailyChallengeService.list());
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

  getToday: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await dailyChallengeService.getToday(req.user!.id)); }
    catch (e) { next(e); }
  },

  submit: async (req: Request, res: Response, next: NextFunction) => {
    try { const { selectedAnswer } = req.body; res.json(await dailyChallengeService.submit(req.user!.id, p(req.params.id), selectedAnswer)); }
    catch (e) { next(e); }
  },

  streak: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await dailyChallengeService.getStreak(req.user!.id)); }
    catch (e) { next(e); }
  },
};
