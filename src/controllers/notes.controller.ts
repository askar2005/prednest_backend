import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

function getCid(req: Request) { return (req as any).__categoryId as string; }

export const notesController = {
  async listByTopic(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.note.findMany({
        where: { topicId: req.params.topicId as string },
        orderBy: { createdAt: 'desc' },
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  },

  async listByCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.note.findMany({
        where: { topic: { preparationCategoryId: getCid(req) } },
        orderBy: { createdAt: 'desc' },
        include: { topic: { select: { name: true } }, attachments: { orderBy: { createdAt: 'desc' } } },
      });
      res.json({ items, total: items.length });
    } catch (e) { next(e); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const note = await prisma.note.findUnique({
        where: { id: req.params.id as string },
        include: { attachments: { orderBy: { createdAt: 'desc' } }, topic: { select: { name: true } } },
      });
      if (!note) throw new AppError('Note not found', 404);
      res.json(note);
    } catch (e) { next(e); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, content, description, tags, attachments: rawAttachments } = req.body;
      const note = await prisma.note.create({
        data: {
          topicId: req.params.topicId as string,
          title,
          content: content || null,
          description: description || null,
          tags: tags || null,
          attachments: rawAttachments?.length ? {
            create: rawAttachments.map((a: any) => ({
              fileName: a.fileName,
              originalName: a.originalName,
              fileType: a.fileType,
              fileSize: a.fileSize || null,
              fileUrl: a.fileUrl,
            })),
          } : undefined,
        },
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      });
      res.status(201).json(note);
    } catch (e) { next(e); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, content, description, tags, attachments: rawAttachments } = req.body;
      const data: any = {};
      if (title !== undefined) data.title = title;
      if (content !== undefined) data.content = content;
      if (description !== undefined) data.description = description;
      if (tags !== undefined) data.tags = tags;

      const note = await prisma.note.update({
        where: { id: req.params.id as string },
        data,
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      });

      if (rawAttachments) {
        await prisma.noteAttachment.deleteMany({ where: { noteId: note.id } });
        if (rawAttachments.length > 0) {
          await prisma.noteAttachment.createMany({
            data: rawAttachments.map((a: any) => ({
              noteId: note.id,
              fileName: a.fileName,
              originalName: a.originalName,
              fileType: a.fileType,
              fileSize: a.fileSize || null,
              fileUrl: a.fileUrl,
            })),
          });
        }
        const updated = await prisma.note.findUnique({
          where: { id: note.id },
          include: { attachments: { orderBy: { createdAt: 'desc' } } },
        });
        return res.json(updated);
      }

      res.json(note);
    } catch (e) { next(e); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await prisma.note.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (e) { next(e); }
  },

  async uploadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const noteId = req.body.noteId as string | undefined;
      if (!noteId) throw new AppError('noteId is required', 400);
      const note = await prisma.note.findUnique({ where: { id: noteId } });
      if (!note) throw new AppError('Note not found', 404);
      const file = req.file;
      const attachment = await prisma.noteAttachment.create({
        data: {
          noteId,
          fileName: file.filename,
          originalName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          fileUrl: `/uploads/${file.filename}`,
        },
      });
      res.status(201).json(attachment);
    } catch (e) { next(e); }
  },

  async deleteAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const attachment = await prisma.noteAttachment.findUnique({ where: { id: req.params.attachmentId as string } });
      if (!attachment) throw new AppError('Attachment not found', 404);
      await prisma.noteAttachment.delete({ where: { id: attachment.id } });
      res.status(204).send();
    } catch (e) { next(e); }
  },
};
