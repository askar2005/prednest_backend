import { Router } from 'express';
import { requireAdmin, requireUser } from '../middlewares/require-auth.js';
import { notificationController } from '../controllers/notification.controller.js';

export const adminNotificationRouter = Router();
export const studentNotificationRouter = Router();

// ── Admin Routes ──
adminNotificationRouter.use(requireAdmin);

adminNotificationRouter.get('/', notificationController.adminList);
adminNotificationRouter.get('/:id', notificationController.adminGet);
adminNotificationRouter.post('/', notificationController.adminCreate);
adminNotificationRouter.put('/:id', notificationController.adminUpdate);
adminNotificationRouter.delete('/:id', notificationController.adminDelete);
adminNotificationRouter.patch('/:id/publish', notificationController.adminPublish);
adminNotificationRouter.patch('/:id/archive', notificationController.adminArchive);

// ── Student Routes ──
studentNotificationRouter.use(requireUser);

studentNotificationRouter.get('/', notificationController.studentList);
studentNotificationRouter.get('/recent', notificationController.studentRecent);
studentNotificationRouter.get('/unread-count', notificationController.studentUnreadCount);
studentNotificationRouter.post('/mark-all-read', notificationController.studentMarkAllRead);
studentNotificationRouter.get('/:id', notificationController.studentGet);
studentNotificationRouter.post('/:id/read', notificationController.studentMarkRead);
