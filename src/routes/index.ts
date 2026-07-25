import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { adminRouter } from './admin.routes.js';
import { contentRouter } from './content.routes.js';
import { studentRouter } from './student.routes.js';
import preparationRouter from './preparation.routes.js';
import fileRouter from './file.routes.js';
import notesRouter from './notes.routes.js';
import { adminNotificationRouter, studentNotificationRouter } from './notification.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);                     // Admin auth + profile routes
apiRouter.use('/', contentRouter);
apiRouter.use('/student', studentRouter);
apiRouter.use('/preparation', preparationRouter);
apiRouter.use('/', fileRouter);
apiRouter.use('/', notesRouter);
apiRouter.use('/admin/notifications', adminNotificationRouter);
apiRouter.use('/notifications', studentNotificationRouter);
