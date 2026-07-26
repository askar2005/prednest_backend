import { Router } from 'express';
import { validateBody } from '../middlewares/validate-body.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { dailyChallengeSchema, dailyChallengeUpdateSchema } from '../validators/content.validators.js';
import { dailyChallengeController } from '../controllers/daily-challenge.controller.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const userOnly = [requireAuth, requireRole('USER')];

// Admin routes (also aliased under /admin/daily-challenges)
router.get('/daily-challenges', ...adminOnly, dailyChallengeController.list);
router.get('/daily-challenges/:id', ...adminOnly, dailyChallengeController.get);
router.post('/daily-challenges', ...adminOnly, validateBody(dailyChallengeSchema), dailyChallengeController.create);
router.put('/daily-challenges/:id', ...adminOnly, validateBody(dailyChallengeUpdateSchema), dailyChallengeController.update);
router.delete('/daily-challenges/:id', ...adminOnly, dailyChallengeController.remove);

// User routes
router.get('/daily-challenge/today', ...userOnly, dailyChallengeController.getToday);
router.post('/daily-challenge/:id/submit', ...userOnly, dailyChallengeController.submit);
router.get('/daily-challenge/streak', ...userOnly, dailyChallengeController.streak);

export { router as dailyChallengeRouter };
