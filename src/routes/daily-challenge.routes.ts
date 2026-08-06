import { Router } from 'express';
import { validateBody } from '../middlewares/validate-body.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { dailyChallengeSchema, dailyChallengeUpdateSchema, dailyChallengeSubmitSchema } from '../validators/content.validators.js';
import { dailyChallengeController } from '../controllers/daily-challenge.controller.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const userOnly = [requireAuth, requireRole('USER')];

// Admin routes (also aliased under /admin/daily-challenges)
// NOTE: /counts and /advance MUST be registered before /:id to avoid param capture.
router.get('/daily-challenges', ...adminOnly, dailyChallengeController.list);
router.get('/daily-challenges/counts', ...adminOnly, dailyChallengeController.counts);
router.post('/daily-challenges/advance', ...adminOnly, dailyChallengeController.advance);
router.post('/daily-challenges', ...adminOnly, validateBody(dailyChallengeSchema), dailyChallengeController.create);
router.get('/daily-challenges/:id', ...adminOnly, dailyChallengeController.get);
router.put('/daily-challenges/:id', ...adminOnly, validateBody(dailyChallengeUpdateSchema), dailyChallengeController.update);
router.delete('/daily-challenges/:id', ...adminOnly, dailyChallengeController.remove);
router.post('/daily-challenges/:id/duplicate', ...adminOnly, dailyChallengeController.duplicate);
router.post('/daily-challenges/:id/archive', ...adminOnly, dailyChallengeController.archive);

// User routes
router.get('/daily-challenge/today', ...userOnly, dailyChallengeController.getToday);
router.post('/daily-challenge/:id/submit', ...userOnly, validateBody(dailyChallengeSubmitSchema), dailyChallengeController.submit);
router.get('/daily-challenge/history', ...userOnly, dailyChallengeController.history);
router.get('/daily-challenge/streak', ...userOnly, dailyChallengeController.streak);

export { router as dailyChallengeRouter };