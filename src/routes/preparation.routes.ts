import { Router } from 'express';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { validateBody } from '../middlewares/validate-body.js';
import { preparationController } from '../controllers/preparation.controller.js';
import { topicController } from '../controllers/topic.controller.js';
import { multerUpload, singleFile, singleImage, singleCoverImage } from '../middlewares/upload.middleware.js';
import { upload } from '../middlewares/upload.js';
import { z } from 'zod';

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];
const anyAuth = [requireAuth, preparationController.resolveCategory];
const withCategory = [...adminOnly, preparationController.resolveCategory];

const topicSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().nullable(),
});
const noteSchema = z.object({
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  pdfUrl: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
});
const noteUpdateSchema = z.object({
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().min(2).optional(),
  pdfUrl: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
});
const mcqSchema = z.object({
  topicId: z.string().uuid().optional().nullable(),
  question: z.string().min(2),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.string().min(1),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
  isPublished: z.boolean().optional(),
});
const videoSchema = z.object({
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  youtubeUrl: z.string().min(1),
});
const pyqSchema = z.object({
  year: z.number().int().positive(),
  title: z.string().min(2),
  pdfUrl: z.string().optional().nullable(),
});
const mockTestEditSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  negativeMarking: z.number().min(0).optional(),
  publishStatus: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});
const bulkMcqSchema = z.object({ questions: z.array(mcqSchema).min(1) });
const moduleSettingsSchema = z.object({
  name: z.string().min(2, 'Module name is required'),
});

// Dashboard
router.get('/:category/dashboard', ...anyAuth, preparationController.dashboard);

// Topics
router.get('/:category/topics', ...anyAuth, preparationController.topics.list);
router.post('/:category/topics', ...withCategory, validateBody(topicSchema), preparationController.topicCreate);
router.put('/topics/:id', ...adminOnly, preparationController.topicUpdate);
router.delete('/topics/:id', ...adminOnly, preparationController.topicDelete);

// Notes
router.get('/:category/notes', ...anyAuth, preparationController.notes.list);
router.post('/:category/notes', ...withCategory, validateBody(noteSchema), preparationController.noteCreate);
router.put('/notes/:id', ...adminOnly, validateBody(noteUpdateSchema), preparationController.noteUpdate);
router.delete('/notes/:id', ...adminOnly, preparationController.noteDelete);

// MCQs
router.get('/:category/mcqs', ...anyAuth, preparationController.mcqs.list);
router.post('/:category/mcqs', ...withCategory, validateBody(mcqSchema), preparationController.mcqCreate);
router.post('/:category/mcqs/bulk', ...withCategory, validateBody(bulkMcqSchema), preparationController.mcqBulkCreate);
router.put('/mcqs/:id', ...adminOnly, preparationController.mcqUpdate);
router.delete('/mcqs/:id', ...adminOnly, preparationController.mcqDelete);

// Videos
router.get('/:category/videos', ...anyAuth, preparationController.videos.list);
router.post('/:category/videos', ...withCategory, validateBody(videoSchema), preparationController.videoCreate);
router.delete('/videos/:id', ...adminOnly, preparationController.videoDelete);

// Previous Year Questions
router.get('/:category/pyqs', ...anyAuth, preparationController.pyqs.list);
router.post('/:category/pyqs', ...withCategory, validateBody(pyqSchema), preparationController.pyqCreate);
router.delete('/pyqs/:id', ...adminOnly, preparationController.pyqDelete);

// Mock Tests
router.get('/:category/mock-tests', ...anyAuth, preparationController.mockTests.list);
router.post('/:category/mock-tests', ...withCategory, validateBody(mockTestEditSchema), preparationController.mockTestCreate);
router.put('/mock-tests/:id', ...adminOnly, preparationController.mockTestUpdate);
router.delete('/mock-tests/:id', ...adminOnly, preparationController.mockTestDelete);

// Analytics
router.get('/:category/analytics', ...anyAuth, preparationController.analytics);

// Module Settings
router.get('/:category/settings', ...anyAuth, preparationController.moduleSettings.get);
router.put('/:category/settings', ...withCategory, validateBody(moduleSettingsSchema), preparationController.moduleSettings.update);

