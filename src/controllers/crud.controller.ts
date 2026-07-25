import { Request, Response, NextFunction } from 'express';

export const createCrudController = (service: any) => ({
  list: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await service.list(req.query)); } catch (e) { next(e); }
  },
  get: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await service.get(req.params.id)); } catch (e) { next(e); }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await service.create(req.body)); } catch (e) { next(e); }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await service.update(req.params.id, req.body)); } catch (e) { next(e); }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(204).send(await service.remove(req.params.id)); } catch (e) { next(e); }
  },
});
