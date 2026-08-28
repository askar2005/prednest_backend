import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

function pid(req: Request) { return (req.params.notificationId || req.params.id) as string; }

async function getReadIds(userId: string, notificationIds: string[]) {
  if (!notificationIds.length) return new Set<string>();
  const reads = await prisma.notificationRead.findMany({
    where: { userId, notificationId: { in: notificationIds } },
    select: { notificationId: true },
  });
  return new Set(reads.map((r) => r.notificationId));
}

async function markRead(userId: string, notificationId: string) {
  await prisma.notificationRead.upsert({
    where: { userId_notificationId: { userId, notificationId } },
    create: { userId, notificationId },
    update: { readAt: new Date() },
  });
}

export const notificationController = {
  // ── Admin ──
  adminList: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, category, status, priority, page = '1', limit = '50' } = req.query as Record<string, string>;
      const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, Math.max(1, parseInt(limit) || 50));
      const take = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const where: any = {};
      if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }];
      if (category) where.category = category;
      if (status) where.status = status;
      if (priority) where.priority = priority;
      const [items, total] = await Promise.all([
        prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.notification.count({ where }),
      ]);
      res.json({ items, total, page: parseInt(page), limit: take });
    } catch (e) { next(e); }
  },

  adminGet: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.findUnique({ where: { id: pid(req) } });
      if (!notification) throw new AppError('Notification not found', 404);
      res.json(notification);
    } catch (e) { next(e); }
  },

  adminCreate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = { ...req.body };
      const notification = await prisma.notification.create({ data });
      res.status(201).json(notification);
    } catch (e) { next(e); }
  },

  adminUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.update({ where: { id: pid(req) }, data: req.body });
      res.json(notification);
    } catch (e) { next(e); }
  },

  adminDelete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.notification.delete({ where: { id: pid(req) } });
      res.status(204).send();
    } catch (e) { next(e); }
  },

  adminPublish: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.update({
        where: { id: pid(req) },
        data: { status: 'PUBLISHED', publishDate: new Date() },
      });
      res.json(notification);
    } catch (e) { next(e); }
  },

  adminArchive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.update({
        where: { id: pid(req) },
        data: { status: 'ARCHIVED' },
      });
      res.json(notification);
    } catch (e) { next(e); }
  },

  // ── Student ──
  studentList: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, page = '1', limit = '20' } = req.query as Record<string, string>;
      const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(50, Math.max(1, parseInt(limit) || 20));
      const take = Math.min(50, Math.max(1, parseInt(limit) || 20));
      const now = new Date();
      const where: any = { status: 'PUBLISHED', OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] };
      if (category) where.category = category;

      const [items, total] = await Promise.all([
        prisma.notification.findMany({
          where, orderBy: [{ isPinned: 'desc' }, { publishDate: 'desc' }], skip, take,
          select: { id: true, title: true, summary: true, category: true, priority: true, thumbnailUrl: true, attachmentUrl: true, externalLink: true, publishDate: true, isPinned: true, isFeatured: true, views: true, createdAt: true },
        }),
        prisma.notification.count({ where }),
      ]);
      const readIds = await getReadIds(req.user!.id, items.map((item) => item.id));
      res.json({
        items: items.map((item) => ({ ...item, isRead: readIds.has(item.id) })),
        total,
        page: parseInt(page),
        limit: take,
      });
    } catch (e) { next(e); }
  },

  studentGet: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.findUnique({ where: { id: pid(req) } });
      if (!notification || notification.status !== 'PUBLISHED') throw new AppError('Notification not found', 404);
      const existingRead = await prisma.notificationRead.findUnique({
        where: { userId_notificationId: { userId: req.user!.id, notificationId: notification.id } },
        select: { id: true },
      });
      await prisma.notification.update({ where: { id: pid(req) }, data: { views: { increment: 1 } } });
      if (!existingRead) {
        await markRead(req.user!.id, notification.id);
      }
        res.json({ ...notification, views: notification.views + 1, isRead: true });
    } catch (e) { next(e); }
  },

  studentRecent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const items = await prisma.notification.findMany({
        where: { status: 'PUBLISHED', OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
        orderBy: [{ isPinned: 'desc' }, { publishDate: 'desc' }],
        take: 5,
        select: { id: true, title: true, summary: true, category: true, priority: true, thumbnailUrl: true, publishDate: true, isPinned: true },
      });
      const readIds = await getReadIds(req.user!.id, items.map((item) => item.id));
      res.json({
        items: items.map((item) => ({ ...item, isRead: readIds.has(item.id) })),
        total: items.length,
      });
    } catch (e) { next(e); }
  },

  studentUnreadCount: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const published = await prisma.notification.findMany({
        where: { status: 'PUBLISHED', OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
        select: { id: true },
      });
      const readCount = published.length
        ? await prisma.notificationRead.count({
            where: { userId: req.user!.id, notificationId: { in: published.map((n) => n.id) } },
          })
        : 0;
      const count = published.length - readCount;
      res.json({ count });
    } catch (e) { next(e); }
  },

  studentMarkRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await prisma.notification.findUnique({ where: { id: pid(req) } });
      if (!notification || notification.status !== 'PUBLISHED') throw new AppError('Notification not found', 404);
      await markRead(req.user!.id, notification.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  },

  studentMarkAllRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const notifications = await prisma.notification.findMany({
        where: { status: 'PUBLISHED', OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
        select: { id: true },
      });
      if (notifications.length === 0) {
        return res.json({ ok: true, marked: 0 });
      }
      await prisma.$transaction(
        notifications.map((notification) =>
          prisma.notificationRead.upsert({
            where: { userId_notificationId: { userId: req.user!.id, notificationId: notification.id } },
            create: { userId: req.user!.id, notificationId: notification.id },
            update: { readAt: new Date() },
          })
        )
      );
      res.json({ ok: true, marked: notifications.length });
    } catch (e) { next(e); }
  },
};