// Category Image Upload
router.post('/:category/image', ...withCategory, singleCoverImage, preparationController.uploadImage);
router.delete('/:category/image', ...withCategory, preparationController.deleteImage);

// Topic-scoped CRUD (admin)
const topicAdmin = [...adminOnly, preparationController.resolveCategory, topicController.resolveTopic];
const topicAny = [...anyAuth, topicController.resolveTopic];

router.get('/:category/topics/:topicId', ...topicAny, topicController.get);
router.put('/:category/topics/:topicId', ...topicAdmin, topicController.update);
router.delete('/:category/topics/:topicId', ...topicAdmin, topicController.delete);
router.get('/:category/topics/:topicId/dashboard', ...topicAny, topicController.dashboard);

// Notes (topic-scoped)
router.get('/:category/topics/:topicId/notes', ...topicAny, topicController.notes.list);
router.post('/:category/topics/:topicId/notes', ...topicAdmin, validateBody(noteSchema), topicController.notes.create);
router.put('/:category/topics/:topicId/notes/:id', ...topicAdmin, topicController.notes.update);
router.delete('/:category/topics/:topicId/notes/:id', ...topicAdmin, topicController.notes.delete);

// MCQs (topic-scoped)
router.get('/:category/topics/:topicId/mcqs', ...topicAny, topicController.mcqs.list);
router.post('/:category/topics/:topicId/mcqs', ...topicAdmin, validateBody(mcqSchema), topicController.mcqs.create);
router.put('/:category/topics/:topicId/mcqs/:id', ...topicAdmin, topicController.mcqs.update);
router.delete('/:category/topics/:topicId/mcqs/:id', ...topicAdmin, topicController.mcqs.delete);
router.post('/:category/topics/:topicId/mcqs/bulk', ...topicAdmin, topicController.mcqs.bulkCreate);
router.post('/:category/topics/:topicId/mcqs/bulk-delete', ...topicAdmin, topicController.mcqs.bulkDelete);

// Videos (topic-scoped)
router.get('/:category/topics/:topicId/videos', ...topicAny, topicController.videos.list);
router.post('/:category/topics/:topicId/videos', ...topicAdmin, validateBody(videoSchema), topicController.videos.create);
router.delete('/:category/topics/:topicId/videos/:id', ...topicAdmin, topicController.videos.delete);

// PYQs (topic-scoped)
router.get('/:category/topics/:topicId/pyqs', ...topicAny, topicController.pyqs.list);
router.post('/:category/topics/:topicId/pyqs', ...topicAdmin, topicController.pyqs.create);
router.delete('/:category/topics/:topicId/pyqs/:id', ...topicAdmin, topicController.pyqs.delete);

// Mock Tests (topic-scoped)
router.get('/:category/topics/:topicId/mock-tests', ...topicAny, topicController.mockTests.list);
router.post('/:category/topics/:topicId/mock-tests', ...topicAdmin, validateBody(mockTestEditSchema), topicController.mockTests.create);
router.put('/:category/topics/:topicId/mock-tests/:id', ...topicAdmin, topicController.mockTests.update);
router.delete('/:category/topics/:topicId/mock-tests/:id', ...topicAdmin, topicController.mockTests.delete);

// MCQ Import/Export
router.post('/:category/topics/:topicId/mcqs/import', ...topicAdmin, upload.single('file'), topicController.mcqImport);
router.get('/:category/topics/:topicId/mcqs/export/:format', ...topicAny, topicController.mcqExport);

// Mock Test Builder
router.post('/:category/topics/:topicId/mock-tests/with-questions', ...topicAdmin, topicController.createMockTestWithQuestions);
router.get('/:category/topics/:topicId/mock-tests/:id', ...topicAny, topicController.getMockTestWithQuestions);
router.post('/:category/topics/:topicId/mock-tests/:id/questions', ...topicAdmin, topicController.addMockTestQuestions);

// Note Versions
router.get('/:category/topics/:topicId/notes/:id/versions', ...topicAny, topicController.noteVersions);
router.post('/:category/topics/:topicId/notes/:id/restore/:versionId', ...topicAdmin, topicController.restoreNoteVersion);

// Analytics & Resources
router.get('/:category/topics/:topicId/analytics', ...topicAny, topicController.analytics);
router.get('/:category/topics/:topicId/resources', ...topicAny, topicController.resources.list);

export default router;