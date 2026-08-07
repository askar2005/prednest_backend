import { Request, Response, NextFunction } from 'express';
import { mockTestService } from '../services/mock-test.service.js';
import { AppError } from '../utils/app-error.js';

export const mockTestController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await mockTestService.list({
        role: req.user?.role || 'USER',
        userId: req.user?.id || '',
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        topicId: req.query.topicId as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      res.json(data);
    } catch (e) { next(e); }
  },

  counts: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await mockTestService.counts());
    } catch (e) { next(e); }
  },

  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === 'ADMIN') {
        return res.json(await mockTestService.get(req.params.id as string));
      }
      return res.json(await mockTestService.getForAttempt(req.params.id as string));
    } catch (e) { next(e); }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const test = await mockTestService.create({ ...req.body, publishStatus: req.body.publishStatus || 'DRAFT' });
      res.status(201).json(test);
    } catch (e) { next(e); }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await mockTestService.update(req.params.id as string, req.body));
    } catch (e) { next(e); }
  },

  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await mockTestService.remove(req.params.id as string);
      res.status(204).send();
    } catch (e) { next(e); }
  },

  duplicate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const copy = await mockTestService.duplicate(req.params.id as string);
      res.status(201).json(copy);
    } catch (e) { next(e); }
  },

  publish: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body as { status: 'DRAFT' | 'PUBLISHED' };
      res.json(await mockTestService.setPublishStatus(req.params.id as string, status));
    } catch (e) { next(e); }
  },

  archive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const archived = req.params.action === 'archive';
      res.json(await mockTestService.setArchived(req.params.id as string, archived));
    } catch (e) { next(e); }
  },

  getForAttempt: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await mockTestService.getForAttempt(req.params.id as string));
    } catch (e) { next(e); }
  },

  submit: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mockTestId, answers, timeSpent } = req.body as { mockTestId: string; answers?: Record<string, unknown>; timeSpent?: number | null };
      const payload = await mockTestService.submit(req.user!.id, mockTestId, answers || {}, timeSpent ?? null);
      res.json(payload);
    } catch (e) { next(e); }
  },

  myResults: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mockTestId = req.query.mockTestId as string | undefined;
      res.json(await mockTestService.getResults(req.user!.id, mockTestId));
    } catch (e) { next(e); }
  },

  getResult: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await mockTestService.getResult(req.user!.id, req.params.resultId as string);
      if (!result) throw new AppError('Result not found', 404);
      res.json(result);
    } catch (e) { next(e); }
  },
};
