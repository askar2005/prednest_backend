import { Router } from 'express';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { notesController } from '../controllers/notes.controller.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const anyAuth = [requireAuth];

router.get('/topics/:topicId/notes', ...anyAuth, notesController.listByTopic);
router.get('/notes/:id', ...anyAuth, notesController.getById);
router.post('/topics/:topicId/notes', ...adminOnly, notesController.create);
router.put('/notes/:id', ...adminOnly, notesController.update);
router.delete('/notes/:id', ...adminOnly, notesController.remove);

export default router;
