import { Router } from 'express';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { upload } from '../middlewares/upload.js';
import { notesController } from '../controllers/notes.controller.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const anyAuth = [requireAuth];

router.get('/topics/:topicId/notes', ...anyAuth, notesController.listByTopic);
router.get('/notes/:id', ...anyAuth, notesController.getById);
router.post('/topics/:topicId/notes', ...adminOnly, notesController.create);
router.put('/notes/:id', ...adminOnly, notesController.update);
router.delete('/notes/:id', ...adminOnly, notesController.remove);

router.post('/notes/upload', ...adminOnly, upload.single('file'), notesController.uploadAttachment);
router.delete('/notes/attachments/:attachmentId', ...adminOnly, notesController.deleteAttachment);

export default router;
