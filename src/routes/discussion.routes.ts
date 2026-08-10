import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser, requireAdmin } from '../middlewares/require-auth.js';
import { validateBody } from '../middlewares/validate-body.js';
import { discussionController } from '../controllers/discussion.controller.js';
import { commentSchema, updateCommentSchema } from '../validators/discussion.validators.js';

const commentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many comments. Please try again in a minute.' },
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
});

const studentRouter = Router();
studentRouter.get('/student/topics/:topicId/discussion', requireUser, discussionController.list);
studentRouter.post('/student/topics/:topicId/discussion', requireUser, commentLimiter, validateBody(commentSchema), discussionController.create);
studentRouter.put('/student/discussion/:commentId', requireUser, validateBody(updateCommentSchema), discussionController.update);
studentRouter.delete('/student/discussion/:commentId', requireUser, discussionController.remove);
studentRouter.get('/student/discussion/:commentId/replies', requireUser, discussionController.replies);
studentRouter.post('/student/discussion/:commentId/reply', requireUser, commentLimiter, validateBody(commentSchema), discussionController.reply);

const adminRouter = Router();
adminRouter.get('/admin/topics/:topicId/discussion', requireAdmin, discussionController.list);
adminRouter.post('/admin/topics/:topicId/discussion', requireAdmin, commentLimiter, validateBody(commentSchema), discussionController.create);
adminRouter.put('/admin/discussion/:commentId', requireAdmin, validateBody(updateCommentSchema), discussionController.update);
adminRouter.delete('/admin/discussion/:commentId', requireAdmin, discussionController.remove);
adminRouter.delete('/admin/discussion/:commentId/moderate', requireAdmin, discussionController.moderate);
adminRouter.get('/admin/discussion/:commentId/replies', requireAdmin, discussionController.replies);
adminRouter.post('/admin/discussion/:commentId/reply', requireAdmin, commentLimiter, validateBody(commentSchema), discussionController.reply);

export { studentRouter as discussionStudentRouter, adminRouter as discussionAdminRouter };
