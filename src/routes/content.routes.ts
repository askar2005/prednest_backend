import { Router } from 'express';
import { createCrudService } from '../services/crud.service.js';
import { createCrudController } from '../controllers/crud.controller.js';
import { validateBody } from '../middlewares/validate-body.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { deleteFileByUrl } from '../services/upload.service.js';
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
  videoSchema,
  previousYearQuestionSchema,
} from '../validators/content.validators.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];

const resources = [
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
] as const;

// Safe user management for admin — NO delete endpoint
router.get('/users', ...adminOnly, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.user.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.user.count(),
    ]);
    res.json({ items, page, limit, total });
  } catch (e) { next(e); }
});
router.get('/users/:id', ...adminOnly, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return next(new AppError('User not found', 404));
    res.json(user);
  } catch (e) { next(e); }
});
router.put('/users/:id', ...adminOnly, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { name, disabledAt, role } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (disabledAt !== undefined) data.disabledAt = disabledAt;
    if (role !== undefined) data.role = role;
    const user = await prisma.user.update({ where: { id }, data });
    res.json(user);
  } catch (e) { next(e); }
});

// Categories need _count for dashboard cards
const catService = createCrudService('preparationCategory', {
  include: { _count: { select: { studyMaterials: true, mcqQuestions: true, videos: true, mockTests: true } } },
});
const catController = createCrudController(catService);
router.get('/preparation-categories', catController.list);
router.get('/preparation-categories/:id', catController.get);
router.post('/preparation-categories', ...adminOnly, validateBody(preparationCategorySchema as any), catController.create);
router.put('/preparation-categories/:id', ...adminOnly, validateBody(preparationCategorySchema as any), catController.update);
router.delete('/preparation-categories/:id', ...adminOnly, catController.remove);

// Resources with Cloudinary file cleanup on delete
const cloudinaryCleanupModels: Record<string, string[]> = {
  studyMaterial: ['pdfPublicId'],
  previousYearQuestion: ['pdfPublicId'],
  notification: ['thumbnailUrl', 'bannerUrl', 'attachmentUrl'],
};

for (const [path, model, schema] of resources) {
  const cleanupFields = cloudinaryCleanupModels[model as string];
  const service = createCrudService(model as any, {
    beforeDelete: cleanupFields
      ? async (_id: string, item: any) => {
          for (const field of cleanupFields) {
            if (item[field] && item[field].includes('cloudinary')) {
              await deleteFileByUrl(item[field]).catch(() => {});
            }
          }
          // Also clean up related File records for study materials
          if (model === 'studyMaterial') {
            const files = await prisma.file.findMany({ where: { studyMaterialId: _id } });
            for (const file of files) {
              if (file.publicId) await deleteFileByUrl(file.secureUrl || '').catch(() => {});
            }
            const attachments = await prisma.attachment.findMany({ where: { studyMaterialId: _id } });
            for (const att of attachments) {
              if (att.publicId) await deleteFileByUrl(att.fileUrl).catch(() => {});
            }
          }
        }
      : undefined,
  });
  const controller = createCrudController(service);
  router.get(`/${path}`, controller.list);
  router.get(`/${path}/:id`, controller.get);
  if (schema) {
    router.post(`/${path}`, ...adminOnly, validateBody(schema as any), controller.create);
    router.put(`/${path}/:id`, ...adminOnly, validateBody(schema as any), controller.update);
  }
  router.delete(`/${path}/:id`, ...adminOnly, controller.remove);
}

export { router as contentRouter };
