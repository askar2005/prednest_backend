import { Request, Response, NextFunction } from 'express';
import { dailyChallengeService } from '../services/daily-challenge.service.js';

function p(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : v ?? '';
}

export const dailyChallengeController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[DC-CTRL] list() called');
      const result = await dailyChallengeService.list();
      console.log('[DC-CTRL] list() success, items:', result.total);
      res.json(result);
    } catch (e: any) {
      console.error('[DC-CTRL] list() ERROR:', e.name, e.message);
      console.error('[DC-CTRL] stack:', e.stack);
      next(e);
    }
  },

  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[DC-CTRL] get() called, id:', req.params.id);
      const result = await dailyChallengeService.get(p(req.params.id));
      res.json(result);
    } catch (e: any) {
      console.error('[DC-CTRL] get() ERROR:', e.name, e.message);
      console.error('[DC-CTRL] stack:', e.stack);
      next(e);
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[DC-CTRL] create() called, body:', JSON.stringify(req.body));
      const result = await dailyChallengeService.create(req.body);
      console.log('[DC-CTRL] create() success, id:', result.id);
      res.status(201).json(result);
    } catch (e: any) {
      console.error('[DC-CTRL] create() ERROR:', e.name, e.message);
      console.error('[DC-CTRL] stack:', e.stack);
      next(e);
    }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[DC-CTRL] update() called, id:', req.params.id, 'body:', JSON.stringify(req.body));
      const result = await dailyChallengeService.update(p(req.params.id), req.body);
      res.json(result);
    } catch (e: any) {
      console.error('[DC-CTRL] update() ERROR:', e.name, e.message);
      console.error('[DC-CTRL] stack:', e.stack);
      next(e);
    }
  },

  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[DC-CTRL] remove() called, id:', req.params.id);
      await dailyChallengeService.remove(p(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      console.error('[DC-CTRL] remove() ERROR:', e.name, e.message);
      console.error('[DC-CTRL] stack:', e.stack);
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
