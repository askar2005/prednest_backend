import { Router } from 'express';
import { requireUser } from '../middlewares/require-auth.js';
import { studentController } from '../controllers/student.controller.js';

const router = Router();

router.get('/bookmarks', requireUser, studentController.getBookmarks);
router.post('/bookmarks/toggle', requireUser, studentController.toggleBookmark);
router.get('/progress', requireUser, studentController.getProgress);
router.post('/progress/mcq-attempt', requireUser, studentController.submitMcqAttempt);
router.get('/mock-tests/:id', requireUser, studentController.getMockTest);
router.post('/mock-tests/submit', requireUser, studentController.submitMockTest);
router.post('/daily-challenges/:id/submit', requireUser, studentController.submitDailyChallenge);

export { router as studentRouter };
