import { Router } from 'express';
import { createCrudService } from '../services/crud.service.js';
import { createCrudController } from '../controllers/crud.controller.js';
import { validateBody } from '../middlewares/validate-body.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import {
  preparationCategorySchema,
  subjectSchema,
  topicSchema,
  studyMaterialSchema,
  mcqSchema,
  mockTestSchema,
  mockTestQuestionSchema,
  interviewQuestionSchema,
  notificationSchema,
  dailyChallengeSchema,
  videoSchema,
  previousYearQuestionSchema,
} from '../validators/content.validators.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];

const resources = [
  ['preparation-categories', 'preparationCategory', preparationCategorySchema],
  ['subjects', 'subject', subjectSchema],
  ['topics', 'topic', topicSchema],
  ['study-materials', 'studyMaterial', studyMaterialSchema],
  ['mcq-questions', 'mcqQuestion', mcqSchema],
  ['mock-tests', 'mockTest', mockTestSchema],
  ['mock-test-questions', 'mockTestQuestion', mockTestQuestionSchema],
  ['interview-questions', 'interviewQuestion', interviewQuestionSchema],
  ['notifications', 'notification', notificationSchema],
  ['videos', 'video', videoSchema],
  ['previous-year-questions', 'previousYearQuestion', previousYearQuestionSchema],
  ['bookmarks', 'bookmark', null],
  ['progress', 'progress', null],
  ['users', 'user', null],
] as const;

for (const [path, model, schema] of resources) {
  const service = createCrudService(model as any);
  const controller = createCrudController(service);
  router.get(`/${path}`, controller.list);
  router.get(`/${path}/:id`, controller.get);
  if (schema) {
    router.post(`/${path}`, ...adminOnly, validateBody(schema as any), controller.create);
    router.put(`/${path}/:id`, ...adminOnly, validateBody(schema as any), controller.update);
  }
  router.delete(`/${path}/:id`, ...adminOnly, controller.remove);
}

const dailyChallengeService = createCrudService('dailyChallenge');
const dailyChallengeController = createCrudController(dailyChallengeService);
router.get('/daily-challenges', dailyChallengeController.list);
router.get('/daily-challenges/:id', dailyChallengeController.get);
router.post('/daily-challenges', ...adminOnly, validateBody(dailyChallengeSchema), async (req, res, next) => {
  try {
    const payload = { ...req.body, userId: req.user?.id };
    const result = await dailyChallengeService.create(payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
router.put('/daily-challenges/:id', ...adminOnly, validateBody(dailyChallengeSchema), dailyChallengeController.update);
router.delete('/daily-challenges/:id', ...adminOnly, dailyChallengeController.remove);

export { router as contentRouter };
