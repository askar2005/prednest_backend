import { Router } from 'express';
import { requireAuth, requireAdmin, requireUser } from '../middlewares/require-auth.js';
import { validateBody } from '../middlewares/validate-body.js';
import { mockTestController } from '../controllers/mock-test.controller.js';
import { mockTestInputSchema, mockTestUpdateSchema, publishSchema, mockTestSubmitSchema } from '../validators/mock-test.validators.js';

const router = Router();

router.get('/mock-tests', requireAuth, mockTestController.list);
router.get('/mock-tests/counts', requireAuth, mockTestController.counts);
router.get('/mock-tests/:id', requireAuth, mockTestController.get);
router.post('/mock-tests', requireAdmin, validateBody(mockTestInputSchema), mockTestController.create);
router.put('/mock-tests/:id', requireAdmin, validateBody(mockTestUpdateSchema), mockTestController.update);
router.delete('/mock-tests/:id', requireAdmin, mockTestController.remove);
router.post('/mock-tests/:id/duplicate', requireAdmin, mockTestController.duplicate);
router.post('/mock-tests/:id/publish', requireAdmin, validateBody(publishSchema), mockTestController.publish);
router.post('/mock-tests/:id/archive/:action', requireAdmin, mockTestController.archive);

router.get('/student/mock-tests/results', requireUser, mockTestController.myResults);
router.get('/student/mock-tests/results/:resultId', requireUser, mockTestController.getResult);
router.get('/student/mock-tests/:id', requireUser, mockTestController.getForAttempt);
router.post('/student/mock-tests/submit', requireUser, validateBody(mockTestSubmitSchema), mockTestController.submit);

export { router as mockTestRouter };
