import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { deleteFileByUrl } from '../services/upload.service.js';

function getCid(req: Request) { return (req as any).__categoryId as string; }

export const notesController = {
  async listByTopic(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.note.findMany({
        where: { topicId: req.params.topicId as string },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  },

  async listByCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.note.findMany({
        where: { topic: { preparationCategoryId: getCid(req) } },
        orderBy: { createdAt: 'desc' },
        include: { topic: { select: { name: true } } },
      });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const note = await prisma.note.findUnique({
        where: { id: req.params.id as string },
        include: { topic: { select: { name: true } } },
      });
      if (!note) throw new AppError('Note not found', 404);
      res.json(note);
    } catch (e) { next(e); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, pdfUrl, pdfPublicId, isPublished } = req.body;
      console.log('[NOTES-CREATE] === DATABASE INSERT === title:', title, 'pdfUrl:', pdfUrl, 'pdfPublicId:', pdfPublicId);
      const note = await prisma.note.create({
        data: {
          topicId: req.params.topicId as string,
          title,
          pdfUrl: pdfUrl || null,
          pdfPublicId: pdfPublicId || null,
          isPublished: isPublished ?? false,
        },
      });
      res.status(201).json(note);
    } catch (e) { next(e); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, pdfUrl, pdfPublicId, isPublished } = req.body;
      const existing = await prisma.note.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError('Note not found', 404);

      const data: any = {};
      if (title !== undefined) data.title = title;
      if (pdfUrl !== undefined) data.pdfUrl = pdfUrl;
      if (pdfPublicId !== undefined) data.pdfPublicId = pdfPublicId;
      if (isPublished !== undefined) data.isPublished = isPublished;

      // PDF is being replaced/removed → delete the old Cloudinary asset.
      if (pdfUrl !== undefined && existing.pdfUrl && pdfUrl !== existing.pdfUrl) {
        console.log('[NOTES-UPDATE] deleting old Cloudinary PDF:', existing.pdfUrl);
        await deleteFileByUrl(existing.pdfUrl).catch(() => {});
      }

      const note = await prisma.note.update({
        where: { id: req.params.id as string },
        data,
      });
      console.log('[NOTES-UPDATE] === DATABASE VALUE === pdfUrl:', note.pdfUrl, 'pdfPublicId:', note.pdfPublicId);
      res.json(note);
    } catch (e) { next(e); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const note = await prisma.note.findUnique({ where: { id: req.params.id as string } });
      if (!note) throw new AppError('Note not found', 404);
      if (note.pdfPublicId) {
        await deleteFileByUrl(note.pdfUrl!).catch(() => {});
      }
      await prisma.note.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (e) { next(e); }
  },
};
