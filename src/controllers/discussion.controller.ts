import { Request, Response, NextFunction } from 'express';
import { discussionService } from '../services/discussion.service.js';

function p(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  if (typeof v === 'string') return v;
  return '';
}

export const discussionController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await discussionService.list(p(req.params.topicId), {
          page: req.query.page,
          limit: req.query.limit,
        })
      );
    } catch (e) {
      next(e);
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const comment = await discussionService.create(p(req.params.topicId), req.user!, req.body.content);
      res.status(201).json(comment);
    } catch (e) {
      next(e);
    }
  },

  replies: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await discussionService.replies(p(req.params.commentId), {
          page: req.query.page,
          limit: req.query.limit,
        })
      );
    } catch (e) {
      next(e);
    }
  },

  reply: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const comment = await discussionService.reply(p(req.params.commentId), req.user!, req.body.content);
      res.status(201).json(comment);
    } catch (e) {
      next(e);
    }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await discussionService.update(p(req.params.commentId), req.user!, req.body.content));
    } catch (e) {
      next(e);
    }
  },

  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await discussionService.remove(p(req.params.commentId), req.user));
    } catch (e) {
      next(e);
    }
  },

  moderate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await discussionService.remove(p(req.params.commentId)));
    } catch (e) {
      next(e);
    }
  },
};
